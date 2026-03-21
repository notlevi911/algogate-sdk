# AlgoGate

AlgoGate is a Python SDK for paywalling FastAPI routes with Algorand x402-style micropayments.

The goal is simple:

- a FastAPI developer adds `AlgoGate`
- protected routes return `402 Payment Required` until they are paid for
- the SDK scaffolds a Chrome extension beside the developer’s `main.py`
- the extension creates a wallet, pays, retries the route, and shows the API response

This branch turns the project into an SDK-first repository.

## What The SDK Gives A Developer

When a developer writes:

```python
from fastapi import FastAPI
from algogate import AlgoGate

gate = AlgoGate(
    receiver="ALGORAND_ADDRESS",
    price_microalgo=500_000,
    network="testnet",
    api_name="My Premium API"
)

app = FastAPI()
gate.init_app(app)

@app.get("/api/premium")
@gate.protect
async def premium_route():
    return {"data": "secret premium content"}
```

AlgoGate does all of this:

1. It adds middleware that understands payment errors and payment sessions.
2. It adds SDK routes such as:
   - `/algogate/dashboard`
   - `/algogate/events`
   - `/algogate/routes`
   - `/algogate/health`
   - `/algogate/verify`
3. It protects the decorated route.
4. It scaffolds an `algogate_extension/` folder next to the developer’s `main.py` on first run.
5. That generated extension already contains:
   - popup UI
   - wallet onboarding
   - local encrypted wallet storage
   - 402 challenge handling
   - Algorand payment signing
   - route retry logic

---

## Repository Layout

```text
.
├── algogate/
│   ├── __init__.py
│   ├── challenge.py
│   ├── config.py
│   ├── dashboard.py
│   ├── exceptions.py
│   ├── gate.py
│   ├── middleware.py
│   ├── payment.py
│   ├── scaffold.py
│   └── session.py
├── requirements.txt
└── README.md
```

The actual browser extension is **not** committed as a shipped folder.

Instead, it is generated at runtime by:

- [scaffold.py](/Users/levi/Desktop/test/algogate/scaffold.py)

That means the SDK ships the extension as templates inside Python code and writes them out on `gate.init_app(app)`.

---

## Installation

```bash
pip install -r requirements.txt
```

Requirements file:

- [requirements.txt](/Users/levi/Desktop/test/requirements.txt)

Current dependencies:

- `fastapi>=0.110.0`
- `httpx>=0.27.0`
- `pyjwt>=2.8.0`
- `python-dotenv>=1.0.0`
- `websockets>=12.0`
- `uvicorn>=0.29.0`

No Python `algosdk` package is required.

The SDK verifies payments with the Algorand indexer REST API through `httpx`.

---

## Minimal Usage

