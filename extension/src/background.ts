import { getEnvConfig } from "./lib/env.js";
import { getSettings, setSettings } from "./lib/storage.js";
import {
  getWalletStatus,
  revealWalletSecrets,
  setupEmbeddedWallet
} from "./wallet/service.js";

chrome.runtime.onInstalled.addListener(async () => {
  const settings = await getSettings();
  await setSettings(settings);
});

chrome.runtime.onMessage.addListener((message: unknown, _sender: unknown, sendResponse: (value: unknown) => void) => {
  handleMessage(message)
    .then((response) => sendResponse(response))
    .catch((error: unknown) =>
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error"
      })
    );

  return true;
});

async function handleMessage(message: unknown) {
  const typedMessage = message as { type?: string; payload?: Record<string, unknown> };

  switch (typedMessage?.type) {
    case "GET_SETTINGS":
      return { ok: true, settings: await getSettings() };
    case "SAVE_SETTINGS":
      await setSettings(typedMessage.payload ?? {});
      return { ok: true };
    case "GET_WALLET_STATUS":
      return { ok: true, status: await getWalletStatus() };
    case "SETUP_EMBEDDED_WALLET":
      return {
        ok: true,
        wallet: await setupEmbeddedWallet(
          {
            address: String(typedMessage.payload?.address ?? ""),
            mnemonic: String(typedMessage.payload?.mnemonic ?? ""),
            secretKeyBase64: String(typedMessage.payload?.secretKeyBase64 ?? ""),
            network: String(typedMessage.payload?.network ?? "testnet")
          },
          String(typedMessage.payload?.password ?? "")
        )
      };
    case "REVEAL_WALLET_SECRETS":
      return {
        ok: true,
        wallet: await revealWalletSecrets(String(typedMessage.payload?.password ?? ""))
      };
    case "GET_WALLET_BALANCE":
      return {
        ok: true,
        balance: await getWalletBalance(String(typedMessage.payload?.address ?? ""))
      };
    case "CONNECT_WALLET":
      return connectWallet(String(typedMessage.payload?.provider ?? "manual"));
    case "SET_CONNECTED_WALLET":
      await setSettings({
        walletConnected: true,
        walletProvider: String(typedMessage.payload?.provider ?? "pera"),
        connectedWalletAddress: String(typedMessage.payload?.address ?? "")
      });
      return { ok: true };
    case "SET_LAST_DETECTED_PAGE_TYPE":
      await setSettings({
        lastDetectedPageType: String(typedMessage.payload?.pageType ?? "generic")
      });
      return { ok: true };
    case "DEEP_ANALYZE_PROTOCOL":
      return deepAnalyzeProtocol(typedMessage.payload ?? {});
    default:
      return { ok: false, error: `Unsupported message type: ${typedMessage?.type}` };
  }
}

async function connectWallet(provider: string) {
  const settings = await getSettings();

  if (provider === "embedded") {
    const wallet = await getWalletStatus();
    if (!wallet.initialized) {
      return {
        ok: false,
        error: "Create or import your embedded wallet first."
      };
    }

    return {
      ok: true,
      provider: "Embedded Wallet",
      network: wallet.network,
      wallet: {
        address: wallet.address,
        provider: "Embedded Wallet",
        network: wallet.network
      }
    };
  }

  if (provider === "pera") {
    return {
      ok: true,
      provider: "Pera Wallet",
      network: settings.network
    };
  }

  if (provider === "algosigner") {
    return {
      ok: true,
      provider: "AlgoSigner",
      requiresPageBridge: true,
      network: settings.network
    };
  }

  if (provider === "manual") {
    if (!settings.walletAddress) {
      return {
        ok: false,
        error: "Add a wallet address in the extension options first."
      };
    }

    await setSettings({
      walletConnected: true,
      walletProvider: "manual"
    });

    return {
      ok: true,
      wallet: {
        address: settings.walletAddress,
        provider: "Manual Address",
        network: settings.network
      }
    };
  }

  return { ok: false, error: `Unknown wallet provider: ${provider}` };
}

