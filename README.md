# EtherX

EtherX is a Chrome extension plus a local FastAPI backend for premium web actions.

The current product has three major parts:

1. A Chrome extension in `extension/`
2. A FastAPI backend in `backend/`
3. A React + Vite landing page in the repo root

This README is intentionally detailed. It explains not just how to run the project, but also how the TypeScript side is structured, how Chrome actually loads the extension, how the wallet is stored, and how the premium payment flow works.

## What EtherX Does

Right now EtherX focuses on page-aware AI actions:

- detect the current page type
- show a page action in the extension
- run a free summary path
- run a paid summary path
- use an embedded Algorand wallet as the payer
- verify payment on the backend
- unlock the premium response after payment

The UI surface currently exists in two places:

- the popup
- the injected right-side page panel

The popup is the main control surface for quick summary and premium summary.

---

## Repository Structure

```text
.
├── backend/
│   ├── main.py
│   ├── routers/
│   ├── services/
│   ├── scripts/
│   ├── requirements.txt
│   └── .env
├── extension/
│   ├── manifest.json
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env
│   └── src/
│       ├── background.ts
│       ├── content/
│       ├── popup/
│       ├── onboarding/
│       ├── options/
│       ├── wallet/
│       ├── lib/
│       └── types/
├── src/
│   ├── App.jsx
│   ├── main.jsx
│   └── styles.css
├── index.html
└── README.md
```

---

## High-Level Architecture

At runtime, the system looks like this:

```text
Web page
  └─ content script injects EtherX pill + side panel
       └─ asks background service worker for wallet state, balances, backend detection

Popup
  └─ reads active tab context from content script
       └─ calls backend for free/premium summary
            └─ premium route may return 402
                 └─ popup uses embedded wallet to sign/send payment
                      └─ backend verifies payment
                           └─ popup retries premium request

Backend
  ├─ cleans HTML
  ├─ calls Gemini
  ├─ returns summary JSON
  └─ verifies native ALGO payments for paid routes
```

---

## TypeScript: How It Works In This Project

This project does **not** use a complex bundler pipeline for the extension runtime.

Instead:

- the source of truth is `.ts`
- TypeScript compiles those `.ts` files into `.js`
- Chrome loads the compiled `.js`
- the `.js` files live next to the `.ts` files inside `extension/src/`

That means:

- you edit `background.ts`
- `tsc` produces `background.js`
- the manifest points to `background.js`

### Important Consequence

You should treat the `.ts` files as the files you maintain and the `.js` files as build output.

In other words:

- edit `.ts`
- run `npm run build`
- reload the unpacked extension

If you change `.ts` but do not rebuild, Chrome will still use the older `.js`.

That is one of the most common reasons an extension change seems like it “did not work.”

---

## Why Both `.ts` And `.js` Exist

Chrome cannot execute TypeScript directly.

It only knows how to load:

- `.js`
- `.html`
- `.css`

So the project keeps:

- `background.ts` as the developer-friendly source
- `background.js` as the compiled output Chrome actually runs

The same is true for:

- `popup.ts` -> `popup.js`
- `content.ts` -> `content.js`
- `onboarding.ts` -> `onboarding.js`
- `options.ts` -> `options.js`
- wallet helper modules in `wallet/`
- shared helpers in `lib/`

---

## `tsconfig.json`: What It Means Here

File: [tsconfig.json](/Users/levi/Desktop/test/extension/tsconfig.json)

Current config:

- `target: ES2022`
  TypeScript emits modern JavaScript.

- `module: ES2022`
  The emitted code uses native ES modules.

- `moduleResolution: bundler`
  This lets the project use modern import behavior cleanly during compilation.

- `lib: ["ES2022", "DOM"]`
  The code can use browser APIs and modern JavaScript APIs.

- `strict: true`
  TypeScript checks types aggressively.

- `allowJs: false`
  `.js` files are not treated as source files by TypeScript.

- `noEmitOnError: true`
  If there is a TypeScript error, build output is not emitted.

This matters because it protects the extension from half-broken builds.

---

## Why Imports End With `.js` Inside `.ts`

You will notice code like this in TypeScript:

```ts
import { getEnvConfig } from "./lib/env.js";
```

That is intentional.

