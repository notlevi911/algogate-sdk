"use strict";
const pageUrlEl = document.getElementById("page-url");
const pageDetectionEl = document.getElementById("page-detection");
const pagePriceEl = document.getElementById("page-price");
const pageStatusEl = document.getElementById("page-status");
const openPagePanelButton = document.getElementById("open-page-panel");
const runFreeActionButton = document.getElementById("run-free-action");
const runPaidActionButton = document.getElementById("run-paid-action");
const actionResultEl = document.getElementById("action-result");
const walletStateEl = document.getElementById("wallet-state");
const walletPrimaryButton = document.getElementById("wallet-primary");
const copyWalletAddressButton = document.getElementById("copy-wallet-address");
const walletPageButton = document.getElementById("wallet-page");
const revealWalletButton = document.getElementById("reveal-wallet");
const walletPasswordEl = document.getElementById("wallet-password");
const walletSecretsEl = document.getElementById("wallet-secrets");
const walletBalanceEl = document.getElementById("wallet-balance");
const optionsButton = document.getElementById("open-options");
let activeTabId = null;
let activeDetection = null;
let activeWalletAddress = "";
let popupEnvConfigCache = null;
init().catch((error) => {
    const message = error instanceof Error ? error.message : "Failed to load popup.";
    walletStateEl.textContent = message;
    pageStatusEl.textContent = message;
    setActionResult(message, "error");
});
async function init() {
    await Promise.all([loadCurrentPage(), loadWallet()]);
}
async function loadCurrentPage() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    activeTabId = typeof tab?.id === "number" ? tab.id : null;
    const currentUrl = tab?.url ?? "";
    pageUrlEl.textContent = currentUrl || "No active page.";
    if (!activeTabId || !currentUrl || currentUrl.startsWith("chrome://")) {
        activeDetection = null;
        pageDetectionEl.textContent = "This tab is not available for extension actions.";
        pagePriceEl.textContent = "";
        setPageButtonsDisabled(true);
        return;
    }
    try {
        const response = await chrome.tabs.sendMessage(activeTabId, { type: "GET_PAGE_DETECTION" });
        const detection = response;
        if (!detection || detection.action === "none") {
            activeDetection = null;
            pageDetectionEl.textContent = "No supported action for this page yet.";
            pagePriceEl.textContent = "";
            setPageButtonsDisabled(true);
            return;
        }
        activeDetection = detection;
        pageDetectionEl.textContent = `${popupTitleCase(detection.type.replaceAll("_", " "))}\n${detection.label}`;
        pagePriceEl.textContent =
            detection.tier === "free"
                ? "Price: Free on the quick Gemini path"
                : `Price: $${detection.price.toFixed(2)} on the premium payment path`;
        runFreeActionButton.textContent = "Quick Summary";
        runPaidActionButton.textContent =
            detection.tier === "paid" ? `Unlock for $${detection.price.toFixed(2)}` : "Premium Action";
        setPageButtonsDisabled(false);
        pageStatusEl.textContent =
            detection.tier === "backend"
                ? "This page type uses backend-assisted detection."
                : "This page was detected instantly from local rules.";
    }
    catch {
        activeDetection = null;
        pageDetectionEl.textContent = "Refresh the page once so the content script can attach.";
        pagePriceEl.textContent = "";
        setPageButtonsDisabled(true);
    }
}
async function loadWallet() {
    const walletResponse = await chrome.runtime.sendMessage({ type: "GET_WALLET_STATUS" });
    const wallet = walletResponse?.status;
    if (walletResponse?.ok && wallet?.initialized) {
        walletStateEl.textContent = [
            `Address: ${wallet.address}`,
            "Chain: Algorand",
            `Session: ${wallet.unlocked ? "Unlocked" : "Locked"}`
        ].join("\n");
        activeWalletAddress = wallet.address || "";
        walletPrimaryButton.textContent = wallet.unlocked ? "Lock wallet" : "Unlock wallet";
        revealWalletButton.disabled = false;
        copyWalletAddressButton.disabled = !wallet.address;
        walletBalanceEl.textContent = "Balance: Loading assets...";
        if (wallet.address) {
            loadWalletBalance(wallet.address);
        }
    }
    else {
        walletStateEl.textContent =
            "No embedded wallet yet. Create or import one to unlock premium actions.";
        walletPrimaryButton.textContent = "Set up wallet";
        revealWalletButton.disabled = true;
        copyWalletAddressButton.disabled = true;
        walletPageButton.disabled = false;
        walletBalanceEl.textContent = "Balance: -- ALGO · -- USDC";
        activeWalletAddress = "";
    }
}
openPagePanelButton.addEventListener("click", async () => {
    if (activeTabId == null) {
        pageStatusEl.textContent = "No active page panel available.";
        return;
    }
    const response = await chrome.tabs.sendMessage(activeTabId, { type: "OPEN_ETHER_PANEL" });
    pageStatusEl.textContent = response?.ok
        ? "Opened the side panel on the current tab."
        : response?.error || "Could not open the side panel.";
});
runFreeActionButton.addEventListener("click", async () => {
    await runActivePageAction("free");
});
runPaidActionButton.addEventListener("click", async () => {
    await runActivePageAction("paid");
});
copyWalletAddressButton.addEventListener("click", async () => {
    if (!activeWalletAddress) {
        walletSecretsEl.textContent = "No wallet address is available yet.";
        walletSecretsEl.classList.remove("hidden");
        return;
    }
    await navigator.clipboard.writeText(activeWalletAddress);
    walletSecretsEl.textContent = "Wallet address copied.";
    walletSecretsEl.classList.remove("hidden");
});
walletPrimaryButton.addEventListener("click", async () => {
    const walletResponse = await chrome.runtime.sendMessage({ type: "GET_WALLET_STATUS" });
    const wallet = walletResponse?.status;
    if (!wallet?.initialized) {
        chrome.tabs.create({
            url: chrome.runtime.getURL("src/onboarding/onboarding.html")
        });
        return;
    }
    if (wallet.unlocked) {
        await chrome.runtime.sendMessage({ type: "LOCK_WALLET_SESSION" });
        walletPasswordEl.value = "";
        walletSecretsEl.classList.add("hidden");
        walletSecretsEl.textContent = "";
        await loadWallet();
        return;
    }
    const password = walletPasswordEl.value.trim();
    if (!password) {
        walletSecretsEl.textContent = "Enter your wallet password to unlock this session.";
        walletSecretsEl.classList.remove("hidden");
        return;
    }
    walletSecretsEl.textContent = "Unlocking wallet session...";
    walletSecretsEl.classList.remove("hidden");
    const response = await chrome.runtime.sendMessage({
        type: "UNLOCK_WALLET_SESSION",
        payload: { password }
    });
    if (!response?.ok) {
        walletSecretsEl.textContent = response?.error || "Could not unlock wallet.";
        return;
    }
    walletSecretsEl.textContent = "Wallet unlocked for this session.";
    await loadWallet();
});
walletPageButton.addEventListener("click", () => {
    chrome.tabs.create({
        url: chrome.runtime.getURL("src/onboarding/onboarding.html")
    });
});
revealWalletButton.addEventListener("click", async () => {
    const unlockedWallet = await chrome.runtime.sendMessage({ type: "GET_UNLOCKED_WALLET" });
    if (!unlockedWallet?.wallet) {
        walletSecretsEl.textContent = "Unlock the wallet once first. After that, you will not need the password again this session.";
        walletSecretsEl.classList.remove("hidden");
        return;
    }
    walletSecretsEl.textContent = "Revealing wallet secrets...";
    walletSecretsEl.classList.remove("hidden");
    const wallet = unlockedWallet.wallet;
    walletSecretsEl.textContent = [
        `Address: ${wallet.address}`,
        "Chain: Algorand",
        "",
        "Recovery phrase:",
        wallet.mnemonic,
        "",
        "Private key (base64):",
        wallet.secretKeyBase64
    ].join("\n");
});
optionsButton.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
});
async function runActivePageAction(tier) {
    if (activeTabId == null || !activeDetection) {
        pageStatusEl.textContent = "No supported page action available.";
        return;
    }
    pageStatusEl.textContent =
        tier === "free" ? "Running quick summary in the popup..." : "Starting premium summary in the popup...";
    try {
        const pageContext = await getActivePageContext();
        if (!pageContext) {
            throw new Error("Could not read the current page context.");
        }
        if (tier === "free") {
            setActionResult("Running quick summary...", "loading");
            const response = await popupFetchEtherApi("/api/summarize/free", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    url: pageContext.url,
                    html: pageContext.html
                })
            });
            if (!response.ok) {
                throw new Error(await popupReadBackendError(response));
            }
            const result = (await response.json());
            renderPopupSummary(result, "free");
            pageStatusEl.textContent = "Quick summary completed in the popup.";
            return;
        }
        setActionResult("Requesting premium summary...", "loading");
        const response = await popupFetchEtherApi("/api/summarize/paid", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                url: pageContext.url,
                html: pageContext.html
            })
        });
        if (response.status === 402) {
            await handlePopupPaidChallenge(pageContext, response);
            pageStatusEl.textContent = "Premium summary flow completed in the popup.";
            return;
        }
        if (!response.ok) {
            throw new Error(await popupReadBackendError(response));
        }
        const result = (await response.json());
        renderPopupSummary(result, "paid");
        pageStatusEl.textContent = "Premium summary completed in the popup.";
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Could not run the page action.";
        pageStatusEl.textContent = message;
        setActionResult(message, "error");
    }
}
async function loadWalletBalance(address) {
    const response = await chrome.runtime.sendMessage({
        type: "GET_WALLET_BALANCE",
        payload: {
            address
        }
    });
    if (!response?.ok) {
        walletBalanceEl.textContent = "Balance unavailable right now.";
        return;
    }
    walletBalanceEl.textContent = `Balance: ${response.balance.algo} ALGO · ${response.balance.usdc} USDC`;
}
function setPageButtonsDisabled(disabled) {
    openPagePanelButton.disabled = disabled;
    runFreeActionButton.disabled = disabled;
    runPaidActionButton.disabled = disabled;
}
function popupTitleCase(value) {
    return value.replace(/\b\w/g, (char) => char.toUpperCase());
}
async function getActivePageContext() {
    if (activeTabId == null) {
        return null;
    }
    const response = (await chrome.tabs.sendMessage(activeTabId, {
        type: "GET_PAGE_CONTEXT"
    }));
    if (!response?.ok || !response.context) {
        throw new Error(response?.error || "Refresh the page once so the content script can attach.");
    }
    return response.context;
}
async function handlePopupPaidChallenge(pageContext, response) {
    const encodedHeader = response.headers.get("payment-required");
    if (!encodedHeader) {
        throw new Error("The backend requested payment, but no payment challenge was exposed.");
    }
    const paymentRequired = JSON.parse(atob(encodedHeader));
    const accepted = paymentRequired.accepts?.[0];
    if (!accepted) {
        throw new Error("The backend did not provide a usable payment option.");
    }
    const unlockedWalletResponse = await chrome.runtime.sendMessage({ type: "GET_UNLOCKED_WALLET" });
    const wallet = unlockedWalletResponse?.wallet;
    if (!wallet) {
        throw new Error("Unlock the wallet in the popup first, then retry the premium summary.");
    }
    const balanceResponse = await chrome.runtime.sendMessage({
        type: "GET_WALLET_BALANCE",
        payload: { address: wallet.address }
    });
    const balance = (balanceResponse?.balance ?? {});
    const requiredAtomicAmount = Number(accepted.amount || 0);
    const minReserve = 100_000;
    const feeReserve = 1_000;
    if (!balanceResponse?.ok || Number(balance.microAlgos || 0) < requiredAtomicAmount + minReserve + feeReserve) {
        throw new Error(`This wallet needs about ${((requiredAtomicAmount + minReserve + feeReserve) / 1_000_000).toFixed(3)} ALGO total to cover the payment, fee, and minimum reserve.`);
    }
    const approved = await promptForPopupPaymentApproval(paymentRequired);
    if (!approved) {
        throw new Error("Premium payment cancelled.");
    }
    setActionResult("Signing ALGO payment...", "loading");
    const paymentHeader = await createPopupPaymentSignature(paymentRequired, wallet);
    await confirmPopupPaymentWithRetry(paymentRequired, paymentHeader);
    const retryResponse = await popupFetchEtherApi("/api/summarize/paid", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "PAYMENT-SIGNATURE": paymentHeader
        },
        body: JSON.stringify({
            url: pageContext.url,
            html: pageContext.html
        })
    });
    if (!retryResponse.ok) {
        throw new Error(await popupReadBackendError(retryResponse));
    }
    const result = (await retryResponse.json());
    renderPopupSummary(result, "paid");
    await loadWallet();
}
function promptForPopupPaymentApproval(paymentRequired) {
    const accepted = paymentRequired.accepts?.[0];
    const amount = Number(accepted?.amount || 0) / 1_000_000;
    const receiver = String(accepted?.payTo || "");
    actionResultEl.className = "result-box tone-info";
    actionResultEl.innerHTML = `
    <div class="result-section">
      <p class="result-label">Premium approval</p>
      <p>Approve this payment to unlock the premium summary.</p>
      <div class="wallet-inline-card">
        <div><strong>Amount:</strong> ${popupEscapeHtml(amount.toFixed(3))} ALGO</div>
        <div><strong>Network:</strong> Algorand</div>
        <div><strong>Receiver:</strong> ${popupEscapeHtml(popupShortAddress(receiver))}</div>
      </div>
      <div class="actions">
        <button id="popup-approve-payment">Approve Payment</button>
        <button id="popup-cancel-payment" class="secondary">Cancel</button>
      </div>
    </div>
  `;
    return new Promise((resolve) => {
        const approveButton = document.getElementById("popup-approve-payment");
        const cancelButton = document.getElementById("popup-cancel-payment");
        const cleanup = () => {
            approveButton?.removeEventListener("click", handleApprove);
            cancelButton?.removeEventListener("click", handleCancel);
        };
        const handleApprove = () => {
            cleanup();
            resolve(true);
        };
        const handleCancel = () => {
            cleanup();
            resolve(false);
        };
        approveButton?.addEventListener("click", handleApprove);
        cancelButton?.addEventListener("click", handleCancel);
    });
}
async function createPopupPaymentSignature(paymentRequired, wallet) {
    const accepted = paymentRequired.accepts?.[0];
    if (!accepted) {
        throw new Error("No accepted payment requirements found.");
    }
    const algodClient = new algosdk.Algodv2("", "https://testnet-api.algonode.cloud", "");
    const suggestedParams = await algodClient.getTransactionParams().do();
    const secretKey = popupDecodeBase64ToUint8Array(wallet.secretKeyBase64);
    const noteText = String(accepted.extra?.noteText || `ether:${Date.now()}`);
    const paymentTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: wallet.address,
        receiver: accepted.payTo,
        amount: Number(accepted.amount),
        note: new TextEncoder().encode(noteText),
        suggestedParams
    });
    const signedPaymentTxn = paymentTxn.signTxn(secretKey);
    const sendResult = await algodClient.sendRawTransaction(signedPaymentTxn).do();
    const txId = String(sendResult.txid || sendResult.txId || sendResult.txID || "");
    if (!txId) {
        throw new Error("Algorand accepted the payment submission, but no transaction id was returned.");
    }
    return btoa(JSON.stringify({
        x402Version: Number(paymentRequired.x402Version || 2),
        payload: {
            txId,
            address: wallet.address
        },
        accepted,
        resource: paymentRequired.resource || { url: pageContextFallbackUrl() },
        extensions: paymentRequired.extensions
    }));
}
async function confirmPopupPaymentWithRetry(paymentRequired, paymentHeader) {
    const resourceUrl = paymentRequired.resource?.url || pageContextFallbackUrl();
    for (let attempt = 1; attempt <= 20; attempt += 1) {
        setActionResult(`Payment sent. Waiting for confirmation (${attempt}/20)...`, "loading");
        const confirmResponse = await popupFetchEtherApi("/api/payments/confirm", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "PAYMENT-SIGNATURE": paymentHeader
            },
            body: JSON.stringify({ resource: resourceUrl })
        });
        if (confirmResponse.ok) {
            return;
        }
        const errorText = await popupReadBackendError(confirmResponse);
        const normalized = errorText.toLowerCase();
        if (confirmResponse.status === 402 &&
            (normalized.includes("not confirmed yet") ||
                normalized.includes("not found on algorand testnet yet") ||
                normalized.includes("not found on algorand yet"))) {
            await popupSleep(1500);
            continue;
        }
        throw new Error(errorText);
    }
    throw new Error("Transaction was sent, but confirmation took too long. Wait a few seconds and try the premium summary again.");
}
async function popupFetchEtherApi(path, init) {
    const env = await getPopupEnvConfig();
    const headers = new Headers(init.headers || {});
    headers.set("X-Ether-Key", env.apiKey);
    return fetch(`${env.apiBaseUrl}${path}`, { ...init, headers });
}
async function getPopupEnvConfig() {
    if (popupEnvConfigCache) {
        return popupEnvConfigCache;
    }
    try {
        const response = await fetch(chrome.runtime.getURL(".env"));
        if (!response.ok) {
            popupEnvConfigCache = { apiBaseUrl: "http://127.0.0.1:8000", apiKey: "ether-browser-dev" };
            return popupEnvConfigCache;
        }
        const text = await response.text();
        const values = {};
        for (const line of text.split(/\r?\n/)) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith("#"))
                continue;
            const idx = trimmed.indexOf("=");
            if (idx <= 0)
                continue;
            values[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
        }
        popupEnvConfigCache = {
            apiBaseUrl: values.ETHER_API_BASE_URL || "http://127.0.0.1:8000",
            apiKey: values.ETHER_API_KEY || "ether-browser-dev"
        };
        return popupEnvConfigCache;
    }
    catch {
        popupEnvConfigCache = { apiBaseUrl: "http://127.0.0.1:8000", apiKey: "ether-browser-dev" };
        return popupEnvConfigCache;
    }
}
async function popupReadBackendError(response) {
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
function renderPopupSummary(result, tier) {
    const bullets = popupNormalizeStringArray(result.bullets);
    const insights = popupNormalizeStringArray(result.key_insights || result.keyInsights);
    const actionItems = popupNormalizeStringArray(result.action_items || result.actionItems);
    const cost = Number(result.cost ?? (tier === "paid" ? 0.25 : 0));
    const title = String(result.title ?? "Summary");
    const tldr = String(result.tldr ?? "");
    const sourceQuality = String(result.source_quality ?? "");
    const modelUsed = String(result.model_used ?? "");
    const wordCount = Number(result.word_count ?? 0);
    const readingTime = Number(result.reading_time_mins ?? 0);
    actionResultEl.className = "result-box";
    actionResultEl.innerHTML = `
    <div class="result-header">
      <strong>${popupEscapeHtml(title)}</strong>
      <span class="result-meta">${popupEscapeHtml(tier.toUpperCase())} · $${cost.toFixed(2)}</span>
    </div>
    <p>${popupEscapeHtml(tldr || "No summary returned.")}</p>
    ${renderPopupListSection("Key points", bullets)}
    ${renderPopupListSection("Key insights", insights)}
    ${renderPopupListSection("Action items", actionItems)}
    <div class="result-footer">
      <span>${popupEscapeHtml(`${wordCount} words`)}</span>
      ${readingTime ? `<span>${popupEscapeHtml(`${readingTime} min read`)}</span>` : ""}
      ${sourceQuality ? `<span>${popupEscapeHtml(`Source quality: ${sourceQuality}`)}</span>` : ""}
      ${modelUsed ? `<span>${popupEscapeHtml(`Model: ${modelUsed}`)}</span>` : ""}
    </div>
  `;
}
function renderPopupListSection(label, items) {
    if (!items.length)
        return "";
    return `
    <div class="result-section">
      <p class="result-label">${popupEscapeHtml(label)}</p>
      <ul class="result-list">
        ${items.map((item) => `<li>${popupEscapeHtml(item)}</li>`).join("")}
      </ul>
    </div>
  `;
}
function setActionResult(message, tone = "info") {
    actionResultEl.className = `result-box tone-${tone}`;
    actionResultEl.textContent = message;
}
function popupNormalizeStringArray(value) {
    if (!Array.isArray(value))
        return [];
    return value.map((item) => String(item)).filter(Boolean);
}
function popupDecodeBase64ToUint8Array(value) {
    const binary = atob(value);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
function popupShortAddress(value) {
    return value.length > 12 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value;
}
function popupEscapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}
function popupSleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
}
function pageContextFallbackUrl() {
    return pageUrlEl.textContent || "http://127.0.0.1:8000/api/summarize/paid";
}
