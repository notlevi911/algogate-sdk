# Algorand DeFi Safety Layer

This repo now contains:

- a Manifest V3 browser extension for Algorand DeFi safety checks
- a React + Vite landing page for the extension with an "Add to Chrome" style CTA

## Frontend

The landing page lives in:

- `index.html`
- `src/App.jsx`
- `src/main.jsx`
- `src/styles.css`

### Run the frontend

```bash
npm install
npm run dev
```

The page includes:

- a hero section describing the extension
- feature cards
- a browser-style mockup
- an "Add to Chrome" button that explains how to load the extension locally

## Extension

## What it does

- Detects supported Algorand DeFi sites
- Injects a right-side risk panel
- Shows free hardcoded protocol checks
- Offers a paid-style "deep analysis" flow powered by OpenAI or a mock fallback
- Includes a simple wallet section for Algorand/x402-oriented UX

## Load in Chrome

1. Open `chrome://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select the `extension` folder

## Configure

Open the extension options page and set:

- Gemini model
- Preferred Algorand network
- Optional wallet address fallback

Also create or edit:

- `extension/.env`

with:

```env
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-2.5-flash
```

## What changed

- Gemini 2.5 Flash is now used for premium analysis instead of OpenAI
- Page-type detection now works on general pages, including YouTube, docs, PDFs, and generic pages
- Wallet connection is now being moved to an official Pera Wallet QR flow in the popup

## Pera Wallet setup

The popup uses the official `@perawallet/connect` package, so you need to bundle the popup and options code before reloading the extension:

```bash
cd extension
npm install
npm run build
```

Then reload the unpacked extension in Chrome.

The content-side wallet button now points users to the popup, where the Pera QR flow is launched.

## AlgoKit note

This extension is scaffolded to fit an Algorand workflow. The official AlgoKit quick start recommends installing AlgoKit with `pipx install algokit`, then using `algokit localnet start` and `algokit init` to bootstrap Algorand development projects. It also points to AlgoKit templates with `use-wallet` integration for wallets like Pera/Defly/Exodus if you later move this into a fuller app stack.

Sources:
- https://dev.algorand.co/getting-started/algokit-quick-start/
- https://dev.algorand.co/algokit/official-algokit-templates/
- https://platform.openai.com/docs/libraries/javascript
