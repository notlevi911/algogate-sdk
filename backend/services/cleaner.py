from html.parser import HTMLParser


MAX_TEXT_LENGTH = 12000
SKIP_TAGS = {"script", "style", "nav", "footer", "header", "aside"}
CONTENT_TAGS = {"main", "article"}
CONTENT_HINTS = {"content", "article", "markdown", "readme", "docs", "documentation", "post"}


class ContentParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.skip_stack: list[bool] = []
        self.content_stack: list[bool] = []
        self.primary_parts: list[str] = []
        self.fallback_parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        lower_tag = tag.lower()
        attrs_dict = {key.lower(): (value or "") for key, value in attrs}
        meta = " ".join(
            [attrs_dict.get("class", ""), attrs_dict.get("id", ""), attrs_dict.get("role", "")]
        ).lower()

        should_skip = lower_tag in SKIP_TAGS
        self.skip_stack.append(should_skip)

        is_content = lower_tag in CONTENT_TAGS or any(hint in meta for hint in CONTENT_HINTS)
        self.content_stack.append(is_content)

    def handle_endtag(self, _tag: str) -> None:
        if self.skip_stack:
            self.skip_stack.pop()
        if self.content_stack:
            self.content_stack.pop()

    def handle_data(self, data: str) -> None:
        if any(self.skip_stack):
            return

        text = " ".join(data.split())
        if not text:
            return

        if any(self.content_stack):
            self.primary_parts.append(text)
        else:
            self.fallback_parts.append(text)


def clean_html(html: str) -> str:
    parser = ContentParser()
    parser.feed(html or "")
    parser.close()

    primary = " ".join(parser.primary_parts).strip()
    fallback = " ".join(parser.fallback_parts).strip()
    text = primary if len(primary) > 200 else fallback
    text = " ".join(text.split())
    return text[:MAX_TEXT_LENGTH]
