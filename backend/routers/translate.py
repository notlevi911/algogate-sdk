from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.services.gemini_service import FREE_MODEL, PAID_MODEL, PROMPTS, call_gemini


router = APIRouter(tags=["translate"])


class TranslateRequest(BaseModel):
    text: str
    target_language: str


def _user_content(body: TranslateRequest) -> str:
    truncated = body.text[:3000]
    return f"Target language: {body.target_language}\n\nText:\n{truncated}"


@router.post("/translate/free")
def translate_free(body: TranslateRequest):
    try:
        result = call_gemini(PROMPTS["translate_free"], _user_content(body), FREE_MODEL)
        if result.get("error"):
            raise HTTPException(status_code=503, detail={"error": "Gemini unavailable", "detail": result["message"]})
        result["success"] = True
        return result
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail={"error": "Internal server error", "detail": str(exc)}) from exc


@router.post("/translate/paid")
def translate_paid(body: TranslateRequest):
    try:
        result = call_gemini(PROMPTS["translate_paid"], _user_content(body), PAID_MODEL)
        if result.get("error"):
            raise HTTPException(status_code=503, detail={"error": "Gemini unavailable", "detail": result["message"]})
        result["success"] = True
        return result
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail={"error": "Internal server error", "detail": str(exc)}) from exc