async function deepAnalyzeProtocol(payload: Record<string, unknown>) {
  const settings = await getSettings();
  const protocol = payload.protocol as AlgoProtocolProfile | undefined;
  const pageContext = (payload.pageContext ?? {}) as {
    pageType?: string;
    title?: string;
    url?: string;
    snippet?: string;
  };

  if (!protocol) {
    return { ok: false, error: "Missing protocol payload." };
  }

  const env = await getEnvConfig();
  const geminiApiKey = env.GEMINI_API_KEY;
  const geminiModel = settings.geminiModel || env.GEMINI_MODEL || "gemini-2.5-flash";

  if (!geminiApiKey) {
    return {
      ok: true,
      source: "mock",
      analysis: buildMockAnalysis(protocol, pageContext)
    };
  }

  const prompt = [
    "You are a concise DeFi risk analyst for Algorand users.",
    "Assess this page in plain English.",
    "Return compact markdown with these sections:",
    "1. Overall risk",
    "2. Main user risks",
    "3. Governance/treasury notes",
    "4. Whale concentration concerns",
    "5. Recommendation",
    "",
    `Protocol or page name: ${protocol.name}`,
    `Category: ${protocol.category}`,
    `Risk score: ${protocol.riskScore}`,
    `Trust level: ${protocol.trustLevel}`,
    `Summary: ${protocol.summary}`,
    `Detected page type: ${pageContext.pageType ?? "generic"}`,
    `Current page title: ${pageContext.title ?? ""}`,
    `Current URL: ${pageContext.url ?? ""}`,
    `Visible page hints: ${pageContext.snippet ?? ""}`
  ].join("\n");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent?key=${encodeURIComponent(geminiApiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }]
          }
        ],
        generationConfig: {
          temperature: 0.3
        }
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    return {
      ok: false,
      error: `Gemini request failed: ${response.status} ${errorText}`
    };
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };

  const analysis =
    data?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("\n")
      .trim() || "No analysis returned.";

  return {
    ok: true,
    source: "gemini",
    analysis
  };
}

async function getWalletBalance(address: string) {
  if (!address) {
    throw new Error("Missing wallet address.");
  }

  const response = await fetch(
    `https://testnet-api.algonode.cloud/v2/accounts/${encodeURIComponent(address)}`
  );

  if (response.status === 404) {
    return {
      microAlgos: 0,
      algo: "0"
    };
  }

  if (!response.ok) {
    throw new Error(`Balance lookup failed with status ${response.status}.`);
  }

  const data = (await response.json()) as {
    amount?: number;
  };

  const microAlgos = Number(data.amount || 0);
  return {
    microAlgos,
    algo: formatAlgo(microAlgos)
  };
}

function formatAlgo(microAlgos: number) {
  return (microAlgos / 1_000_000).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6
  });
}

function buildMockAnalysis(
  protocol: AlgoProtocolProfile,
  pageContext: { title?: string }
) {
  return [
    "## Overall risk",
    `${protocol.name} is currently treated as a ${protocol.trustLevel.toLowerCase()}-risk ${protocol.category.toLowerCase()} surface in this hardcoded prototype.`,
    "",
    "## Main user risks",
    "- Smart contract bugs or protocol logic failures remain possible.",
    "- Thin liquidity or volatile collateral can create unexpected losses.",
    "- Token quality should be verified before interacting with pools or markets.",
    "",
    "## Governance and treasury notes",
    "- Governance centralization should be reviewed before relying on long-term protocol incentives.",
    "- Treasury transparency, runway, and incentive design should be checked in docs/forum material.",
    "",
    "## Whale concentration concerns",
    "- Look for low float assets, treasury-heavy ownership, or concentrated LP positions.",
    "",
    "## Recommendation",
    `Use this as a pre-deposit caution layer only. For the page "${pageContext.title ?? "Unknown page"}", do not treat this output as a full audit.`
  ].join("\n");
}
