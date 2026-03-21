export const STANDARD_MNEMONIC_WORDS = 25;
export const DEFAULT_ALGORAND_NETWORK = "testnet";

declare const algosdk: {
  generateAccount(): {
    addr: { toString(): string };
    sk: Uint8Array;
  };
  mnemonicToSecretKey(mnemonic: string): {
    addr: { toString(): string };
    sk: Uint8Array;
  };
  secretKeyToMnemonic(secretKey: Uint8Array): string;
};

export interface SerializedAlgorandWallet {
  address: string;
  mnemonic: string;
  secretKeyBase64: string;
  network: string;
}

export function createAlgorandWalletDraft(): SerializedAlgorandWallet {
  const account = algosdk.generateAccount();
  const mnemonic = algosdk.secretKeyToMnemonic(account.sk);
  return serializeAccount(account, mnemonic);
}

export function importAlgorandWalletFromMnemonic(mnemonic: string): SerializedAlgorandWallet {
  const normalizedMnemonic = normalizeMnemonic(mnemonic);
  const account = algosdk.mnemonicToSecretKey(normalizedMnemonic);
  return serializeAccount(account, normalizedMnemonic);
}

export function normalizeMnemonic(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
}

export function mnemonicWords(mnemonic: string) {
  return normalizeMnemonic(mnemonic).split(" ").filter(Boolean);
}

function serializeAccount(
  account: { addr: { toString(): string }; sk: Uint8Array },
  mnemonic: string
): SerializedAlgorandWallet {
  return {
    address: account.addr.toString(),
    mnemonic,
    secretKeyBase64: bytesToBase64(account.sk),
    network: DEFAULT_ALGORAND_NETWORK
  };
}

function bytesToBase64(bytes: Uint8Array) {
  const chunkSize = 32768;
  let binary = "";

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}
