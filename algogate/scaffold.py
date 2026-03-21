from __future__ import annotations

import inspect
import json
import textwrap
from pathlib import Path

import httpx

from . import __version__


SCAFFOLD_METADATA_FILE = ".algogate_scaffold.json"


def scaffold_extension(gate) -> str:
    caller_dir = _resolve_caller_dir()
    target_dir = caller_dir / "algogate_extension"
    if target_dir.exists():
        if _scaffold_is_current(target_dir):
            print(f"AlgoGate scaffold already exists at {target_dir}")
            return "./algogate_extension/"
        print(f"AlgoGate scaffold at {target_dir} is outdated. Refreshing it for SDK {__version__}.")

    for relative_path, content in _extension_files(gate).items():
        file_path = target_dir / relative_path
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_text(content, encoding="utf-8")

    _copy_algosdk_bundle(target_dir)
    _write_scaffold_metadata(target_dir)
    return "./algogate_extension/"


def _resolve_caller_dir() -> Path:
    package_dir = Path(__file__).resolve().parent

    for frame_info in inspect.stack()[1:]:
        frame_path = Path(frame_info.filename).resolve()
        if frame_path == package_dir or package_dir in frame_path.parents:
            continue
        return frame_path.parent

    return Path.cwd()


def _copy_algosdk_bundle(target_dir: Path) -> None:
    target = target_dir / "node_modules" / "algosdk" / "dist" / "browser" / "algosdk.min.js"
    target.parent.mkdir(parents=True, exist_ok=True)

    local_source = Path(__file__).resolve().parents[1] / "extension" / "node_modules" / "algosdk" / "dist" / "browser" / "algosdk.min.js"
    if local_source.exists():
        target.write_bytes(local_source.read_bytes())
        return

    response = httpx.get("https://cdn.jsdelivr.net/npm/algosdk/dist/browser/algosdk.min.js", timeout=30.0)
    response.raise_for_status()
    target.write_bytes(response.content)


def _scaffold_is_current(target_dir: Path) -> bool:
    metadata_path = target_dir / SCAFFOLD_METADATA_FILE
    if not metadata_path.exists():
        return False
    try:
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    except Exception:
        return False
    return metadata.get("sdk_version") == __version__


def _write_scaffold_metadata(target_dir: Path) -> None:
    metadata_path = target_dir / SCAFFOLD_METADATA_FILE
    metadata_path.write_text(
        json.dumps({"sdk_version": __version__}, indent=2) + "\n",
        encoding="utf-8",
    )


def _extension_files(gate) -> dict[str, str]:
    return {
        "manifest.json": _manifest_json(),
        ".env": _extension_env(gate),
        "src/background.js": _background_js(),
        "src/popup/popup.html": _popup_html(),
        "src/popup/popup.js": _popup_js(),
        "src/popup/popup.css": _popup_css(),
        "src/wallet/algorand.js": _wallet_algorand_js(),
        "src/wallet/crypto.js": _wallet_crypto_js(),
        "src/wallet/vault.js": _wallet_vault_js(),
        "src/wallet/service.js": _wallet_service_js(),
        "src/lib/env.js": _lib_env_js(),
        "src/lib/api.js": _lib_api_js(),
        "src/onboarding/onboarding.html": _onboarding_html(),
        "src/onboarding/onboarding.js": _onboarding_js(),
        "src/onboarding/onboarding.css": _onboarding_css(),
    }


def _manifest_json() -> str:
    manifest = {
        "manifest_version": 3,
        "name": "AlgoGate Wallet",
        "version": "1.0.0",
        "permissions": ["storage", "activeTab", "scripting"],
        "host_permissions": ["<all_urls>"],
        "background": {"service_worker": "src/background.js", "type": "module"},
        "action": {"default_popup": "src/popup/popup.html"},
        "web_accessible_resources": [
            {
                "resources": [".env", "node_modules/algosdk/dist/browser/algosdk.min.js"],
                "matches": ["<all_urls>"],
            }
        ],
    }
    return json.dumps(manifest, indent=2) + "\n"


def _extension_env(gate) -> str:
    return "\n".join(
        [
            f"ALGO_RECEIVER={gate.config.receiver}",
            f"ALGO_NETWORK={gate.config.network}",
            f"PRICE_MICROALGO={gate.config.price_microalgo}",
            "API_BASE_URL=http://127.0.0.1:8000",
            f"API_KEY={gate.config.api_key}",
            f"API_NAME={gate.config.api_name}",
            "",
        ]
    )


def _background_js() -> str:
    return textwrap.dedent(
        """
        import { getEnvConfig } from "./lib/env.js";
        import {
          getWalletStatus,
          setupWallet,
          unlockWallet,
          lockWallet,
          getUnlockedWallet,
          revealWallet
        } from "./wallet/service.js";

        chrome.runtime.onInstalled.addListener(() => {
          console.log("AlgoGate Wallet installed.");
        });

        chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
          Promise.resolve(handleMessage(message))
            .then((result) => sendResponse(result))
            .catch((error) =>
              sendResponse({
                ok: false,
                error: error instanceof Error ? error.message : String(error)
              })
            );

          return true;
        });

        async function handleMessage(message) {
          switch (message?.type) {
            case "GET_ENV":
              return { ok: true, env: await getEnvConfig() };
            case "GET_WALLET_STATUS":
              return { ok: true, status: await getWalletStatus() };
            case "SETUP_WALLET":
              return {
                ok: true,
                wallet: await setupWallet(message?.payload?.wallet || {}, String(message?.payload?.password || ""))
              };
            case "UNLOCK_WALLET":
              return {
                ok: true,
                wallet: await unlockWallet(String(message?.payload?.password || ""))
              };
            case "LOCK_WALLET":
              await lockWallet();
              return { ok: true };
            case "GET_UNLOCKED_WALLET":
              return { ok: true, wallet: await getUnlockedWallet() };
            case "REVEAL_WALLET":
              return {
                ok: true,
                wallet: await revealWallet(String(message?.payload?.password || ""))
              };
            case "GET_BALANCE":
              return {
                ok: true,
                microalgo: await fetchBalance(
                  String(message?.payload?.address || ""),
                  String(message?.payload?.network || "testnet")
                )
              };
            default:
              return { ok: false, error: `Unsupported message type: ${String(message?.type || "")}` };
          }
        }

        async function fetchBalance(address, network) {
          if (!address) {
            return 0;
          }
          const base = network === "mainnet"
            ? "https://mainnet-api.algonode.cloud"
            : "https://testnet-api.algonode.cloud";
          const response = await fetch(`${base}/v2/accounts/${encodeURIComponent(address)}`);
          if (!response.ok) {
            throw new Error(`Could not fetch balance (${response.status})`);
          }
          const data = await response.json();
          return Number(data.amount || 0);
        }
        """
    ).strip() + "\n"


