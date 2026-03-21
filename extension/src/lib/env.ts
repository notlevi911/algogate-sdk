export interface EnvConfig {
  GEMINI_API_KEY: string;
  GEMINI_MODEL: string;
  ETHER_API_BASE_URL: string;
  ETHER_API_KEY: string;
}

let cachedConfig: EnvConfig | null = null;

export async function getEnvConfig(): Promise<EnvConfig> {
  if (cachedConfig) {
    return cachedConfig;
  }

  try {
    const response = await fetch(chrome.runtime.getURL(".env"));
    if (!response.ok) {
      cachedConfig = emptyConfig();
      return cachedConfig;
    }

    const text = await response.text();
    cachedConfig = parseEnv(text);
    return cachedConfig;
  } catch {
    cachedConfig = emptyConfig();
    return cachedConfig;
  }
}

function parseEnv(text: string): EnvConfig {
  const lines = text.split(/\r?\n/);
  const values: Record<string, string> = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    values[key] = value;
  }

  return {
    GEMINI_API_KEY: values.GEMINI_API_KEY || "",
    GEMINI_MODEL: values.GEMINI_MODEL || "",
    ETHER_API_BASE_URL: values.ETHER_API_BASE_URL || "http://127.0.0.1:8000",
    ETHER_API_KEY: values.ETHER_API_KEY || "ether-browser-dev"
  };
}

function emptyConfig(): EnvConfig {
  return {
    GEMINI_API_KEY: "",
    GEMINI_MODEL: "",
    ETHER_API_BASE_URL: "http://127.0.0.1:8000",
    ETHER_API_KEY: "ether-browser-dev"
  };
}
