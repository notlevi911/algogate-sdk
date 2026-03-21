# AlgoGate SDK

AlgoGate is a Python SDK for **Algorand-paywalled FastAPI routes**.

It gives you an **x402-style payment flow**:

1. A client calls a protected route.
2. The route returns **`402 Payment Required`** with an `X-Payment-Required` challenge header.
3. The client pays on Algorand.
4. The client retries the same route with `X-Payment-Signature`.
5. The SDK verifies the payment on-chain and returns the premium response.

On first run, AlgoGate also scaffolds a Chrome extension next to the developer's app so the user has a ready-made wallet and payment UI.

Important note:
- AlgoGate currently implements an **Algorand x402-style HTTP paywall flow**
- It is **not** using the `x402-avm` Python package internally right now
- The behavior is still the same shape developers expect: `402 -> pay -> retry`

---

## 1. What A Developer Does

The smallest developer flow is:

1. Install or otherwise make `algogate/` available in the project.
2. Import `AlgoGate`.
3. Configure `receiver`, `price_microalgo`, `network`, and `api_name`.
4. Call `gate.init_app(app)`.
5. Add `@gate.protect` to any premium route.
6. Run `main.py`.

Example:

```python
from fastapi import FastAPI, Query
from algogate import AlgoGate

gate = AlgoGate(
    receiver="YOUR_ALGORAND_ADDRESS",
    price_microalgo=500_000,
    network="testnet",
    api_name="My Premium API",
    api_key="optional-internal-api-key"
)

app = FastAPI()
gate.init_app(app)


@app.get("/api/free")
async def free_route():
    return {"message": "free response"}


@app.get("/api/premium")
@gate.protect
async def premium_route(number: int = Query(...)):
    return {"number": number, "premium": True}
```

That is enough to:
- add the AlgoGate middleware
- expose the AlgoGate helper routes
- scaffold `algogate_extension/`
- make `/api/premium` return `402` until payment succeeds

---

## 2. What Happens When `main.py` Runs

When the app imports:

```python
from algogate import AlgoGate
```

AlgoGate now tries to make the Python runtime smoother:
- it checks for required Python packages like `fastapi`, `pydantic`, `httpx`, `websockets`, and `uvicorn`
- if they are missing, it attempts to install them automatically using `pip`

Then when the app executes:

```python
gate.init_app(app)
```

AlgoGate does these things:

1. stores the gate instance on `app.state.algogate`
2. adds the AlgoGate middleware
3. registers helper routes:
   - `GET /algogate/dashboard`
   - `WS /algogate/events`
   - `GET /algogate/routes`
   - `GET /algogate/health`
   - `POST /algogate/verify`
4. scaffolds `algogate_extension/` next to the caller's `main.py` if it does not already exist
5. prints the startup banner

The scaffold only happens once per app directory.

If `algogate_extension/` already exists, AlgoGate skips rewriting it.

---

## 3. What The User Experiences

After the developer runs the app once:

1. a folder called `algogate_extension/` appears next to their `main.py`
2. the developer loads that folder in Chrome through:

```text
chrome://extensions -> Load unpacked
```

3. the user opens the extension popup
4. the extension asks the user to:
   - create a wallet or
   - import a recovery phrase
5. the user funds that wallet with ALGO
6. the popup fetches protected routes from `/algogate/routes`
7. the user selects a route and optionally enters:
   - query params
   - JSON body
8. the popup calls the route
9. if the route returns `402`, the extension shows a payment approval modal
10. the user approves the payment
11. the extension sends an Algorand payment
12. the extension polls `/algogate/verify`
13. the extension retries the route with `X-Payment-Signature`
14. the SDK verifies the payment and returns the premium API response

---

## 4. Core SDK Surface

The main public import is:

```python
from algogate import AlgoGate
```

You also get:

```python
from algogate import AlgoGateConfig
```

### `AlgoGate(...)`

Constructor:

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

#### Parameters

`receiver`
- Algorand address that receives payments

`price_microalgo`
- default price for protected routes
- `1 ALGO = 1_000_000 microAlgos`

`network`
- `"testnet"` or `"mainnet"`

`api_name`
- human-readable API label shown in the banner, extension, and challenge

`api_key`
- optional extra API key the scaffolded extension will automatically include

`session_ttl_seconds`
- successful payment creates a local session token for that route
- this reduces repeated indexer lookups

`replay_cache_ttl`
- how long to remember used transaction IDs
- prevents the same tx from being reused forever

`scaffold_on_init`
- whether `init_app()` should create `algogate_extension/`

### `gate.init_app(app)`

Adds AlgoGate to a FastAPI app.

Use:

```python
app = FastAPI()
gate.init_app(app)
```

What it does:
- registers middleware
- registers helper SDK routes
- scaffolds the extension
- prints the startup banner

