import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

from backend.routers import articles, detect, payments, score, summarize, translate, writing


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Registered routes:")
    for route in sorted(app.routes, key=lambda item: item.path):
        methods = ",".join(sorted(getattr(route, "methods", [])))
        print(f" - {methods} {route.path}")
    print("Native payment asset: ALGO")
    yield


app = FastAPI(title="EtherX API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["PAYMENT-REQUIRED", "PAYMENT-RESPONSE", "X-PAYMENT-RESPONSE"],
)

app.include_router(summarize.router, prefix="/api")
app.include_router(detect.router, prefix="/api")
app.include_router(payments.router, prefix="/api")
app.include_router(score.router, prefix="/api")
app.include_router(translate.router, prefix="/api")
app.include_router(writing.router, prefix="/api")
app.include_router(articles.router, prefix="/api")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "version": "1.0", "network": "algorand"}


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_request: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(status_code=422, content={"error": "Validation error", "detail": exc.errors()})


@app.exception_handler(Exception)
async def generic_exception_handler(_request: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(status_code=500, content={"error": "Internal server error", "detail": str(exc)})