def _popup_html() -> str:
    return textwrap.dedent(
        """
        <!doctype html>
        <html lang="en">
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <title>AlgoGate Wallet</title>
            <link rel="stylesheet" href="./popup.css" />
          </head>
          <body>
            <main class="popup-shell">
              <header class="popup-header">
                <p class="eyebrow">AlgoGate</p>
                <h1 id="api-name">Loading API…</h1>
                <p id="api-subtitle" class="popup-subtitle">Wrap premium FastAPI routes with Algorand micropayments.</p>
                <div class="header-row">
                  <p id="api-url" class="api-url mono"></p>
                  <span id="network-badge" class="section-chip section-chip-soft">...</span>
                </div>
              </header>

              <section id="empty-state" class="card card-welcome">
                <div class="card-topline">
                  <span class="section-chip">Wallet</span>
                  <span class="section-chip section-chip-soft">First Run</span>
                </div>
                <h2>Set up your payment wallet</h2>
                <p class="helper-text">
                  AlgoGate created this extension for the current API. Create or import an Algorand wallet once, then call any protected route from here.
                </p>
                <div class="stat-grid">
                  <div class="stat-card">
                    <span class="stat-label">API</span>
                    <strong id="empty-api-name">Protected API</strong>
                  </div>
                  <div class="stat-card">
                    <span class="stat-label">Default Price</span>
                    <strong id="empty-default-price">--</strong>
                  </div>
                </div>
                <button id="open-onboarding" class="primary full">Set up wallet</button>
              </section>

              <section id="main-state" class="hidden">
                <section class="card card-api">
                  <div class="card-topline">
                    <span class="section-chip">API Access</span>
                    <span class="section-chip section-chip-soft">Protected Routes</span>
                  </div>
                  <h2>Call a premium route</h2>
                  <p class="helper-text">
                    AlgoGate fetches the protected routes from <span class="mono">/algogate/routes</span>. Pick one, add any query or JSON payload, then pay only when the route responds with a challenge.
                  </p>

                  <div class="route-row">
                    <div class="field-group field-method">
                      <label class="field-label" for="method-select">Method</label>
                      <select id="method-select">
                        <option value="GET">GET</option>
                      </select>
                    </div>
                    <div class="field-group field-route">
                      <label class="field-label" for="route-input">Route</label>
                      <input id="route-input" list="routes-list" placeholder="/api/premium" />
                      <datalist id="routes-list"></datalist>
                    </div>
                  </div>
                  <p id="route-meta" class="wallet-meta">Load routes from the API or type one manually.</p>

                  <section class="details-panel request-panel">
                    <div class="settings-line">
                      <span>Protected price</span>
                      <strong id="route-price">—</strong>
                    </div>
                    <div class="settings-line settings-line-stack">
                      <span>Expected input</span>
                      <span id="schema-hint" class="schema-hint">No request schema discovered yet.</span>
                    </div>
                  </section>

                  <div id="query-group">
                    <label class="field-label" for="query-input">Query string</label>
                    <input id="query-input" placeholder="city=Bengaluru&units=metric" />
                  </div>

                  <div id="body-group" class="hidden">
                    <label class="field-label" for="body-input">JSON body</label>
                    <textarea
                      id="body-input"
                      rows="7"
                      spellcheck="false"
                      placeholder='{"city":"Bengaluru","question":"Will it rain after 6 pm?"}'
                    ></textarea>
                    <p class="helper-text">
                      Paste a valid JSON payload here for POST, PUT, PATCH, or DELETE routes.
                    </p>
                  </div>

                  <div class="actions actions-two">
                    <button id="call-api" class="primary">Call API</button>
                    <button id="toggle-settings" class="secondary">View details</button>
                  </div>

                  <section id="settings-panel" class="details-panel hidden">
                    <div class="settings-line"><span>API</span><strong id="settings-api-name"></strong></div>
                    <div class="settings-line"><span>Base URL</span><code id="settings-api-base"></code></div>
                    <div class="settings-line"><span>Receiver</span><code id="receiver-address"></code></div>
                    <div class="settings-line"><span>Default Price</span><strong id="settings-price"></strong></div>
                  </section>
                </section>

                <section class="card card-wallet">
                  <div class="card-topline">
                    <span class="section-chip">Wallet</span>
                    <span id="wallet-session-badge" class="section-chip section-chip-soft">Locked</span>
                  </div>
                  <h2>Your embedded payer</h2>
                  <p id="wallet-state" class="wallet-state">Loading wallet state...</p>
                  <p id="wallet-balance" class="wallet-meta">Balance: --</p>

                  <div id="unlock-panel" class="wallet-inline-card">
                    <label class="inline-field" for="wallet-password">Unlock wallet</label>
                    <div class="unlock-row">
                      <input id="wallet-password" type="password" placeholder="Unlock once for this session" />
                      <button id="unlock-wallet" class="primary">Unlock</button>
                    </div>
                  </div>

                  <div class="actions actions-three">
                    <button id="wallet-address" class="secondary mono">Copy address</button>
                    <button id="refresh-balance" class="secondary">Refresh</button>
                    <button id="lock-wallet" class="secondary">Lock</button>
                    <button id="open-wallet-page" class="secondary">Wallet page</button>
                    <button id="toggle-secrets" class="secondary">Reveal</button>
                  </div>

                  <pre id="wallet-secrets" class="secret-box hidden"></pre>
                </section>

                <section class="card card-result">
                  <div class="card-topline">
                    <span class="section-chip">Response</span>
                    <span class="section-chip section-chip-soft">Last Call</span>
                  </div>
                  <h2>API output</h2>
                  <pre id="response-output" class="result-box">Select a route and call it to see the API response here.</pre>
                </section>
              </section>
            </main>

            <div id="payment-modal" class="modal hidden" role="dialog" aria-modal="true">
              <div class="modal-card">
                <div class="card-topline">
                  <span class="section-chip">Payment Required</span>
                  <span class="section-chip section-chip-soft">Algorand</span>
                </div>
                <h2>Approve payment</h2>
                <p id="modal-copy" class="helper-text"></p>
                <div class="modal-actions">
                  <button id="modal-cancel" class="secondary">Cancel</button>
                  <button id="modal-confirm" class="primary">Confirm</button>
                </div>
              </div>
            </div>

            <script src="../../node_modules/algosdk/dist/browser/algosdk.min.js"></script>
            <script type="module" src="./popup.js"></script>
          </body>
        </html>
        """
    ).strip() + "\n"


