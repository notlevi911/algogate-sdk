from fastapi import APIRouter, HTTPException, Request

from backend.services.payment_service import ensure_native_algo_payment, payment_amounts


router = APIRouter(tags=["articles"])


ARTICLE_1 = {
    "id": 1,
    "title": "The Future of Decentralized Browsers",
    "content": (
        "Decentralized browsers are changing how the web gets paid for. Traditional browsing assumes that ads, "
        "tracking, and large subscription bundles are the default business model, but x402-style payment flows let "
        "apps charge tiny amounts only when the user actually wants value. In a decentralized browser, the payment "
        "layer can sit much closer to the page, which means the browser can recognize premium content, request a "
        "payment, and unlock the result in seconds. Algorand makes this especially interesting because transaction "
        "finality is fast, costs are low, and wallet UX can be embedded into browser-like products. Instead of "
        "forcing every publisher to build a checkout flow, the browser itself becomes the commerce client. That "
        "changes incentives: readers can buy one article, one summary, or one premium translation without signing up "
        "for another monthly subscription. Developers also gain a standard protocol surface. If the route returns "
        "402, the browser can handle the rest. Over time, this could create a cleaner web where monetization is "
        "explicit, privacy is stronger, and useful AI features are paid for per use rather than hidden behind giant "
        "bundles. The browser stops being a passive window and becomes an active economic agent for the user."
    ),
    "paid": True,
    "price_paid": 0.10,
}

ARTICLE_2 = {
    "id": 2,
    "title": "How AI Agents Are Replacing Subscriptions",
    "content": (
        "Subscriptions are a blunt tool for AI products. Most people do not need unlimited usage every day, and many "
        "would rather pay for a single high-value action than commit to recurring billing. AI agents amplify this "
        "trend because they can make autonomous decisions about when extra capability is worth buying. A browser "
        "agent might use a cheap model for quick summarization, then switch to a stronger model only when the user "
        "opens a research paper or legal document. With x402, the payment request can happen at the exact moment of "
        "need. This makes AI feel more like infrastructure than like a SaaS dashboard. The user pays for a better "
        "translation, a deeper score, or a premium writing transformation only when it matters. That lowers "
        "friction, makes costs more predictable, and gives builders a direct path to monetization without hiding "
        "useful features behind arbitrary plans. As agents get better at understanding context, they will be able to "
        "optimize spend automatically, balancing quality, price, and urgency in real time. The result is a shift "
        "from subscriptions as access control to payments as dynamic capability selection."
    ),
    "paid": True,
    "price_paid": 0.25,
}

ARTICLE_3 = {
    "id": 3,
    "title": "Algorand DeFi: Complete Guide for Developers",
    "content": (
        "Building on Algorand DeFi requires understanding both the protocol primitives and the product patterns that "
        "have emerged around them. For developers, the appeal starts with predictable fees, fast settlement, and a "
        "smart contract environment that can support meaningful financial workflows without forcing users through "
        "expensive execution paths. Protocols like Folks Finance show how lending, borrowing, and collateral "
        "management can be packaged into user-friendly interfaces, while wallets and explorers reduce the barrier to "
        "observing state transitions on-chain. Yield strategies on Algorand depend on understanding liquidity, asset "
        "quality, and where incentives come from. A developer building DeFi-aware browser tools should not just read "
        "APYs at face value; they should inspect where rewards originate, whether incentives are temporary, how "
        "oracle assumptions work, and what liquidation or smart contract risks exist. For browser-based experiences, "
        "there is a powerful opportunity to bring DeFi context directly into page-level interactions. A user can "
        "view a protocol, open a risk layer, buy a premium explanation, and understand the product before taking "
        "action. That turns the browser into a research and payment surface at the same time."
    ),
    "paid": True,
    "price_paid": 0.50,
}

ARTICLES = {1: ARTICLE_1, 2: ARTICLE_2, 3: ARTICLE_3}


def _preview(article: dict) -> dict:
    preview_words = article["content"].split()[:50]
    return {
        "id": article["id"],
        "title": article["title"],
        "preview": " ".join(preview_words) + "...",
        "price": article["price_paid"],
        "network": "algorand-testnet",
    }


@router.get("/articles")
def list_articles():
    try:
        return [_preview(ARTICLES[1]), _preview(ARTICLES[2]), _preview(ARTICLES[3])]
    except Exception as exc:
        raise HTTPException(status_code=500, detail={"error": "Internal server error", "detail": str(exc)}) from exc


@router.get("/articles/1")
async def get_article_1(request: Request):
    try:
        payment_response = await ensure_native_algo_payment(
            request,
            payment_amounts()["article_1"],
            "Article 1",
        )
        if payment_response is not None:
            return payment_response
        return ARTICLES[1]
    except Exception as exc:
        raise HTTPException(status_code=500, detail={"error": "Internal server error", "detail": str(exc)}) from exc


@router.get("/articles/2")
async def get_article_2(request: Request):
    try:
        payment_response = await ensure_native_algo_payment(
            request,
            payment_amounts()["article_2"],
            "Article 2",
        )
        if payment_response is not None:
            return payment_response
        return ARTICLES[2]
    except Exception as exc:
        raise HTTPException(status_code=500, detail={"error": "Internal server error", "detail": str(exc)}) from exc


@router.get("/articles/3")
async def get_article_3(request: Request):
    try:
        payment_response = await ensure_native_algo_payment(
            request,
            payment_amounts()["article_3"],
            "Article 3",
        )
        if payment_response is not None:
            return payment_response
        return ARTICLES[3]
    except Exception as exc:
        raise HTTPException(status_code=500, detail={"error": "Internal server error", "detail": str(exc)}) from exc
