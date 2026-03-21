import base64
import json
import os
import secrets
from typing import Any

import httpx
from fastapi import Request
from fastapi.responses import JSONResponse


PAYMENT_REQUIRED_HEADER = "PAYMENT-REQUIRED"
PAYMENT_SIGNATURE_HEADER = "PAYMENT-SIGNATURE"
ALGORAND_TESTNET_CAIP2 = "algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI="
ALGORAND_TESTNET_ALGOD = os.getenv("ALGOD_TESTNET_URL", "https://testnet-api.algonode.cloud")
ALGORAND_TESTNET_INDEXER = os.getenv("INDEXER_TESTNET_URL", "https://testnet-idx.algonode.cloud")
ALGORAND_RECEIVER = os.getenv("AVM_ADDRESS", "")
PAYMENT_TIMEOUT_SECONDS = 600


def payment_amounts() -> dict[str, int]:
    return {
        "summarize_paid": 100_000,
        "translate_paid": 20_000,
        "writing_paid": 20_000,
        "score_paid": 50_000,
        "article_1": 100_000,
        "article_2": 250_000,
        "article_3": 500_000,
    }


def build_payment_required_response(
    request: Request,
    amount_microalgos: int,
    description: str,
) -> JSONResponse:
    payment_id = secrets.token_hex(12)
    note_text = f"ether:{payment_id}"
    payment_required = {
        "x402Version": 2,
        "error": "Payment Required",
        "resource": {
            "url": str(request.url),
            "description": description,
            "mimeType": "application/json",
        },
        "accepts": [
            {
                "scheme": "algo-native",
                "network": ALGORAND_TESTNET_CAIP2,
                "asset": "ALGO",
                "amount": str(amount_microalgos),
                "payTo": ALGORAND_RECEIVER,
                "maxTimeoutSeconds": PAYMENT_TIMEOUT_SECONDS,
                "extra": {
                    "decimals": 6,
                    "symbol": "ALGO",
                    "paymentId": payment_id,
                    "noteText": note_text,
                },
            }
        ],
    }

    response = JSONResponse(
        status_code=402,
        content={
            "error": "Payment required",
            "payment_id": payment_id,
            "accepts": payment_required["accepts"],
            "resource": payment_required["resource"],
        },
    )
    response.headers[PAYMENT_REQUIRED_HEADER] = base64.b64encode(
        json.dumps(payment_required).encode("utf-8")
    ).decode("utf-8")
    return response


async def ensure_native_algo_payment(
    request: Request,
    amount_microalgos: int,
    description: str,
) -> JSONResponse | None:
    header = request.headers.get(PAYMENT_SIGNATURE_HEADER)
    if not header:
        return build_payment_required_response(request, amount_microalgos, description)

    payload = decode_payment_signature(header)
    error = await verify_payment_payload(payload, amount_microalgos)
    if error:
        return JSONResponse(status_code=402, content={"error": error})
    return None


async def confirm_payment_request(request: Request) -> JSONResponse:
    header = request.headers.get(PAYMENT_SIGNATURE_HEADER)
    if not header:
        raise ValueError("Missing PAYMENT-SIGNATURE header.")

    payload = decode_payment_signature(header)
    accepted = payload.get("accepted") or {}
    amount_microalgos = int(accepted.get("amount") or 0)
    error = await verify_payment_payload(payload, amount_microalgos)
    if error:
        return JSONResponse(status_code=402, content={"error": error})

    payment = payload.get("payload") or {}
    return JSONResponse(
        status_code=200,
        content={
            "success": True,
            "tx_id": payment.get("txId"),
            "address": payment.get("address"),
            "amount": amount_microalgos,
            "asset": accepted.get("asset"),
            "network": accepted.get("network"),
        },
    )


def decode_payment_signature(header: str) -> dict[str, Any]:
    decoded = base64.b64decode(header.encode("utf-8")).decode("utf-8")
    return json.loads(decoded)


async def verify_payment_payload(payload: dict[str, Any], amount_microalgos: int) -> str | None:
    accepted = payload.get("accepted") or {}
    extra = accepted.get("extra") or {}
    payment = payload.get("payload") or {}

    if accepted.get("scheme") != "algo-native":
        return "Unsupported payment scheme."

    tx_id = str(payment.get("txId") or "")
    payer_address = str(payment.get("address") or "")
    note_text = str(extra.get("noteText") or "")

    if not tx_id or not payer_address or not note_text:
        return "Missing payment details."

    if accepted.get("payTo") != ALGORAND_RECEIVER:
        return "Payment receiver mismatch."

    if str(accepted.get("asset")) != "ALGO":
        return "Payment asset mismatch."

    tx_data = await fetch_transaction(tx_id)
    if not tx_data:
        return "Payment transaction was not found on Algorand TestNet."

    payment_tx = tx_data.get("payment-transaction") or {}
    sender = str(tx_data.get("sender") or "")
    receiver = str(payment_tx.get("receiver") or "")
    amount = int(payment_tx.get("amount") or 0)
    note_b64 = tx_data.get("note")
    note_value = ""
    if isinstance(note_b64, str) and note_b64:
        note_value = base64.b64decode(note_b64).decode("utf-8")

    if sender != payer_address:
        return "Payment sender mismatch."
    if receiver != ALGORAND_RECEIVER:
        return "Payment receiver mismatch."
    if amount < amount_microalgos:
        return "Payment amount is too small."
    if note_value != note_text:
        return "Payment note mismatch."
    if not tx_data.get("confirmed-round"):
        return "Payment is not confirmed yet."

    return None


async def fetch_transaction(tx_id: str) -> dict[str, Any] | None:
    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.get(f"{ALGORAND_TESTNET_INDEXER}/v2/transactions/{tx_id}")
        if response.status_code == 404:
            return None
        response.raise_for_status()
        return (response.json() or {}).get("transaction")
