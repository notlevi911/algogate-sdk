(function initAlgoSafetyLayer() {
  if (document.getElementById("algo-safety-root")) {
    return;
  }

  const state: ContentState = {
    root: null,
    pill: null,
    panel: null,
    resultBox: null,
    walletState: null,
    walletBalance: null,
    detection: null,
    requestId: 0,
    panelOpen: false
  };

  runDetection(state).catch((error: unknown) => {
    console.error("Algo Safety detection failed", error);
  });

  chrome.runtime.onMessage.addListener((
    message: { type?: string; payload?: { tier?: "free" | "paid" } },
    _sender: unknown,
    sendResponse: (value: unknown) => void
  ) => {
    if (message?.type === "GET_PAGE_DETECTION") {
      sendResponse(state.detection ?? noneDetection());
      return true;
    }

    if (message?.type === "OPEN_ETHER_PANEL") {
      openPanel(state);
      sendResponse({ ok: true });
      return true;
    }

    if (message?.type === "RUN_PAGE_ACTION") {
      const tier = message.payload?.tier === "paid" ? "paid" : "free";
      const detection = state.detection;
      if (!detection || detection.action === "none") {
        sendResponse({ ok: false, error: "No supported action for this page yet." });
        return true;
      }

      openPanel(state);
      runPageAction(state, detection, tier)
        .then(() => sendResponse({ ok: true }))
        .catch((error: unknown) =>
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : "Action failed."
          })
        );
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
  resultBox: HTMLElement | null;
  walletState: HTMLElement | null;
  walletBalance: HTMLElement | null;
  detection: PageActionDetection | null;
  requestId: number;
  panelOpen: boolean;
}

interface ExtensionEnvConfig {
  apiBaseUrl: string;
  apiKey: string;
}

interface WalletStatus {
  initialized?: boolean;
  unlocked?: boolean;
  address?: string;
  network?: string;
}

interface WalletSecrets {
  address: string;
  network: string;
  mnemonic: string;
  secretKeyBase64: string;
}

interface WalletBalance {
  algo?: string;
  usdc?: string;
  microAlgos?: number;
  microUsdc?: number;
}

interface X402PaymentRequired {
  x402Version?: number;
  error?: string;
  resource?: {
    url?: string;
    description?: string;
    mimeType?: string;
  };
  accepts?: X402PaymentRequirement[];
  extensions?: Record<string, unknown>;
}

interface X402PaymentRequirement {
  scheme: string;
  network: string;
  asset: string;
  amount: string;
  payTo: string;
  maxTimeoutSeconds?: number;
  extra?: Record<string, unknown>;
}

let cachedEnvConfig: ExtensionEnvConfig | null = null;

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
      state.detection = noneDetection();
      return;
    }

    await mountUi(state, normalizeBackendDetection(response.result));
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
  pill.addEventListener("click", () => openPanel(state));

  const toggle = document.createElement("button");
  toggle.id = "algo-safety-toggle";
  toggle.textContent = "Ether Tools";

  const panel = document.createElement("aside");
  panel.id = "algo-safety-panel";
  panel.innerHTML = renderPanel(detection);

  root.appendChild(pill);
  root.appendChild(toggle);
  root.appendChild(panel);
  document.documentElement.appendChild(root);

  if (state.panelOpen) {
    panel.classList.add("is-open");
  }

  const closeButton = panel.querySelector<HTMLElement>("[data-close]");
  const walletButton = panel.querySelector<HTMLButtonElement>("[data-open-wallet]");
  const refreshWalletButton = panel.querySelector<HTMLButtonElement>("[data-refresh-wallet]");
  const freeButton = panel.querySelector<HTMLButtonElement>("[data-run-free]");
  const paidButton = panel.querySelector<HTMLButtonElement>("[data-run-paid]");
  const resultBox = panel.querySelector<HTMLElement>("[data-result-box]");
  const walletState = panel.querySelector<HTMLElement>("[data-wallet-state]");
  const walletBalance = panel.querySelector<HTMLElement>("[data-wallet-balance]");

  toggle.addEventListener("click", () => {
    if (panel.classList.contains("is-open")) {
      closePanel(state);
    } else {
      openPanel(state);
    }
  });

  closeButton?.addEventListener("click", () => closePanel(state));

  walletButton?.addEventListener("click", () => {
    window.open(chrome.runtime.getURL("src/onboarding/onboarding.html"), "_blank");
  });

  refreshWalletButton?.addEventListener("click", async () => {
    await refreshWalletCard(state);
  });

  freeButton?.addEventListener("click", async () => {
    await runPageAction(state, detection, "free");
  });

  paidButton?.addEventListener("click", async () => {
    await runPageAction(state, detection, "paid");
  });

  state.root = root;
  state.pill = pill;
  state.panel = panel;
  state.resultBox = resultBox;
  state.walletState = walletState;
  state.walletBalance = walletBalance;

  await refreshWalletCard(state);
}