def _popup_js() -> str:
    return textwrap.dedent(
        """
        import { getEnvConfig } from "../lib/env.js";
        import { callWithPayment } from "../lib/api.js";
        import { getBalance } from "../wallet/algorand.js";
        import {
          getWalletStatus,
          getUnlockedWallet,
          lockWallet,
          unlockWallet
        } from "../wallet/service.js";

        const emptyState = document.getElementById("empty-state");
        const mainState = document.getElementById("main-state");
        const apiNameEl = document.getElementById("api-name");
        const apiSubtitleEl = document.getElementById("api-subtitle");
        const apiUrlEl = document.getElementById("api-url");
        const emptyApiNameEl = document.getElementById("empty-api-name");
        const emptyDefaultPriceEl = document.getElementById("empty-default-price");
        const networkBadgeEl = document.getElementById("network-badge");
        const openOnboardingButton = document.getElementById("open-onboarding");
        const walletAddressButton = document.getElementById("wallet-address");
        const walletStateEl = document.getElementById("wallet-state");
        const walletSecretsEl = document.getElementById("wallet-secrets");
        const receiverAddressEl = document.getElementById("receiver-address");
        const walletBalanceEl = document.getElementById("wallet-balance");
        const walletSessionBadgeEl = document.getElementById("wallet-session-badge");
        const unlockPanel = document.getElementById("unlock-panel");
        const walletPasswordEl = document.getElementById("wallet-password");
        const unlockWalletButton = document.getElementById("unlock-wallet");
        const lockWalletButton = document.getElementById("lock-wallet");
        const refreshBalanceButton = document.getElementById("refresh-balance");
        const openWalletPageButton = document.getElementById("open-wallet-page");
        const toggleSecretsButton = document.getElementById("toggle-secrets");
        const toggleSettingsButton = document.getElementById("toggle-settings");
        const settingsPanel = document.getElementById("settings-panel");
        const settingsApiNameEl = document.getElementById("settings-api-name");
        const settingsApiBaseEl = document.getElementById("settings-api-base");
        const settingsPriceEl = document.getElementById("settings-price");
        const methodSelect = document.getElementById("method-select");
        const routeInput = document.getElementById("route-input");
        const routeList = document.getElementById("routes-list");
        const routeMetaEl = document.getElementById("route-meta");
        const routePriceEl = document.getElementById("route-price");
        const schemaHintEl = document.getElementById("schema-hint");
        const queryGroup = document.getElementById("query-group");
        const queryInput = document.getElementById("query-input");
        const bodyGroup = document.getElementById("body-group");
        const bodyInput = document.getElementById("body-input");
        const callApiButton = document.getElementById("call-api");
        const responseOutput = document.getElementById("response-output");
        const paymentModal = document.getElementById("payment-modal");
        const modalCopy = document.getElementById("modal-copy");
        const modalCancel = document.getElementById("modal-cancel");
        const modalConfirm = document.getElementById("modal-confirm");

        let envConfig = null;
        let protectedRoutes = [];
        let currentWalletStatus = null;
        let secretsVisible = false;
        let openApiSpec = null;

        const walletServiceProxy = {
          async getUnlockedWallet() {
            return getUnlockedWallet();
          }
        };

        document.addEventListener("DOMContentLoaded", init);

        openOnboardingButton.addEventListener("click", openOnboardingPage);
        walletAddressButton.addEventListener("click", copyWalletAddress);
        unlockWalletButton.addEventListener("click", handleUnlock);
        lockWalletButton.addEventListener("click", handleLock);
        refreshBalanceButton.addEventListener("click", refreshWalletSection);
        openWalletPageButton.addEventListener("click", openOnboardingPage);
        toggleSecretsButton.addEventListener("click", handleToggleSecrets);
        toggleSettingsButton.addEventListener("click", () => {
          settingsPanel.classList.toggle("hidden");
        });
        routeInput.addEventListener("input", renderRouteMeta);
        methodSelect.addEventListener("change", renderRouteMeta);
        callApiButton.addEventListener("click", handleCallApi);

        async function init() {
          try {
            envConfig = await getEnvConfig();
            renderEnv();
            await loadProtectedRoutes();
            await loadOpenApiSpec();
            await refreshWalletSection();
            renderRouteMeta();
          } catch (error) {
            setResponse(error instanceof Error ? error.message : String(error));
          }
        }

        function renderEnv() {
          apiNameEl.textContent = envConfig.API_NAME || "Protected API";
          apiSubtitleEl.textContent = `This extension was scaffolded for ${envConfig.API_NAME || "your protected API"}.`;
          apiUrlEl.textContent = envConfig.API_BASE_URL || "http://127.0.0.1:8000";
          emptyApiNameEl.textContent = envConfig.API_NAME || "Protected API";
          emptyDefaultPriceEl.textContent = `${(Number(envConfig.PRICE_MICROALGO || 0) / 1_000_000).toFixed(3)} ALGO`;
          networkBadgeEl.textContent = String(envConfig.ALGO_NETWORK || "testnet").toUpperCase();
          receiverAddressEl.textContent = envConfig.ALGO_RECEIVER || "—";
          receiverAddressEl.title = envConfig.ALGO_RECEIVER || "";
          settingsApiNameEl.textContent = envConfig.API_NAME || "Protected API";
          settingsApiBaseEl.textContent = envConfig.API_BASE_URL || "http://127.0.0.1:8000";
          settingsPriceEl.textContent = `${(Number(envConfig.PRICE_MICROALGO || 0) / 1_000_000).toFixed(6)} ALGO`;
        }

        async function loadProtectedRoutes() {
          const headers = buildApiHeaders();
          const response = await fetch(`${envConfig.API_BASE_URL}/algogate/routes`, { headers });
          if (!response.ok) {
            routeMetaEl.textContent = `Could not load protected routes (${response.status}). You can still type one manually.`;
            return;
          }

          protectedRoutes = await response.json();
          routeList.innerHTML = "";
          for (const route of protectedRoutes) {
            const option = document.createElement("option");
            option.value = route.path;
            option.label = `${route.path} — ${Number(route.price_algo || 0).toFixed(6)} ALGO`;
            routeList.appendChild(option);
          }

          if (!routeInput.value && protectedRoutes.length) {
            routeInput.value = protectedRoutes[0].path;
          }
          syncMethodOptions();
          renderRouteMeta();
        }

        async function loadOpenApiSpec() {
          const headers = buildApiHeaders();
          const response = await fetch(`${envConfig.API_BASE_URL}/openapi.json`, { headers });
          if (!response.ok) {
            return;
          }
          openApiSpec = await response.json();
        }

        async function refreshWalletSection() {
          currentWalletStatus = await getWalletStatus();
          const hasWallet = Boolean(currentWalletStatus?.initialized && currentWalletStatus?.address);

          emptyState.classList.toggle("hidden", hasWallet);
          mainState.classList.toggle("hidden", !hasWallet);

          if (!hasWallet) {
            return;
          }

          walletAddressButton.textContent = `Copy ${truncateMiddle(currentWalletStatus.address)}`;
          walletAddressButton.title = currentWalletStatus.address;
          walletStateEl.textContent = `Address: ${currentWalletStatus.address}\\nNetwork: ${String(currentWalletStatus.network || envConfig.ALGO_NETWORK || "testnet")}`;
          walletSessionBadgeEl.textContent = currentWalletStatus.unlocked ? "Unlocked" : "Locked";
          unlockPanel.classList.toggle("hidden", Boolean(currentWalletStatus.unlocked));
          lockWalletButton.disabled = !currentWalletStatus.unlocked;
          callApiButton.disabled = !currentWalletStatus.unlocked;
          toggleSecretsButton.disabled = !currentWalletStatus.unlocked;
          walletBalanceEl.textContent = "Loading...";
          secretsVisible = false;
          walletSecretsEl.classList.add("hidden");
          walletSecretsEl.textContent = "";
          try {
            const microalgo = await getBalance(currentWalletStatus.address, envConfig.ALGO_NETWORK);
            walletBalanceEl.textContent = `${(microalgo / 1_000_000).toFixed(6)} ALGO`;
          } catch (error) {
            walletBalanceEl.textContent = "Unavailable";
            setResponse(error instanceof Error ? error.message : String(error));
          }
        }

        async function handleUnlock() {
          const password = walletPasswordEl.value;
          if (!password) {
            setResponse("Enter your wallet password first.");
            return;
          }

          try {
            await unlockWallet(password);
            walletPasswordEl.value = "";
            await refreshWalletSection();
            setResponse("Wallet unlocked.");
          } catch (error) {
            setResponse(error instanceof Error ? error.message : String(error));
          }
        }

        async function handleLock() {
          await lockWallet();
          walletPasswordEl.value = "";
          secretsVisible = false;
          walletSecretsEl.classList.add("hidden");
          walletSecretsEl.textContent = "";
          await refreshWalletSection();
          setResponse("Wallet locked.");
        }

        async function handleCallApi() {
          const route = normalizeRoute(routeInput.value);
          if (!route) {
            setResponse("Choose or type a protected route first.");
            return;
          }

          const method = getSelectedMethod();
          const operation = getOperationSpec(route, method);
          const bodyText = String(bodyInput?.value || "").trim();
          const queryString = normalizeQueryInput(String(queryInput?.value || "").trim(), operation);
          if (shouldUseRequestBody(method) && bodyText) {
            try {
              JSON.parse(bodyText);
            } catch {
              setResponse("The JSON body is not valid. Fix it before calling the API.");
              return;
            }
          }

          callApiButton.disabled = true;
          setResponse("Calling API...");

          try {
            const response = await callWithPayment(route, walletServiceProxy, envConfig.ALGO_NETWORK, {
              apiBaseUrl: envConfig.API_BASE_URL,
              apiKey: envConfig.API_KEY,
              method,
              queryString,
              bodyText,
              confirmPayment: (challenge) => openPaymentModal(route, challenge)
            });

            const text = await response.text();
            const pretty = tryPrettyJson(text);
            const prefix = `HTTP ${response.status} ${response.statusText}`.trim();
            setResponse(`${prefix}\\n\\n${pretty}`);
            await refreshWalletSection();
          } catch (error) {
            setResponse(error instanceof Error ? error.message : String(error));
          } finally {
            callApiButton.disabled = !currentWalletStatus?.unlocked;
          }
        }

        function openOnboardingPage() {
          window.open(chrome.runtime.getURL("src/onboarding/onboarding.html"), "_blank");
        }

        async function copyWalletAddress() {
          if (!currentWalletStatus?.address) {
            return;
          }
          await navigator.clipboard.writeText(currentWalletStatus.address);
          setResponse("Wallet address copied.");
        }

        async function handleToggleSecrets() {
          if (!currentWalletStatus?.unlocked) {
            setResponse("Unlock the wallet first to reveal local secrets.");
            return;
          }

          if (secretsVisible) {
            secretsVisible = false;
            walletSecretsEl.classList.add("hidden");
            walletSecretsEl.textContent = "";
            return;
          }

          try {
            const wallet = await getUnlockedWallet();
            if (!wallet) {
              setResponse("Unlock the wallet first.");
              return;
            }
            walletSecretsEl.textContent = [
              `Address: ${wallet.address}`,
              `Network: ${wallet.network}`,
              "",
              "Recovery phrase:",
              wallet.mnemonic,
              "",
              "Private key (base64):",
              wallet.secretKeyBase64
            ].join("\\n");
            walletSecretsEl.classList.remove("hidden");
            secretsVisible = true;
          } catch (error) {
            setResponse(error instanceof Error ? error.message : String(error));
          }
        }

        function renderRouteMeta() {
          const route = normalizeRoute(routeInput.value);
          if (!route) {
            routeMetaEl.textContent = "Choose a route discovered from the API or type one manually.";
            routePriceEl.textContent = "—";
            schemaHintEl.textContent = "No request schema discovered yet.";
            return;
          }
          const found = protectedRoutes.find((item) => item.path === route);
          syncMethodOptions(found?.methods || []);
          const method = getSelectedMethod();
          const operation = getOperationSpec(route, method);
          const descriptor = describeOperation(route, method, operation);

          if (!found) {
            routeMetaEl.textContent = `Custom ${method} route selected. If it is protected, the payment flow will handle it.`;
            routePriceEl.textContent = `${(Number(envConfig.PRICE_MICROALGO || 0) / 1_000_000).toFixed(6)} ALGO`;
            schemaHintEl.textContent = descriptor;
            syncRequestEditors(method, operation);
            return;
          }
          routeMetaEl.textContent = `${found.methods.join(", ")} • ${(Number(found.price_algo || 0)).toFixed(6)} ALGO`;
          routePriceEl.textContent = `${(Number(found.price_algo || 0)).toFixed(6)} ALGO`;
          schemaHintEl.textContent = descriptor;
          syncRequestEditors(method, operation);
        }

        function openPaymentModal(route, challenge) {
          const algoAmount = Number(challenge.amount || 0) / 1_000_000;
          const prompt = `Pay ${algoAmount.toFixed(6)} ALGO to call ${getSelectedMethod()} ${route}?`;

          if (!paymentModal || !modalCopy || !modalConfirm || !modalCancel) {
            return Promise.resolve(window.confirm(prompt));
          }

          paymentModal.classList.remove("hidden");
          modalCopy.textContent = prompt;
          requestAnimationFrame(() => modalConfirm.focus());

          return new Promise((resolve) => {
            const close = (approved) => {
              paymentModal.classList.add("hidden");
              modalConfirm.removeEventListener("click", handleConfirm);
              modalCancel.removeEventListener("click", handleCancel);
              resolve(approved);
            };

            const handleConfirm = () => close(true);
            const handleCancel = () => close(false);

            modalConfirm.addEventListener("click", handleConfirm);
            modalCancel.addEventListener("click", handleCancel);
          });
        }

        function buildApiHeaders() {
          const headers = {};
          if (envConfig.API_KEY) {
            headers["X-API-Key"] = envConfig.API_KEY;
          }
          return headers;
        }

        function syncMethodOptions(methods = []) {
          const normalizedMethods = (methods.length ? methods : [methodSelect.value || "GET"])
            .map((value) => String(value || "GET").toUpperCase())
            .filter(Boolean);
          const previous = String(methodSelect.value || normalizedMethods[0] || "GET").toUpperCase();
          const deduped = [...new Set(normalizedMethods)];
          methodSelect.innerHTML = deduped
            .map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`)
            .join("");
          methodSelect.value = deduped.includes(previous) ? previous : deduped[0] || "GET";
        }

        function getSelectedMethod() {
          return String(methodSelect.value || "GET").toUpperCase();
        }

        function shouldUseRequestBody(method) {
          return ["POST", "PUT", "PATCH", "DELETE"].includes(String(method || "GET").toUpperCase());
        }

        function syncRequestEditors(method, operation) {
          const queryParams = listQueryParameters(operation);
          const bodySchema = getJsonBodySchema(operation);
          const showQuery = queryParams.length > 0 || !shouldUseRequestBody(method);
          const showBody = shouldUseRequestBody(method) || Boolean(bodySchema);

          queryGroup.classList.toggle("hidden", !showQuery);
          bodyGroup.classList.toggle("hidden", !showBody);

          queryInput.placeholder = queryParams.length
            ? queryParams.map((param) => `${param.name}=${exampleForSchema(param.schema)}`).join("&")
            : "city=Bengaluru&units=metric";

          const bodyExample = schemaToExample(bodySchema);
          bodyInput.placeholder = bodyExample
            ? JSON.stringify(bodyExample, null, 2)
            : '{"message":"Hello from AlgoGate"}';
        }

        function getOperationSpec(route, method) {
          if (!openApiSpec?.paths) {
            return null;
          }
          const pathItem = openApiSpec.paths[route];
          if (!pathItem) {
            return null;
          }
          return pathItem[String(method || "GET").toLowerCase()] || null;
        }

        function describeOperation(route, method, operation) {
          const queryParams = listQueryParameters(operation);
          const bodySchema = getJsonBodySchema(operation);
          const parts = [`${method} ${route}`];
          if (queryParams.length) {
            parts.push(`query: ${queryParams.map((param) => param.name).join(", ")}`);
          }
          if (bodySchema) {
            const bodyExample = schemaToExample(bodySchema);
            if (bodyExample && typeof bodyExample === "object" && !Array.isArray(bodyExample)) {
              parts.push(`body: ${Object.keys(bodyExample).join(", ")}`);
            } else {
              parts.push("body: JSON payload");
            }
          }
          if (operation?.summary) {
            parts.push(operation.summary);
          }
          return parts.join(" • ");
        }

        function listQueryParameters(operation) {
          const parameters = operation?.parameters || [];
          return parameters
            .filter((parameter) => parameter?.in === "query")
            .map((parameter) => ({
              name: parameter.name,
              required: Boolean(parameter.required),
              schema: resolveSchema(parameter.schema)
            }));
        }

        function getJsonBodySchema(operation) {
          const schema = operation?.requestBody?.content?.["application/json"]?.schema;
          return resolveSchema(schema);
        }

        function resolveSchema(schema) {
          if (!schema) {
            return null;
          }
          if (schema.$ref && openApiSpec?.components?.schemas) {
            const refName = String(schema.$ref).split("/").pop();
            return resolveSchema(openApiSpec.components.schemas?.[refName]);
          }
          if (Array.isArray(schema.allOf) && schema.allOf.length) {
            return schema.allOf.reduce((merged, item) => mergeSchemas(merged, resolveSchema(item)), {});
          }
          if (Array.isArray(schema.oneOf) && schema.oneOf.length) {
            return resolveSchema(schema.oneOf[0]);
          }
          if (Array.isArray(schema.anyOf) && schema.anyOf.length) {
            return resolveSchema(schema.anyOf[0]);
          }
          return schema;
        }

        function mergeSchemas(base, extra) {
          const left = base || {};
          const right = extra || {};
          return {
            ...left,
            ...right,
            properties: {
              ...(left.properties || {}),
              ...(right.properties || {})
            }
          };
        }

        function schemaToExample(schema) {
          const resolved = resolveSchema(schema);
          if (!resolved) {
            return null;
          }
          if (resolved.example !== undefined) {
            return resolved.example;
          }
          if (resolved.default !== undefined) {
            return resolved.default;
          }
          const type = resolved.type;
          if (type === "object" || resolved.properties) {
            const output = {};
            for (const [key, value] of Object.entries(resolved.properties || {})) {
              output[key] = schemaToExample(value);
            }
            return output;
          }
          if (type === "array") {
            return [schemaToExample(resolved.items)];
          }
          if (type === "integer" || type === "number") {
            return 0;
          }
          if (type === "boolean") {
            return false;
          }
          return "";
        }

        function exampleForSchema(schema) {
          const example = schemaToExample(schema);
          if (example === null || example === undefined || example === "") {
            return "value";
          }
          if (typeof example === "object") {
            return encodeURIComponent(JSON.stringify(example));
          }
          return String(example);
        }

        function normalizeQueryInput(rawValue, operation) {
          const value = String(rawValue || "").trim();
          if (!value) {
            return "";
          }
          if (value.includes("=") || value.includes("&") || value.startsWith("?")) {
            return value;
          }

          const queryParams = listQueryParameters(operation);
          if (queryParams.length === 1) {
            return `${encodeURIComponent(queryParams[0].name)}=${encodeURIComponent(value)}`;
          }

          return value;
        }

        function normalizeRoute(value) {
          const trimmed = String(value || "").trim();
          if (!trimmed) {
            return "";
          }
          if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
            try {
              return new URL(trimmed).pathname;
            } catch {
              return trimmed;
            }
          }
          return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
        }

        function tryPrettyJson(text) {
          try {
            return JSON.stringify(JSON.parse(text), null, 2);
          } catch {
            return text || "(empty response)";
          }
        }

        function setResponse(value) {
          responseOutput.textContent = value;
        }

        function truncateMiddle(value) {
          if (!value) {
            return "—";
          }
          return value.length <= 18 ? value : `${value.slice(0, 8)}…${value.slice(-6)}`;
        }

        function escapeHtml(value) {
          return String(value)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#39;");
        }
        """
    ).strip() + "\n"