Even though the source file is `env.ts`, the runtime file after build is `env.js`.

Chrome runs the emitted JavaScript, so the import path needs to match the final runtime file extension.

This pattern is normal for TS projects that emit native ESM directly instead of bundling everything into one file.

---

## The Extension Runtime Pieces

The extension is split into several runtime surfaces.

### 1. `background.ts`

File: [background.ts](/Users/levi/Desktop/test/extension/src/background.ts)

This is the service worker for the extension.

Its job is to do background work that should not live in the popup or directly inside the page.

What it currently handles:

- reading and saving extension settings
- wallet setup and wallet session state
- wallet secret reveal
- wallet balance fetches
- backend-assisted page detection
- protocol analysis helper calls

Think of `background.ts` as the extension’s controller layer.

It listens for `chrome.runtime.onMessage` and switches on message types like:

- `GET_SETTINGS`
- `SAVE_SETTINGS`
- `GET_WALLET_STATUS`
- `UNLOCK_WALLET_SESSION`
- `GET_WALLET_BALANCE`
- `DETECT_PAGE_WITH_BACKEND`

So when popup or content code needs data or a privileged action, they usually message the background script.

### 2. `content.ts`

File: [content.ts](/Users/levi/Desktop/test/extension/src/content/content.ts)

This script is injected into normal webpages.

It does page-level UI and page-aware logic:

- detects the current page
- injects the EtherX action pill
- injects the right-side panel
- lets the panel run actions
- sends the current page HTML to the backend
- handles paid flow when needed

This file owns the browser-page experience.

It is also where the resizable right-side panel lives.

### 3. `page_detector.ts`

File: [page_detector.ts](/Users/levi/Desktop/test/extension/src/content/page_detector.ts)

This is the fast local classifier.

Its job is:

- inspect the URL
- classify common page types instantly
- avoid hitting the backend for obvious pages

Examples it detects directly:

- YouTube watch pages
- YouTube playlists
- research paper sites
- docs sites
- Medium articles
- Stack Overflow
- GitHub
- legal pages
- Wikipedia

If the detector does not know the page, it returns `check_backend`, and the background script can ask the FastAPI backend to classify it.

### 4. `popup.ts`

File: [popup.ts](/Users/levi/Desktop/test/extension/src/popup/popup.ts)

This is the main user control surface.

The popup does all of these:

- reads the active tab
- asks the content script for page context
- shows wallet state
- unlocks the wallet for the current session
- copies wallet address
- reveals secrets after unlock
- runs quick summary
- runs premium summary
- handles the full payment retry flow for premium summary

In practical terms, the popup is where the user spends most of their time.

### 5. `onboarding.ts`

File: [onboarding.ts](/Users/levi/Desktop/test/extension/src/onboarding/onboarding.ts)

This controls the wallet setup page.

It supports:

- create wallet
- import wallet
- phrase reveal
- phrase verification
- saving encrypted wallet data

Create flow:

1. user sets password
2. extension generates Algorand account
3. 25-word mnemonic is shown
4. user confirms selected words
5. wallet is encrypted and saved

### 6. `options.ts`

File: [options.ts](/Users/levi/Desktop/test/extension/src/options/options.ts)

This is a small settings page.

It currently controls:

- Gemini model preference
- whether premium payment prompts are enabled

It is intentionally lighter than popup and onboarding.

---

## Wallet Modules

The wallet logic is split into several focused TypeScript modules.

### `wallet/algorand.ts`

File: [algorand.ts](/Users/levi/Desktop/test/extension/src/wallet/algorand.ts)

This file handles raw Algorand wallet creation/import logic:

- generate account
- convert secret key to mnemonic
- import mnemonic into account
- normalize mnemonic
- serialize the account into a shape the extension can store

Important detail:

This file uses the browser build of `algosdk`, loaded from:

- `node_modules/algosdk/dist/browser/algosdk.min.js`

That global script is declared in TypeScript using a `declare const algosdk` shape.

### `wallet/crypto.ts`

File: [crypto.ts](/Users/levi/Desktop/test/extension/src/wallet/crypto.ts)

This file handles local encryption.

It uses Web Crypto:

- PBKDF2 for password-based key derivation
- AES-GCM for encrypting the wallet payload

This is the protection layer for:

- mnemonic
- private key
- address

The extension does not store the raw wallet secrets directly as plain text in persistent storage.

### `wallet/vault.ts`

File: [vault.ts](/Users/levi/Desktop/test/extension/src/wallet/vault.ts)

This file is the storage adapter for the encrypted wallet vault.

It stores:

- encrypted vault record in `chrome.storage.local`
- metadata like address and created timestamp

### `wallet/service.ts`

File: [service.ts](/Users/levi/Desktop/test/extension/src/wallet/service.ts)

This is the higher-level wallet service used by the rest of the extension.

It combines:

- vault read/write
- encryption/decryption
- wallet session state
- settings sync

Important behavior:

- encrypted vault lives in `chrome.storage.local`
- unlocked wallet session lives in `chrome.storage.session`

So the password is not needed on every premium request.

The intended UX is:

1. unlock once
2. session stays unlocked
3. premium actions reuse that in-memory/session wallet

---

## Shared Extension Helpers

### `lib/storage.ts`

File: [storage.ts](/Users/levi/Desktop/test/extension/src/lib/storage.ts)

This manages extension settings in `chrome.storage.sync`.

It defines:

- `ExtensionSettings`
- default settings
- `getSettings()`
- `setSettings()`

This is where app-level preferences live.

### `lib/env.ts`

File: [env.ts](/Users/levi/Desktop/test/extension/src/lib/env.ts)

This reads the extension-local `.env` file.

That file is exposed through `web_accessible_resources` in the manifest, so runtime code can fetch it with:

```ts
fetch(chrome.runtime.getURL(".env"))
```

The parsed values currently include:

- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `ETHER_API_BASE_URL`
- `ETHER_API_KEY`

---

## Manifest: How Chrome Knows What To Load

File: [manifest.json](/Users/levi/Desktop/test/extension/manifest.json)

This file is the extension entrypoint for Chrome.

Important parts:

### `background`

```json
"background": {
  "service_worker": "src/background.js",
  "type": "module"
}
```

Chrome loads the compiled `background.js`, not `background.ts`.

### `action.default_popup`

```json
"default_popup": "src/popup/popup.html"
```

Chrome opens the popup HTML, and that HTML loads `popup.js`.

### `content_scripts`

```json
"js": [
  "node_modules/algosdk/dist/browser/algosdk.min.js",
  "src/data/protocols.js",
  "src/content/page_detector.js",
  "src/content/content.js"
]
```

This means every normal webpage gets:

1. Algorand SDK browser build
2. protocol data
3. page detector
4. content script

That ordering matters.

The detector and content script expect those earlier globals to already exist.

---

## How The TypeScript Build Works

In [extension/package.json](/Users/levi/Desktop/test/extension/package.json), the build command is:

```json
"build": "tsc -p tsconfig.json"
```

That means the extension build is currently:

- pure TypeScript compiler
- no complex bundling step
- no Webpack/Rollup packing of the runtime files

Build command:

```bash
cd extension
npm install
npm run build
```

What happens after build:

- every `.ts` included by `tsconfig.json` gets emitted to `.js`
- those `.js` files are what the extension runs

After build, you must reload the unpacked extension in Chrome.

---

## Why `types/chrome.d.ts` Exists

File: [chrome.d.ts](/Users/levi/Desktop/test/extension/src/types/chrome.d.ts)

This file exists so TypeScript understands Chrome extension globals and APIs.

Without declaration files like this, you would get a lot of missing-type errors in strict mode.

It is part of the reason the TS side can stay strict while still using browser/extension globals.

---

## Popup Flow: Step By Step

When the popup opens:

1. `popup.ts` asks Chrome for the active tab
2. it sends `GET_PAGE_DETECTION` to the content script
3. it loads wallet state from the background script
4. it renders page status and wallet status

When the user clicks `Quick Summary`:

1. popup asks content script for `GET_PAGE_CONTEXT`
2. content script returns:
   - current URL
   - page title
   - page HTML
   - current detection
3. popup sends URL + HTML to `/api/summarize/free`
4. backend cleans HTML
5. backend calls Gemini free model
6. popup renders the returned JSON summary

When the user clicks `Premium Action`:

1. popup asks backend for `/api/summarize/paid`
2. backend returns `402 Payment Required` if not already paid
3. popup decodes the payment challenge
4. popup checks wallet unlock state
5. popup checks balance
6. popup asks user to approve payment
7. popup signs and sends ALGO payment
8. popup polls `/api/payments/confirm`
9. popup retries `/api/summarize/paid` with `PAYMENT-SIGNATURE`
10. popup renders premium summary

---

## Content Script Flow: Step By Step

When a page loads:

1. `content.ts` runs
2. it calls `window.detectPageType(url, title)`
3. if local rules know the page, it mounts the UI immediately
4. if the page is unknown, it asks the background script to call backend detection
5. it creates:
   - floating action pill
   - side toggle
   - right-side panel

When the URL changes in an SPA:

- a `MutationObserver` notices URL change
- detection reruns
- the UI tears down and remounts with the new classification

That is why sites like YouTube or GitHub can still update correctly without a full hard refresh.

---

## Backend: What It Does

The backend lives in `backend/`.

Main entry:

- [main.py](/Users/levi/Desktop/test/backend/main.py)

Routers:

- [summarize.py](/Users/levi/Desktop/test/backend/routers/summarize.py)
- [detect.py](/Users/levi/Desktop/test/backend/routers/detect.py)
- [payments.py](/Users/levi/Desktop/test/backend/routers/payments.py)
- [score.py](/Users/levi/Desktop/test/backend/routers/score.py)
- [translate.py](/Users/levi/Desktop/test/backend/routers/translate.py)
- [writing.py](/Users/levi/Desktop/test/backend/routers/writing.py)
- [articles.py](/Users/levi/Desktop/test/backend/routers/articles.py)

Services:

- [gemini_service.py](/Users/levi/Desktop/test/backend/services/gemini_service.py)
- [cleaner.py](/Users/levi/Desktop/test/backend/services/cleaner.py)
- [payment_service.py](/Users/levi/Desktop/test/backend/services/payment_service.py)

### `cleaner.py`

This extracts readable text from raw HTML.

It:

- strips scripts/styles/nav/footer/header/aside
- prefers `main` and `article`
- falls back to general text if necessary
- caps output at 12,000 chars

### `gemini_service.py`

This stores:

- all system prompts in one place
- free and paid model names
- the Gemini HTTP call helper

It expects JSON-only model output and parses that JSON before returning it.

### `payment_service.py`

This handles the premium payment gate.

It:

- builds a `402 Payment Required` response
- encodes the payment challenge in `PAYMENT-REQUIRED`
- verifies `PAYMENT-SIGNATURE`
- checks Algorand transaction data
- confirms:
  - sender
  - receiver
  - amount
  - note
  - confirmation state

This is the key payment service behind premium routes.

---

## Backend Routes: What Each One Does

### `/api/summarize/free`

- cleans the HTML
- calls Gemini free model
- returns a compact free summary

### `/api/summarize/paid`

- checks payment first
- if not paid, returns `402`
- if paid, calls Gemini paid model
- returns deeper summary

### `/api/detect`

- first tries hardcoded URL rules
- if the URL is unknown, cleans HTML and calls Gemini for classification

### `/api/payments/confirm`

- verifies the payment signature payload
- checks on-chain payment confirmation
- returns `200` once valid

### `/api/score/free` and `/api/score/paid`

- content relevance / payment-worth scoring

### `/api/translate/free` and `/api/translate/paid`

- translation features

### `/api/writing/free` and `/api/writing/paid`

- writing transformation features

### `/api/articles`

- preview list for demo paywalled articles

### `/api/articles/1`, `/2`, `/3`

- paid article demo routes

---

## Environment Files

### Backend `.env`

Use [backend/.env.example](/Users/levi/Desktop/test/backend/.env.example) as the template.

Expected values:

```env
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_FREE_MODEL=gemini-2.5-flash
GEMINI_PAID_MODEL=gemini-2.5-flash
AVM_ADDRESS=YOUR_ALGORAND_RECEIVER_ADDRESS
FACILITATOR_URL=https://facilitator.goplausible.xyz
```

### Extension `.env`

Use [extension/.env.example](/Users/levi/Desktop/test/extension/.env.example) as the template.

Expected values:

```env
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash
ETHER_API_BASE_URL=http://127.0.0.1:8000
ETHER_API_KEY=ether-browser-dev
```

