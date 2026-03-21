from __future__ import annotations

from contextvars import ContextVar

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from .challenge import PAYMENT_REQUIRED_HEADER, PAYMENT_SESSION_HEADER, encode_challenge
from .exceptions import InvalidSignature, PaymentRequired, ReplayAttack
from .session import SESSION_PREFIX


_current_request: ContextVar[Request | None] = ContextVar("algogate_current_request", default=None)


def get_current_request() -> Request:
    request = _current_request.get()
    if request is None:
        raise RuntimeError("AlgoGate request context is not available.")
    return request


class AlgoGateMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, gate) -> None:
        super().__init__(app)
        self.gate = gate

    async def dispatch(self, request: Request, call_next):
        token = _current_request.set(request)
        request.state.algogate = self.gate

        try:
            response = await call_next(request)
        except PaymentRequired as exc:
            response = JSONResponse(
                status_code=402,
                content={"detail": exc.message, "challenge": exc.challenge},
            )
            response.headers[PAYMENT_REQUIRED_HEADER] = encode_challenge(exc.challenge)
        except ReplayAttack as exc:
            response = JSONResponse(status_code=409, content={"detail": str(exc)})
        except InvalidSignature as exc:
            response = JSONResponse(status_code=403, content={"detail": str(exc)})
        finally:
            _current_request.reset(token)

        session_token = getattr(request.state, "algogate_session_token", "")
        if session_token:
            response.headers[PAYMENT_SESSION_HEADER] = f"{SESSION_PREFIX}{session_token}"

        exposed = response.headers.get("Access-Control-Expose-Headers", "")
        needed = {PAYMENT_REQUIRED_HEADER, PAYMENT_SESSION_HEADER}
        existing = {item.strip() for item in exposed.split(",") if item.strip()}
        response.headers["Access-Control-Expose-Headers"] = ", ".join(sorted(existing | needed))

        return response