def _popup_css() -> str:
    return textwrap.dedent(
        """
        html,
        body {
          margin: 0;
          width: 420px;
          height: 640px;
          overflow: hidden;
          overscroll-behavior: contain;
        }

        body {
          min-width: 320px;
          font: 14px/1.5 "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif;
          background:
            radial-gradient(circle at top right, rgba(203, 24, 30, 0.12), transparent 34%),
            linear-gradient(180deg, #fff7f7 0%, #fff 42%, #fff1f1 100%);
          color: #311111;
        }

        * {
          box-sizing: border-box;
        }

        .popup-shell {
          height: 100%;
          box-sizing: border-box;
          overflow-y: auto;
          overscroll-behavior: contain;
          padding: 18px;
        }

        .popup-header {
          padding: 8px 2px 14px;
        }

        .popup-header h1,
        .card h2 {
          margin: 0;
        }

        .popup-header h1 {
          font-size: 30px;
          line-height: 1.05;
        }

        .popup-subtitle {
          margin: 8px 0 0;
          color: #7b3033;
          font-size: 13px;
        }

        .header-row {
          display: flex;
          gap: 10px;
          align-items: center;
          justify-content: space-between;
          margin-top: 12px;
        }

        .api-url {
          margin: 0;
          color: #8a4447;
          font-size: 12px;
          word-break: break-word;
        }

        .eyebrow {
          margin: 0 0 6px;
          color: #c5161d;
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.12em;
        }

        .card {
          margin-top: 14px;
          padding: 16px;
          border-radius: 20px;
          background: rgba(255, 255, 255, 0.94);
          border: 1px solid rgba(197, 22, 29, 0.12);
          box-shadow: 0 18px 38px rgba(111, 19, 23, 0.08);
        }

        .card-api {
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(255, 245, 245, 0.98));
        }

        .card-wallet {
          background:
            linear-gradient(180deg, rgba(255, 250, 250, 0.98), rgba(255, 238, 239, 0.98));
        }

        .card-topline {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-bottom: 10px;
        }

        .section-chip {
          display: inline-flex;
          align-items: center;
          padding: 5px 10px;
          border-radius: 999px;
          background: #c5161d;
          color: #fff;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .section-chip-soft {
          background: #ffe0e1;
          color: #9a1418;
        }

        .helper-text,
        .wallet-meta {
          margin: 8px 0 0;
          color: #8a4447;
          font-size: 12px;
        }

        .field-label {
          display: block;
          margin-top: 14px;
          color: #6d2e30;
          font-weight: 700;
        }

        .field-label + input,
        .field-label + select,
        .field-label + textarea,
        #wallet-password {
          display: block;
          width: 100%;
          box-sizing: border-box;
          margin-top: 8px;
          padding: 12px 13px;
          border-radius: 14px;
          border: 1px solid rgba(197, 22, 29, 0.18);
          background: #fff;
          color: #2d1011;
          outline: none;
          font: inherit;
          resize: vertical;
        }

        .field-label + input:focus,
        .field-label + select:focus,
        .field-label + textarea:focus,
        #wallet-password:focus {
          border-color: #c5161d;
          box-shadow: 0 0 0 4px rgba(197, 22, 29, 0.1);
        }

        .route-row {
          display: grid;
          grid-template-columns: 112px minmax(0, 1fr);
          gap: 10px;
          align-items: end;
        }

        .field-group {
          min-width: 0;
        }

        .wallet-state {
          margin: 10px 0 0;
          padding: 10px 12px;
          border-radius: 14px;
          background: rgba(255, 244, 244, 0.9);
          border: 1px solid rgba(197, 22, 29, 0.08);
          color: #5a2123;
          white-space: pre-wrap;
          word-break: break-word;
        }

        .wallet-inline-card,
        .details-panel,
        .stat-card,
        .result-box,
        .secret-box {
          margin-top: 12px;
          padding: 12px 14px;
          border-radius: 16px;
          background: #fff5f5;
          border: 1px solid rgba(197, 22, 29, 0.12);
        }

        .stat-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
          margin: 14px 0;
        }

        .stat-label {
          display: block;
          margin-bottom: 6px;
          color: #9a1418;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .unlock-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 10px;
          align-items: end;
          margin-top: 8px;
        }

        .inline-field {
          display: block;
          color: #6d2e30;
          font-weight: 700;
        }

        .actions {
          display: grid;
          gap: 10px;
          margin-top: 14px;
        }

        .actions-two {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .actions-three {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        .settings-line {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          padding: 8px 0;
          border-bottom: 1px solid rgba(197, 22, 29, 0.08);
        }

        .settings-line:last-child {
          border-bottom: 0;
        }

        .settings-line-stack {
          align-items: flex-start;
          flex-direction: column;
        }

        .request-panel {
          margin-top: 12px;
        }

        .schema-hint {
          color: #7b3033;
          text-align: right;
          line-height: 1.45;
          word-break: break-word;
        }

        .mono,
        code,
        .result-box,
        .secret-box {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
        }

        .result-box,
        .secret-box {
          white-space: pre-wrap;
          word-break: break-word;
          max-height: 220px;
          overflow: auto;
          color: #4f1618;
        }

        button {
          border: 0;
          border-radius: 14px;
          padding: 11px 14px;
          background: linear-gradient(180deg, #d81f28, #b11017);
          color: white;
          cursor: pointer;
          font-weight: 700;
          box-shadow: 0 10px 24px rgba(177, 16, 23, 0.18);
          transition: transform 150ms ease, opacity 150ms ease, background-color 150ms ease;
        }

        button.secondary,
        button.ghost {
          background: #fff;
          color: #9a1418;
          border: 1px solid rgba(197, 22, 29, 0.14);
          box-shadow: none;
        }

        button.full {
          width: 100%;
        }

        button:hover:not(:disabled) {
          transform: translateY(-1px);
        }

        button:disabled {
          opacity: 0.55;
          cursor: not-allowed;
          transform: none;
        }

        .modal {
          position: fixed;
          inset: 0;
          display: grid;
          place-items: center;
          background: rgba(86, 10, 14, 0.24);
          padding: 18px;
          z-index: 20;
        }

        .hidden,
        .modal.hidden {
          display: none;
        }

        .modal-card {
          width: 100%;
          max-width: 360px;
          padding: 18px;
          border-radius: 20px;
          background: rgba(255, 255, 255, 0.98);
          border: 1px solid rgba(197, 22, 29, 0.14);
          box-shadow: 0 18px 38px rgba(111, 19, 23, 0.12);
        }

        .modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          margin-top: 14px;
        }

        @media (max-width: 420px) {
          .actions-two,
          .actions-three,
          .stat-grid,
          .unlock-row,
          .route-row {
            grid-template-columns: 1fr;
          }
        }
        """
    ).strip() + "\n"


