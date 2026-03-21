from __future__ import annotations

import base64
import hashlib
import json
import time
from typing import Any

from .config import AlgoGateConfig


PAYMENT_REQUIRED_HEADER = "X-Payment-Required"
PAYMENT_SIGNATURE_HEADER = "X-Payment-Signature"
PAYMENT_SESSION_HEADER = "X-Payment-Session"


def note_prefix_for_route(route_path: str) -> str:
    return hashlib.sha256(route_path.encode("utf-8")).hexdigest()[:16]


def build_payment_challenge(
    config: AlgoGateConfig,
    route_path: str,
    price_microalgo: int,
) -> dict[str, Any]:
    return {
        "receiver": config.receiver,
        "amount": int(price_microalgo),
        "network": config.network,
        "note_prefix": note_prefix_for_route(route_path),
        "api_name": config.api_name,
        "expires": int(time.time()) + config.challenge_ttl_seconds,
    }


def encode_challenge(challenge: dict[str, Any]) -> str:
    return base64.b64encode(json.dumps(challenge).encode("utf-8")).decode("utf-8")


def decode_challenge(encoded: str) -> dict[str, Any]:
    return json.loads(base64.b64decode(encoded.encode("utf-8")).decode("utf-8"))

