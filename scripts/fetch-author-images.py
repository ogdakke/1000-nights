"""Download public-domain author portraits for readings without source covers."""

from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import quote, urlparse
import json
import re
import time

import requests


ROOT = Path(__file__).resolve().parent.parent
CATALOG = ROOT / "data/catalog.json"
MANIFEST = ROOT / "data/author-images.json"
OUTPUT = ROOT / "public/images"
HEADERS = {"User-Agent": "ThousandNightsImageCatalog/1.0 (public literary catalog)"}
CURATED_FILES = {
    "Catullus": ("Bakalovich catullus.jpg", "Painting depicting Catullus"),
    "Charles Waterton": ("Charles Waterton.jpg", "Portrait of Charles Waterton"),
    "George Anson": ("George Anson, 1st Baron Anson, Admiral of the Fleet, 1697-1762 RMG L8416.jpg", "Portrait of Admiral George Anson"),
    "George J. Romanes": ("George John Romanes, photograph by Elliott & Fry.jpg", "Portrait of George J. Romanes"),
    "Heinrich Schliemann": ("Heinrich Schliemann, half-length portrait, facing front LCCN96516246.jpg", "Portrait of Heinrich Schliemann"),
    "John Masefield": ("John Masefield by Alvin Langdon Coburn, January 13, 1913, photogravure, from the National Portrait Gallery - NPG-S-NPG 87 288 cc.jpg", "Portrait of John Masefield"),
    "Richard Lovelace": ("RichardLovelace.jpg", "Portrait of Richard Lovelace"),
    "Robert Herrick": ("Robert Herrick (poet).jpg", "Portrait of Robert Herrick"),
    "Seneca": ("Peter Paul Rubens - Brustbild des Philosophen Seneca - 178 - Staatliche Kunsthalle Karlsruhe.jpg", "Later painted depiction of Seneca"),
    "Sir John Suckling": ("Van Dyck - Sir John Suckling, ca. 1638.jpg", "Portrait of Sir John Suckling"),
    "Wilfred Owen": ("Wilfred Owen.png", "Portrait of Wilfred Owen"),
}


class PlainText(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []

    def handle_data(self, data):
        self.parts.append(data)


def plain(value):
    parser = PlainText()
    parser.feed(value or "")
    return " ".join("".join(parser.parts).split())


def get(url, params=None):
    last_status = None
    for attempt in range(3):
        try:
            response = requests.get(url, params=params, headers=HEADERS, timeout=25)
            last_status = response.status_code
            if response.status_code in (429, 500, 502, 503, 504):
                time.sleep(2 ** attempt)
                continue
            response.raise_for_status()
            return response
        except requests.RequestException:
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)
    raise RuntimeError(f"Request failed: HTTP {last_status}")


def chunks(items, size):
    for start in range(0, len(items), size):
        yield items[start:start + size]


def main():
    data = json.loads(CATALOG.read_text())
    rows = data if isinstance(data, list) else data["readings"]
    covers = json.loads((ROOT / "data/image-sources.json").read_text())
    authors = set()
    for row in rows:
        if not row.get("author"):
            continue
        url = row.get("corrected_url") or row.get("original_url") or ""
        match = re.fullmatch(r"/ebooks/(\d+)", urlparse(url).path)
        book_id = match.group(1) if urlparse(url).hostname == "www.gutenberg.org" and match else None
        cover = book_id and covers.get(book_id, {}).get("status") == "downloaded" and (
            row.get("corrected_url") or row["link_status"] not in ("broken", "content_mismatch"))
        if not cover:
            authors.add(row["author"])
    authors = sorted(authors)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    previous = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}
    result = {author: previous[author] for author in authors if previous.get(author, {}).get("status") == "downloaded"
              and (ROOT / "public" / previous[author]["image_url"].lstrip("/")).exists()}
    pending = [author for author in authors if author not in result]
    for batch in chunks(pending, 10):
        try:
            pages = get("https://en.wikipedia.org/w/api.php", {
                "action": "query", "format": "json", "redirects": "1", "titles": "|".join(batch),
                "prop": "pageimages", "piprop": "name", "pilimit": "max",
            }).json()["query"]
            redirects = {r["from"]: r["to"] for r in pages.get("redirects", [])}
            page_by_title = {page["title"]: page for page in pages["pages"].values()}
            for author in batch:
                page = page_by_title.get(redirects.get(author, author), {})
                filename = page.get("pageimage")
                result[author] = {"status": "candidate" if filename else "no_portrait", "wiki_page": page.get("title"), "file": filename}
        except (requests.RequestException, KeyError, ValueError, RuntimeError) as error:
            for author in batch:
                result[author] = {"status": "fetch_error", "error": str(error)}
    for author, (filename, alt) in CURATED_FILES.items():
        if author in pending:
            result[author] = {"status": "candidate", "file": filename, "image_alt": alt}
    candidates = [(author, item["file"]) for author, item in result.items() if item["status"] == "candidate"]
    for batch in chunks(candidates, 8):
        titles = [f"File:{filename.replace('_', ' ')}" for _, filename in batch]
        try:
            pages = get("https://commons.wikimedia.org/w/api.php", {
                "action": "query", "format": "json", "titles": "|".join(titles),
                "prop": "imageinfo", "iiprop": "url|extmetadata|mime", "iiurlwidth": "320",
            }).json()["query"]["pages"]
            files = {page["title"].casefold(): page for page in pages.values()}
            for author, filename in batch:
                title = f"File:{filename.replace('_', ' ')}"
                page = files.get(title.casefold(), {})
                info = (page.get("imageinfo") or [{}])[0]
                metadata = info.get("extmetadata", {})
                license_name = metadata.get("LicenseShortName", {}).get("value", "")
                source_page = info.get("descriptionurl")
                result[author].update({"source_page": source_page, "license": license_name,
                                       "artist": plain(metadata.get("Artist", {}).get("value", ""))})
                if license_name not in ("Public domain", "CC0"):
                    result[author]["status"] = "rights_review"
                    continue
                image_url = info.get("thumburl")
                if not image_url:
                    result[author]["status"] = "no_thumbnail"
                    continue
                response = get(image_url)
                content = response.content
                if content.startswith(b"\xff\xd8\xff"):
                    extension = "jpg"
                elif content.startswith(b"\x89PNG\r\n\x1a\n"):
                    extension = "png"
                elif content.startswith(b"RIFF") and content[8:12] == b"WEBP":
                    extension = "webp"
                else:
                    result[author]["status"] = "unsupported_format"
                    continue
                path = OUTPUT / f"author-{re.sub(r'[^a-z0-9]+', '-', author.lower()).strip('-')}.{extension}"
                path.write_bytes(content)
                result[author].update({"status": "downloaded", "source_image": info.get("url"),
                                       "image_url": f"/images/{path.name}",
                                       "credit": plain(metadata.get("Artist", {}).get("value", "")) or "Wikimedia Commons"})
        except (requests.RequestException, KeyError, ValueError, RuntimeError) as error:
            for author, _ in batch:
                if result[author]["status"] == "candidate":
                    result[author].update({"status": "fetch_error", "error": str(error)})
    MANIFEST.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n")
    counts = {}
    for item in result.values():
        counts[item["status"]] = counts.get(item["status"], 0) + 1
    print(f"{len(authors)} authors: {counts}")


if __name__ == "__main__":
    main()
