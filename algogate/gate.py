from __future__ import annotations

import inspect
from functools import wraps
from typing import Any, Callable

from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel

from .challenge import PAYMENT_SIGNATURE_HEADER
from .config import AlgoGateConfig
from .dashboard import AlgoGateDashboard
from .exceptions import PaymentRequired
from .middleware import AlgoGateMiddleware, get_current_request
from .payment import build_challenge, verify_any_payment, verify_payment
from .scaffold import scaffold_extension
from .session import is_session_signature, issue_session_token, verify_session_signature


class ManualVerifyRequest(BaseModel):
    tx_id: str


class AlgoGate:
    def __init__(
        self,
        receiver: str,
        price_microalgo: int,
        network: str = "testnet",
        api_name: str = "Protected API",
        api_key: str = "",
        session_ttl_seconds: int = 3600,
        replay_cache_ttl: int = 86400,
        scaffold_on_init: bool = True,
    ) -> None:
        self.config = AlgoGateConfig(
            receiver=receiver,
            price_microalgo=price_microalgo,
            network=network,
            api_name=api_name,
            api_key=api_key,
            session_ttl_seconds=session_ttl_seconds,
            replay_cache_ttl=replay_cache_ttl,
            scaffold_on_init=scaffold_on_init,
        )
        self.app: FastAPI | None = None
        self.dashboard = AlgoGateDashboard()
        self._initialized = False

    def init_app(self, app: FastAPI):
        if self._initialized:
            return app

        self.app = app
        app.state.algogate = self
        app.add_middleware(AlgoGateMiddleware, gate=self)

        app.add_api_route("/algogate/dashboard", self._dashboard_view, methods=["GET"], tags=["algogate"])
        app.add_api_websocket_route("/algogate/events", self.dashboard.websocket_endpoint)
        app.add_api_route("/algogate/routes", self._routes_view, methods=["GET"], tags=["algogate"])
        app.add_api_route("/algogate/health", self._health_view, methods=["GET"], tags=["algogate"])
        app.add_api_route("/algogate/verify", self._verify_view, methods=["POST"], tags=["algogate"])

        scaffold_path = None
        if self.config.scaffold_on_init:
            scaffold_path = scaffold_extension(self)

        self._print_banner(scaffold_path or "./algogate_extension/")
        self._initialized = True
        return app

    @property
    def protect(self):
        return self.protect_with_price(self.config.price_microalgo)

    def protect_with_price(self, price_microalgo: int):
        def decorator(func: Callable[..., Any]):
            if inspect.iscoroutinefunction(func):

                @wraps(func)
                async def async_wrapper(*args, **kwargs):
                    request = get_current_request()
                    await self._authorize_request(request, int(price_microalgo))
                    return await func(*args, **kwargs)

                async_wrapper.__signature__ = inspect.signature(func)  # type: ignore[attr-defined]
                setattr(async_wrapper, "__algogate_protected__", True)
                setattr(async_wrapper, "__algogate_price_microalgo__", int(price_microalgo))
                return async_wrapper

            @wraps(func)
            def sync_wrapper(*args, **kwargs):
                import anyio

                request = get_current_request()
                anyio.from_thread.run(self._authorize_request, request, int(price_microalgo))
                return func(*args, **kwargs)

            sync_wrapper.__signature__ = inspect.signature(func)  # type: ignore[attr-defined]
            setattr(sync_wrapper, "__algogate_protected__", True)
            setattr(sync_wrapper, "__algogate_price_microalgo__", int(price_microalgo))
            return sync_wrapper

        return decorator

    async def _authorize_request(self, request: Request, price_microalgo: int) -> None:
        route_path = self._route_path_for_request(request)
        signature = request.headers.get(PAYMENT_SIGNATURE_HEADER, "").strip()

        if not signature:
            challenge = build_challenge(self.config, route_path, price_microalgo)
            raise PaymentRequired(challenge)

        if is_session_signature(signature):
            verify_session_signature(self.config.receiver, signature, route_path)
            return

        transaction = await verify_payment(
            tx_id=signature,
            expected_receiver=self.config.receiver,
            expected_amount=price_microalgo,
            expected_note_prefix=self._note_prefix(route_path),
            network=self.config.network,
            replay_cache_ttl=self.config.replay_cache_ttl,
        )

        request.state.algogate_session_token = issue_session_token(
            receiver=self.config.receiver,
            tx_id=signature,
            route_path=route_path,
            ttl_seconds=self.config.session_ttl_seconds,
        )

        await self.dashboard.broadcast_payment(
            tx_id=signature,
            route=route_path,
            amount=int((transaction.get("payment-transaction") or {}).get("amount") or price_microalgo),
            caller_ip=request.client.host if request.client else "",
            session_issued=True,
        )

    def _dashboard_view(self):
        return self.dashboard.dashboard_html(self)

    def _routes_view(self):
        return self._protected_routes()

    def _health_view(self):
        return {
            "status": "ok",
            "receiver": self.config.receiver,
            "network": self.config.network,
            "price": self.config.price_microalgo,
        }

    async def _verify_view(self, body: ManualVerifyRequest):
        try:
            transaction = await verify_any_payment(body.tx_id, self.config.receiver, self.config.network)
        except Exception as exc:
            raise HTTPException(status_code=403, detail=str(exc)) from exc

        return {
            "status": "ok",
            "tx_id": body.tx_id,
            "confirmed_round": transaction.get("confirmed-round"),
            "receiver": (transaction.get("payment-transaction") or {}).get("receiver"),
        }

    def _protected_routes(self) -> list[dict[str, Any]]:
        if not self.app:
            return []

        routes: list[dict[str, Any]] = []
        for route in self.app.routes:
            endpoint = getattr(route, "endpoint", None)
            if not endpoint or not getattr(endpoint, "__algogate_protected__", False):
                continue
            path = getattr(route, "path", "")
            if path.startswith("/algogate/"):
                continue
            methods = sorted(method for method in getattr(route, "methods", []) if method not in {"HEAD", "OPTIONS"})
            price = int(getattr(endpoint, "__algogate_price_microalgo__", self.config.price_microalgo))
            routes.append(
                {
                    "path": path,
                    "methods": methods,
                    "price_microalgo": price,
                    "price_algo": price / 1_000_000,
                    "api_name": self.config.api_name,
                }
            )
        return routes

    @staticmethod
    def _route_path_for_request(request: Request) -> str:
        route = request.scope.get("route")
        path = getattr(route, "path", None)
        return str(path or request.url.path)

    @staticmethod
    def _note_prefix(route_path: str) -> str:
        from .challenge import note_prefix_for_route

        return note_prefix_for_route(route_path)

    def _print_banner(self, scaffold_path: str) -> None:
        width = 40

        def line(text: str = "") -> str:
            return f"  ║{text[:width].center(width)}║" if text and text.strip() == "AlgoGate SDK active" else f"  ║{text[:width].ljust(width)}║"

        receiver_short = self.config.receiver if len(self.config.receiver) <= 28 else f"{self.config.receiver[:24]}..."
        price_text = f"{self.config.price_algo:g} ALGO per call"
        banner = "\n".join(
            [
                "  ╔══════════════════════════════════════════╗",
                line("AlgoGate SDK active"),
                "  ╠══════════════════════════════════════════╣",
                line(f"  API:       {self.config.api_name}"),
                line(f"  Receiver:  {receiver_short}"),
                line(f"  Price:     {price_text}"),
                line(f"  Network:   {self.config.network}"),
                line("  Dashboard: http://127.0.0.1:8000/"),
                line("              algogate/dashboard"),
                "  ╠══════════════════════════════════════════╣",
                line("  Extension scaffolded →"),
                line(f"  {scaffold_path}"),
                line(),
                line("  Load it in Chrome:"),
                line("  chrome://extensions → Load unpacked"),
                "  ╚══════════════════════════════════════════╝",
            ]
        )
        print(banner)
