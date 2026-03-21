import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from x402.http import FacilitatorConfig, HTTPFacilitatorClient, PaymentOption
from x402.http.middleware.fastapi import PaymentMiddlewareASGI
from x402.http.types import RouteConfig
from x402.mechanisms.avm import USDC_TESTNET_ASA_ID
from x402.mechanisms.avm.exact import ExactAvmServerScheme
from x402.server import x402ResourceServer

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

from backend.routers import articles, detect, score, summarize, translate, writing

AVM_NETWORK = "algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI="
AVM_ADDRESS = os.getenv("AVM_ADDRESS", "")
FACILITATOR_URL = os.getenv("FACILITATOR_URL", "https://facilitator.goplausible.xyz")
AVM_ASSET_ID = USDC_TESTNET_ASA_ID

facilitator = HTTPFacilitatorClient(FacilitatorConfig(url=FACILITATOR_URL))
server = x402ResourceServer(facilitator)
server.register("algorand:*", ExactAvmServerScheme())

routes = {
    "POST /api/summarize/paid": RouteConfig(
        accepts=PaymentOption(scheme="exact", pay_to=AVM_ADDRESS, price="$0.25", network=AVM_NETWORK),
        description="Deep page summary",
    ),
    "POST /api/translate/paid": RouteConfig(
        accepts=PaymentOption(scheme="exact", pay_to=AVM_ADDRESS, price="$0.05", network=AVM_NETWORK),
        description="Professional translation",
    ),
    "POST /api/writing/paid": RouteConfig(
        accepts=PaymentOption(scheme="exact", pay_to=AVM_ADDRESS, price="$0.05", network=AVM_NETWORK),
        description="AI writing assist",
    ),
    "POST /api/score/paid": RouteConfig(
        accepts=PaymentOption(scheme="exact", pay_to=AVM_ADDRESS, price="$0.10", network=AVM_NETWORK),
        description="Deep content scoring",
    ),
    "GET /api/articles/1": RouteConfig(
        accepts=PaymentOption(scheme="exact", pay_to=AVM_ADDRESS, price="$0.10", network=AVM_NETWORK),
        description="Article 1",
    ),
    "GET /api/articles/2": RouteConfig(
        accepts=PaymentOption(scheme="exact", pay_to=AVM_ADDRESS, price="$0.25", network=AVM_NETWORK),
        description="Article 2",
    ),
    "GET /api/articles/3": RouteConfig(
        accepts=PaymentOption(scheme="exact", pay_to=AVM_ADDRESS, price="$0.50", network=AVM_NETWORK),
        description="Article 3",
    ),
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Registered routes:")
    for route in sorted(app.routes, key=lambda item: item.path):
        methods = ",".join(sorted(getattr(route, "methods", [])))
        print(f" - {methods} {route.path}")
    print(f"x402 AVM asset id: {AVM_ASSET_ID}")
    yield


app = FastAPI(title="Ether Browser API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["PAYMENT-REQUIRED", "PAYMENT-RESPONSE", "X-PAYMENT-RESPONSE"],
)

app.add_middleware(PaymentMiddlewareASGI, routes=routes, server=server)

app.include_router(summarize.router, prefix="/api")
app.include_router(detect.router, prefix="/api")
app.include_router(score.router, prefix="/api")
app.include_router(translate.router, prefix="/api")
app.include_router(writing.router, prefix="/api")
app.include_router(articles.router, prefix="/api")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "version": "1.0", "network": "algorand-testnet"}


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_request: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(status_code=422, content={"error": "Validation error", "detail": exc.errors()})


@app.exception_handler(Exception)
async def generic_exception_handler(_request: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(status_code=500, content={"error": "Internal server error", "detail": str(exc)})