def _wallet_algorand_js() -> str:
    return textwrap.dedent(
        """
        const NETWORKS = {
          testnet: { algod: "https://testnet-api.algonode.cloud" },
          mainnet: { algod: "https://mainnet-api.algonode.cloud" }
        };

        function getNetwork(network) {
          return String(network || "testnet").toLowerCase() === "mainnet" ? "mainnet" : "testnet";
        }

        function algodClient(network) {
          const resolved = getNetwork(network);
          return new algosdk.Algodv2("", NETWORKS[resolved].algod, "");
        }

        export function generateAccount() {
          const account = algosdk.generateAccount();
          return {
            address: account.addr.toString(),
            mnemonic: algosdk.secretKeyToMnemonic(account.sk),
            secretKeyBase64: bytesToBase64(account.sk),
            network: "testnet"
          };
        }

        export function mnemonicToSecretKey(mnemonic, network = "testnet") {
          const normalized = normalizeMnemonic(mnemonic);
          const account = algosdk.mnemonicToSecretKey(normalized);
          return {
            address: account.addr.toString(),
            mnemonic: normalized,
            secretKeyBase64: bytesToBase64(account.sk),
            network: getNetwork(network)
          };
        }

        export async function getSuggestedParams(network) {
          return algodClient(network).getTransactionParams().do();
        }

        export async function signPayment({ from, to, amount, note, suggestedParams, secretKeyBase64 }) {
          const secretKey = base64ToBytes(secretKeyBase64);
          const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
            sender: from,
            receiver: to,
            amount: Number(amount),
            note,
            suggestedParams
          });
          return txn.signTxn(secretKey);
        }

        export async function sendTransaction(signedTxn, network) {
          const result = await algodClient(network).sendRawTransaction(signedTxn).do();
          return String(result.txid || result.txId || result.txID || "");
        }

        export async function getBalance(address, network) {
          const account = await algodClient(network).accountInformation(address).do();
          return Number(account.amount || 0);
        }

        export function normalizeMnemonic(value) {
          return String(value || "")
            .trim()
            .toLowerCase()
            .split(/\\s+/)
            .filter(Boolean)
            .join(" ");
        }

        export function mnemonicWords(mnemonic) {
          return normalizeMnemonic(mnemonic).split(" ").filter(Boolean);
        }

        function bytesToBase64(bytes) {
          let binary = "";
          bytes.forEach((byte) => {
            binary += String.fromCharCode(byte);
          });
          return btoa(binary);
        }

        function base64ToBytes(value) {
          const binary = atob(value);
          return Uint8Array.from(binary, (char) => char.charCodeAt(0));
        }
        """
    ).strip() + "\n"


def _wallet_crypto_js() -> str:
    return textwrap.dedent(
        """
        const ITERATIONS = 250000;

        export async function encryptJson(payload, password) {
          const plaintext = new TextEncoder().encode(JSON.stringify(payload));
          const salt = crypto.getRandomValues(new Uint8Array(16));
          const iv = crypto.getRandomValues(new Uint8Array(12));
          const key = await deriveAesKey(password, salt, ["encrypt"]);
          const ciphertext = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv },
            key,
            plaintext
          );

          return {
            version: 1,
            iterations: ITERATIONS,
            salt: bytesToBase64(salt),
            iv: bytesToBase64(iv),
            ciphertext: bytesToBase64(new Uint8Array(ciphertext))
          };
        }

        export async function decryptJson(record, password) {
          const salt = base64ToBytes(record.salt);
          const iv = base64ToBytes(record.iv);
          const ciphertext = base64ToBytes(record.ciphertext);
          const key = await deriveAesKey(password, salt, ["decrypt"]);
          const plaintext = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv },
            key,
            ciphertext
          );
          return JSON.parse(new TextDecoder().decode(plaintext));
        }

        async function deriveAesKey(password, salt, usages) {
          const keyMaterial = await crypto.subtle.importKey(
            "raw",
            new TextEncoder().encode(password),
            "PBKDF2",
            false,
            ["deriveKey"]
          );

          return crypto.subtle.deriveKey(
            {
              name: "PBKDF2",
              salt,
              iterations: ITERATIONS,
              hash: "SHA-256"
            },
            keyMaterial,
            {
              name: "AES-GCM",
              length: 256
            },
            false,
            usages
          );
        }

        function bytesToBase64(bytes) {
          let binary = "";
          bytes.forEach((byte) => {
            binary += String.fromCharCode(byte);
          });
          return btoa(binary);
        }

        function base64ToBytes(value) {
          const binary = atob(value);
          return Uint8Array.from(binary, (char) => char.charCodeAt(0));
        }
        """
    ).strip() + "\n"


