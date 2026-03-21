from fastapi import FastAPI, Query

from algogate import AlgoGate


gate = AlgoGate(
    receiver="YOUR_ALGORAND_ADDRESS",
    price_microalgo=10_000,
    network="testnet",
    api_name="Example Palindrome API",
    api_key="optional-internal-api-key",
)

app = FastAPI(title="Example Palindrome API")
gate.init_app(app)


@app.get("/api/free")
async def free_health():
    return {"status": "ok", "note": "This route is public."}


@app.get("/api/palindrome")
@gate.protect
async def palindrome(number: int = Query(..., description="Number to mirror")):
    digits = str(abs(number))
    mirrored = digits[::-1]
    return {
        "input": number,
        "palindrome_text": mirrored,
        "is_palindrome": digits == mirrored,
        "price_algo": 0.01,
    }


@app.get("/api/palindrome/nearest")
@gate.protect_with_price(50_000)
async def nearest_palindrome(number: int = Query(..., description="Number to inspect")):
    digits = str(abs(number))
    return {
        "input": number,
        "palindrome_text": digits[::-1],
        "explanation": "This route uses a higher per-route price override.",
        "price_algo": 0.05,
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)
