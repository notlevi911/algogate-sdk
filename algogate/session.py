from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time

from .challenge import PAYMENT_SIGNATURE_HEADER
from .exceptions import InvalidSignature


SESSION_PREFIX = "jwt."


def issue_session_token(receiver: str, tx_id: str, route_path: str, ttl_seconds: int) -> str:
    payload = {
        "sub": tx_id,
        "route": route_path,
        "exp": int(time.time()) + ttl_seconds,
    }
    header = {"alg": "HS256", "typ": "JWT"}
    encoded_header = _b64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    encoded_payload = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signing_input = f"{encoded_header}.{encoded_payload}".encode("utf-8")
    signature = hmac.new(_session_secret(receiver), signing_input, hashlib.sha256).digest()
    encoded_signature = _b64url_encode(signature)
    return f"{encoded_header}.{encoded_payload}.{encoded_signature}"


def verify_session_signature(receiver: str, signature: str, route_path: str) -> dict:
    if not signature.startswith(SESSION_PREFIX):
        raise InvalidSignature(f"{PAYMENT_SIGNATURE_HEADER} is not a session token.")

    token = signature[len(SESSION_PREFIX) :]
    try:
        encoded_header, encoded_payload, encoded_signature = token.split(".")
    except ValueError as exc:
        raise InvalidSignature("Invalid payment session token.") from exc

    signing_input = f"{encoded_header}.{encoded_payload}".encode("utf-8")
    expected_signature = hmac.new(_session_secret(receiver), signing_input, hashlib.sha256).digest()
    actual_signature = _b64url_decode(encoded_signature)
    if not hmac.compare_digest(actual_signature, expected_signature):
        raise InvalidSignature("Invalid payment session token.")

    try:
        payload = json.loads(_b64url_decode(encoded_payload).decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError, ValueError) as exc:
        raise InvalidSignature("Invalid payment session token.") from exc

    if payload.get("route") != route_path:
        raise InvalidSignature("Payment session token is not valid for this route.")
    if int(payload.get("exp", 0)) < int(time.time()):
        raise InvalidSignature("Payment session token has expired.")

    return payload


def is_session_signature(signature: str) -> bool:
    return signature.startswith(SESSION_PREFIX)


def _session_secret(receiver: str) -> str:
    return hashlib.sha256(receiver.encode("utf-8")).digest()


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("utf-8").rstrip("=")


def _b64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(f"{value}{padding}".encode("utf-8"))