def _wallet_vault_js() -> str:
    return textwrap.dedent(
        """
        const VAULT_KEY = "algogate.wallet.vault";
        const META_KEY = "algogate.wallet.meta";
        const SESSION_KEY = "algogate.wallet.session";

        export async function readVault() {
          const data = await chrome.storage.local.get([VAULT_KEY, META_KEY]);
          return {
            vault: data[VAULT_KEY] || null,
            meta: data[META_KEY] || null
          };
        }

        export async function writeVault(vault, meta) {
          await chrome.storage.local.set({
            [VAULT_KEY]: vault,
            [META_KEY]: meta
          });
        }

        export async function saveUnlockedSession(wallet) {
          await chrome.storage.session.set({
            [SESSION_KEY]: wallet
          });
        }

        export async function readUnlockedSession() {
          const data = await chrome.storage.session.get([SESSION_KEY]);
          return data[SESSION_KEY] || null;
        }

        export async function clearUnlockedSession() {
          await chrome.storage.session.remove([SESSION_KEY]);
        }
        """
    ).strip() + "\n"


def _wallet_service_js() -> str:
    return textwrap.dedent(
        """
        import { decryptJson, encryptJson } from "./crypto.js";
        import {
          clearUnlockedSession,
          readUnlockedSession,
          readVault,
          saveUnlockedSession,
          writeVault
        } from "./vault.js";

        const DEFAULT_NETWORK = "testnet";

        export async function getWalletStatus() {
          const { meta } = await readVault();
          const session = await readUnlockedSession();
          if (!meta) {
            return { initialized: false, unlocked: false, network: DEFAULT_NETWORK };
          }
          return {
            initialized: true,
            unlocked: Boolean(session),
            address: meta.address,
            network: meta.network || DEFAULT_NETWORK,
            createdAt: meta.createdAt
          };
        }

        export async function setupWallet(wallet, password) {
          validatePassword(password);
          validateWallet(wallet);
          const payload = {
            address: wallet.address,
            mnemonic: wallet.mnemonic,
            secretKeyBase64: wallet.secretKeyBase64,
            network: wallet.network || DEFAULT_NETWORK
          };
          const encrypted = await encryptJson(payload, password);
          const meta = {
            address: payload.address,
            network: payload.network,
            createdAt: new Date().toISOString()
          };
          await writeVault(encrypted, meta);
          await saveUnlockedSession(payload);
          return { address: payload.address, network: payload.network };
        }

        export async function unlockWallet(password) {
          validatePassword(password);
          const wallet = await revealWallet(password);
          await saveUnlockedSession(wallet);
          return wallet;
        }

        export async function lockWallet() {
          await clearUnlockedSession();
        }

        export async function getUnlockedWallet() {
          const wallet = await readUnlockedSession();
          if (!wallet?.address || !wallet?.secretKeyBase64) {
            return null;
          }
          return wallet;
        }

        export async function revealWallet(password) {
          validatePassword(password);
          const { vault } = await readVault();
          if (!vault) {
            throw new Error("Wallet is not initialized yet.");
          }
          return decryptJson(vault, password);
        }

        function validatePassword(password) {
          if (typeof password !== "string" || password.length < 8) {
            throw new Error("Password must be at least 8 characters.");
          }
        }

        function validateWallet(wallet) {
          if (!wallet || !wallet.address || !wallet.mnemonic || !wallet.secretKeyBase64) {
            throw new Error("Wallet payload is incomplete.");
          }
        }
        """
    ).strip() + "\n"


def _lib_env_js() -> str:
    return textwrap.dedent(
        """
        let cachedEnv = null;

        export async function getEnvConfig() {
          if (cachedEnv) {
            return cachedEnv;
          }

          const response = await fetch(chrome.runtime.getURL(".env"));
          if (!response.ok) {
            throw new Error("Could not load the AlgoGate extension environment.");
          }

          const text = await response.text();
          const values = {};
          for (const line of text.split(/\\r?\\n/)) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith("#")) continue;
            const index = trimmed.indexOf("=");
            if (index <= 0) continue;
            values[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim();
          }

          cachedEnv = {
            ALGO_RECEIVER: values.ALGO_RECEIVER || "",
            ALGO_NETWORK: values.ALGO_NETWORK || "testnet",
            PRICE_MICROALGO: Number(values.PRICE_MICROALGO || 0),
            API_BASE_URL: values.API_BASE_URL || "http://127.0.0.1:8000",
            API_KEY: values.API_KEY || "",
            API_NAME: values.API_NAME || "Protected API"
          };
          return cachedEnv;
        }
        """
    ).strip() + "\n"


def _lib_api_js() -> str:
    return textwrap.dedent(
        """
        import { getEnvConfig } from "./env.js";
        import {
          getSuggestedParams,
          sendTransaction,
          signPayment
        } from "../wallet/algorand.js";

        const SESSION_KEY = "algogate.route.sessions";

        export async function callWithPayment(route, walletService, network, options = {}) {
          const env = await getEnvConfig();
          const apiBaseUrl = options.apiBaseUrl || env.API_BASE_URL;
          const apiKey = options.apiKey || env.API_KEY || "";
          const routeUrl = buildRequestUrl(route, apiBaseUrl, options.queryString || "");
          const sessionKey = buildSessionKey(routeUrl, options.method || "GET");
          const sessionToken = await getSessionToken(sessionKey);

          const initialHeaders = buildApiHeaders(apiKey, options.headers || {});
          if (sessionToken) {
            initialHeaders["X-Payment-Signature"] = `jwt.${sessionToken}`;
          }

          let response = await fetch(routeUrl, buildRequestInit(options, initialHeaders));
          storeSessionHeader(sessionKey, response);
          if (response.status !== 402) {
            return response;
          }

          await clearSessionToken(sessionKey);
          const challengeHeader = response.headers.get("X-Payment-Required");
          if (!challengeHeader) {
            throw new Error("The protected API returned 402 without X-Payment-Required.");
          }

          const challenge = JSON.parse(atob(challengeHeader));
          if (Number(challenge.expires || 0) <= Math.floor(Date.now() / 1000)) {
            throw new Error("The payment challenge expired. Call the route again.");
          }

          if (typeof options.confirmPayment === "function") {
            const approved = await options.confirmPayment(challenge);
            if (!approved) {
              throw new Error("Payment cancelled.");
            }
          }

          const wallet = await walletService.getUnlockedWallet();
          if (!wallet) {
            throw new Error("Unlock the wallet before calling a paid route.");
          }

          const note = new TextEncoder().encode(`${challenge.note_prefix}:${Date.now()}`);
          const suggestedParams = await getSuggestedParams(challenge.network || network);
          const signedTxn = await signPayment({
            from: wallet.address,
            to: challenge.receiver,
            amount: challenge.amount,
            note,
            suggestedParams,
            secretKeyBase64: wallet.secretKeyBase64
          });
          const txId = await sendTransaction(signedTxn, challenge.network || network);

          await waitForVerification(txId, apiBaseUrl, apiKey);

          const retryHeaders = buildApiHeaders(apiKey, options.headers || {});
          retryHeaders["X-Payment-Signature"] = txId;
          const retryResponse = await fetch(routeUrl, buildRequestInit(options, retryHeaders));
          await storeSessionHeader(sessionKey, retryResponse);
          return retryResponse;
        }

        function buildRequestUrl(route, apiBaseUrl, queryString) {
          const value = String(route || "").trim();
          if (!value) {
            throw new Error("Route is required.");
          }
          const normalizedQuery = normalizeQueryString(queryString);
          if (value.startsWith("http://") || value.startsWith("https://")) {
            const absoluteUrl = new URL(value);
            if (normalizedQuery) {
              absoluteUrl.search = normalizedQuery;
            }
            return absoluteUrl.toString();
          }
          const normalized = value.startsWith("/") ? value : `/${value}`;
          const url = new URL(normalized, apiBaseUrl);
          if (normalizedQuery) {
            url.search = normalizedQuery;
          }
          return url.toString();
        }

        function buildApiHeaders(apiKey, extraHeaders = {}) {
          const headers = { ...extraHeaders };
          if (apiKey) {
            headers["X-API-Key"] = apiKey;
          }
          return headers;
        }

        function buildRequestInit(options, headers) {
          const method = String(options.method || "GET").toUpperCase();
          const init = {
            method,
            headers
          };
          const bodyText = String(options.bodyText || "").trim();
          if (!["GET", "HEAD"].includes(method) && bodyText) {
            headers["Content-Type"] = options.contentType || "application/json";
            init.body = bodyText;
          }
          return init;
        }

        function buildSessionKey(routeUrl, method) {
          const url = new URL(routeUrl);
          return `${String(method || "GET").toUpperCase()} ${url.origin}${url.pathname}`;
        }

        function normalizeQueryString(queryString) {
          const value = String(queryString || "").trim();
          if (!value) {
            return "";
          }
          return value.startsWith("?") ? value.slice(1) : value;
        }

        async function waitForVerification(txId, apiBaseUrl, apiKey) {
          const headers = {
            "Content-Type": "application/json"
          };
          if (apiKey) {
            headers["X-API-Key"] = apiKey;
          }

          for (let attempt = 0; attempt < 6; attempt += 1) {
            const response = await fetch(new URL("/algogate/verify", apiBaseUrl), {
              method: "POST",
              headers,
              body: JSON.stringify({ tx_id: txId })
            });
            if (response.ok) {
              return;
            }
            await new Promise((resolve) => setTimeout(resolve, 1500));
          }

          await new Promise((resolve) => setTimeout(resolve, 4000));
        }

        async function storeSessionHeader(sessionKey, response) {
          const header = response.headers.get("X-Payment-Session");
          if (!header || !header.startsWith("jwt.")) {
            return;
          }
          await setSessionToken(sessionKey, header.slice(4));
        }

        async function getSessionToken(sessionKey) {
          const data = await chrome.storage.local.get([SESSION_KEY]);
          return data[SESSION_KEY]?.[sessionKey] || "";
        }

        async function setSessionToken(sessionKey, token) {
          const data = await chrome.storage.local.get([SESSION_KEY]);
          const sessions = data[SESSION_KEY] || {};
          sessions[sessionKey] = token;
          await chrome.storage.local.set({ [SESSION_KEY]: sessions });
        }

        async function clearSessionToken(sessionKey) {
          const data = await chrome.storage.local.get([SESSION_KEY]);
          const sessions = data[SESSION_KEY] || {};
          delete sessions[sessionKey];
          await chrome.storage.local.set({ [SESSION_KEY]: sessions });
        }
        """
    ).strip() + "\n"


