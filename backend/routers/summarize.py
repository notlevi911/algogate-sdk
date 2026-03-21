import math

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from backend.services.cleaner import clean_html
from backend.services.gemini_service import FREE_MODEL, PAID_MODEL, PROMPTS, call_gemini
from backend.services.payment_service import ensure_native_algo_payment, payment_amounts


router = APIRouter(tags=["summarize"])


class SummarizeRequest(BaseModel):
    url: str
    html: str


def _build_summary_response(result: dict, cleaned: str, tier: str) -> dict:
    word_count = len(cleaned.split())
    reading_time_mins = max(1, math.ceil(word_count / 220)) if word_count else 0
    payload = dict(result)
    payload["word_count"] = word_count
    payload["tier"] = tier
    if tier == "paid":
        payload["reading_time_mins"] = reading_time_mins
        payload["cost"] = 0.25
    else:
        payload["cost"] = 0.00
    payload["success"] = True
    return payload


@router.post("/summarize/free")
def summarize_free(body: SummarizeRequest):
    try:
        cleaned = clean_html(body.html)
        result = call_gemini(
            system_prompt=PROMPTS["summarize_free"],
            user_content=f"URL: {body.url}\n\nReadable content:\n{cleaned}",
            model=FREE_MODEL,
        )
        if result.get("error"):
            raise HTTPException(status_code=503, detail={"error": "Gemini unavailable", "detail": result["message"]})
        return _build_summary_response(result, cleaned, "free")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail={"error": "Internal server error", "detail": str(exc)}) from exc


@router.post("/summarize/paid")
async def summarize_paid(body: SummarizeRequest, request: Request):
    try:
        payment_response = await ensure_native_algo_payment(
            request,
            payment_amounts()["summarize_paid"],
            "Deep page summary",
        )
        if payment_response is not None:
            return payment_response
        cleaned = clean_html(body.html)
        result = call_gemini(
            system_prompt=PROMPTS["summarize_paid"],
            user_content=f"URL: {body.url}\n\nReadable content:\n{cleaned}",
            model=PAID_MODEL,
        )
        if result.get("error"):
            raise HTTPException(status_code=503, detail={"error": "Gemini unavailable", "detail": result["message"]})
        return _build_summary_response(result, cleaned, "paid")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail={"error": "Internal server error", "detail": str(exc)}) from exc
