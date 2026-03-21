import { PeraWalletConnect } from "@perawallet/connect";
import { getPeraChainId } from "../lib/network.js";

const walletStateEl = document.getElementById("wallet-state");
const tabStateEl = document.getElementById("tab-state");
const connectButton = document.getElementById("connect-manual");
const disconnectButton = document.getElementById("disconnect-wallet");
const optionsButton = document.getElementById("open-options");

let peraWallet = null;

init().catch((error) => {
  walletStateEl.textContent =
    error instanceof Error ? error.message : "Failed to load popup.";
});

async function init() {
  const settingsResponse = await chrome.runtime.sendMessage({ type: "GET_SETTINGS" });
  const settings = settingsResponse?.settings || {};

  peraWallet = new PeraWalletConnect({
    chainId: getPeraChainId(settings.network || "testnet"),
    shouldShowSignTxnToast: false
  });

  if (peraWallet.connector?.on) {
    peraWallet.connector.on("disconnect", handleDisconnect);
  }

  const reconnectedAccounts = await peraWallet.reconnectSession();
  if (reconnectedAccounts.length > 0) {
    await persistConnectedWallet(reconnectedAccounts[0], settings.network || "testnet");
    walletStateEl.textContent = `Connected: ${reconnectedAccounts[0]}`;
  } else {
    walletStateEl.textContent = settings.walletConnected
      ? `Connected: ${settings.connectedWalletAddress || "Wallet"}`
      : "Wallet not connected.";
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const currentUrl = tab?.url ?? "";
  tabStateEl.textContent = `Current page: ${currentUrl || "Unavailable"}`;
}

connectButton.addEventListener("click", async () => {
  if (!peraWallet) {
    walletStateEl.textContent = "Pera Wallet is not initialized.";
    return;
  }

  walletStateEl.textContent = "Opening Pera QR connect...";

  try {
    const accounts = await peraWallet.connect();
    const [account] = accounts;

    if (!account) {
      walletStateEl.textContent = "No wallet account returned.";
      return;
    }

    const settingsResponse = await chrome.runtime.sendMessage({ type: "GET_SETTINGS" });
    const settings = settingsResponse?.settings || {};
    await persistConnectedWallet(account, settings.network || "testnet");
    walletStateEl.textContent = `Connected: ${account}`;
  } catch (error) {
    if (error?.data?.type === "CONNECT_MODAL_CLOSED") {
      walletStateEl.textContent = "Pera connect modal was closed.";
      return;
    }

    walletStateEl.textContent =
      error instanceof Error ? error.message : "Wallet connection failed.";
  }
});

disconnectButton.addEventListener("click", async () => {
  if (peraWallet) {
    await peraWallet.disconnect();
  }

  await chrome.runtime.sendMessage({
    type: "SAVE_SETTINGS",
    payload: {
      walletConnected: false,
      connectedWalletAddress: ""
    }
  });

  walletStateEl.textContent = "Wallet disconnected.";
});

optionsButton.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

async function persistConnectedWallet(address, network) {
  await chrome.runtime.sendMessage({
    type: "SET_CONNECTED_WALLET",
    payload: {
      provider: "pera",
      address
    }
  });

  await chrome.runtime.sendMessage({
    type: "SAVE_SETTINGS",
    payload: {
      walletProvider: "pera",
      network
    }
  });
}

async function handleDisconnect() {
  await chrome.runtime.sendMessage({
    type: "SAVE_SETTINGS",
    payload: {
      walletConnected: false,
      connectedWalletAddress: ""
    }
  });

  walletStateEl.textContent = "Wallet disconnected.";
}
