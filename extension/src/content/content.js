"use strict";
(function initAlgoSafetyLayer() {
    if (document.getElementById("algo-safety-root")) {
        return;
    }
    const state = {
        root: null,
        pill: null,
        panel: null,
        resultBox: null,
        walletState: null,
        walletBalance: null,
        passwordInput: null,
        detection: null,
        requestId: 0,
        panelOpen: false
    };
    runDetection(state).catch((error) => {
        console.error("Algo Safety detection failed", error);
    });
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
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
                .catch((error) => sendResponse({
                ok: false,
                error: error instanceof Error ? error.message : "Action failed."
            }));
            return true;
        }
        return undefined;
    });
    observeLocationChanges(() => {
        runDetection(state).catch((error) => {
            console.error("Algo Safety detection failed", error);
        });
    });
})();
let cachedEnvConfig = null;
async function runDetection(state) {
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
async function mountUi(state, detection) {
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
    const closeButton = panel.querySelector("[data-close]");
    const walletButton = panel.querySelector("[data-open-wallet]");
    const refreshWalletButton = panel.querySelector("[data-refresh-wallet]");
    const freeButton = panel.querySelector("[data-run-free]");
    const paidButton = panel.querySelector("[data-run-paid]");
    const resultBox = panel.querySelector("[data-result-box]");
    const walletState = panel.querySelector("[data-wallet-state]");
    const walletBalance = panel.querySelector("[data-wallet-balance]");
    const passwordInput = panel.querySelector("[data-wallet-password]");
    toggle.addEventListener("click", () => {
        if (panel.classList.contains("is-open")) {
            closePanel(state);
        }
        else {
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
    state.passwordInput = passwordInput;
    await refreshWalletCard(state);
}
function renderPanel(detection) {
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
        <label class="algo-input-group">
          <span>Wallet password</span>
          <input data-wallet-password type="password" placeholder="Needed only for premium payment signing" />
        </label>
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
async function refreshWalletCard(state) {
    if (!state.walletState || !state.walletBalance) {
        return;
    }
    state.walletState.textContent = "Checking embedded wallet...";
    state.walletBalance.textContent = "Balance: --";
    const statusResponse = await chrome.runtime.sendMessage({ type: "GET_WALLET_STATUS" });
    const status = (statusResponse?.status ?? {});
    if (!statusResponse?.ok || !status?.initialized || !status.address) {
        state.walletState.textContent = "No embedded wallet found yet. Create or import it first.";
        state.walletBalance.textContent = "Balance: --";
        return;
    }
    state.walletState.textContent = `Payer: ${shortAddress(status.address)} on ${status.network || "testnet"}`;
    state.walletBalance.textContent = "Balance: Loading ALGO and TestNet USDC...";
    const balanceResponse = await chrome.runtime.sendMessage({
        type: "GET_WALLET_BALANCE",
        payload: { address: status.address }
    });
    const balance = (balanceResponse?.balance ?? {});
    if (!balanceResponse?.ok) {
        state.walletBalance.textContent = "Balance unavailable right now.";
        return;
    }
    state.walletBalance.textContent = `Balance: ${balance.algo || "0"} ALGO · ${balance.usdc || "0"} USDC`;
}
async function runPageAction(state, detection, tier) {
    if (!state.resultBox) {
        return;
    }
    if (!supportsSummaryAction(detection)) {
        setResultMessage(state, `${detection.label} is detected, but this non-summary flow is not wired yet.`, "warning");
        return;
    }
    setResultMessage(state, tier === "free" ? "Running quick summary..." : "Requesting premium summary...", "loading");
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
    });
    if (response.status === 402 && tier === "paid") {
        await handlePaidChallenge(state, body, response);
        return;
    }
    if (!response.ok) {
        setResultMessage(state, await readBackendError(response), "error");
        return;
    }
    const result = (await response.json());
    renderSummaryResult(state, result, tier);
}
async function handlePaidChallenge(state, requestBody, response) {
    if (!state.resultBox) {
        return;
    }
    const encodedHeader = getHeaderCaseInsensitive(response.headers, "PAYMENT-REQUIRED");
    if (!encodedHeader) {
        setResultMessage(state, "The backend requested payment, but the payment challenge header was not exposed to the extension.", "error");
        return;
    }
    const paymentRequired = decodePaymentRequired(encodedHeader);
    const accepted = paymentRequired.accepts?.[0];
    if (!accepted) {
        setResultMessage(state, "The backend did not provide a usable payment option.", "error");
        return;
    }
    setResultMessage(state, formatPaymentChallenge(paymentRequired), "info");
    const password = state.passwordInput?.value.trim() || "";
    if (!password) {
        setResultMessage(state, `${formatPaymentChallenge(paymentRequired)}\n\nEnter your wallet password in the panel, then click the premium button again to sign and pay.`, "info");
        return;
    }
    const walletResponse = await chrome.runtime.sendMessage({
        type: "REVEAL_WALLET_SECRETS",
        payload: { password }
    });
    if (!walletResponse?.ok) {
        setResultMessage(state, walletResponse?.error || "Could not unlock the embedded wallet.", "error");
        return;
    }
    setResultMessage(state, "Signing Algorand TestNet USDC payment with the embedded wallet...", "loading");
    const paymentHeader = await createPaymentSignature(paymentRequired, walletResponse.wallet);
    const retryResponse = await fetchEtherApi("/api/summarize/paid", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "PAYMENT-SIGNATURE": paymentHeader
        },
        body: requestBody
    });
    if (!retryResponse.ok) {
        setResultMessage(state, await readBackendError(retryResponse), "error");
        return;
    }
    const result = (await retryResponse.json());
    renderSummaryResult(state, result, "paid");
    await refreshWalletCard(state);
}
async function createPaymentSignature(paymentRequired, wallet) {
    const accepted = paymentRequired.accepts?.[0];
    if (!accepted) {
        throw new Error("No accepted payment requirements found.");
    }
    const algodClient = new algosdk.Algodv2("", "https://testnet-api.algonode.cloud", "");
    const suggestedParams = await algodClient.getTransactionParams().do();
    const transactions = [];
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
        ? {
            ...suggestedParams,
            fee: 0,
            flatFee: true
        }
        : suggestedParams;
    const assetTxn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
        sender: wallet.address,
        receiver: accepted.payTo,
        amount: BigInt(accepted.amount),
        assetIndex: Number(accepted.asset),
        note: new TextEncoder().encode(`x402-payment-${Date.now()}`),
        suggestedParams: assetParams
    });
    transactions.push(assetTxn);
    if (transactions.length > 1) {
        algosdk.assignGroupID(transactions);
    }
    const secretKey = decodeBase64ToUint8Array(wallet.secretKeyBase64);
    const signedAssetTxn = assetTxn.signTxn(secretKey);
    const paymentGroup = transactions.map((txn, index) => {
        if (index === paymentIndex) {
            return encodeBytesToBase64(signedAssetTxn);
        }
        return encodeBytesToBase64(algosdk.encodeUnsignedTransaction(txn));
    });
    const payload = {
        x402Version: Number(paymentRequired.x402Version || 2),
        payload: {
            paymentGroup,
            paymentIndex
        },
        accepted,
        resource: paymentRequired.resource || { url: location.href },
        extensions: paymentRequired.extensions
    };
    return encodeTextToBase64(JSON.stringify(payload));
}
function renderSummaryResult(state, result, tier) {
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
function renderListSection(label, items) {
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
function setResultMessage(state, message, tone) {
    if (!state.resultBox) {
        return;
    }
    state.resultBox.className = `algo-analysis-box tone-${tone}`;
    state.resultBox.textContent = message;
}
async function fetchEtherApi(path, init) {
    const env = await getExtensionEnvConfig();
    const headers = new Headers(init.headers || {});
    headers.set("X-Ether-Key", env.apiKey);
    return fetch(`${env.apiBaseUrl}${path}`, { ...init, headers });
}
async function getExtensionEnvConfig() {
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
    }
    catch {
        cachedEnvConfig = defaultEnvConfig();
        return cachedEnvConfig;
    }
}
function defaultEnvConfig() {
    return {
        apiBaseUrl: "http://127.0.0.1:8000",
        apiKey: "ether-browser-dev"
    };
}
function parseEnv(text) {
    const values = {};
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
function normalizeBackendDetection(result) {
    const price = Number(result.suggested_price ?? result.price ?? 0);
    const tierValue = String(result.suggested_tier ?? result.tier ?? (price > 0 ? "paid" : "free"));
    const tier = tierValue === "paid" ? "paid" : tierValue === "free" ? "free" : "free";
    return {
        type: String(result.page_type ?? result.type ?? "backend_detected"),
        action: String(result.action ?? "summarize"),
        label: String(result.action_label ?? result.label ?? "Summarize"),
        price,
        tier
    };
}
function supportsSummaryAction(detection) {
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
function formatPaymentChallenge(paymentRequired) {
    const accepted = paymentRequired.accepts?.[0];
    if (!accepted) {
        return "Payment required.";
    }
    const amount = Number(accepted.amount || 0) / 1_000_000;
    const assetLabel = String(accepted.asset) === "10458941" ? "USDC" : accepted.asset;
    const description = paymentRequired.resource?.description || "Premium action";
    return `Payment required for ${description}: ${amount.toFixed(2)} ${assetLabel} on Algorand TestNet.`;
}
function formatPillText(detection) {
    const priceText = detection.tier === "free" ? "Free" : `$${detection.price.toFixed(2)}`;
    return `${detection.label} - ${priceText}`;
}
function openPanel(state) {
    state.panelOpen = true;
    state.panel?.classList.add("is-open");
}
function closePanel(state) {
    state.panelOpen = false;
    state.panel?.classList.remove("is-open");
}
function teardownUi(state) {
    state.root?.remove();
    state.root = null;
    state.pill = null;
    state.panel = null;
    state.resultBox = null;
    state.walletState = null;
    state.walletBalance = null;
    state.passwordInput = null;
    state.detection = null;
}
function observeLocationChanges(onChange) {
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
async function readBackendError(response) {
    try {
        const json = (await response.json());
        const detail = json.detail;
        if (typeof detail === "string") {
            return detail;
        }
        if (detail && typeof detail === "object") {
            return String(detail.error || detail.detail || response.statusText || "Request failed.");
        }
        return String(json.error || response.statusText || "Request failed.");
    }
    catch {
        return `Request failed with status ${response.status}.`;
    }
}
function normalizeStringArray(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.map((item) => String(item)).filter(Boolean);
}
function getHeaderCaseInsensitive(headers, name) {
    return headers.get(name) || headers.get(name.toLowerCase()) || headers.get(name.toUpperCase());
}
function decodePaymentRequired(headerValue) {
    return JSON.parse(decodeBase64ToText(headerValue));
}
function decodeBase64ToText(value) {
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
}
function decodeBase64ToUint8Array(value) {
    const binary = atob(value);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
function encodeTextToBase64(value) {
    return encodeBytesToBase64(new TextEncoder().encode(value));
}
function encodeBytesToBase64(value) {
    let binary = "";
    value.forEach((byte) => {
        binary += String.fromCharCode(byte);
    });
    return btoa(binary);
}
function noneDetection() {
    return {
        type: "none",
        action: "none",
        label: "",
        price: 0,
        tier: "none"
    };
}
function shortAddress(value) {
    return value.length > 12 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value;
}
function toTitleCase(value) {
    return value.replace(/\b\w/g, (char) => char.toUpperCase());
}
function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}
