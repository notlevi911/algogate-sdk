(function initAlgoSafetyLayer() {
  const detection = detectPage();
  const protocol = detection.profile;

  const root = document.createElement("div");
  root.id = "algo-safety-root";

  const toggle = document.createElement("button");
  toggle.id = "algo-safety-toggle";
  toggle.textContent = detection.toggleLabel;

  const panel = document.createElement("aside");
  panel.id = "algo-safety-panel";
  panel.innerHTML = renderPanel(protocol, detection);

  root.appendChild(toggle);
  root.appendChild(panel);
  document.documentElement.appendChild(root);

  const closeButton = panel.querySelector<HTMLElement>("[data-close]");
  const connectButton = panel.querySelector<HTMLButtonElement>("[data-connect-wallet]");
  const analyzeButton = panel.querySelector<HTMLButtonElement>("[data-deep-analyze]");
  const walletState = panel.querySelector<HTMLElement>("[data-wallet-state]");
  const analysisBox = panel.querySelector<HTMLElement>("[data-analysis-box]");
  const pageTypeBox = panel.querySelector<HTMLElement>("[data-page-type]");

  chrome.runtime.sendMessage({
    type: "SET_LAST_DETECTED_PAGE_TYPE",
    payload: { pageType: detection.pageType }
  });

  if (pageTypeBox) {
    pageTypeBox.textContent = detection.pageTypeLabel;
  }

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
        protocol,
        pageContext: {
          pageType: detection.pageType,
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
})();

interface PageDetection {
  pageType: string;
  pageTypeLabel: string;
  toggleLabel: string;
  profile: AlgoProtocolProfile;
}

function detectPage(): PageDetection {
  const host = location.hostname.replace(/^www\./, "");
  const protocol = window.ALGO_PROTOCOLS?.[host];

  if (protocol) {
    return {
      pageType: "algorand-defi",
      pageTypeLabel: "Algorand DeFi page detected",
      toggleLabel: `Algo Risk: ${protocol.name}`,
      profile: protocol
    };
  }

  if (isYouTubePage(host, location.pathname)) {
    return {
      pageType: "youtube",
      pageTypeLabel: "YouTube page detected",
      toggleLabel: "Page Type: YouTube",
      profile: {
        name: "YouTube",
        category: "Video",
        riskScore: 18,
        trustLevel: "General",
        summary:
          "This looks like a YouTube page. The extension can treat this as a media/watch context rather than a DeFi protocol page.",
        checks: [
          "Video/media page detected",
          "This is not an Algorand DeFi protocol",
          "Useful for ad-free or content summarization flows later"
        ],
        premiumFocus: [
          "Video summary",
          "Creator/channel context",
          "Content trust notes",
          "Future premium media analysis"
        ]
      }
    };
  }

  if (isDocPage(host, location.pathname)) {
    return {
      pageType: "documentation",
      pageTypeLabel: "Documentation page detected",
      toggleLabel: "Page Type: Docs",
      profile: {
        name: "Documentation Page",
        category: "Docs",
        riskScore: 12,
        trustLevel: "Informational",
        summary:
          "This looks like a docs or developer-reference page. The extension can use this context for summarization and technical explanation.",
        checks: [
          "Documentation-like URL or host pattern detected",
          "Likely developer or product reference content",
          "Good candidate for summarization or Q&A"
        ],
        premiumFocus: [
          "Technical summarization",
          "Decision-relevant takeaways",
          "Glossary extraction",
          "API or architecture explanation"
        ]
      }
    };
  }

  if (isPdfPage()) {
    return {
      pageType: "pdf",
      pageTypeLabel: "PDF page detected",
      toggleLabel: "Page Type: PDF",
      profile: {
        name: "PDF Document",
        category: "Document",
        riskScore: 10,
        trustLevel: "Informational",
        summary:
          "This looks like a PDF/document page. Good fit for premium summarization and document understanding flows.",
        checks: [
          "PDF or embedded document detected",
          "Likely useful for summarization",
          "Not a protocol interaction page"
        ],
        premiumFocus: [
          "Document summary",
          "Key risks and action items",
          "Extracted definitions",
          "Structured notes"
        ]
      }
    };
  }

  return {
    pageType: "generic",
    pageTypeLabel: "General webpage detected",
    toggleLabel: "Page Type: Web",
    profile: {
      name: "General Webpage",
      category: "Web",
      riskScore: 15,
      trustLevel: "Unknown",
      summary:
        "This page is not one of the hardcoded Algorand DeFi protocols, but the extension can still classify and analyze it.",
      checks: [
        "Generic webpage detected",
        "No known Algorand protocol match",
        "Gemini analysis can still inspect visible page context"
      ],
      premiumFocus: [
        "General page summary",
        "Trust signals",
        "Content explanation",
        "Custom page-type reasoning"
      ]
    }
  };
}

function renderPanel(protocol: AlgoProtocolProfile, detection: PageDetection) {
  const checksHtml = protocol.checks
    .map((item: string) => `<li>${escapeHtml(item)}</li>`)
    .join("");
  const premiumHtml = protocol.premiumFocus
    .map((item: string) => `<li>${escapeHtml(item)}</li>`)
    .join("");

  return `
    <div class="algo-safety-header">
      <div>
        <h2>${escapeHtml(protocol.name)}</h2>
        <span class="algo-risk-pill">${escapeHtml(protocol.category)} · Risk ${protocol.riskScore}</span>
      </div>
      <button class="algo-safety-close" data-close>x</button>
    </div>
    <div class="algo-safety-content">
      <section class="algo-safety-section">
        <h3>Detected page type</h3>
        <p data-page-type>${escapeHtml(detection.pageTypeLabel)}</p>
      </section>
      <section class="algo-safety-section">
        <h3>Free checks</h3>
        <p>${escapeHtml(protocol.summary)}</p>
        <ul class="algo-safety-list">${checksHtml}</ul>
      </section>
      <section class="algo-safety-section">
        <h3>Premium x402-style scan</h3>
        <p>Unlock a deeper report with Gemini 2.5 Flash: treasury/governance risk, page explanation, whale concentration, and plain-English failure modes.</p>
        <ul class="algo-safety-list">${premiumHtml}</ul>
        <div class="algo-safety-actions">
          <button class="algo-safety-primary" data-deep-analyze>Run deep analysis</button>
        </div>
        <div class="algo-analysis-box" data-analysis-box>Premium analysis output will appear here.</div>
      </section>
      <section class="algo-safety-wallet">
        <h3>Algorand Wallet</h3>
        <p class="algo-wallet-meta">Use the extension popup to create or import your embedded Algorand TestNet wallet, then return to this page.</p>
        <div class="algo-safety-actions">
          <button class="algo-safety-secondary" data-connect-wallet>Open wallet setup</button>
        </div>
        <div class="algo-analysis-box" data-wallet-state>Wallet not connected.</div>
      </section>
    </div>
  `;
}

function isYouTubePage(host: string, pathname: string) {
  return host.includes("youtube.com") || host === "youtu.be" || pathname === "/watch";
}

function isDocPage(host: string, pathname: string) {
  return (
    host.startsWith("docs.") ||
    host.startsWith("developer.") ||
    host.includes("readthedocs") ||
    pathname.includes("/docs") ||
    pathname.includes("/documentation") ||
    pathname.includes("/reference")
  );
}

function isPdfPage() {
  return (
    location.pathname.toLowerCase().endsWith(".pdf") ||
    document.contentType === "application/pdf" ||
    Boolean(document.querySelector('embed[type="application/pdf"], object[type="application/pdf"]'))
  );
}

function escapeHtml(value: string | number) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