```python
from fastapi import FastAPI
from algogate import AlgoGate

gate = AlgoGate(
    receiver="ABC123...",
    price_microalgo=500_000,
    network="testnet",
    api_name="Weather Premium API",
    api_key="my-internal-api-key"
)

app = FastAPI()
gate.init_app(app)

@app.get("/api/weather/free")
async def free_weather():
    return {"temp": "25C", "note": "basic data"}

@app.get("/api/weather/premium")
@gate.protect
async def premium_weather():
    return {
        "temp": "25C",
        "humidity": "72%",
        "forecast": ["sunny", "windy", "cloudy"],
        "alerts": ["none"]
    }

@app.get("/api/weather/detailed")
@gate.protect_with_price(1_000_000)
async def detailed_weather():
    return {
        "hourly": ["..."],
        "radar": "..."
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

---

## How `AlgoGate` Works

Main class:

- [gate.py](/Users/levi/Desktop/test/algogate/gate.py)

### Constructor

```python
AlgoGate(
    receiver: str,
    price_microalgo: int,
    network: str = "testnet",
    api_name: str = "Protected API",
    api_key: str = "",
    session_ttl_seconds: int = 3600,
    replay_cache_ttl: int = 86400,
    scaffold_on_init: bool = True,
)
```

Meaning of each field:

- `receiver`
  Algorand address that receives payments.

- `price_microalgo`
  Default route price in microALGO.
  `1 ALGO = 1_000_000 microALGO`.

- `network`
  Either `testnet` or `mainnet`.

- `api_name`
  Human-readable name shown in the extension and dashboard.

- `api_key`
  Optional string embedded into the scaffolded extension `.env`.
  The extension sends it as `X-API-Key` when making API requests.

- `session_ttl_seconds`
  After a valid on-chain payment, the SDK issues a JWT session token so future calls do not need to hit the chain again immediately.

- `replay_cache_ttl`
  How long used tx IDs stay in replay protection memory.

- `scaffold_on_init`
  If true, `gate.init_app(app)` writes the extension folder automatically.

---

## What `init_app(app)` Does

When `gate.init_app(app)` runs, the SDK:

1. attaches [AlgoGateMiddleware](/Users/levi/Desktop/test/algogate/middleware.py)
2. registers:
   - `GET /algogate/dashboard`
   - `WS /algogate/events`
   - `GET /algogate/routes`
   - `GET /algogate/health`
   - `POST /algogate/verify`
3. stores the gate instance on `app.state.algogate`
4. scaffolds the extension if enabled
5. prints the startup banner

### Startup Banner

`init_app()` prints a startup banner showing:

- API name
- receiver
- default price
- network
- dashboard URL
- scaffold folder location
- Chrome load instructions

---

## Protecting Routes

There are two protection APIs.

### Default Price

```python
@gate.protect
```

This uses the default `price_microalgo` set on the gate.

### Per-Route Price Override

```python
@gate.protect_with_price(1_000_000)
```

This overrides the default for one route.

### What The Decorator Does

On every protected request, the decorator checks `X-Payment-Signature`.

#### If the header is missing

The route does not run.

Instead:

- a payment challenge is built
- `PaymentRequired` is raised
- middleware turns that into a `402` response
- the `X-Payment-Required` header is set

#### If the header starts with `jwt.`

The SDK treats it as a local payment session token.

It verifies:

- token signature
- token expiry
- token route match

If valid, the route runs immediately with no on-chain lookup.

#### If the header is a tx id

The SDK verifies the Algorand payment on-chain:

- transaction exists
- confirmed round exists
- receiver matches
- amount is enough
- note starts with the expected route prefix
- tx id has not already been used

If valid:

- a JWT payment session is issued
- the route runs
- the response gets `X-Payment-Session: jwt.<token>`
- a dashboard event is broadcast

---

## 402 Challenge Format

File:

- [challenge.py](/Users/levi/Desktop/test/algogate/challenge.py)

Header used:

- `X-Payment-Required`

The header value is:

- base64-encoded JSON

Shape:

```json
{
  "receiver": "ADDR...",
  "amount": 500000,
  "network": "testnet",
  "note_prefix": "abcd1234efgh5678",
  "api_name": "My Premium API",
  "expires": 1712345678
}
```

### Why `note_prefix` Exists

The note prefix ties a transaction to a specific protected route.

AlgoGate derives it from:

- `sha256(route_path).hexdigest()[:16]`

The extension then sends a note like:

```text
<note_prefix>:<timestamp>
```

The backend checks that the on-chain note starts with the correct prefix.

That prevents a payment meant for one route from being replayed against another route.

---

## On-Chain Payment Verification

File:

- [payment.py](/Users/levi/Desktop/test/algogate/payment.py)

AlgoGate uses the Algorand indexer REST API with `httpx`.

No Python `algosdk` is used on the backend.

### Indexer URLs

- testnet: `https://testnet-idx.algonode.cloud`
- mainnet: `https://mainnet-idx.algonode.cloud`

### What Gets Verified

For a tx id, AlgoGate checks:

1. the transaction exists
2. `confirmed-round` exists
3. `payment-transaction.receiver == expected_receiver`
4. `payment-transaction.amount >= expected_amount`
5. decoded note starts with `expected_note_prefix`

If any check fails:

- `InvalidSignature` is raised

If the tx id was already used:

- `ReplayAttack` is raised

---

## Replay Protection

Also in:

