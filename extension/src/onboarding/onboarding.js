import { STANDARD_MNEMONIC_WORDS, createAlgorandWalletDraft, importAlgorandWalletFromMnemonic, mnemonicWords, normalizeMnemonic } from "../wallet/algorand.js";
const setupPanel = document.getElementById("setup-panel");
const existingWalletPanel = document.getElementById("existing-wallet");
const existingSummaryEl = document.getElementById("existing-summary");
const walletReadyPanel = document.getElementById("wallet-ready");
const readySummaryEl = document.getElementById("ready-summary");
const statusTextEl = document.getElementById("status-text");
const copyReadyAddressButton = document.getElementById("copy-ready-address");
const copyExistingAddressButton = document.getElementById("copy-existing-address");
const openExistingPopupButton = document.getElementById("open-existing-popup");
const tabCreate = document.getElementById("tab-create");
const tabImport = document.getElementById("tab-import");
const createView = document.getElementById("create-view");
const importView = document.getElementById("import-view");
const createPasswordEl = document.getElementById("create-password");
const createPasswordConfirmEl = document.getElementById("create-password-confirm");
const generateWalletButton = document.getElementById("generate-wallet");
const createStepForm = document.getElementById("create-step-form");
const createStepReveal = document.getElementById("create-step-reveal");
const createStepConfirm = document.getElementById("create-step-confirm");
const mnemonicGrid = document.getElementById("mnemonic-grid");
const copyMnemonicButton = document.getElementById("copy-mnemonic");
const continueToVerifyButton = document.getElementById("continue-to-verify");
const confirmWord4El = document.getElementById("confirm-word-4");
const confirmWord5El = document.getElementById("confirm-word-5");
const confirmWalletButton = document.getElementById("confirm-wallet");
const restartCreateButton = document.getElementById("restart-create");
const backToPhraseButton = document.getElementById("back-to-phrase");
const importMnemonicEl = document.getElementById("import-mnemonic");
const importPasswordEl = document.getElementById("import-password");
const importPasswordConfirmEl = document.getElementById("import-password-confirm");
const importWalletButton = document.getElementById("import-wallet");
const openPopupButton = document.getElementById("open-popup");
let createDraft = null;
let currentReadyAddress = "";
let currentExistingAddress = "";
init().catch((error) => {
    setStatus(error instanceof Error ? error.message : "Wallet setup failed.");
});
tabCreate.addEventListener("click", () => switchTab("create"));
tabImport.addEventListener("click", () => switchTab("import"));
generateWalletButton.addEventListener("click", handleGenerateWallet);
copyMnemonicButton.addEventListener("click", handleCopyMnemonic);
continueToVerifyButton.addEventListener("click", showVerifyStep);
confirmWalletButton.addEventListener("click", handleConfirmWallet);
restartCreateButton.addEventListener("click", resetCreateFlow);
backToPhraseButton.addEventListener("click", showPhraseStep);
importWalletButton.addEventListener("click", handleImportWallet);
openPopupButton.addEventListener("click", () => window.close());
openExistingPopupButton?.addEventListener("click", () => window.close());
copyReadyAddressButton?.addEventListener("click", async () => copyAddress(currentReadyAddress));
copyExistingAddressButton?.addEventListener("click", async () => copyAddress(currentExistingAddress));
async function init() {
    const response = await chrome.runtime.sendMessage({ type: "GET_WALLET_STATUS" });
    if (!response?.ok) {
        setStatus(response?.error || "Could not load wallet status.");
        return;
    }
    if (response.status?.initialized) {
        setupPanel.classList.add("hidden");
        existingWalletPanel.classList.remove("hidden");
        currentExistingAddress = String(response.status.address || "");
        existingSummaryEl.textContent = `Address: ${response.status.address}\nChain: Algorand`;
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
function handleGenerateWallet() {
    const password = createPasswordEl.value;
    const confirmPassword = createPasswordConfirmEl.value;
    const passwordError = validatePasswords(password, confirmPassword);
    if (passwordError) {
        setStatus(passwordError, true);
        return;
    }
    createDraft = createAlgorandWalletDraft();
    const words = mnemonicWords(createDraft.mnemonic);
    if (words.length !== STANDARD_MNEMONIC_WORDS) {
        setStatus("Unexpected mnemonic length while creating wallet.", true);
        createDraft = null;
        return;
    }
    mnemonicGrid.innerHTML = words
        .map((word, index) => `<div class="mnemonic-word"><strong>${index + 1}.</strong>${escapeHtml(word)}</div>`)
        .join("");
    createStepForm.classList.add("hidden");
    createStepReveal.classList.remove("hidden");
    clearStatus();
}
async function handleCopyMnemonic() {
    if (!createDraft) {
        setStatus("Generate a recovery phrase first.", true);
        return;
    }
    await navigator.clipboard.writeText(createDraft.mnemonic);
    setStatus("Recovery phrase copied. Keep it safe.");
}
function showVerifyStep() {
    if (!createDraft) {
        setStatus("Generate a recovery phrase first.", true);
        return;
    }
    createStepReveal.classList.add("hidden");
    createStepConfirm.classList.remove("hidden");
    clearStatus();
}
function showPhraseStep() {
    createStepConfirm.classList.add("hidden");
    createStepReveal.classList.remove("hidden");
    clearStatus();
}
async function handleConfirmWallet() {
    if (!createDraft) {
        setStatus("Generate a recovery phrase first.", true);
        return;
    }
    const words = mnemonicWords(createDraft.mnemonic);
    const word4 = confirmWord4El.value.trim().toLowerCase();
    const word5 = confirmWord5El.value.trim().toLowerCase();
    if (word4 !== words[3] || word5 !== words[4]) {
        setStatus("The recovery-word check did not match. Please try again.", true);
        return;
    }
    const response = await chrome.runtime.sendMessage({
        type: "SETUP_EMBEDDED_WALLET",
        payload: {
            address: createDraft.address,
            mnemonic: createDraft.mnemonic,
            secretKeyBase64: createDraft.secretKeyBase64,
            network: createDraft.network,
            password: createPasswordEl.value
        }
    });
    if (!response?.ok) {
        setStatus(response?.error || "Could not create wallet.", true);
        return;
    }
    showReadyState(response.wallet.address, response.wallet.network);
}
async function handleImportWallet() {
    const mnemonic = normalizeMnemonic(importMnemonicEl.value);
    const password = importPasswordEl.value;
    const confirmPassword = importPasswordConfirmEl.value;
    const passwordError = validatePasswords(password, confirmPassword);
    if (passwordError) {
        setStatus(passwordError, true);
        return;
    }
    let importedWallet;
    try {
        importedWallet = importAlgorandWalletFromMnemonic(mnemonic);
    }
    catch (error) {
        setStatus(error instanceof Error ? error.message : "Recovery phrase looks invalid.", true);
        return;
    }
    const response = await chrome.runtime.sendMessage({
        type: "SETUP_EMBEDDED_WALLET",
        payload: {
            address: importedWallet.address,
            mnemonic,
            secretKeyBase64: importedWallet.secretKeyBase64,
            network: importedWallet.network,
            password
        }
    });
    if (!response?.ok) {
        setStatus(response?.error || "Could not import wallet.", true);
        return;
    }
    showReadyState(response.wallet.address, response.wallet.network);
}
function showReadyState(address, network) {
    setupPanel.classList.add("hidden");
    existingWalletPanel.classList.add("hidden");
    walletReadyPanel.classList.remove("hidden");
    currentReadyAddress = address;
    readySummaryEl.textContent = `Address: ${address}\nChain: Algorand`;
    setStatus("Wallet created successfully.");
}
function resetCreateFlow() {
    createDraft = null;
    createStepForm.classList.remove("hidden");
    createStepReveal.classList.add("hidden");
    createStepConfirm.classList.add("hidden");
    mnemonicGrid.innerHTML = "";
    confirmWord4El.value = "";
    confirmWord5El.value = "";
    clearStatus();
}
function validatePasswords(password, confirmPassword) {
    if (password.length < 8) {
        return "Password must be at least 8 characters.";
    }
    if (password !== confirmPassword) {
        return "Passwords do not match.";
    }
    return "";
}
function setStatus(message, isError = false) {
    statusTextEl.textContent = message;
    statusTextEl.style.color = isError ? "#fca5a5" : "#86efac";
}
function clearStatus() {
    statusTextEl.textContent = "";
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
