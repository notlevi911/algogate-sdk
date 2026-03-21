import { setSettings } from "../lib/storage.js";
import { decryptJson, encryptJson, type EncryptedRecord } from "./crypto.js";
import { getWalletVaultRecord, saveWalletVaultRecord } from "./vault.js";

const DEFAULT_ALGORAND_NETWORK = "testnet";
const WALLET_SESSION_KEY = "embeddedWalletSession";

interface WalletPayload {
  mnemonic: string;
  secretKeyBase64: string;
  address: string;
  network: string;
}

export async function getWalletStatus() {
  const { meta } = await getWalletVaultRecord();

  if (!meta) {
    return {
      initialized: false,
      network: DEFAULT_ALGORAND_NETWORK
    };
  }

  return {
    initialized: true,
    address: meta.address,
    network: meta.network || DEFAULT_ALGORAND_NETWORK,
    createdAt: meta.createdAt,
    unlocked: Boolean(await getUnlockedWallet())
  };
}

export async function setupEmbeddedWallet(walletPayload: WalletPayload, password: string) {
  validatePassword(password);
  validateWalletPayload(walletPayload);
  const network = walletPayload.network || DEFAULT_ALGORAND_NETWORK;
  const encryptedPayload = await encryptJson(
    {
      mnemonic: walletPayload.mnemonic,
      secretKeyBase64: walletPayload.secretKeyBase64,
      address: walletPayload.address,
      network
    },
    password
  );

  const meta = {
    address: walletPayload.address,
    network,
    createdAt: new Date().toISOString()
  };

  await saveWalletVaultRecord(encryptedPayload, meta);
  await saveUnlockedWalletSession({
    mnemonic: walletPayload.mnemonic,
    secretKeyBase64: walletPayload.secretKeyBase64,
    address: walletPayload.address,
    network
  });
  await setSettings({
    network: DEFAULT_ALGORAND_NETWORK,
    walletProvider: "embedded",
    walletConnected: true,
    connectedWalletAddress: walletPayload.address,
    walletAddress: walletPayload.address,
    walletInitialized: true
  });

  return {
    address: walletPayload.address,
    network
  };
}

export async function revealWalletSecrets(password: string) {
  validatePassword(password);

  const { vault, meta } = await getWalletVaultRecord();
  if (!vault || !meta) {
    throw new Error("Wallet is not initialized yet.");
  }

  const decrypted = await decryptJson<WalletPayload>(vault as EncryptedRecord, password);
  return {
    address: decrypted.address || meta.address,
    network: decrypted.network || meta.network || DEFAULT_ALGORAND_NETWORK,
    mnemonic: decrypted.mnemonic,
    secretKeyBase64: decrypted.secretKeyBase64
  };
}

export async function unlockWalletSession(password: string) {
  const wallet = await revealWalletSecrets(password);
  await saveUnlockedWalletSession(wallet);
  return {
    address: wallet.address,
    network: wallet.network,
    unlocked: true
  };
}

export async function lockWalletSession() {
  await chrome.storage.session.remove(WALLET_SESSION_KEY);
  return { unlocked: false };
}

export async function getUnlockedWallet(): Promise<WalletPayload | null> {
  const data = (await chrome.storage.session.get([WALLET_SESSION_KEY])) as Record<string, unknown>;
  const wallet = data[WALLET_SESSION_KEY] as WalletPayload | undefined;
  if (!wallet?.address || !wallet?.secretKeyBase64 || !wallet?.mnemonic) {
    return null;
  }

  return wallet;
}

async function saveUnlockedWalletSession(wallet: WalletPayload) {
  await chrome.storage.session.set({
    [WALLET_SESSION_KEY]: wallet
  });
}

function validatePassword(password: string) {
  if (typeof password !== "string" || password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }
}

function validateWalletPayload(walletPayload: WalletPayload) {
  if (!walletPayload || typeof walletPayload !== "object") {
    throw new Error("Missing wallet payload.");
  }

  if (!walletPayload.address || !walletPayload.mnemonic || !walletPayload.secretKeyBase64) {
    throw new Error("Incomplete wallet payload.");
  }
}
