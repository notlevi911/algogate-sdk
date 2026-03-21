const modelEl = document.getElementById("gemini-model") as HTMLInputElement;
const networkEl = document.getElementById("network") as HTMLInputElement;
const x402EnabledEl = document.getElementById("x402-enabled") as HTMLInputElement;
const saveButton = document.getElementById("save-settings") as HTMLButtonElement;
const openWalletSetupButton = document.getElementById("open-wallet-setup") as HTMLButtonElement;
const statusTextEl = document.getElementById("status-text") as HTMLElement;

loadSettings().catch((error: unknown) => {
  statusTextEl.textContent =
    error instanceof Error ? error.message : "Failed to load settings.";
});

saveButton.addEventListener("click", async () => {
  const payload = {
    geminiModel: modelEl.value.trim(),
    network: networkEl.value,
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

  const settings = response.settings as {
    geminiModel?: string;
    network?: string;
    x402Enabled?: boolean;
  };
  modelEl.value = settings.geminiModel || "gemini-2.5-flash";
  networkEl.value = settings.network || "testnet";
  x402EnabledEl.checked = Boolean(settings.x402Enabled);
}
