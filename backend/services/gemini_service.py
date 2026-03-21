import json
import os
from typing import Any

import httpx


PROMPTS = {
    "summarize_free": 'You are a fast webpage summarizer. The user has not paid. Give a quick free summary. Return pure JSON only, no markdown: {"tldr": "one sentence max 20 words", "bullets": ["3 short bullet points"], "word_count": number, "tier": "free", "cost": 0.00}',
    "summarize_paid": 'You are a deep content analyst. The user has paid for premium analysis. Return pure JSON only, no markdown: {"title": "page title", "tldr": "2-3 sentence executive summary", "bullets": ["5 detailed key points"], "key_insights": ["3 non-obvious insights from this content"], "action_items": ["3 actionable takeaways"], "source_quality": "high|medium|low", "word_count": number, "reading_time_mins": number, "tier": "paid", "cost": 0.25}',
    "detect_unknown": 'Classify this webpage. Return pure JSON only, no markdown: {"summarizable": true|false, "page_type": "research_paper|documentation|news_article|blog_post|wikipedia|legal_document|github_repo|stackoverflow|youtube|spotify|not_summarizable", "suggested_tier": "free|paid", "confidence": 0-100, "action_label": "appropriate action label", "suggested_price": 0.00, "cost": 0.00}. Return summarizable false for homepages, search pages, social feeds, login pages.',
    "score_free": 'Decide if this article is worth paying for based on user interests. Return pure JSON only, no markdown: {"decision": "pay|skip", "score": 0-100, "reason": "one sentence", "tier": "free", "cost": 0.00}',
    "score_paid": 'Give a deep analysis of whether this article is worth paying for. Consider the user interests carefully, assess the article quality, and factor in the price. Return pure JSON only, no markdown: {"decision": "pay|skip", "score": 0-100, "reason": "2-3 sentence detailed analysis", "quality_estimate": "high|medium|low", "relevance_score": 0-100, "price_fairness": "good_value|fair|expensive", "tier": "paid", "cost": 0.10}',
    "translate_free": 'Translate the text naturally and accurately. Return pure JSON only, no markdown: {"translated": "translated text", "detected_language": "source language name", "tier": "free", "cost": 0.00}',
    "translate_paid": 'Translate professionally, preserving tone, register, cultural nuance, and all stylistic choices. Return pure JSON only, no markdown: {"translated": "translated text", "detected_language": "source language name", "notes": "any important translation notes or cultural context worth knowing", "tier": "paid", "cost": 0.05}',
    "writing_free": 'Only fix spelling, grammar, and punctuation. Do not rephrase. Return pure JSON only, no markdown: {"rewritten": "corrected text", "changes_summary": "brief description of corrections", "tier": "free", "cost": 0.00}',
    "writing_paid": 'Follow the instruction exactly: {instruction}. Preserve the author meaning. Do not add facts. Return pure JSON only, no markdown: {"rewritten": "rewritten text", "changes_summary": "description of what changed and why", "tier": "paid", "cost": 0.05}',
}

FREE_MODEL = os.getenv("GEMINI_FREE_MODEL", "gemini-2.5-flash-lite")
PAID_MODEL = os.getenv("GEMINI_PAID_MODEL", "gemini-2.5-flash")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"


def call_gemini(system_prompt: str, user_content: str, model: str) -> dict[str, Any]:
    try:
        if not GEMINI_API_KEY:
            return {"error": True, "message": "GEMINI_API_KEY is not configured."}

        payload = {
            "systemInstruction": {
                "parts": [
                    {
                        "text": f"{system_prompt} Respond in pure JSON only. No markdown. No backticks. No preamble."
                    }
                ]
            },
            "contents": [{"parts": [{"text": user_content}]}],
            "generationConfig": {
                "temperature": 0.2,
                "responseMimeType": "application/json",
            },
        }

        response = httpx.post(
            f"{GEMINI_API_BASE}/{model}:generateContent",
            params={"key": GEMINI_API_KEY},
            json=payload,
            timeout=60.0,
        )
        response.raise_for_status()
        body = response.json()
        candidates = body.get("candidates", [])
        if not candidates:
            return {"error": True, "message": "Gemini returned no candidates."}

        content = candidates[0].get("content", {})
        parts = content.get("parts", [])
        text = "".join(part.get("text", "") for part in parts).strip()
        if not text:
            return {"error": True, "message": "Gemini returned empty text."}

        return _parse_json_text(text)
    except Exception as exc:
        return {"error": True, "message": str(exc)}


def _parse_json_text(text: str) -> dict[str, Any]:
    candidate = text.strip()
    if candidate.startswith("```"):
        lines = candidate.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        candidate = "\n".join(lines).strip()
    return json.loads(candidate)