### `@gate.protect`

Use this on a premium route that should use the gate's default price.

Example:

```python
@app.get("/api/premium")
@gate.protect
async def premium_route():
    return {"data": "secret"}
```

Behavior:
- if there is no valid `X-Payment-Signature`, the route returns `402`
- if the payment signature is valid, the route runs normally

### `@gate.protect_with_price(price_microalgo)`

Use this when a specific route should cost a different amount.

Example:

```python
@app.get("/api/enterprise")
@gate.protect_with_price(1_000_000)
async def enterprise():
    return {"data": "costs 1 ALGO"}
```

Behavior:
- same as `@gate.protect`
- but the price for that route overrides the gate default

---

## 5. Available Internal Modules And What They Do

These are part of the SDK package and useful to understand while debugging or contributing.

### `algogate/config.py`

Contains `AlgoGateConfig`.

Important properties:
- `indexer_url`
- `price_algo`
- `session_secret`

Validation:
- only `"testnet"` and `"mainnet"` are accepted
- receiver cannot be empty
- price must be greater than zero

### `algogate/challenge.py`

Handles payment challenge creation.

Important pieces:
- `PAYMENT_REQUIRED_HEADER = "X-Payment-Required"`
- `PAYMENT_SIGNATURE_HEADER = "X-Payment-Signature"`
- `PAYMENT_SESSION_HEADER = "X-Payment-Session"`

Functions:

`note_prefix_for_route(route_path)`
- returns the first 16 hex chars of `sha256(route_path)`

`build_payment_challenge(config, route_path, price_microalgo)`
- creates the challenge dict sent back in the `402`

`encode_challenge(challenge)`
- base64-encodes the JSON challenge for the response header

`decode_challenge(encoded)`
- decodes that header back into JSON

### `algogate/payment.py`

Handles payment verification against Algorand indexer REST APIs using `httpx`.

Network endpoints:
- testnet: `https://testnet-idx.algonode.cloud`
- mainnet: `https://mainnet-idx.algonode.cloud`

Functions:

`build_challenge(config, route_path, price_microalgo)`
- small wrapper around challenge creation

`verify_payment(...)`
- verifies:
  - transaction exists
  - transaction is confirmed
  - receiver matches
  - amount is at least the required amount
  - note starts with the expected route prefix
  - tx id has not already been used

`verify_any_payment(tx_id, expected_receiver, network)`
- lighter verification used by `/algogate/verify`

Replay protection:
- in-memory tx cache
- reusing the same tx id raises a replay error

### `algogate/session.py`

Handles payment sessions.

Current behavior:
- after a successful on-chain payment, AlgoGate issues a JWT-like HMAC token
- the response header includes:

```text
X-Payment-Session: jwt.<token>
```

- clients can reuse that token through:

```text
X-Payment-Signature: jwt.<token>
```

Functions:

`issue_session_token(receiver, tx_id, route_path, ttl_seconds)`
- creates a signed session token

`verify_session_signature(receiver, signature, route_path)`
- validates:
  - token shape
  - signature
  - route match
  - expiry

`is_session_signature(signature)`
- checks whether the signature starts with `jwt.`

### `algogate/exceptions.py`

Custom exceptions:

`AlgoGateError`
- base error

`PaymentRequired`
- raised to trigger the `402` response

`InvalidSignature`
- raised when a tx id or session token is invalid

`ReplayAttack`
- raised when the same tx id is reused

### `algogate/middleware.py`

The FastAPI middleware layer.

Responsibilities:
- stores current request in a context var
- converts `PaymentRequired` into `402`
- converts invalid signatures to `403`
- converts replay attacks to `409`
- attaches `X-Payment-Session` when a route payment succeeds
- exposes payment-related headers through CORS

### `algogate/dashboard.py`

Live monitoring UI.

Provides:
- HTML dashboard page
- websocket payment event stream

Tracks:
- tx id
- route
- amount
- timestamp
- caller IP
- whether a session token was issued

### `algogate/scaffold.py`

Creates the extension on first run.

Responsibilities:
- finds the caller app directory
- writes `algogate_extension/`
- writes the `.env`
- writes popup/onboarding/wallet files
- copies or downloads the browser `algosdk.min.js`

This is why developers do not need to hand-build the extension themselves.

---

## 6. Helper Routes Registered By AlgoGate

When `gate.init_app(app)` runs, these routes are added automatically.

### `GET /algogate/health`

Returns:

```json
{
  "status": "ok",
  "receiver": "ADDR...",
  "network": "testnet",
  "price": 500000
}
```

### `GET /algogate/routes`

Returns a list of all protected routes:

```json
[
  {
    "path": "/api/premium",
    "methods": ["GET"],
    "price_microalgo": 500000,
    "price_algo": 0.5,
    "api_name": "My Premium API"
  }
]
```

