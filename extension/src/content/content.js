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
        detection: null,
        requestId: 0,
        panelOpen: false,
        panelWidth: 380
    };
    runDetection(state).catch((error) => {
        console.error("EtherX detection failed", error);
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
        if (message?.type === "GET_PAGE_CONTEXT") {
            sendResponse({
                ok: true,
                context: {
                    url: location.href,
                    title: document.title,
                    html: document.documentElement.outerHTML.slice(0, 250000),
                    detection: state.detection ?? noneDetection()
                }
            });
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
            console.error("EtherX detection failed", error);
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
    toggle.textContent = "EtherX";
    const panel = document.createElement("aside");
    panel.id = "algo-safety-panel";
    panel.innerHTML = renderPanel(detection);
    panel.style.width = `${state.panelWidth}px`;
    root.appendChild(pill);
    root.appendChild(toggle);
    root.appendChild(panel);
    document.documentElement.appendChild(root);
    if (state.panelOpen) {
        panel.classList.add("is-open");
    }
    const closeButton = panel.querySelector("[data-close]");
    const resizeHandle = panel.querySelector("[data-resize-handle]");
    const walletButton = panel.querySelector("[data-open-wallet]");
    const refreshWalletButton = panel.querySelector("[data-refresh-wallet]");
    const freeButton = panel.querySelector("[data-run-free]");
    const paidButton = panel.querySelector("[data-run-paid]");
    const resultBox = panel.querySelector("[data-result-box]");
    const walletState = panel.querySelector("[data-wallet-state]");
    const walletBalance = panel.querySelector("[data-wallet-balance]");
    toggle.addEventListener("click", () => {
        if (panel.classList.contains("is-open")) {
            closePanel(state);
        }
        else {
            openPanel(state);
        }
    });
    closeButton?.addEventListener("click", () => closePanel(state));
    resizeHandle?.addEventListener("mousedown", (event) => startPanelResize(state, event));
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
function renderPanel(detection) {
    const pricing = detection.tier === "free" ? "Free" : `$${detection.price.toFixed(2)}`;
    const summaryEnabled = supportsSummaryAction(detection);
    const paidButtonLabel = summaryEnabled
        ? detection.tier === "paid"
            ? `Pay ${pricing} and Unlock`
            : "Upgrade to Premium"
        : detection.label;
    const summaryText = summaryEnabled
        ? "Use the quick tier for a fast read or unlock the stronger Gemini path through EtherX."
        : "This page type is detected correctly, but the non-summary premium flow for it is still coming next.";
    const modelText = summaryEnabled
        ? "Quick Summary uses the fast Gemini path. Premium uses gemini-2.5-flash after payment."
        : "This page type has detection support, but its premium action flow is still coming next.";
    return `
    <div class="algo-resize-handle" data-resize-handle></div>
    <div class="algo-safety-header">
      <div class="algo-header-copy">
        <p class="algo-brand">EtherX</p>
        <h2>${escapeHtml(toTitleCase(detection.type.replaceAll("_", " ")))}</h2>
        <p class="algo-header-subtitle">Live page tools for reading, paying, and unlocking premium AI actions.</p>
        <span class="algo-risk-pill">${escapeHtml(detection.label)} · ${escapeHtml(pricing)}</span>
      </div>
      <button class="algo-safety-close" data-close aria-label="Close panel">×</button>
    </div>
    <div class="algo-safety-content">
      <section class="algo-safety-section algo-safety-hero">
        <h3>Detected page</h3>
        <p class="algo-muted">${escapeHtml(location.hostname)}</p>
        <p>This tab is classified as <strong>${escapeHtml(detection.type)}</strong>. EtherX is ready with a matching action.</p>
      </section>

      <section class="algo-safety-section">
        <h3>Action</h3>
        <p>${escapeHtml(summaryText)}</p>
        <p class="algo-wallet-meta">${escapeHtml(modelText)}</p>
        <div class="algo-safety-actions">
          <button class="algo-safety-primary" data-run-free ${summaryEnabled ? "" : "disabled"}>Quick Summary</button>
          <button class="algo-safety-secondary" data-run-paid ${summaryEnabled ? "" : "disabled"}>${escapeHtml(paidButtonLabel)}</button>
        </div>
      </section>

      <section class="algo-safety-wallet">
        <h3>Wallet Payer</h3>
        <p class="algo-wallet-meta">Your embedded wallet is used as the payer for premium actions.</p>
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
    state.walletState.textContent = `Payer: ${shortAddress(status.address)} · ${status.unlocked ? "Unlocked" : "Locked"}`;
    state.walletBalance.textContent = "Balance: Loading assets...";
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
    try {
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
        }).catch((error) => {
            throw new Error(error instanceof Error && error.message.includes("Failed to fetch")
                ? "Could not reach the EtherX API. Start the backend on port 8000 and try again."
                : error instanceof Error
                    ? error.message
                    : "Request failed.");
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
    catch (error) {
        setResultMessage(state, error instanceof Error ? error.message : "This action failed unexpectedly.", "error");
    }
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
    const approvalText = formatPaymentChallenge(paymentRequired);
    setResultMessage(state, approvalText, "info");
    const sessionResponse = await chrome.runtime.sendMessage({ type: "GET_UNLOCKED_WALLET" });
    if (!sessionResponse?.wallet) {
        setResultMessage(state, `${approvalText}\n\nUnlock the wallet once from the extension popup, then try the premium action again.`, "info");
        return;
    }
    const balanceResponse = await chrome.runtime.sendMessage({
        type: "GET_WALLET_BALANCE",
        payload: { address: sessionResponse.wallet.address }
    });
    const walletBalance = (balanceResponse?.balance ?? {});
    const requiresAlgo = String(accepted.asset || "").toUpperCase() === "ALGO";
    const requiredAtomicAmount = Number(accepted.amount || 0);
    const availableAtomicAmount = requiresAlgo
        ? Number(walletBalance.microAlgos || 0)
        : Number(walletBalance.microUsdc || 0);
    const algoMinBalanceReserve = 100_000;
    const algoTxnFeeReserve = 1_000;
    const spendableAlgoThreshold = requiredAtomicAmount + algoMinBalanceReserve + algoTxnFeeReserve;
    const hasEnoughAlgoForPayment = availableAtomicAmount >= spendableAlgoThreshold;
    if (!balanceResponse?.ok || (requiresAlgo ? !hasEnoughAlgoForPayment : availableAtomicAmount < requiredAtomicAmount)) {
        setResultMessage(state, requiresAlgo
            ? `${approvalText}\n\nThis wallet does not have enough spendable ALGO yet. It needs enough for the payment, the transaction fee, and the network reserve. For this request you need about ${(spendableAlgoThreshold / 1_000_000).toFixed(3)} ALGO total in the wallet.`
            : `${approvalText}\n\nThis wallet does not have enough USDC to pay yet.`, "warning");
        return;
    }
    const approved = await promptForPaymentApproval(state, paymentRequired, approvalText);
    if (!approved) {
        setResultMessage(state, "Premium request cancelled before payment.", "warning");
        return;
    }
    setResultMessage(state, "Signing ALGO payment with your wallet...", "loading");
    const paymentHeader = await createPaymentSignature(paymentRequired, sessionResponse.wallet);
    setResultMessage(state, "Payment sent. Confirming it with the backend...", "loading");
    await confirmPaymentWithRetry(state, paymentRequired, paymentHeader);
    const retryResponse = await fetchEtherApi("/api/summarize/paid", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "PAYMENT-SIGNATURE": paymentHeader
        },
        body: requestBody
    }).catch((error) => {
        throw new Error(error instanceof Error && error.message.includes("Failed to fetch")
            ? "Payment was signed, but the premium retry could not reach the backend on port 8000."
            : error instanceof Error
                ? error.message
                : "Premium retry failed.");
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
        const txId = String(sendResult.txid || sendResult.txId || sendResult.txID || "");
        if (!txId) {
            throw new Error("Algorand accepted the payment submission, but no transaction id was returned.");
        }
        return encodeTextToBase64(JSON.stringify({
            x402Version: Number(paymentRequired.x402Version || 2),
            payload: {
                txId,
                address: wallet.address
            },
            accepted,
            resource: paymentRequired.resource || { url: location.href },
            extensions: paymentRequired.extensions
        }));
    }
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
    const paymentGroup = transactions.map((txn, index) => index === paymentIndex
        ? encodeBytesToBase64(signedAssetTxn)
        : encodeBytesToBase64(algosdk.encodeUnsignedTransaction(txn)));
    return encodeTextToBase64(JSON.stringify({
        x402Version: Number(paymentRequired.x402Version || 2),
        payload: {
            paymentGroup,
            paymentIndex
        },
        accepted,
        resource: paymentRequired.resource || { url: location.href },
        extensions: paymentRequired.extensions
    }));
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
    const modelUsed = String(result.model_used ?? "");
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
      ${modelUsed ? `<span>${escapeHtml(`Model: ${modelUsed}`)}</span>` : ""}
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
function promptForPaymentApproval(state, paymentRequired, approvalText) {
    if (!state.resultBox) {
        return Promise.resolve(false);
    }
    const accepted = paymentRequired.accepts?.[0];
    const amount = Number(accepted?.amount || 0) / 1_000_000;
    const assetLabel = String(accepted?.asset || "ALGO").toUpperCase() === "ALGO" ? "ALGO" : String(accepted?.asset || "");
    const receiver = String(accepted?.payTo || "");
    state.resultBox.className = "algo-analysis-box tone-info";
    state.resultBox.innerHTML = `
    <div class="algo-result-section">
      <p class="algo-result-label">Premium approval</p>
      <p>${escapeHtml(approvalText)}</p>
      <div class="algo-wallet-card algo-wallet-card-accent">
        <div class="algo-wallet-line"><strong>Amount:</strong> ${escapeHtml(amount.toFixed(3))} ${escapeHtml(assetLabel)}</div>
        <div class="algo-wallet-line"><strong>Network:</strong> Algorand</div>
        <div class="algo-wallet-line"><strong>Receiver:</strong> ${escapeHtml(shortAddress(receiver))}</div>
      </div>
      <div class="algo-safety-actions">
        <button class="algo-safety-primary" data-payment-approve>Approve Payment</button>
        <button class="algo-safety-secondary" data-payment-cancel>Cancel</button>
      </div>
    </div>
  `;
    return new Promise((resolve) => {
        const approveButton = state.resultBox?.querySelector("[data-payment-approve]");
        const cancelButton = state.resultBox?.querySelector("[data-payment-cancel]");
        const approveHandler = () => {
            cleanup();
            resolve(true);
        };
        const cancelHandler = () => {
            cleanup();
            resolve(false);
        };
        const cleanup = () => {
            approveButton?.removeEventListener("click", approveHandler);
            cancelButton?.removeEventListener("click", cancelHandler);
        };
        approveButton?.addEventListener("click", approveHandler);
        cancelButton?.addEventListener("click", cancelHandler);
    });
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
    const assetLabel = String(accepted.asset).toUpperCase() === "ALGO"
        ? "ALGO"
        : String(accepted.asset) === "10458941"
            ? "USDC"
            : accepted.asset;
    const description = paymentRequired.resource?.description || "Premium action";
    return `Payment required for ${description}: ${amount.toFixed(2)} ${assetLabel} on Algorand.`;
}
function formatPillText(detection) {
    const priceText = detection.tier === "free" ? "Free" : `$${detection.price.toFixed(2)}`;
    return `${detection.label} - ${priceText}`;
}
function startPanelResize(state, event) {
    if (!state.panel) {
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    const minWidth = 320;
    const maxWidth = Math.max(minWidth, Math.min(window.innerWidth - 24, 760));
    const onMouseMove = (moveEvent) => {
        const nextWidth = Math.min(maxWidth, Math.max(minWidth, window.innerWidth - moveEvent.clientX));
        state.panelWidth = nextWidth;
        if (state.panel) {
            state.panel.style.width = `${nextWidth}px`;
        }
    };
    const stopResize = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", stopResize);
        window.removeEventListener("blur", stopResize);
        document.documentElement.classList.remove("etherx-panel-resizing");
    };
    document.documentElement.classList.add("etherx-panel-resizing");
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", stopResize);
    window.addEventListener("blur", stopResize);
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
async function confirmPaymentWithRetry(state, paymentRequired, paymentHeader) {
    const resourceUrl = paymentRequired.resource?.url || location.href;
    for (let attempt = 1; attempt <= 20; attempt += 1) {
        setResultMessage(state, `Payment sent. Waiting for confirmation (${attempt}/20)...`, "loading");
        const confirmResponse = await fetchEtherApi("/api/payments/confirm", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "PAYMENT-SIGNATURE": paymentHeader
            },
            body: JSON.stringify({
                resource: resourceUrl
            })
        }).catch((error) => {
            throw new Error(error instanceof Error && error.message.includes("Failed to fetch")
                ? "Payment was sent, but the backend confirmation request could not reach port 8000."
                : error instanceof Error
                    ? error.message
                    : "Payment confirmation failed.");
        });
        if (confirmResponse.ok) {
            return;
        }
        const errorText = await readBackendError(confirmResponse);
        const normalizedError = errorText.toLowerCase();
        if (confirmResponse.status === 402 &&
            (normalizedError.includes("not confirmed yet") ||
                normalizedError.includes("not found on algorand testnet yet") ||
                normalizedError.includes("not found on algorand yet"))) {
            await sleep(1500);
            continue;
        }
        throw new Error(errorText);
    }
    throw new Error("Transaction was sent, but confirmation took too long. Wait a few seconds and try the premium action again.");
}
function sleep(ms) {
    return new Promise((resolve) => {
        window.setTimeout(resolve, ms);
    });
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
