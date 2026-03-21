from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.services.gemini_service import FREE_MODEL, PAID_MODEL, PROMPTS, call_gemini


router = APIRouter(tags=["score"])


class ScoreRequest(BaseModel):
    title: str
    preview: str
    price: float
    user_interests: list[str]


def _build_user_content(body: ScoreRequest) -> str:
    return (
        f"Title: {body.title}\n"
        f"Preview: {body.preview}\n"
        f"Price: {body.price}\n"
        f"User interests: {', '.join(body.user_interests)}"
    )


@router.post("/score/free")
def score_free(body: ScoreRequest):
    try:
        result = call_gemini(PROMPTS["score_free"], _build_user_content(body), FREE_MODEL)
        if result.get("error"):
            raise HTTPException(status_code=503, detail={"error": "Gemini unavailable", "detail": result["message"]})
        result["success"] = True
        return result
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail={"error": "Internal server error", "detail": str(exc)}) from exc


@router.post("/score/paid")
def score_paid(body: ScoreRequest):
    try:
        result = call_gemini(PROMPTS["score_paid"], _build_user_content(body), PAID_MODEL)
        if result.get("error"):
            raise HTTPException(status_code=503, detail={"error": "Gemini unavailable", "detail": result["message"]})
        result["success"] = True
        return result
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail={"error": "Internal server error", "detail": str(exc)}) from exc
