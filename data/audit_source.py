"""Extract the original Archive.org DOCX and audit its external reading links.

Run with: python3 data/audit_source.py
"""
import csv
import io
import json
import re
import unicodedata
import zipfile
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse

import requests
import xml.etree.ElementTree as ET


SOURCE = "https://archive.org/download/1000-nights-reading-program/1000-Nights-Reading-Program.docx"
OUT = Path(__file__).parent
W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
NS = {"w": W}
HEADERS = {"User-Agent": "1000-Nights-Link-Audit/0.1 (catalog verification)"}
CHECKED_REPLACEMENTS = {
    "https://www.gutenberg.org/ebooks/1964": "https://www.gutenberg.org/ebooks/6320",
    "https://www.poetryfoundation.org/poems/42889/hope-is-the-thing-with-feathers-254": "https://www.poetryfoundation.org/poems/42889/hope-is-the-thing-with-feathers-314",
    "https://www.poetryfoundation.org/poems/43654/the-chimney-sweeper-songs-of-innocence": "https://www.poetryfoundation.org/poems/43654/the-chimney-sweeper-when-my-mother-died-i-was-very-young",
    "https://www.poetryfoundation.org/poems/43673/london": "https://www.poetryfoundation.org/poems/43673/london-56d222777e969",
    "https://www.poetryfoundation.org/poems/148652/nothing-gold-can-stay": "https://www.poetryfoundation.org/poems/148652/nothing-gold-can-stay-5c095cc5ab679",
    "https://www.poetryfoundation.org/poems/43741/if-thou-must-love-me-let-it-be-for-nought-sonnet-14": "https://www.poetryfoundation.org/poems/43736/sonnets-from-the-portuguese-14-if-thou-must-love-me-let-it-be-for-nought",
    "https://www.poetryfoundation.org/poems/43285/the-wild-swans-at-coole": "https://www.poetryfoundation.org/poems/43288/the-wild-swans-at-coole",
    "https://www.poetryfoundation.org/poems/43566/dover-beach": "https://www.poetryfoundation.org/poems/43588/dover-beach",
    "https://www.poetryfoundation.org/poems/43670/the-lamb": "https://www.poetryfoundation.org/poems/43670/the-lamb-56d222765a3e1",
    "https://www.poetryfoundation.org/poems/43597/the-scholar-gipsy": "https://www.poetryfoundation.org/poems/43606/the-scholar-gipsy",
}


