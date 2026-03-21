from __future__ import annotations

import base64
import time
from typing import Any

import httpx

from .challenge import build_payment_challenge
from .config import AlgoGateConfig
from .exceptions import InvalidSignature, ReplayAttack


TESTNET_INDEXER = "https://testnet-idx.algonode.cloud"
MAINNET_INDEXER = "https://mainnet-idx.algonode.cloud"

_used_tx_ids: dict[str, float] = {}


def build_challenge(config: AlgoGateConfig, route_path: str, price_microalgo: int) -> dict[str, Any]:
    return build_payment_challenge(config, route_path, price_microalgo)


async def verify_payment(
    tx_id: str,
    expected_receiver: str,
    expected_amount: int,
    expected_note_prefix: str,
    network: str,
    replay_cache_ttl: int,
) -> dict[str, Any]:
    _prune_replay_cache(replay_cache_ttl)
    if tx_id in _used_tx_ids:
        raise ReplayAttack("This payment transaction has already been used.")

    transaction = await _fetch_transaction(tx_id, network)
    confirmed_round = transaction.get("confirmed-round")
    if not confirmed_round:
        raise InvalidSignature("Payment transaction is not confirmed yet.")

    payment_tx = transaction.get("payment-transaction") or {}
    receiver = payment_tx.get("receiver")
    amount = int(payment_tx.get("amount") or 0)
    if receiver != expected_receiver:
        raise InvalidSignature("Payment receiver does not match the protected route receiver.")
    if amount < expected_amount:
        raise InvalidSignature("Payment amount is lower than the required price.")

    note_prefix = _decode_note_prefix(transaction.get("note"))
    if not note_prefix.startswith(expected_note_prefix):
        raise InvalidSignature("Payment note does not match the route challenge.")

    _used_tx_ids[tx_id] = time.time()
    return transaction


async def verify_any_payment(tx_id: str, expected_receiver: str, network: str) -> dict[str, Any]:
    transaction = await _fetch_transaction(tx_id, network)
    confirmed_round = transaction.get("confirmed-round")
    if not confirmed_round:
        raise InvalidSignature("Payment transaction is not confirmed yet.")

    payment_tx = transaction.get("payment-transaction") or {}
    receiver = payment_tx.get("receiver")
    if receiver != expected_receiver:
        raise InvalidSignature("Payment receiver does not match this API receiver.")
    return transaction


async def _fetch_transaction(tx_id: str, network: str) -> dict[str, Any]:
    indexer_url = TESTNET_INDEXER if network == "testnet" else MAINNET_INDEXER
    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.get(f"{indexer_url}/v2/transactions/{tx_id}")
        if response.status_code == 404:
            raise InvalidSignature("Payment transaction was not found on the Algorand indexer.")
        response.raise_for_status()
        body = response.json()
        transaction = body.get("transaction")
        if not transaction:
            raise InvalidSignature("Transaction lookup returned an empty response.")
        return transaction


def _decode_note_prefix(note_value: Any) -> str:
    if not isinstance(note_value, str) or not note_value:
        return ""
    try:
        return base64.b64decode(note_value).decode("utf-8", errors="ignore")
    except Exception as exc:  # pragma: no cover - defensive decoding path
        raise InvalidSignature("Could not decode payment note.") from exc


def _prune_replay_cache(replay_cache_ttl: int) -> None:
    now = time.time()
    expired = [tx_id for tx_id, ts in _used_tx_ids.items() if now - ts > replay_cache_ttl]
    for tx_id in expired:
        _used_tx_ids.pop(tx_id, None)