function renderPanel(detection: PageActionDetection) {
  const pricing = detection.tier === "free" ? "Free" : `$${detection.price.toFixed(2)}`;
  const summaryEnabled = supportsSummaryAction(detection);
  const paidButtonLabel = summaryEnabled
    ? detection.tier === "paid"
      ? `Pay ${pricing} and Unlock`
      : "Upgrade to Premium"
    : detection.label;
  const summaryText = summaryEnabled
    ? "Use the free tier for a quick read or unlock the stronger Gemini path over x402 on Algorand TestNet."
    : "This page type is detected correctly, but the non-summary premium flow for it is still coming next.";

  return `
    <div class="algo-safety-header">
      <div>
        <p class="algo-brand">Ether Browser</p>
        <h2>${escapeHtml(toTitleCase(detection.type.replaceAll("_", " ")))}</h2>
        <span class="algo-risk-pill">${escapeHtml(detection.label)} · ${escapeHtml(pricing)}</span>
      </div>
      <button class="algo-safety-close" data-close aria-label="Close panel">x</button>
    </div>
    <div class="algo-safety-content">
      <section class="algo-safety-section">
        <h3>Detected page</h3>
        <p class="algo-muted">${escapeHtml(location.hostname)}</p>
        <p>${escapeHtml(detection.type)} was detected for this tab.</p>
      </section>

      <section class="algo-safety-section">
        <h3>Action</h3>
        <p>${escapeHtml(summaryText)}</p>
        <div class="algo-safety-actions">
          <button class="algo-safety-primary" data-run-free ${summaryEnabled ? "" : "disabled"}>Quick Summary</button>
          <button class="algo-safety-secondary" data-run-paid ${summaryEnabled ? "" : "disabled"}>${escapeHtml(paidButtonLabel)}</button>
        </div>
      </section>

      <section class="algo-safety-wallet">
        <h3>Wallet Payer</h3>
        <p class="algo-wallet-meta">Your embedded Algorand TestNet wallet is used as the x402 payer for premium actions.</p>
        <div class="algo-wallet-card">
          <div class="algo-wallet-line" data-wallet-state>Checking embedded wallet...</div>
          <div class="algo-wallet-line algo-muted" data-wallet-balance>Balance: --</div>
        </div>
        <p class="algo-wallet-meta">Unlock it once from the popup, then premium requests can use that session without asking again.</p>
        <div class="algo-safety-actions">
          <button class="algo-safety-primary" data-open-wallet>Wallet Setup</button>
          <button class="algo-safety-secondary" data-refresh-wallet>Refresh Wallet</button>
        </div>
      </section>

      <section class="algo-safety-section">
        <h3>Result</h3>
        <div class="algo-analysis-box" data-result-box>Ready. Pick a free or premium action to begin.</div>
      </section>
    </div>
  `;
}

async function refreshWalletCard(state: ContentState) {
  if (!state.walletState || !state.walletBalance) {
    return;
  }

  state.walletState.textContent = "Checking embedded wallet...";
  state.walletBalance.textContent = "Balance: --";

  const statusResponse = await chrome.runtime.sendMessage({ type: "GET_WALLET_STATUS" });
  const status = (statusResponse?.status ?? {}) as WalletStatus;

  if (!statusResponse?.ok || !status?.initialized || !status.address) {
    state.walletState.textContent = "No embedded wallet found yet. Create or import it first.";
    state.walletBalance.textContent = "Balance: --";
    return;
  }

  state.walletState.textContent = `Payer: ${shortAddress(status.address)} on ${status.network || "testnet"} · ${status.unlocked ? "Unlocked" : "Locked"}`;
  state.walletBalance.textContent = "Balance: Loading ALGO and TestNet USDC...";

  const balanceResponse = await chrome.runtime.sendMessage({
    type: "GET_WALLET_BALANCE",
    payload: { address: status.address }
  });

  const balance = (balanceResponse?.balance ?? {}) as WalletBalance;
  if (!balanceResponse?.ok) {
    state.walletBalance.textContent = "Balance unavailable right now.";
    return;
  }

  state.walletBalance.textContent = `Balance: ${balance.algo || "0"} ALGO · ${balance.usdc || "0"} USDC`;
}

