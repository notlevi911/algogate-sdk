const pageUrlEl = document.getElementById("page-url") as HTMLElement;
const pageDetectionEl = document.getElementById("page-detection") as HTMLElement;
const pagePriceEl = document.getElementById("page-price") as HTMLElement;
const pageStatusEl = document.getElementById("page-status") as HTMLElement;
const openPagePanelButton = document.getElementById("open-page-panel") as HTMLButtonElement;
const runFreeActionButton = document.getElementById("run-free-action") as HTMLButtonElement;
const runPaidActionButton = document.getElementById("run-paid-action") as HTMLButtonElement;

const walletStateEl = document.getElementById("wallet-state") as HTMLElement;
const walletPrimaryButton = document.getElementById("wallet-primary") as HTMLButtonElement;
const revealWalletButton = document.getElementById("reveal-wallet") as HTMLButtonElement;
const walletPasswordEl = document.getElementById("wallet-password") as HTMLInputElement;
const walletSecretsEl = document.getElementById("wallet-secrets") as HTMLElement;
const walletBalanceEl = document.getElementById("wallet-balance") as HTMLElement;
const optionsButton = document.getElementById("open-options") as HTMLButtonElement;

let activeTabId: number | null = null;
let activeDetection: PopupDetection | null = null;

interface PopupDetection {
  type: string;
  action: string;
  label: string;
  price: number;
  tier: "free" | "paid" | "none" | "backend";
}

init().catch((error: unknown) => {
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
    const detection = response as PopupDetection | undefined;

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
  } catch {
    activeDetection = null;
    pageDetectionEl.textContent = "Refresh the page once so the content script can attach.";
    pagePriceEl.textContent = "";
    setPageButtonsDisabled(true);
  }
}

async function loadWallet() {
  const walletResponse = await chrome.runtime.sendMessage({ type: "GET_WALLET_STATUS" });
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

async function runActivePageAction(tier: "free" | "paid") {
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

  walletBalanceEl.textContent = `Balance: ${response.balance.algo} ALGO · ${response.balance.usdc} USDC on Algorand TestNet`;
}

function setPageButtonsDisabled(disabled: boolean) {
  openPagePanelButton.disabled = disabled;
  runFreeActionButton.disabled = disabled;
  runPaidActionButton.disabled = disabled;
}

function popupTitleCase(value: string) {
  return value.replace(/\b\w/g, (char) => char.toUpperCase());
}
