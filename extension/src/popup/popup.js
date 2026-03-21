"use strict";
const pageUrlEl = document.getElementById("page-url");
const pageDetectionEl = document.getElementById("page-detection");
const pagePriceEl = document.getElementById("page-price");
const pageStatusEl = document.getElementById("page-status");
const openPagePanelButton = document.getElementById("open-page-panel");
const runFreeActionButton = document.getElementById("run-free-action");
const runPaidActionButton = document.getElementById("run-paid-action");
const walletStateEl = document.getElementById("wallet-state");
const walletPrimaryButton = document.getElementById("wallet-primary");
const walletPageButton = document.getElementById("wallet-page");
const revealWalletButton = document.getElementById("reveal-wallet");
const walletPasswordEl = document.getElementById("wallet-password");
const walletSecretsEl = document.getElementById("wallet-secrets");
const walletBalanceEl = document.getElementById("wallet-balance");
const optionsButton = document.getElementById("open-options");
let activeTabId = null;
let activeDetection = null;
init().catch((error) => {
    const message = error instanceof Error ? error.message : "Failed to load popup.";
    walletStateEl.textContent = message;
    pageStatusEl.textContent = message;
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
                ? "Price: Free"
                : `Price: $${detection.price.toFixed(2)} on Algorand TestNet`;
        runFreeActionButton.textContent = "Quick Summary";
        runPaidActionButton.textContent =
            detection.tier === "paid" ? `Pay $${detection.price.toFixed(2)}` : "Premium Action";
        setPageButtonsDisabled(false);
        pageStatusEl.textContent =
            detection.tier === "backend"
                ? "This page type uses the backend fallback detector."
                : "This page was detected instantly from URL patterns.";
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
            `Network: ${wallet.network}`,
            `Session: ${wallet.unlocked ? "Unlocked" : "Locked"}`
        ].join("\n");
        walletPrimaryButton.textContent = wallet.unlocked ? "Lock wallet" : "Unlock wallet";
        revealWalletButton.disabled = false;
        walletBalanceEl.textContent = "Balance: Loading TestNet balance...";
        if (wallet.address) {
            loadWalletBalance(wallet.address);
        }
    }
    else {
        walletStateEl.textContent =
            "No embedded wallet yet. Create or import one to use Algorand TestNet.";
        walletPrimaryButton.textContent = "Set up wallet";
        revealWalletButton.disabled = true;
        walletPageButton.disabled = false;
        walletBalanceEl.textContent = "Balance: -- ALGO · -- USDC on Algorand TestNet";
    }
}
openPagePanelButton.addEventListener("click", async () => {
    if (activeTabId == null) {
        pageStatusEl.textContent = "No active page panel available.";
        return;
    }
    const response = await chrome.tabs.sendMessage(activeTabId, { type: "OPEN_ETHER_PANEL" });
    pageStatusEl.textContent = response?.ok
        ? "Opened the page panel on the current tab."
        : response?.error || "Could not open the page panel.";
});
runFreeActionButton.addEventListener("click", async () => {
    await runActivePageAction("free");
});
runPaidActionButton.addEventListener("click", async () => {
    await runActivePageAction("paid");
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
        walletSecretsEl.textContent = "Enter your wallet password to unlock this browser session.";
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
    walletSecretsEl.textContent = "Wallet unlocked for this browser session.";
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
        `Network: ${wallet.network}`,
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
        tier === "free" ? "Running quick summary on the page..." : "Starting premium action on the page...";
    const response = await chrome.tabs.sendMessage(activeTabId, {
        type: "RUN_PAGE_ACTION",
        payload: { tier }
    });
    pageStatusEl.textContent = response?.ok
        ? tier === "free"
            ? "Quick summary started in the page panel."
            : "Premium action started in the page panel."
        : response?.error || "Could not run the page action.";
}
async function loadWalletBalance(address) {
    const response = await chrome.runtime.sendMessage({
        type: "GET_WALLET_BALANCE",
        payload: {
            address
        }
    });
    if (!response?.ok) {
        walletBalanceEl.textContent = "Balance: unavailable on Algorand TestNet";
        return;
    }
    walletBalanceEl.textContent = `Balance: ${response.balance.algo} ALGO · ${response.balance.usdc} USDC on Algorand TestNet`;
}
function setPageButtonsDisabled(disabled) {
    openPagePanelButton.disabled = disabled;
    runFreeActionButton.disabled = disabled;
    runPaidActionButton.disabled = disabled;
}
function popupTitleCase(value) {
    return value.replace(/\b\w/g, (char) => char.toUpperCase());
}