The scaffolded extension uses this to populate the route selector.

### `POST /algogate/verify`

Request:

```json
{
  "tx_id": "SOME_TX_ID"
}
```

Response on success:

```json
{
  "status": "ok",
  "tx_id": "SOME_TX_ID",
  "confirmed_round": 123456,
  "receiver": "ADDR..."
}
```

The extension uses this to poll for confirmation after payment.

### `GET /algogate/dashboard`

Returns a self-contained HTML dashboard page.

### `WS /algogate/events`

WebSocket stream of payment events used by the dashboard.

---

## 7. The 402 Payment Flow In Detail

For a protected route like:

```python
@app.get("/api/premium")
@gate.protect
async def premium():
    return {"secret": True}
```

the HTTP flow is:

### First request

Client calls:

```http
GET /api/premium
```

Response:

```http
HTTP/1.1 402 Payment Required
X-Payment-Required: <base64-json>
```

Decoded challenge shape:

```json
{
  "receiver": "ADDR...",
  "amount": 500000,
  "network": "testnet",
  "note_prefix": "0ed9bf3e276e789c",
  "api_name": "My Premium API",
  "expires": 1774121315
}
```

### Payment

The client builds an Algorand payment:
- sender = user wallet
- receiver = `challenge.receiver`
- amount = `challenge.amount`
- note starts with `challenge.note_prefix`

### Verification

Client either:
- retries directly with `X-Payment-Signature: <tx_id>`, or
- polls `/algogate/verify`

### Retry

```http
GET /api/premium
X-Payment-Signature: SOME_TX_ID
```

If verified:
- route runs
- response includes `X-Payment-Session`

### Reuse

Later calls can use:

```http
X-Payment-Signature: jwt.<session-token>
```

so the SDK does not need to hit the chain on every request.

---

## 8. Generated Extension Behavior

The scaffolded extension lives in:

```text
your_app/algogate_extension/
```

It includes:
- popup UI
- wallet onboarding
- encrypted local wallet storage
- payment flow
- route selector
- response viewer

### Popup

The popup shows:
- API name
- base URL
- network
- default price
- protected route selector
- query field
- JSON body field for POST/PUT/PATCH/DELETE
- wallet status
- balance
- call button
- response panel

### Wallet onboarding

The onboarding page supports:
- create wallet
- import wallet
- password setup
- recovery phrase verification
- local encrypted storage

### Payment flow

The popup does:
1. fetch `/algogate/routes`
2. optionally fetch `/openapi.json`
3. build request with query/body
4. call protected route
5. on `402`, decode challenge
6. show payment approval modal
7. send Algorand payment
8. poll `/algogate/verify`
9. retry with `X-Payment-Signature`
10. show the API response

---

## 9. Example App

A simple example is in:

- [example_main.py](./example_main.py)

This app demonstrates:
- one free route
- one protected palindrome route at `0.01 ALGO`
- one higher-priced premium route

---

## 10. Common Problems

### `422 Unprocessable Entity` before payment

This means FastAPI rejected the request shape before AlgoGate could paywall it.

Example:

```text
/api/palindrome?12546
```

should have been:

```text
/api/palindrome?number=12546
```

Fix:
- send valid query params or valid JSON body first

### `403` on `/algogate/verify`

This often means the transaction is not confirmed yet.

The extension may briefly see a few `403`s while polling, then succeed once the tx confirms.

### `409`

Replay protection caught the same tx id being reused.

### payment send failure because of balance

Algorand requires:
- enough ALGO for the payment amount
- enough for the network fee
- enough to remain above the chain minimum balance

That minimum is enforced by Algorand itself, not by AlgoGate.

### old code still running

If you change SDK internals but still see old errors, restart the FastAPI process.

---

## 11. Minimal Usage Example

```python
from fastapi import FastAPI, Query
from algogate import AlgoGate

gate = AlgoGate(
    receiver="YOUR_ALGORAND_ADDRESS",
    price_microalgo=10_000,
    network="testnet",
    api_name="Mini Palindrome API"
)

app = FastAPI()
gate.init_app(app)


@app.get("/api/palindrome")
@gate.protect
async def palindrome(number: int = Query(...)):
    digits = str(abs(number))
    return {
        "input": number,
        "palindrome_text": digits[::-1]
    }
```

Run:

```bash
python3 main.py
```

Then:
- load the generated extension
- create/import wallet
- fund wallet
- call the protected route from the popup

---

## 12. Current SDK Summary

Today AlgoGate gives you:
- FastAPI paywalled routes
- `402` challenge flow
- Algorand on-chain verification
- replay protection
- session tokens
- scaffolded Chrome extension
- payment dashboard

That means the developer mostly writes business logic, while AlgoGate handles the payment-gating mechanics around it.