def _onboarding_html() -> str:
    return textwrap.dedent(
        """
        <!doctype html>
        <html lang="en">
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <title>AlgoGate Wallet Setup</title>
            <link rel="stylesheet" href="./onboarding.css" />
          </head>
          <body>
            <main class="page">
              <header class="hero">
                <p class="eyebrow">AlgoGate Wallet</p>
                <h1>Set up your wallet once.</h1>
                <p class="helper-text">
                  This embedded wallet lives locally in AlgoGate and is used to pay for the protected routes exposed by the SDK.
                </p>
              </header>

              <section id="wallet-ready" class="card hidden">
                <div class="card-topline">
                  <span class="section-chip">Wallet Ready</span>
                  <span class="section-chip section-chip-soft">Embedded Vault</span>
                </div>
                <h2>Wallet ready</h2>
                <pre id="ready-summary" class="summary-box"></pre>
                <div class="actions">
                  <button id="copy-ready-address" class="secondary">Copy address</button>
                  <button id="open-popup">Done</button>
                </div>
              </section>

              <section id="existing-wallet" class="card hidden">
                <div class="card-topline">
                  <span class="section-chip">Already Initialized</span>
                  <span class="section-chip section-chip-soft">Local Wallet</span>
                </div>
                <h2>Wallet already initialized</h2>
                <pre id="existing-summary" class="summary-box"></pre>
                <div class="actions">
                  <button id="copy-existing-address" class="secondary">Copy address</button>
                  <button id="open-existing-popup">Open popup</button>
                </div>
              </section>

              <section id="setup-panel" class="card">
                <div class="tab-row">
                  <button id="tab-create" class="tab-button is-active" type="button">Create Wallet</button>
                  <button id="tab-import" class="tab-button secondary" type="button">Import Existing</button>
                </div>

                <div id="create-view">
                  <div id="create-step-form">
                    <h2>Create a new wallet</h2>
                    <label>
                      Password
                      <input id="password" type="password" placeholder="At least 8 characters" />
                    </label>
                    <label>
                      Confirm password
                      <input id="password-confirm" type="password" placeholder="Repeat password" />
                    </label>
                    <p id="password-strength" class="helper-text">Strength: —</p>
                    <div class="actions">
                      <button id="choose-create" type="button">Generate recovery phrase</button>
                    </div>
                  </div>

                  <div id="create-flow" class="hidden">
                    <h2>Save your recovery phrase</h2>
                    <p class="helper-text">
                      Write these 25 words down in order. They are the real recovery phrase for this wallet.
                    </p>
                    <div id="mnemonic-grid" class="mnemonic-grid"></div>
                    <div class="actions">
                      <button id="copy-mnemonic" type="button">Copy recovery phrase</button>
                      <button id="continue-verify" type="button">I saved it</button>
                    </div>
                  </div>

                  <div id="verify-flow" class="hidden">
                    <h2>Verify your recovery phrase</h2>
                    <p class="helper-text">
                      Confirm the requested recovery words before the wallet is created.
                    </p>
                    <div id="verify-prompts" class="verify-prompts"></div>
                    <div class="actions">
                      <button id="finish-create" type="button">Create wallet</button>
                    </div>
                  </div>
                </div>

                <div id="import-view" class="hidden">
                  <h2>Import an existing wallet</h2>
                  <label>
                    Recovery phrase
                    <textarea
                      id="import-mnemonic"
                      rows="5"
                      placeholder="Paste your 25-word Algorand recovery phrase"
                    ></textarea>
                  </label>
                  <div class="actions">
                    <button id="finish-import" type="button">Import wallet</button>
                  </div>
                </div>

                <p id="status-output" class="status-text">Ready.</p>
              </section>
            </main>

            <script src="../../node_modules/algosdk/dist/browser/algosdk.min.js"></script>
            <script type="module" src="./onboarding.js"></script>
          </body>
        </html>
        """
    ).strip() + "\n"