- [payment.py](/Users/levi/Desktop/test/algogate/payment.py)

Replay protection is an in-memory cache:

```python
_used_tx_ids: dict[str, float]
```

Meaning:

- key = tx id
- value = first-use timestamp

Before accepting a tx:

- the SDK prunes expired entries
- checks whether the tx id was already used
- rejects it if so

Important note:

This is process memory only.

If a developer wants multi-instance or persistent replay protection, they would later swap this for Redis or database storage. The current SDK keeps it simple and self-contained.

---

## Payment Sessions (JWT)

File:

- [session.py](/Users/levi/Desktop/test/algogate/session.py)

After the first successful on-chain verification:

- a JWT is issued
- signed with HMAC-SHA256
- secret derived from the receiver address

Payload:

```json
{
  "sub": "<tx_id>",
  "route": "/api/premium",
  "exp": 1712349999
}
```

Clients can send:

```http
X-Payment-Signature: jwt.<token>
```

This avoids going back to the Algorand indexer on every request.

---

## Middleware Behavior

File:

- [middleware.py](/Users/levi/Desktop/test/algogate/middleware.py)

The middleware has three main jobs:

1. place the current `Request` into a context variable so the route decorator can read headers and route path without forcing the developer to add `request: Request` to every endpoint
2. catch:
   - `PaymentRequired`
   - `InvalidSignature`
   - `ReplayAttack`
3. translate them into HTTP responses

Status mapping:

- `PaymentRequired` -> `402`
- `InvalidSignature` -> `403`
- `ReplayAttack` -> `409`

It also exposes:

- `X-Payment-Required`
- `X-Payment-Session`

through `Access-Control-Expose-Headers`.

---

## Dashboard And Event Stream

File:

- [dashboard.py](/Users/levi/Desktop/test/algogate/dashboard.py)

### `GET /algogate/dashboard`

Returns a self-contained HTML dashboard that shows:

- API name
- receiver
- network
- default price
- live payment event list

### `WS /algogate/events`

Broadcasts payment verification events.

Event shape:

```json
{
  "tx_id": "...",
  "route": "/api/premium",
  "amount": 500000,
  "caller_ip": "127.0.0.1",
  "timestamp": "...",
  "session_issued": true
}
```

The dashboard page subscribes to this websocket and updates live.

---

## SDK Routes Added Automatically

After `init_app(app)`, these SDK routes exist:

### `GET /algogate/dashboard`

Live HTML dashboard.

### `WS /algogate/events`

Live event feed.

### `GET /algogate/routes`

Returns all protected routes discovered from the FastAPI app.

Each route entry includes:

- path
- methods
- `price_microalgo`
- `price_algo`
- `api_name`

### `GET /algogate/health`

Returns:

```json
{
  "status": "ok",
  "receiver": "...",
  "network": "testnet",
  "price": 500000
}
```

### `POST /algogate/verify`

Request:

```json
{
  "tx_id": "..."
}
```

This is used by the generated extension while waiting for payment confirmation.

It verifies that:

- the transaction exists
- it is confirmed
- it was sent to the configured receiver

---

## Scaffolded Extension

File:

- [scaffold.py](/Users/levi/Desktop/test/algogate/scaffold.py)

On first `init_app(app)` run, AlgoGate writes:

```text
algogate_extension/
  manifest.json
  .env
  src/
    background.js
    popup/
      popup.html
      popup.js
      popup.css
    wallet/
      algorand.js
      crypto.js
      vault.js
      service.js
    lib/
      env.js
      api.js
    onboarding/
      onboarding.html
      onboarding.js
      onboarding.css
  node_modules/
    algosdk/dist/browser/algosdk.min.js
```

### Where It Gets Written

It is written next to the developer’s `main.py`, using `inspect.stack()` to find the caller directory.

### What Goes Into The Generated `.env`

The scaffold writes:

```env
ALGO_RECEIVER=<gate.receiver>
ALGO_NETWORK=<gate.network>
PRICE_MICROALGO=<gate.price_microalgo>
API_BASE_URL=http://127.0.0.1:8000
API_KEY=<gate.api_key>
API_NAME=<gate.api_name>
```

