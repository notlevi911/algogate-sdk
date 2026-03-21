"use strict";
const walletStateEl = document.getElementById("wallet-state");
const walletPrimaryButton = document.getElementById("wallet-primary");
const revealWalletButton = document.getElementById("reveal-wallet");
const walletPasswordEl = document.getElementById("wallet-password");
const walletSecretsEl = document.getElementById("wallet-secrets");
const walletBalanceEl = document.getElementById("wallet-balance");
const optionsButton = document.getElementById("open-options");
init().catch((error) => {
    walletStateEl.textContent =
        error instanceof Error ? error.message : "Failed to load popup.";
});
async function init() {
    const walletResponse = await chrome.runtime.sendMessage({ type: "GET_WALLET_STATUS" });
    const wallet = walletResponse?.status;
    if (walletResponse?.ok && wallet?.initialized) {
        walletStateEl.textContent = `Address: ${wallet.address}\nNetwork: ${wallet.network}`;
        walletPrimaryButton.textContent = "Open wallet page";
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
        walletBalanceEl.textContent = "Balance: -- ALGO on Algorand TestNet";
    }
}
walletPrimaryButton.addEventListener("click", () => {
    chrome.tabs.create({
        url: chrome.runtime.getURL("src/onboarding/onboarding.html")
    });
});
revealWalletButton.addEventListener("click", async () => {
    const password = walletPasswordEl.value;
    if (!password) {
        walletSecretsEl.textContent = "Enter your wallet password first.";
        walletSecretsEl.classList.remove("hidden");
        return;
    }
    walletSecretsEl.textContent = "Revealing wallet secrets...";
    walletSecretsEl.classList.remove("hidden");
    const response = await chrome.runtime.sendMessage({
        type: "REVEAL_WALLET_SECRETS",
        payload: {
            password
        }
    });
    if (!response?.ok) {
        walletSecretsEl.textContent = response?.error || "Could not unlock wallet.";
        return;
    }
    const wallet = response.wallet;
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
    walletBalanceEl.textContent = `Balance: ${response.balance.algo} ALGO on Algorand TestNet`;
}