class VisibleText(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self.skip += 1

    def handle_endtag(self, tag):
        if tag in ("script", "style") and self.skip:
            self.skip -= 1

    def handle_data(self, data):
        if not self.skip:
            self.parts.append(data)


def normalize(value):
    value = unicodedata.normalize("NFKD", value).lower()
    value = "".join(c for c in value if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", value).strip()


def extract():
    doc = requests.get(SOURCE, headers=HEADERS, timeout=30)
    doc.raise_for_status()
    archive = zipfile.ZipFile(io.BytesIO(doc.content))
    rel_root = ET.fromstring(archive.read("word/_rels/document.xml.rels"))
    relationships = {item.attrib["Id"]: item.attrib.get("Target") for item in rel_root}
    root = ET.fromstring(archive.read("word/document.xml"))
    rows = []
    night = None
    position = 0
    for paragraph in root.findall(".//w:p", NS):
        paragraph_text = "".join(t.text or "" for t in paragraph.findall(".//w:t", NS))
        day_match = re.fullmatch(r"Day\s+(\d+)", paragraph_text.strip())
        if day_match:
            night = int(day_match.group(1))
            position = 0
            continue
        for hyperlink in paragraph.findall(".//w:hyperlink", NS):
            url = relationships.get(hyperlink.attrib.get(f"{{{R}}}id"))
            if not url or night is None:
                continue
            parts = paragraph_text.rsplit(" — ", 2)
            if len(parts) != 3:
                raise ValueError(f"Unexpected reading paragraph: {paragraph_text}")
            named, author, printed_url = parts
            kind, title = named.split(": ", 1)
            position += 1
            rows.append({
                "id": f"night-{night:04d}-{position}",
                "night": night,
                "position": position,
                "title": title.strip(),
                "author": author.strip(),
                "kind": kind.strip().lower().replace(" ", "_"),
                "original_url": url,
                "resolved_url": None,
                "link_status": "not_checked",
                "evidence": "",
                "corrected_url": None,
                "source_url": SOURCE,
                "source_url_matches_display": url == printed_url,
            })
    assert len(rows) == 3000, len(rows)
    assert set(row["night"] for row in rows) == set(range(1, 1001))
    assert Counter(row["night"] for row in rows) == Counter({i: 3 for i in range(1, 1001)})
    return rows


def fetch_url(url):
    parsed = urlparse(url)
    if parsed.hostname == "www.gutenberg.org":
        ebook_match = re.fullmatch(r"/ebooks/(\d+)", parsed.path)
        if ebook_match:
            number = ebook_match.group(1)
            fetch = f"https://www.gutenberg.org/cache/epub/{number}/pg{number}.txt"
        else:
            fetch = url
    else:
        fetch = url
    try:
        response = requests.get(fetch, headers=HEADERS, timeout=30, allow_redirects=True)
        if parsed.hostname == "www.gutenberg.org" and fetch != url and response.status_code == 404:
            # Some live ebooks have no generated plain-text file. Check the
            # canonical page without scraping its HTML content.
            landing = requests.head(url, headers=HEADERS, timeout=20, allow_redirects=True)
            if landing.status_code < 400:
                return {
                    "http_status": landing.status_code,
                    "resolved_url": landing.url,
                    "content": "",
                    "fetch_url": url,
                    "bytes": 0,
                }
        response.encoding = response.apparent_encoding or response.encoding
        content = response.text
        if "html" in response.headers.get("content-type", ""):
            parser = VisibleText()
            parser.feed(content)
            content = " ".join(parser.parts)
        return {
            "http_status": response.status_code,
            "resolved_url": response.url,
            "content": normalize(content),
            "fetch_url": fetch,
            "bytes": len(response.content),
        }
    except requests.RequestException as error:
        return {"http_status": None, "resolved_url": None, "content": "", "fetch_url": fetch, "error": str(error)}


def title_variants(title):
    candidates = [title]
    if " (" in title:
        candidates.append(title.split(" (", 1)[0])
    if " — " in title:
        candidates.extend(part for part in title.split(" — ") if len(normalize(part)) > 8)
    candidates = [normalize(c) for c in candidates]
    return [c for c in candidates if len(c) >= 8 and not c.startswith("emily dickinson poem selection")]


def classify(row, result):
    code = result["http_status"]
    row["resolved_url"] = result["resolved_url"]
    row["corrected_url"] = CHECKED_REPLACEMENTS.get(row["original_url"])
    if code is None:
        row["link_status"] = "request_failed"
        row["evidence"] = f"GET {result['fetch_url']}: {result['error']}"
        return
    if code in (401, 403, 429):
        row["link_status"] = "access_blocked"
        row["evidence"] = f"GET {result['fetch_url']}: HTTP {code}; content could not be inspected"
        return
    if code >= 400:
        row["link_status"] = "broken"
        row["evidence"] = f"GET {result['fetch_url']}: HTTP {code}"
        if row["corrected_url"]:
            row["evidence"] += f"; replacement page with matching work and author: {row['corrected_url']}"
        return
    content = result["content"]
    sonnet = re.fullmatch(r"Sonnet\s+(\d+)", row["title"], re.I)
    if row["original_url"] == "https://www.gutenberg.org/ebooks/1041" and sonnet and 1 <= int(sonnet.group(1)) <= 154:
        row["link_status"] = "verified"
        row["evidence"] = f"GET {result['fetch_url']}: HTTP {code}; Shakespeare's Sonnets contains numbered sonnets I–CLIV, including {sonnet.group(1)}"
        return
    variants = title_variants(row["title"])
    matched = next((variant for variant in variants if re.search(r"(?<![a-z0-9])" + re.escape(variant) + r"(?![a-z0-9])", content)), None)
    if matched:
        row["link_status"] = "verified"
        row["evidence"] = f"GET {result['fetch_url']}: HTTP {code}; title phrase '{matched}' found in destination text"
    else:
        row["link_status"] = "content_unconfirmed"
        row["evidence"] = f"GET {result['fetch_url']}: HTTP {code}; title phrase not found in destination text"


def main():
    rows = extract()
    urls = sorted(set(row["original_url"] for row in rows))
    results = {}
    with ThreadPoolExecutor(max_workers=8) as pool:
        tasks = {pool.submit(fetch_url, url): url for url in urls}
        for i, task in enumerate(as_completed(tasks), 1):
            url = tasks[task]
            results[url] = task.result()
            if i % 50 == 0:
                print(f"checked {i}/{len(urls)} unique URLs", flush=True)
    for row in rows:
        classify(row, results[row["original_url"]])
    checked_at = datetime.now(timezone.utc).isoformat()
    catalog = {"source": SOURCE, "checked_at": checked_at, "readings": rows}
    (OUT / "catalog.json").write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n")
    fields = ["id", "night", "position", "kind", "title", "author", "original_url", "resolved_url", "link_status", "evidence", "corrected_url"]
    with (OUT / "link-audit.csv").open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)
    print("readings", len(rows), "unique URLs", len(urls))
    print("statuses", dict(Counter(row["link_status"] for row in rows)))


if __name__ == "__main__":
    main()
