from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.services.gemini_service import FREE_MODEL, PAID_MODEL, PROMPTS, call_gemini


router = APIRouter(tags=["writing"])

VALID_INSTRUCTIONS = [
    "fix grammar",
    "make formal",
    "simplify",
    "shorten",
    "make casual",
    "expand",
    "make persuasive",
]


class WritingRequest(BaseModel):
    text: str
    instruction: str


def _validate_instruction(instruction: str) -> str:
    normalized = instruction.strip().lower()
    if normalized not in VALID_INSTRUCTIONS:
        raise HTTPException(
            status_code=400,
            detail={"error": f"Invalid instruction. Valid instructions: {', '.join(VALID_INSTRUCTIONS)}"},
        )
    return normalized


@router.post("/writing/free")
def writing_free(body: WritingRequest):
    try:
        _validate_instruction(body.instruction)
        result = call_gemini(PROMPTS["writing_free"], f"Text:\n{body.text[:3000]}", FREE_MODEL)
        if result.get("error"):
            raise HTTPException(status_code=503, detail={"error": "Gemini unavailable", "detail": result["message"]})
        result["success"] = True
        return result
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail={"error": "Internal server error", "detail": str(exc)}) from exc


@router.post("/writing/paid")
def writing_paid(body: WritingRequest):
    try:
        instruction = _validate_instruction(body.instruction)
        system_prompt = PROMPTS["writing_paid"].replace("{instruction}", instruction)
        result = call_gemini(system_prompt, f"Text:\n{body.text[:3000]}", PAID_MODEL)
        if result.get("error"):
            raise HTTPException(status_code=503, detail={"error": "Gemini unavailable", "detail": result["message"]})
        result["success"] = True
        return result
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail={"error": "Internal server error", "detail": str(exc)}) from exc
