from urllib.parse import urlparse

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.services.cleaner import clean_html
from backend.services.gemini_service import FREE_MODEL, PROMPTS, call_gemini


router = APIRouter(tags=["detect"])


class DetectRequest(BaseModel):
    url: str
    html: str


def _match_known_url(url: str):
    parsed = urlparse(url)
    host = parsed.netloc.lower().replace("www.", "")
    path = parsed.path.lower()

    if host == "youtube.com" and path == "/watch":
        return {
            "summarizable": True,
            "page_type": "youtube",
            "suggested_tier": "free",
            "action_label": "Watch Ad-free",
            "suggested_price": 0.05,
            "confidence": 100,
            "cost": 0.00,
            "success": True,
        }

    if "spotify.com" in host:
        return {
            "summarizable": True,
            "page_type": "spotify",
            "suggested_tier": "free",
            "action_label": "Listen Ad-free",
            "suggested_price": 0.10,
            "confidence": 100,
            "cost": 0.00,
            "success": True,
        }

    if host in {"arxiv.org", "researchgate.net", "nature.com", "ieee.org", "springer.com", "dl.acm.org"} or "pubmed.ncbi" in host:
        return {
            "summarizable": True,
            "page_type": "research_paper",
            "suggested_tier": "paid",
            "action_label": "Deep Summary",
            "suggested_price": 0.25,
            "confidence": 100,
            "cost": 0.00,
            "success": True,
        }

    if host.endswith("wikipedia.org") and path.startswith("/wiki/"):
        return {
            "summarizable": True,
            "page_type": "wikipedia",
            "suggested_tier": "free",
            "action_label": "Summarize",
            "suggested_price": 0.00,
            "confidence": 100,
            "cost": 0.00,
            "success": True,
        }

    if host == "github.com" and path not in {"", "/"}:
        return {
            "summarizable": True,
            "page_type": "github_repo",
            "suggested_tier": "free",
            "action_label": "Explain Repo",
            "suggested_price": 0.00,
            "confidence": 100,
            "cost": 0.00,
            "success": True,
        }

    if host == "stackoverflow.com" and path.startswith("/questions/"):
        return {
            "summarizable": True,
            "page_type": "stackoverflow",
            "suggested_tier": "free",
            "action_label": "Summarize Thread",
            "suggested_price": 0.00,
            "confidence": 100,
            "cost": 0.00,
            "success": True,
        }

    if host.endswith("medium.com") and path not in {"", "/"}:
        return {
            "summarizable": True,
            "page_type": "article",
            "suggested_tier": "free",
            "action_label": "Summarize",
            "suggested_price": 0.00,
            "confidence": 100,
            "cost": 0.00,
            "success": True,
        }

    if host.startswith("docs.") or host.endswith("readthedocs.io") or host == "developer.mozilla.org" or "/docs/" in path:
        return {
            "summarizable": True,
            "page_type": "documentation",
            "suggested_tier": "free",
            "action_label": "Summarize Docs",
            "suggested_price": 0.00,
            "confidence": 100,
            "cost": 0.00,
            "success": True,
        }

    if host in {"google.com", "bing.com", "twitter.com", "x.com", "instagram.com", "facebook.com", "amazon.com"}:
        return {
            "summarizable": False,
            "page_type": "not_summarizable",
            "confidence": 100,
            "cost": 0.00,
            "success": True,
        }

    return None


@router.post("/detect")
def detect_page(body: DetectRequest):
    try:
        known = _match_known_url(body.url)
        if known:
            return known

        cleaned = clean_html(body.html)[:500]
        result = call_gemini(
            system_prompt=PROMPTS["detect_unknown"],
            user_content=f"URL: {body.url}\n\nSnippet:\n{cleaned}",
            model=FREE_MODEL,
        )
        if result.get("error"):
            raise HTTPException(status_code=503, detail={"error": "Gemini unavailable", "detail": result["message"]})
        result["success"] = True
        result["cost"] = 0.00
        return result
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail={"error": "Internal server error", "detail": str(exc)}) from exc
