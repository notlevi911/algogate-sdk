"use strict";
const modelEl = document.getElementById("gemini-model");
const networkEl = document.getElementById("network");
const x402EnabledEl = document.getElementById("x402-enabled");
const saveButton = document.getElementById("save-settings");
const openWalletSetupButton = document.getElementById("open-wallet-setup");
const statusTextEl = document.getElementById("status-text");
loadSettings().catch((error) => {
    statusTextEl.textContent =
        error instanceof Error ? error.message : "Failed to load settings.";
});
saveButton.addEventListener("click", async () => {
    const payload = {
        geminiModel: modelEl.value.trim(),
        network: "testnet",
        walletProvider: "embedded",
        x402Enabled: x402EnabledEl.checked
    };
    const response = await chrome.runtime.sendMessage({
        type: "SAVE_SETTINGS",
        payload
    });
    statusTextEl.textContent = response?.ok ? "Saved." : response?.error || "Save failed.";
});
openWalletSetupButton.addEventListener("click", () => {
    chrome.tabs.create({
        url: chrome.runtime.getURL("src/onboarding/onboarding.html")
    });
});
async function loadSettings() {
    const response = await chrome.runtime.sendMessage({ type: "GET_SETTINGS" });
    if (!response?.ok) {
        statusTextEl.textContent = response?.error || "Could not load settings.";
        return;
    }
    const settings = response.settings;
    modelEl.value = settings.geminiModel || "gemini-2.5-flash";
    networkEl.value = "Algorand";
    x402EnabledEl.checked = Boolean(settings.x402Enabled);
}
