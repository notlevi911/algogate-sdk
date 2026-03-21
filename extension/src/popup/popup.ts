const walletStateEl = document.getElementById("wallet-state") as HTMLElement;
const tabStateEl = document.getElementById("tab-state") as HTMLElement;
const walletPrimaryButton = document.getElementById("wallet-primary") as HTMLButtonElement;
const revealWalletButton = document.getElementById("reveal-wallet") as HTMLButtonElement;
const walletPasswordEl = document.getElementById("wallet-password") as HTMLInputElement;
const walletSecretsEl = document.getElementById("wallet-secrets") as HTMLElement;
const walletBalanceEl = document.getElementById("wallet-balance") as HTMLElement;
const optionsButton = document.getElementById("open-options") as HTMLButtonElement;

init().catch((error: unknown) => {
  walletStateEl.textContent =
    error instanceof Error ? error.message : "Failed to load popup.";
});

async function init() {
  const [settingsResponse, walletResponse] = await Promise.all([
    chrome.runtime.sendMessage({ type: "GET_SETTINGS" }),
    chrome.runtime.sendMessage({ type: "GET_WALLET_STATUS" })
  ]);

  const settings = (settingsResponse?.settings || {}) as { lastDetectedPageType?: string };
  const wallet = walletResponse?.status as
    | { initialized?: boolean; address?: string; network?: string }
    | undefined;

  if (walletResponse?.ok && wallet?.initialized) {
    walletStateEl.textContent = `Address: ${wallet.address}\nNetwork: ${wallet.network}`;
    walletPrimaryButton.textContent = "Open wallet page";
    revealWalletButton.disabled = false;
    walletBalanceEl.textContent = "Balance: Loading TestNet balance...";
    if (wallet.address) {
      loadWalletBalance(wallet.address);
    }
  } else {
    walletStateEl.textContent =
      "No embedded wallet yet. Create or import one to use Algorand TestNet.";
    walletPrimaryButton.textContent = "Set up wallet";
    revealWalletButton.disabled = true;
    walletBalanceEl.textContent = "Balance: -- ALGO on Algorand TestNet";
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const currentUrl = tab?.url ?? "";
  const pageType = settings.lastDetectedPageType || "generic";
  tabStateEl.textContent = `Current page: ${currentUrl || "Unavailable"}\nDetected type: ${pageType}`;
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

  const wallet = response.wallet as {
    address: string;
    network: string;
    mnemonic: string;
    secretKeyBase64: string;
  };

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

async function loadWalletBalance(address: string) {
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