---

## How To Run Everything

### Backend

```bash
cd backend
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
PYTHONPATH=/Users/levi/Desktop/test .venv/bin/uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

Health check:

```bash
curl http://127.0.0.1:8000/health
```

### Extension

```bash
cd extension
npm install
npm run build
```

Then:

1. open `chrome://extensions`
2. enable Developer Mode
3. click `Load unpacked`
4. select [extension](/Users/levi/Desktop/test/extension)

Every time you change TypeScript:

1. save the `.ts` file
2. run `npm run build`
3. reload the extension in Chrome
4. refresh the page you are testing

### Landing Page

```bash
npm install
npm run dev
```

---

## How To Add A New Extension Feature In TypeScript

Suppose you want to add a new popup action.

The normal pattern is:

1. add UI in `popup.html`
2. add logic in `popup.ts`
3. if it needs background state, add a message type in `background.ts`
4. if it needs backend data, add a route in FastAPI
5. if it needs page-specific context, add a message in `content.ts`
6. run `npm run build`
7. reload extension

Suppose you want a new page type:

1. add local rule in `page_detector.ts`
2. decide whether it should use free, paid, or backend detection
3. update label/price behavior if needed
4. rebuild

Suppose you want a new wallet behavior:

1. if it is raw Algorand logic, update `wallet/algorand.ts`
2. if it is encryption/session behavior, update `wallet/crypto.ts` or `wallet/service.ts`
3. if it changes stored shape, update `vault.ts`
4. rebuild and test onboarding + popup

---

## Common Gotchas

### 1. “I changed TS but nothing changed in Chrome”

Usually means:

- you forgot `npm run build`, or
- you forgot to reload the unpacked extension, or
- you forgot to refresh the page after reloading the extension

### 2. “The popup still shows old text”

Same cause: Chrome is loading the old emitted `.js`.

### 3. “Quick summary says Gemini unavailable”

Usually means:

- bad Gemini key
- restricted key
- `403` from Gemini
- backend not restarted after env change

### 4. “Premium flow returns 402”

That is normal on the first paid request.

The expected sequence is:

1. initial premium request -> `402`
2. wallet signs payment
3. `/api/payments/confirm`
4. retry premium request

### 5. “Content script seems stale”

After reloading the extension, refresh the actual page tab too.

Content scripts do not always update on already-open pages until refresh.

---

## Files To Read First If You Are New

If you only want the fastest orientation, read these in order:

1. [extension/manifest.json](/Users/levi/Desktop/test/extension/manifest.json)
2. [extension/src/background.ts](/Users/levi/Desktop/test/extension/src/background.ts)
3. [extension/src/content/page_detector.ts](/Users/levi/Desktop/test/extension/src/content/page_detector.ts)
4. [extension/src/content/content.ts](/Users/levi/Desktop/test/extension/src/content/content.ts)
5. [extension/src/popup/popup.ts](/Users/levi/Desktop/test/extension/src/popup/popup.ts)
6. [extension/src/wallet/service.ts](/Users/levi/Desktop/test/extension/src/wallet/service.ts)
7. [backend/main.py](/Users/levi/Desktop/test/backend/main.py)
8. [backend/routers/summarize.py](/Users/levi/Desktop/test/backend/routers/summarize.py)
9. [backend/services/payment_service.py](/Users/levi/Desktop/test/backend/services/payment_service.py)

---

## Current Status

What is already in place:

- detailed page detection
- popup summary flow
- embedded wallet flow
- paid premium summary path
- backend payment verification
- resizable side panel

What is still a future improvement:

- richer ad-blocking workflow for YouTube
- more premium actions beyond summary
- more polished analytics / usage views
- broader page-type monetization logic

---

## Short Summary

If you want the simplest mental model:

- `manifest.json` tells Chrome what to load
- `.ts` files are the source of truth
- `npm run build` turns `.ts` into `.js`
- Chrome runs the `.js`
- `background.ts` is the controller
- `content.ts` is the page UI
- `popup.ts` is the main user control surface
- wallet modules handle encryption, storage, and session unlock
- FastAPI handles detection, summaries, and payment verification
- premium actions are just: `402 -> pay -> confirm -> retry`
