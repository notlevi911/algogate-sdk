from __future__ import annotations


class AlgoGateError(Exception):
    """Base exception for the AlgoGate SDK."""


class PaymentRequired(AlgoGateError):
    def __init__(self, challenge: dict, message: str = "Payment required") -> None:
        super().__init__(message)
        self.challenge = challenge
        self.message = message


class InvalidSignature(AlgoGateError):
    """Raised when a payment signature or session token is invalid."""


class ReplayAttack(AlgoGateError):
    """Raised when a payment transaction ID is reused."""