async function runPageAction(
  state: ContentState,
  detection: PageActionDetection,
  tier: "free" | "paid"
) {
  if (!state.resultBox) {
    return;
  }

  if (!supportsSummaryAction(detection)) {
    setResultMessage(state, `${detection.label} is detected, but this non-summary flow is not wired yet.`, "warning");
    return;
  }

  setResultMessage(
    state,
    tier === "free" ? "Running quick summary..." : "Requesting premium summary...",
    "loading"
  );

  const body = JSON.stringify({
    url: location.href,
    html: document.documentElement.outerHTML.slice(0, 250000)
  });

  const response = await fetchEtherApi(`/api/summarize/${tier}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body
  }).catch((error: unknown) => {
    throw new Error(
      error instanceof Error && error.message.includes("Failed to fetch")
        ? "Could not reach the Ether Browser backend. Start the FastAPI server on port 8000 and try again."
        : error instanceof Error
          ? error.message
          : "Request failed."
    );
  });

  if (response.status === 402 && tier === "paid") {
    await handlePaidChallenge(state, body, response);
    return;
  }

  if (!response.ok) {
    setResultMessage(state, await readBackendError(response), "error");
    return;
  }

  const result = (await response.json()) as Record<string, unknown>;
  renderSummaryResult(state, result, tier);
}

async function handlePaidChallenge(
  state: ContentState,
  requestBody: string,
  response: Response
) {
  if (!state.resultBox) {
    return;
  }

  const encodedHeader = getHeaderCaseInsensitive(response.headers, "PAYMENT-REQUIRED");
  if (!encodedHeader) {
    setResultMessage(
      state,
      "The backend requested payment, but the payment challenge header was not exposed to the extension.",
      "error"
    );
    return;
  }

  const paymentRequired = decodePaymentRequired(encodedHeader);
  const accepted = paymentRequired.accepts?.[0];
  if (!accepted) {
    setResultMessage(state, "The backend did not provide a usable payment option.", "error");
    return;
  }

  const approvalText = formatPaymentChallenge(paymentRequired);
  setResultMessage(state, approvalText, "info");

  const sessionResponse = await chrome.runtime.sendMessage({ type: "GET_UNLOCKED_WALLET" });
  if (!sessionResponse?.wallet) {
    setResultMessage(
      state,
      `${approvalText}\n\nUnlock the wallet once from the extension popup, then try the premium action again.`,
      "info"
    );
    return;
  }

  const balanceResponse = await chrome.runtime.sendMessage({
    type: "GET_WALLET_BALANCE",
    payload: { address: (sessionResponse.wallet as WalletSecrets).address }
  });
  const walletBalance = (balanceResponse?.balance ?? {}) as WalletBalance;
  const requiresAlgo = String(accepted.asset || "").toUpperCase() === "ALGO";
  const requiredAtomicAmount = Number(accepted.amount || 0);
  const availableAtomicAmount = requiresAlgo
    ? Number(walletBalance.microAlgos || 0)
    : Number(walletBalance.microUsdc || 0);
  if (!balanceResponse?.ok || availableAtomicAmount < requiredAtomicAmount) {
    setResultMessage(
      state,
      requiresAlgo
        ? `${approvalText}\n\nThis wallet does not have enough Algorand TestNet ALGO to pay yet. Fund it from the TestNet dispenser first.`
        : `${approvalText}\n\nThis wallet does not have enough Algorand TestNet USDC to pay. Opt in to USDC ASA 10458941 and fund the wallet with testnet USDC first.`,
      "warning"
    );
    return;
  }

  if (!window.confirm(`${approvalText}\n\nApprove this premium request from your embedded Algorand TestNet wallet?`)) {
    setResultMessage(state, "Premium request cancelled before payment.", "warning");
    return;
  }

  setResultMessage(state, "Signing Algorand TestNet ALGO payment with the embedded wallet...", "loading");

  const paymentHeader = await createPaymentSignature(
    paymentRequired,
    sessionResponse.wallet as WalletSecrets
  );

  setResultMessage(state, "Payment sent. Confirming it with the backend...", "loading");

  const confirmResponse = await fetchEtherApi("/api/payments/confirm", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "PAYMENT-SIGNATURE": paymentHeader
    },
    body: JSON.stringify({
      resource: paymentRequired.resource?.url || location.href
    })
  }).catch((error: unknown) => {
    throw new Error(
      error instanceof Error && error.message.includes("Failed to fetch")
        ? "Payment was sent, but the backend confirmation request could not reach port 8000."
        : error instanceof Error
          ? error.message
          : "Payment confirmation failed."
    );
  });

  if (!confirmResponse.ok) {
    setResultMessage(state, await readBackendError(confirmResponse), "error");
    return;
  }

  const retryResponse = await fetchEtherApi("/api/summarize/paid", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "PAYMENT-SIGNATURE": paymentHeader
    },
    body: requestBody
  }).catch((error: unknown) => {
    throw new Error(
      error instanceof Error && error.message.includes("Failed to fetch")
        ? "Payment was signed, but the premium retry could not reach the backend on port 8000."
        : error instanceof Error
          ? error.message
          : "Premium retry failed."
    );
  });

  if (!retryResponse.ok) {
    setResultMessage(state, await readBackendError(retryResponse), "error");
    return;
  }

  const result = (await retryResponse.json()) as Record<string, unknown>;
  renderSummaryResult(state, result, "paid");
  await refreshWalletCard(state);
}

async function createPaymentSignature(
  paymentRequired: X402PaymentRequired,
  wallet: WalletSecrets
) {
  const accepted = paymentRequired.accepts?.[0];
  if (!accepted) {
    throw new Error("No accepted payment requirements found.");
  }

  const algodClient = new algosdk.Algodv2("", "https://testnet-api.algonode.cloud", "");
  const suggestedParams = await algodClient.getTransactionParams().do();
  const secretKey = decodeBase64ToUint8Array(wallet.secretKeyBase64);
  const noteText = String(accepted.extra?.noteText || `ether:${Date.now()}`);

  if (String(accepted.asset || "").toUpperCase() === "ALGO" || accepted.scheme === "algo-native") {
    const paymentTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: wallet.address,
      receiver: accepted.payTo,
      amount: Number(accepted.amount),
      note: new TextEncoder().encode(noteText),
      suggestedParams
    });
    const signedPaymentTxn = paymentTxn.signTxn(secretKey);
    const sendResult = await algodClient.sendRawTransaction(signedPaymentTxn).do();
    await waitForAlgoConfirmation(algodClient, sendResult.txId);

    return encodeTextToBase64(
      JSON.stringify({
        x402Version: Number(paymentRequired.x402Version || 2),
        payload: {
          txId: sendResult.txId,
          address: wallet.address
        },
        accepted,
        resource: paymentRequired.resource || { url: location.href },
        extensions: paymentRequired.extensions
      })
    );
  }

  const transactions: unknown[] = [];
  let paymentIndex = 0;
  const feePayer = String(accepted.extra?.feePayer || "");
  if (feePayer) {
    const feePayerParams = {
      ...suggestedParams,
      fee: Number(suggestedParams.minFee || 1000) * 2,
      flatFee: true
    };

    const feePayerTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: feePayer,
      receiver: feePayer,
      amount: 0,
      note: new TextEncoder().encode(`x402-fee-payer-${Date.now()}`),
      suggestedParams: feePayerParams
    });

    transactions.push(feePayerTxn);
    paymentIndex = 1;
  }

  const assetParams = feePayer
    ? { ...suggestedParams, fee: 0, flatFee: true }
    : suggestedParams;

  const assetTxn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
    sender: wallet.address,
    receiver: accepted.payTo,
    amount: BigInt(accepted.amount),
    assetIndex: Number(accepted.asset),
    note: new TextEncoder().encode(noteText),
    suggestedParams: assetParams
  });

  transactions.push(assetTxn);

  if (transactions.length > 1) {
    algosdk.assignGroupID(transactions);
  }

  const signedAssetTxn = assetTxn.signTxn(secretKey);
  const paymentGroup = transactions.map((txn, index) =>
    index === paymentIndex
      ? encodeBytesToBase64(signedAssetTxn)
      : encodeBytesToBase64(algosdk.encodeUnsignedTransaction(txn))
  );

  return encodeTextToBase64(
    JSON.stringify({
      x402Version: Number(paymentRequired.x402Version || 2),
      payload: {
        paymentGroup,
        paymentIndex
      },
      accepted,
      resource: paymentRequired.resource || { url: location.href },
      extensions: paymentRequired.extensions
    })
  );
}

function renderSummaryResult(
  state: ContentState,
  result: Record<string, unknown>,
  tier: "free" | "paid"
) {
  if (!state.resultBox) {
    return;
  }

  state.resultBox.className = "algo-analysis-box";

  const bullets = normalizeStringArray(result.bullets);
  const insights = normalizeStringArray(result.key_insights || result.keyInsights);
  const actionItems = normalizeStringArray(result.action_items || result.actionItems);
  const wordCount = Number(result.word_count ?? 0);
  const readingTime = Number(result.reading_time_mins ?? 0);
  const cost = Number(result.cost ?? (tier === "paid" ? 0.25 : 0));
  const title = String(result.title ?? document.title ?? "Summary");
  const tldr = String(result.tldr ?? "");
  const sourceQuality = String(result.source_quality ?? "");

  state.resultBox.innerHTML = `
    <div class="algo-result-header">
      <strong>${escapeHtml(title)}</strong>
      <span class="algo-result-meta">${escapeHtml(tier.toUpperCase())} · $${cost.toFixed(2)}</span>
    </div>
    <p>${escapeHtml(tldr || "No summary returned.")}</p>
    ${renderListSection("Key points", bullets)}
    ${renderListSection("Key insights", insights)}
    ${renderListSection("Action items", actionItems)}
    <div class="algo-result-footer">
      <span>${escapeHtml(`${wordCount} words`)}</span>
      ${readingTime ? `<span>${escapeHtml(`${readingTime} min read`)}</span>` : ""}
      ${sourceQuality ? `<span>${escapeHtml(`Source quality: ${sourceQuality}`)}</span>` : ""}
    </div>
  `;
}

function renderListSection(label: string, items: string[]) {
  if (!items.length) {
    return "";
  }

  return `
    <div class="algo-result-section">
      <p class="algo-result-label">${escapeHtml(label)}</p>
      <ul class="algo-safety-list">
        ${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
    </div>
  `;
}

function setResultMessage(
  state: ContentState,
  message: string,
  tone: "info" | "error" | "warning" | "loading"
) {
  if (!state.resultBox) {
    return;
  }

  state.resultBox.className = `algo-analysis-box tone-${tone}`;
  state.resultBox.textContent = message;
}

async function fetchEtherApi(path: string, init: RequestInit) {
  const env = await getExtensionEnvConfig();
  const headers = new Headers(init.headers || {});
  headers.set("X-Ether-Key", env.apiKey);
  return fetch(`${env.apiBaseUrl}${path}`, { ...init, headers });
}

async function getExtensionEnvConfig(): Promise<ExtensionEnvConfig> {
  if (cachedEnvConfig) {
    return cachedEnvConfig;
  }

  try {
    const response = await fetch(chrome.runtime.getURL(".env"));
    if (!response.ok) {
      cachedEnvConfig = defaultEnvConfig();
      return cachedEnvConfig;
    }

    const values = parseEnv(await response.text());
    cachedEnvConfig = {
      apiBaseUrl: values.ETHER_API_BASE_URL || "http://127.0.0.1:8000",
      apiKey: values.ETHER_API_KEY || "ether-browser-dev"
    };
    return cachedEnvConfig;
  } catch {
    cachedEnvConfig = defaultEnvConfig();
    return cachedEnvConfig;
  }
}

function defaultEnvConfig(): ExtensionEnvConfig {
  return {
    apiBaseUrl: "http://127.0.0.1:8000",
    apiKey: "ether-browser-dev"
  };
}

function parseEnv(text: string) {
  const values: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    values[trimmed.slice(0, separatorIndex).trim()] = trimmed.slice(separatorIndex + 1).trim();
  }

  return values;
}

function normalizeBackendDetection(result: Record<string, unknown>): PageActionDetection {
  const price = Number(result.suggested_price ?? result.price ?? 0);
  const tierValue = String(result.suggested_tier ?? result.tier ?? (price > 0 ? "paid" : "free"));
  const tier: PageActionDetection["tier"] =
    tierValue === "paid" ? "paid" : tierValue === "free" ? "free" : "free";

  return {
    type: String(result.page_type ?? result.type ?? "backend_detected"),
    action: String(result.action ?? "summarize"),
    label: String(result.action_label ?? result.label ?? "Summarize"),
    price,
    tier
  };
}

function supportsSummaryAction(detection: PageActionDetection) {
  return [
    "research_paper",
    "pdf_document",
    "documentation",
    "article",
    "paywalled_article",
    "wikipedia",
    "legal",
    "financial_doc",
    "github_repo",
    "github_readme",
    "stackoverflow",
    "youtube_search",
    "algorand_defi"
  ].includes(detection.type);
}

function formatPaymentChallenge(paymentRequired: X402PaymentRequired) {
  const accepted = paymentRequired.accepts?.[0];
  if (!accepted) {
    return "Payment required.";
  }

  const amount = Number(accepted.amount || 0) / 1_000_000;
  const assetLabel = String(accepted.asset).toUpperCase() === "ALGO"
    ? "ALGO"
    : String(accepted.asset) === "10458941"
      ? "USDC"
      : accepted.asset;
  const description = paymentRequired.resource?.description || "Premium action";
  return `Payment required for ${description}: ${amount.toFixed(2)} ${assetLabel} on Algorand TestNet.`;
}

function formatPillText(detection: PageActionDetection) {
  const priceText = detection.tier === "free" ? "Free" : `$${detection.price.toFixed(2)}`;
  return `${detection.label} - ${priceText}`;
}

function openPanel(state: ContentState) {
  state.panelOpen = true;
  state.panel?.classList.add("is-open");
}

function closePanel(state: ContentState) {
  state.panelOpen = false;
  state.panel?.classList.remove("is-open");
}

function teardownUi(state: ContentState) {
  state.root?.remove();
  state.root = null;
  state.pill = null;
  state.panel = null;
  state.resultBox = null;
  state.walletState = null;
  state.walletBalance = null;
  state.detection = null;
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

async function readBackendError(response: Response) {
  try {
    const json = (await response.json()) as Record<string, unknown>;
    const detail = json.detail as Record<string, unknown> | string | undefined;
    if (typeof detail === "string") {
      return detail;
    }
    if (detail && typeof detail === "object") {
      return String(detail.error || detail.detail || response.statusText || "Request failed.");
    }
    return String(json.error || response.statusText || "Request failed.");
  } catch {
    return `Request failed with status ${response.status}.`;
  }
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item)).filter(Boolean);
}

function getHeaderCaseInsensitive(headers: Headers, name: string) {
  return headers.get(name) || headers.get(name.toLowerCase()) || headers.get(name.toUpperCase());
}

function decodePaymentRequired(headerValue: string): X402PaymentRequired {
  return JSON.parse(decodeBase64ToText(headerValue)) as X402PaymentRequired;
}

function decodeBase64ToText(value: string) {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function decodeBase64ToUint8Array(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function encodeTextToBase64(value: string) {
  return encodeBytesToBase64(new TextEncoder().encode(value));
}

function encodeBytesToBase64(value: Uint8Array) {
  let binary = "";
  value.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

async function waitForAlgoConfirmation(algodClient: any, txId: string) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const pending = await algodClient.pendingTransactionInformation(txId).do();
    if (Number(pending["confirmed-round"] || 0) > 0) {
      return pending;
    }

    const status = await algodClient.status().do();
    await algodClient.statusAfterBlock(Number(status["last-round"] || 0) + 1).do();
  }

  throw new Error("Transaction was sent but not confirmed quickly enough.");
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

function shortAddress(value: string) {
  return value.length > 12 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value;
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
