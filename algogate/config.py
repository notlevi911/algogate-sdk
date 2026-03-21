from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256


INDEXER_URLS = {
    "testnet": "https://testnet-idx.algonode.cloud",
    "mainnet": "https://mainnet-idx.algonode.cloud",
}


@dataclass
class AlgoGateConfig:
    receiver: str
    price_microalgo: int
    network: str = "testnet"
    api_name: str = "Protected API"
    api_key: str = ""
    session_ttl_seconds: int = 3600
    replay_cache_ttl: int = 86400
    scaffold_on_init: bool = True
    challenge_ttl_seconds: int = 300
    api_base_url: str = "http://127.0.0.1:8000"

    def __post_init__(self) -> None:
        self.network = self.network.strip().lower()
        if self.network not in INDEXER_URLS:
            raise ValueError("network must be 'testnet' or 'mainnet'")
        if not self.receiver.strip():
            raise ValueError("receiver is required")
        if self.price_microalgo <= 0:
            raise ValueError("price_microalgo must be greater than zero")
        if self.session_ttl_seconds <= 0:
            raise ValueError("session_ttl_seconds must be greater than zero")
        if self.replay_cache_ttl <= 0:
            raise ValueError("replay_cache_ttl must be greater than zero")
        self.receiver = self.receiver.strip()
        self.api_name = self.api_name.strip() or "Protected API"

    @property
    def indexer_url(self) -> str:
        return INDEXER_URLS[self.network]

    @property
    def price_algo(self) -> float:
        return self.price_microalgo / 1_000_000

    @property
    def session_secret(self) -> str:
        return sha256(self.receiver.encode("utf-8")).hexdigest()
