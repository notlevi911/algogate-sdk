(function initAlgoSafetyLayer() {
  if (document.getElementById("algo-safety-root")) {
    return;
  }

  const state: ContentState = {
    root: null,
    pill: null,
    panel: null,
    analysisBox: null,
    walletState: null,
    detection: null,
    requestId: 0
  };

  runDetection(state).catch((error: unknown) => {
    console.error("Algo Safety detection failed", error);
  });

  chrome.runtime.onMessage.addListener((
    message: { type?: string },
    _sender: unknown,
    sendResponse: (value: PageActionDetection) => void
  ) => {
    if (message?.type === "GET_PAGE_DETECTION") {
      sendResponse(state.detection ?? noneDetection());
      return true;
    }

    return undefined;
  });

  observeLocationChanges(() => {
    runDetection(state).catch((error: unknown) => {
      console.error("Algo Safety detection failed", error);
    });
  });
})();

interface ContentState {
  root: HTMLDivElement | null;
  pill: HTMLButtonElement | null;
  panel: HTMLElement | null;
  analysisBox: HTMLElement | null;
  walletState: HTMLElement | null;
  detection: PageActionDetection | null;
  requestId: number;
}

async function runDetection(state: ContentState) {
  const requestId = ++state.requestId;
  teardownUi(state);

  const localDetection = window.detectPageType?.(location.href, document.title) ?? noneDetection();

  if (localDetection.action === "none") {
    state.detection = localDetection;
    await chrome.runtime.sendMessage({
      type: "SET_LAST_DETECTED_PAGE_TYPE",
      payload: { pageType: localDetection.type }
    });
    return;
  }

  if (localDetection.action === "check_backend") {
    state.detection = {
      type: "unknown",
      action: "check_backend",
      label: "",
      price: 0,
      tier: "backend"
    };
    await chrome.runtime.sendMessage({
      type: "SET_LAST_DETECTED_PAGE_TYPE",
      payload: { pageType: "unknown" }
    });

    const response = await chrome.runtime.sendMessage({
      type: "DETECT_PAGE_WITH_BACKEND",
      payload: {
        url: location.href,
        html: document.documentElement.outerHTML.slice(0, 2000)
      }
    });

    if (requestId !== state.requestId) {
      return;
    }

    if (!response?.ok || !response.result?.summarizable) {
      return;
    }

    const backendDetection = normalizeBackendDetection(response.result);
    await mountUi(state, backendDetection);
    return;
  }

  await mountUi(state, localDetection);
}

async function mountUi(state: ContentState, detection: PageActionDetection) {
  state.detection = detection;

  await chrome.runtime.sendMessage({
    type: "SET_LAST_DETECTED_PAGE_TYPE",
    payload: { pageType: detection.type }
  });

  const root = document.createElement("div");
  root.id = "algo-safety-root";

  const pill = document.createElement("button");
  pill.id = "algo-safety-action-pill";
  pill.textContent = formatPillText(detection);
  pill.addEventListener("click", () => handlePageAction(detection));

  const toggle = document.createElement("button");
  toggle.id = "algo-safety-toggle";
  toggle.textContent = "Safety Layer";

  const panel = document.createElement("aside");
  panel.id = "algo-safety-panel";
  panel.innerHTML = renderPanel(detection);

  root.appendChild(pill);
  root.appendChild(toggle);
  root.appendChild(panel);
  document.documentElement.appendChild(root);

  const closeButton = panel.querySelector<HTMLElement>("[data-close]");
  const connectButton = panel.querySelector<HTMLButtonElement>("[data-connect-wallet]");
  const analyzeButton = panel.querySelector<HTMLButtonElement>("[data-deep-analyze]");
  const analysisBox = panel.querySelector<HTMLElement>("[data-analysis-box]");
  const walletState = panel.querySelector<HTMLElement>("[data-wallet-state]");

  toggle.addEventListener("click", () => panel.classList.add("is-open"));
  closeButton?.addEventListener("click", () => panel.classList.remove("is-open"));

  connectButton?.addEventListener("click", async () => {
    if (walletState) {
      walletState.textContent =
        "Open the extension popup and create or import your embedded wallet.";
    }
  });

  analyzeButton?.addEventListener("click", async () => {
    if (!analysisBox) {
      return;
    }

    analysisBox.textContent = "Running deep analysis...";
    const response = await chrome.runtime.sendMessage({
      type: "DEEP_ANALYZE_PROTOCOL",
      payload: {
        protocol: buildProtocolProfile(detection),
        pageContext: {
          pageType: detection.type,
          url: location.href,
          title: document.title,
          snippet: document.body?.innerText?.slice(0, 1200) ?? ""
        }
      }
    });

    if (!response?.ok) {
      analysisBox.textContent = response?.error || "Analysis failed.";
      return;
    }

    analysisBox.textContent = response.analysis;
  });

  state.root = root;
  state.pill = pill;
  state.panel = panel;
  state.analysisBox = analysisBox;
  state.walletState = walletState;
}

