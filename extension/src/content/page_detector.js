"use strict";
const FREE_ACTION = 0;
const PAID_SUMMARY = 0.25;
const detectPageType = (url, title) => {
    if (!url || url === "about:blank" || url.startsWith("chrome://newtab")) {
        return none();
    }
    let parsed;
    try {
        parsed = new URL(url);
    }
    catch {
        return none();
    }
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    const path = parsed.pathname || "/";
    const lowerPath = path.toLowerCase();
    const titleText = (title || "").toLowerCase();
    if (isLocalPage(host) || isSearchHome(host) || isSocialHome(host) || isStoreHome(host)) {
        return none();
    }
    if (isBareHomepage(parsed)) {
        if (host === "youtube.com") {
            return none();
        }
        return none();
    }
    const algorandProtocol = window.ALGO_PROTOCOLS?.[host];
    if (algorandProtocol) {
        return {
            type: "algorand_defi",
            action: "deep_risk_scan",
            label: "Deep Risk Scan",
            price: 0.1,
            tier: "paid"
        };
    }
    if (host === "youtube.com" && lowerPath === "/watch") {
        return paid("youtube", "watch_ad_free", "Watch Ad-free", 0.05);
    }
    if (host === "youtube.com" && lowerPath === "/playlist") {
        return paid("youtube_playlist", "playlist_ad_free", "Playlist Ad-free", 0.3);
    }
    if (host === "youtube.com" && lowerPath === "/results") {
        return free("youtube_search", "summarize_results", "Summarize Results");
    }
    if (host === "vimeo.com") {
        return paid("vimeo", "watch_ad_free", "Watch Ad-free", 0.05);
    }
    if (host === "twitch.tv") {
        return paid("twitch", "watch_ad_free", "Watch Ad-free", 0.05);
    }
    if (host.includes("spotify.com")) {
        return paid("spotify", "listen_ad_free", "Listen Ad-free", 0.1);
    }
    if (host.includes("soundcloud.com")) {
        return paid("soundcloud", "listen_ad_free", "Listen Ad-free", 0.05);
    }
    if (lowerPath.endsWith(".pdf")) {
        return paid("pdf_document", "summarize_pdf", "Summarize PDF", PAID_SUMMARY);
    }
    if (matchesHost(host, [
        "arxiv.org",
        "pubmed.ncbi.nlm.nih.gov",
        "researchgate.net",
        "semanticscholar.org",
        "scholar.google.com",
        "jstor.org",
        "nature.com",
        "science.org",
        "ieee.org",
        "springer.com",
        "dl.acm.org"
    ])) {
        return paid("research_paper", "deep_summary", "Deep Summary", PAID_SUMMARY);
    }
    if (host.startsWith("docs.") ||
        host.includes("readthedocs.io") ||
        host === "developer.mozilla.org" ||
        host === "devdocs.io" ||
        host.includes("notion.so") ||
        host.includes("gitbook.io") ||
        lowerPath.includes("/docs/") ||
        lowerPath.includes("/wiki/") ||
        isConfluencePage(host, lowerPath)) {
        return free("documentation", "summarize_docs", "Summarize Docs");
    }
    if (isMediumArticle(host, lowerPath) || isSubstackArticle(host, lowerPath)) {
        return free("article", "summarize", "Summarize");
    }
    if (matchesHost(host, ["nytimes.com", "wsj.com", "ft.com", "economist.com", "theatlantic.com", "bloomberg.com"])) {
        return paid("paywalled_article", "unlock_and_summarize", "Unlock + Summarize", PAID_SUMMARY);
    }
    if (matchesHost(host, ["wired.com", "theverge.com", "techcrunch.com", "arstechnica.com", "reuters.com"])) {
        return free("article", "summarize", "Summarize");
    }
    if (host === "news.ycombinator.com" || titleText.includes("hacker news")) {
        return free("article", "summarize_comments", "Summarize Comments");
    }
    if (host === "bbc.com" || host.endsWith(".bbc.com")) {
        if (lowerPath.startsWith("/news")) {
            return free("article", "summarize", "Summarize");
        }
    }
    if (host === "reddit.com" || host.endsWith(".reddit.com")) {
        if (/^\/r\/[^/]+\/comments\//.test(lowerPath)) {
            return free("article", "summarize_thread", "Summarize Thread");
        }
        return none();
    }
    if (host === "github.com") {
        const segments = splitPath(lowerPath);
        if (segments.length >= 2) {
            if (segments.length === 2) {
                return free("github_readme", "summarize_readme", "Summarize README");
            }
            return free("github_repo", "explain_repo", "Explain this Repo");
        }
        return none();
    }
    if (host === "stackoverflow.com") {
        if (lowerPath.startsWith("/questions/")) {
            return free("stackoverflow", "summarize_answers", "Summarize Answers");
        }
        return free("stackoverflow", "summarize_answers", "Summarize Answers");
    }
    if (host.endsWith("wikipedia.org") && lowerPath.startsWith("/wiki/")) {
        return free("wikipedia", "summarize_article", "Summarize Article");
    }
    if (containsLegalPath(lowerPath)) {
        return free("legal", "summarize_terms", "Summarize Terms");
    }
    if (host === "sec.gov") {
        return paid("financial_doc", "summarize_filing", "Summarize Filing", PAID_SUMMARY);
    }
    return {
        type: "unknown",
        action: "check_backend",
        label: "",
        price: 0,
        tier: "backend"
    };
};
window.detectPageType = detectPageType;
function free(type, action, label) {
    return {
        type,
        action,
        label,
        price: FREE_ACTION,
        tier: "free"
    };
}
function paid(type, action, label, price) {
    return {
        type,
        action,
        label,
        price,
        tier: "paid"
    };
}
function none() {
    return {
        type: "none",
        action: "none",
        label: "",
        price: 0,
        tier: "none"
    };
}
function splitPath(pathname) {
    return pathname.split("/").filter(Boolean);
}
function matchesHost(host, hosts) {
    return hosts.some((candidate) => host === candidate || host.endsWith(`.${candidate}`));
}
function isLocalPage(host) {
    return host === "localhost" || host === "127.0.0.1" || host.endsWith(".local");
}
function isSearchHome(host) {
    return host === "google.com" || host.endsWith(".google.com") || host === "bing.com" || host === "duckduckgo.com";
}
function isSocialHome(host) {
    return host === "twitter.com" || host === "x.com" || host === "instagram.com" || host === "facebook.com";
}
function isStoreHome(host) {
    return host === "amazon.com" || host.endsWith(".amazon.com");
}
function isBareHomepage(parsed) {
    return parsed.pathname === "/" && !parsed.search && !parsed.hash;
}
function isConfluencePage(host, lowerPath) {
    return host.includes("atlassian.net") && lowerPath.includes("/wiki/");
}
function isMediumArticle(host, lowerPath) {
    if (!host.endsWith("medium.com")) {
        return false;
    }
    return lowerPath !== "/" && splitPath(lowerPath).length >= 1;
}
function isSubstackArticle(host, lowerPath) {
    return host.endsWith("substack.com") && lowerPath.startsWith("/p/");
}
function containsLegalPath(lowerPath) {
    return ["/terms", "/privacy", "/legal", "/tos"].some((segment) => lowerPath.includes(segment));
}