def _onboarding_js() -> str:
    return textwrap.dedent(
        """
        import { getEnvConfig } from "../lib/env.js";
        import { generateAccount, mnemonicToSecretKey, mnemonicWords } from "../wallet/algorand.js";
        import { getWalletStatus, setupWallet } from "../wallet/service.js";

        const setupPanel = document.getElementById("setup-panel");
        const existingWalletPanel = document.getElementById("existing-wallet");
        const existingSummaryEl = document.getElementById("existing-summary");
        const walletReadyPanel = document.getElementById("wallet-ready");
        const readySummaryEl = document.getElementById("ready-summary");
        const statusOutput = document.getElementById("status-output");
        const copyReadyAddressButton = document.getElementById("copy-ready-address");
        const copyExistingAddressButton = document.getElementById("copy-existing-address");
        const openExistingPopupButton = document.getElementById("open-existing-popup");

        const tabCreate = document.getElementById("tab-create");
        const tabImport = document.getElementById("tab-import");
        const createView = document.getElementById("create-view");
        const importView = document.getElementById("import-view");

        const passwordEl = document.getElementById("password");
        const passwordConfirmEl = document.getElementById("password-confirm");
        const passwordStrengthEl = document.getElementById("password-strength");
        const chooseCreateButton = document.getElementById("choose-create");
        const createStepForm = document.getElementById("create-step-form");
        const createFlow = document.getElementById("create-flow");
        const verifyFlow = document.getElementById("verify-flow");
        const mnemonicGrid = document.getElementById("mnemonic-grid");
        const copyMnemonicButton = document.getElementById("copy-mnemonic");
        const continueVerifyButton = document.getElementById("continue-verify");
        const verifyPrompts = document.getElementById("verify-prompts");
        const finishCreateButton = document.getElementById("finish-create");

        const importMnemonicEl = document.getElementById("import-mnemonic");
        const finishImportButton = document.getElementById("finish-import");
        const openPopupButton = document.getElementById("open-popup");

        let draftWallet = null;
        let verificationIndices = [];
        let currentReadyAddress = "";
        let currentExistingAddress = "";

        init().catch((error) => {
          setStatus(error instanceof Error ? error.message : "Wallet setup failed.", true);
        });

        passwordEl.addEventListener("input", updatePasswordStrength);
        tabCreate.addEventListener("click", () => switchTab("create"));
        tabImport.addEventListener("click", () => switchTab("import"));
        chooseCreateButton.addEventListener("click", startCreateFlow);
        copyMnemonicButton.addEventListener("click", copyDraftMnemonic);
        continueVerifyButton.addEventListener("click", showVerifyStep);
        finishCreateButton.addEventListener("click", finishCreateFlow);
        finishImportButton.addEventListener("click", finishImportFlow);
        openPopupButton.addEventListener("click", () => window.close());
        openExistingPopupButton?.addEventListener("click", () => window.close());
        copyReadyAddressButton?.addEventListener("click", async () => copyAddress(currentReadyAddress));
        copyExistingAddressButton?.addEventListener("click", async () => copyAddress(currentExistingAddress));

        async function init() {
          const status = await getWalletStatus();
          if (status?.initialized) {
            setupPanel.classList.add("hidden");
            existingWalletPanel.classList.remove("hidden");
            currentExistingAddress = String(status.address || "");
            existingSummaryEl.textContent = `Address: ${status.address}\\nNetwork: ${status.network}`;
            return;
          }

          switchTab("create");
        }

        function switchTab(tab) {
          const createActive = tab === "create";
          createView.classList.toggle("hidden", !createActive);
          importView.classList.toggle("hidden", createActive);
          tabCreate.classList.toggle("is-active", createActive);
          tabImport.classList.toggle("is-active", !createActive);
          clearStatus();
        }

        function updatePasswordStrength() {
          const value = passwordEl.value;
          let strength = "Weak";
          if (value.length >= 12 && /[A-Z]/.test(value) && /\\d/.test(value) && /[^A-Za-z0-9]/.test(value)) {
            strength = "Strong";
          } else if (value.length >= 10 && /\\d/.test(value)) {
            strength = "Medium";
          }
          passwordStrengthEl.textContent = `Strength: ${strength}`;
        }

        function validatePasswordFields() {
          const password = passwordEl.value;
          const confirm = passwordConfirmEl.value;
          if (password.length < 8) {
            throw new Error("Password must be at least 8 characters.");
          }
          if (password !== confirm) {
            throw new Error("Passwords do not match.");
          }
          return password;
        }

        async function startCreateFlow() {
          try {
            validatePasswordFields();
            draftWallet = generateAccount();
            const env = await getEnvConfig();
            draftWallet.network = env.ALGO_NETWORK || "testnet";
            verificationIndices = pickRandomIndices(25, 3);
            mnemonicGrid.innerHTML = mnemonicWords(draftWallet.mnemonic)
              .map(
                (word, index) =>
                  `<div class="mnemonic-word"><strong>${index + 1}.</strong>${escapeHtml(word)}</div>`
              )
              .join("");
            createStepForm.classList.add("hidden");
            createFlow.classList.remove("hidden");
            verifyFlow.classList.add("hidden");
            setStatus("New wallet generated. Save the mnemonic before continuing.");
          } catch (error) {
            setStatus(error instanceof Error ? error.message : String(error), true);
          }
        }

        async function copyDraftMnemonic() {
          if (!draftWallet) {
            setStatus("Generate a wallet first.", true);
            return;
          }
          await navigator.clipboard.writeText(draftWallet.mnemonic);
          setStatus("Recovery phrase copied. Keep it safe.");
        }

        function showVerifyStep() {
          if (!draftWallet) {
            setStatus("Generate a wallet first.", true);
            return;
          }
          verifyPrompts.innerHTML = verificationIndices
            .map(
              (index) => `
                <label>
                  Word #${index + 1}
                  <input data-verify-index="${index}" type="text" autocomplete="off" />
                </label>
              `
            )
            .join("");
          createFlow.classList.add("hidden");
          verifyFlow.classList.remove("hidden");
          setStatus("Confirm the requested recovery words.");
        }

        async function finishCreateFlow() {
          try {
            const password = validatePasswordFields();
            if (!draftWallet) {
              throw new Error("Generate a wallet first.");
            }

            const words = mnemonicWords(draftWallet.mnemonic);
            for (const input of verifyPrompts.querySelectorAll("input[data-verify-index]")) {
              const index = Number(input.getAttribute("data-verify-index"));
              const expected = words[index];
              const actual = String(input.value || "").trim().toLowerCase();
              if (actual !== expected) {
                throw new Error(`Recovery word #${index + 1} does not match.`);
              }
            }

            await setupWallet(draftWallet, password);
            showReadyState(draftWallet.address, draftWallet.network);
          } catch (error) {
            setStatus(error instanceof Error ? error.message : String(error), true);
          }
        }

        async function finishImportFlow() {
          try {
            const password = validatePasswordFields();
            const env = await getEnvConfig();
            const wallet = mnemonicToSecretKey(importMnemonicEl.value, env.ALGO_NETWORK || "testnet");
            await setupWallet(wallet, password);
            showReadyState(wallet.address, wallet.network);
          } catch (error) {
            setStatus(error instanceof Error ? error.message : String(error), true);
          }
        }

        function showReadyState(address, network) {
          setupPanel.classList.add("hidden");
          existingWalletPanel.classList.add("hidden");
          walletReadyPanel.classList.remove("hidden");
          currentReadyAddress = address;
          readySummaryEl.textContent = `Address: ${address}\\nNetwork: ${network}`;
          setStatus("Wallet created successfully.");
        }

        function pickRandomIndices(total, count) {
          const picked = new Set();
          while (picked.size < count) {
            picked.add(Math.floor(Math.random() * total));
          }
          return [...picked].sort((a, b) => a - b);
        }

        function setStatus(message, isError = false) {
          statusOutput.textContent = message;
          statusOutput.style.color = isError ? "#b42318" : "#1e7b44";
        }

        function clearStatus() {
          statusOutput.textContent = "";
        }

        async function copyAddress(address) {
          if (!address) {
            setStatus("No wallet address available to copy.", true);
            return;
          }
          await navigator.clipboard.writeText(address);
          setStatus("Wallet address copied.");
        }

        function escapeHtml(value) {
          return String(value)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#39;");
        }
        """
    ).strip() + "\n"


def _onboarding_css() -> str:
    return textwrap.dedent(
        """
        body {
          margin: 0;
          font: 14px/1.55 "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif;
          background:
            radial-gradient(circle at top right, rgba(216, 31, 40, 0.12), transparent 28%),
            linear-gradient(180deg, #fff7f7 0%, #fff 45%, #fff2f2 100%);
          color: #2d1011;
        }

        * {
          box-sizing: border-box;
        }

        .page {
          max-width: 860px;
          margin: 0 auto;
          padding: 40px 18px 56px;
        }

        .hero h1,
        .card h2 {
          margin: 0;
        }

        .hero h1 {
          font-size: 40px;
          line-height: 1.04;
        }

        .eyebrow {
          margin: 0 0 8px;
          color: #c5161d;
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.12em;
        }

        .helper-text {
          color: #7c383b;
        }

        .card {
          margin-top: 18px;
          padding: 22px;
          border-radius: 24px;
          background: rgba(255, 255, 255, 0.94);
          border: 1px solid rgba(197, 22, 29, 0.12);
          box-shadow: 0 20px 42px rgba(109, 21, 25, 0.08);
        }

        .hidden {
          display: none;
        }

        .card-topline {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-bottom: 10px;
        }

        .section-chip {
          display: inline-flex;
          align-items: center;
          padding: 5px 10px;
          border-radius: 999px;
          background: #c5161d;
          color: #fff;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .section-chip-soft {
          background: #ffe0e1;
          color: #9a1418;
        }

        .tab-row {
          display: flex;
          gap: 10px;
          margin-bottom: 18px;
          flex-wrap: wrap;
        }

        .tab-button,
        button {
          border: 0;
          border-radius: 14px;
          padding: 12px 16px;
          color: #fff;
          background: linear-gradient(180deg, #d81f28, #b11017);
          cursor: pointer;
          font-weight: 700;
          box-shadow: 0 12px 24px rgba(177, 16, 23, 0.16);
        }

        .tab-button.secondary,
        button.secondary {
          background: #fff;
          color: #9a1418;
          border: 1px solid rgba(197, 22, 29, 0.14);
          box-shadow: none;
        }

        .tab-button.is-active {
          transform: translateY(-1px);
        }

        label {
          display: block;
          margin-top: 14px;
          color: #62262a;
          font-weight: 600;
        }

        input,
        textarea {
          display: block;
          width: 100%;
          box-sizing: border-box;
          margin-top: 8px;
          padding: 12px 13px;
          border-radius: 14px;
          border: 1px solid rgba(197, 22, 29, 0.16);
          background: #fff;
          color: #2d1011;
          outline: none;
        }

        input:focus,
        textarea:focus {
          border-color: #c5161d;
          box-shadow: 0 0 0 4px rgba(197, 22, 29, 0.1);
        }

        textarea {
          resize: vertical;
        }

        .actions {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
          margin-top: 16px;
        }

        .mnemonic-grid {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 10px;
          margin-top: 16px;
        }

        .mnemonic-word {
          padding: 10px 12px;
          border-radius: 14px;
          background: #fff7f7;
          border: 1px solid rgba(197, 22, 29, 0.1);
          color: #5d1e21;
        }

        .mnemonic-word strong {
          color: #c5161d;
          margin-right: 6px;
        }

        .verify-prompts {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 10px;
        }

        .summary-box {
          margin: 12px 0 0;
          padding: 14px;
          border-radius: 16px;
          background: #fff5f5;
          border: 1px solid rgba(197, 22, 29, 0.12);
          color: #5d1e21;
          white-space: pre-wrap;
          word-break: break-word;
        }

        .status-text {
          min-height: 22px;
          margin: 16px 0 0;
          color: #1e7b44;
          white-space: pre-wrap;
        }

        @media (max-width: 720px) {
          .hero h1 {
            font-size: 32px;
          }

          .mnemonic-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 560px) {
          .actions {
            grid-template-columns: 1fr;
          }
        }
        """
    ).strip() + "\n"