function teardownUi(state: ContentState) {
  state.root?.remove();
  state.root = null;
  state.pill = null;
  state.panel = null;
  state.analysisBox = null;
  state.walletState = null;
  state.detection = null;
}

function renderPanel(detection: PageActionDetection) {
  const pricing = detection.tier === "free" ? "Free" : `$${detection.price.toFixed(2)}`;
  const profile = buildProtocolProfile(detection);
  const checksHtml = profile.checks.map((item) => `<li>${escapeHtml(item)}</li>`).join("");

  return `
    <div class="algo-safety-header">
      <div>
        <h2>${escapeHtml(profile.name)}</h2>
        <span class="algo-risk-pill">${escapeHtml(detection.type)} · ${escapeHtml(pricing)}</span>
      </div>
      <button class="algo-safety-close" data-close>x</button>
    </div>
    <div class="algo-safety-content">
      <section class="algo-safety-section">
        <h3>Detected page type</h3>
        <p>${escapeHtml(detection.type)}</p>
      </section>
      <section class="algo-safety-section">
        <h3>Suggested action</h3>
        <p>${escapeHtml(detection.label)} (${escapeHtml(pricing)})</p>
        <ul class="algo-safety-list">${checksHtml}</ul>
      </section>
      <section class="algo-safety-section">
        <h3>Deep analysis</h3>
        <p>Use Gemini 2.5 Flash for a richer explanation of this page and what to do next.</p>
        <div class="algo-safety-actions">
          <button class="algo-safety-primary" data-deep-analyze>Run deep analysis</button>
        </div>
        <div class="algo-analysis-box" data-analysis-box>Analysis output will appear here.</div>
      </section>
      <section class="algo-safety-wallet">
        <h3>Algorand Wallet</h3>
        <p class="algo-wallet-meta">Use the extension popup to create or import your embedded Algorand TestNet wallet, then come back here.</p>
        <div class="algo-safety-actions">
          <button class="algo-safety-secondary" data-connect-wallet>Open wallet setup</button>
        </div>
        <div class="algo-analysis-box" data-wallet-state>Wallet not connected.</div>
      </section>
    </div>
  `;
}

function formatPillText(detection: PageActionDetection) {
  const priceText = detection.tier === "free" ? "Free" : `$${detection.price.toFixed(2)}`;
  return `${detection.label} - ${priceText}`;
}

function buildProtocolProfile(detection: PageActionDetection): AlgoProtocolProfile {
  return {
    name: toTitleCase(detection.type.replaceAll("_", " ")),
    category: detection.type,
    riskScore: detection.tier === "paid" ? 38 : 12,
    trustLevel: detection.tier === "paid" ? "Premium" : "General",
    summary: `${detection.label} is available for this page type.`,
    checks: [
      `Page classified as ${detection.type}`,
      `Action selected: ${detection.action}`,
      detection.tier === "free"
        ? "This action is available without payment."
        : `This action is priced at $${detection.price.toFixed(2)}.`
    ],
    premiumFocus: [
      detection.label,
      "Context extraction",
      "Actionable summary",
      "Page-specific explanation"
    ]
  };
}

function handlePageAction(detection: PageActionDetection) {
  console.log("page_action", {
    type: detection.type,
    action: detection.action,
    price: detection.price
  });
}

function observeLocationChanges(onChange: () => void) {
  let lastUrl = location.href;

  const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      onChange();
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  window.addEventListener("popstate", () => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      onChange();
    }
  });
}

function normalizeBackendDetection(result: Record<string, unknown>): PageActionDetection {
  const price = Number(result.price ?? 0);
  const tierValue = String(result.tier ?? (price > 0 ? "paid" : "free"));
  const tier: PageActionDetection["tier"] =
    tierValue === "paid" ? "paid" : tierValue === "free" ? "free" : "free";

  return {
    type: String(result.type ?? "backend_detected"),
    action: String(result.action ?? "summarize"),
    label: String(result.label ?? "Summarize"),
    price,
    tier
  };
}

function noneDetection(): PageActionDetection {
  return {
    type: "none",
    action: "none",
    label: "",
    price: 0,
    tier: "none"
  };
}

function toTitleCase(value: string) {
  return value.replace(/\b\w/g, (char) => char.toUpperCase());
}

function escapeHtml(value: string | number) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
