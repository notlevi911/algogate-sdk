const modelEl = document.getElementById("gemini-model");
const networkEl = document.getElementById("network");
const walletAddressEl = document.getElementById("wallet-address");
const walletProviderEl = document.getElementById("wallet-provider");
const x402EnabledEl = document.getElementById("x402-enabled");
const saveButton = document.getElementById("save-settings");
const statusTextEl = document.getElementById("status-text");

loadSettings().catch((error) => {
  statusTextEl.textContent =
    error instanceof Error ? error.message : "Failed to load settings.";
});

saveButton.addEventListener("click", async () => {
  const payload = {
    geminiModel: modelEl.value.trim(),
    network: networkEl.value,
    walletAddress: walletAddressEl.value.trim(),
    walletProvider: walletProviderEl.value,
    x402Enabled: x402EnabledEl.checked,
    walletConnected: false
  };

  const response = await chrome.runtime.sendMessage({
    type: "SAVE_SETTINGS",
    payload
  });

  statusTextEl.textContent = response?.ok ? "Saved." : response?.error || "Save failed.";
});

async function loadSettings() {
  const response = await chrome.runtime.sendMessage({ type: "GET_SETTINGS" });
  if (!response?.ok) {
    statusTextEl.textContent = response?.error || "Could not load settings.";
    return;
  }

  const settings = response.settings;
  modelEl.value = settings.geminiModel || "gemini-2.5-flash";
  networkEl.value = settings.network || "testnet";
  walletAddressEl.value = settings.walletAddress || "";
  walletProviderEl.value = settings.walletProvider || "pera";
  x402EnabledEl.checked = Boolean(settings.x402Enabled);
}
