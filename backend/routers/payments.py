from fastapi import APIRouter, HTTPException, Request

from backend.services.payment_service import confirm_payment_request


router = APIRouter(tags=["payments"])


@router.post("/payments/confirm")
async def confirm_payment(request: Request):
    try:
        return await confirm_payment_request(request)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail={"error": "Internal server error", "detail": str(exc)},
        ) from exc