### If The Folder Already Exists

AlgoGate skips regeneration and prints a message.

---

## How The Generated Extension Works

The generated extension is plain JavaScript.

It does not require npm install after scaffold.

### Popup

Files:

- `src/popup/popup.html`
- `src/popup/popup.js`
- `src/popup/popup.css`

It has two main states.

#### State 1: No Wallet

Shows:

- welcome heading
- API name
- setup wallet button

#### State 2: Wallet Exists

Shows:

- truncated wallet address
- balance
- receiver
- network badge
- route selector
- call API button
- response panel
- wallet unlock / lock controls
- settings panel

### Onboarding

Files:

- `src/onboarding/onboarding.html`
- `src/onboarding/onboarding.js`
- `src/onboarding/onboarding.css`

Flow:

1. create password
2. choose create or import
3. create path shows 25-word mnemonic
4. user confirms 3 random words
5. wallet is encrypted with AES-GCM
6. encrypted vault stored in `chrome.storage.local`
7. unlocked session stored in `chrome.storage.session`
8. redirect to popup

### Wallet Storage

Files:

- `src/wallet/crypto.js`
- `src/wallet/vault.js`
- `src/wallet/service.js`

The extension stores:

- encrypted wallet vault in `chrome.storage.local`
- unlocked session in `chrome.storage.session`

So the password is needed once per session, not on every API call.

### Payment Flow In The Extension

Client-side core:

- `src/lib/api.js`

Flow:

1. call protected route
2. if `402`, read `X-Payment-Required`
3. decode challenge
4. ask for payment confirmation
5. sign Algorand payment
6. submit tx
7. poll `/algogate/verify`
8. retry route with `X-Payment-Signature: <tx_id>`
9. store `X-Payment-Session` if returned

Future calls can reuse the JWT session token automatically.

---

## Loading The Generated Extension

After the developer runs their FastAPI app once:

1. open `chrome://extensions`
2. enable `Developer mode`
3. click `Load unpacked`
4. select the generated `algogate_extension/` folder

Then:

1. open the popup
2. set up wallet
3. select a protected route
4. click `Call API`
5. approve payment
6. view the API response in the popup

---

## Internal File Guide

### Core Python SDK Files

- [config.py](/Users/levi/Desktop/test/algogate/config.py)
  Shared validated config object.

- [exceptions.py](/Users/levi/Desktop/test/algogate/exceptions.py)
  SDK exceptions.

- [challenge.py](/Users/levi/Desktop/test/algogate/challenge.py)
  Challenge building, note prefixing, base64 encoding.

- [payment.py](/Users/levi/Desktop/test/algogate/payment.py)
  On-chain verification + replay protection.

- [session.py](/Users/levi/Desktop/test/algogate/session.py)
  JWT issue/verify logic.

- [middleware.py](/Users/levi/Desktop/test/algogate/middleware.py)
  Exception-to-response translation and request context handling.

- [dashboard.py](/Users/levi/Desktop/test/algogate/dashboard.py)
  Web dashboard + websocket broadcaster.

- [scaffold.py](/Users/levi/Desktop/test/algogate/scaffold.py)
  Extension generator.

- [gate.py](/Users/levi/Desktop/test/algogate/gate.py)
  Public developer API.

- [__init__.py](/Users/levi/Desktop/test/algogate/__init__.py)
  Re-exports `AlgoGate`.

---

## Current Sanity Checks Run

On this branch, the SDK package files compile with:

```bash
python3 -m py_compile algogate/*.py
```

That validates the Python syntax of the package files.

---

## Notes

- The generated extension is intentionally self-contained.
- The backend verification uses Algorand indexer REST, not Python algosdk.
- Replay protection is in-memory.
- Session tokens are route-scoped.
- The scaffold copies or downloads the browser Algorand SDK bundle so the generated extension does not need npm install.

If you want, the next step can be:

1. scaffold a sample developer app using this SDK
2. run it locally
3. load the generated `algogate_extension/`
4. test the end-to-end payment flow
