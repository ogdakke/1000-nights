"""Fetch source-volume covers listed in Project Gutenberg's RDF metadata.

Only books whose RDF says "Public domain in the USA" are copied. Images are
kept locally because Gutenberg does not serve images for third-party inlining.
Rerunning this script skips covers already present and keeps a review manifest.
"""

from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import urlparse
import json
import re
import time
import xml.etree.ElementTree as ET

import requests


ROOT = Path(__file__).resolve().parent.parent
CATALOG = ROOT / "data/catalog.json"
MANIFEST = ROOT / "data/image-sources.json"
OUTPUT = ROOT / "public/images"
NS = {
    "pg": "http://www.gutenberg.org/2009/pgterms/",
    "dc": "http://purl.org/dc/terms/",
    "rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
}


def fetch(url):
    for attempt in range(3):
        try:
            response = requests.get(url, timeout=25, headers={"User-Agent": "ThousandNightsImageCatalog/1.0 (public book cover research)"})
            if response.status_code in (429, 500, 502, 503, 504):
                time.sleep(2 ** attempt)
                continue
            response.raise_for_status()
            return response
        except requests.RequestException:
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)
    raise RuntimeError(f"Could not fetch {url}")


def load_ids():
    data = json.loads(CATALOG.read_text())
    rows = data if isinstance(data, list) else data["readings"]
    ids = set()
    for row in rows:
        if row["link_status"] in ("broken", "content_mismatch") and not row.get("corrected_url"):
            continue
        url = row.get("corrected_url") or row.get("original_url") or ""
        match = re.fullmatch(r"/ebooks/(\d+)", urlparse(url).path)
        if urlparse(url).hostname == "www.gutenberg.org" and match:
            ids.add(int(match.group(1)))
    return sorted(ids)


def get_cover(book_id):
    page = f"https://www.gutenberg.org/ebooks/{book_id}"
    try:
        root = ET.fromstring(fetch(page + ".rdf").content)
        ebook = root.find("pg:ebook", NS)
        if ebook is None:
            raise ValueError("RDF has no ebook record")
        title = ebook.findtext("dc:title", default="", namespaces=NS).strip()
        rights = ebook.findtext("dc:rights", default="", namespaces=NS).strip()
        if rights != "Public domain in the USA.":
            return str(book_id), {"status": "rights_review", "source_page": page, "title": title, "rights": rights}
        cover = next((item.attrib.get(f"{{{NS['rdf']}}}about") for item in root.findall(".//pg:file", NS)
                      if re.search(r"\.cover\.medium\.jpe?g$", item.attrib.get(f"{{{NS['rdf']}}}about", ""))), None)
        if not cover:
            return str(book_id), {"status": "no_cover", "source_page": page, "title": title, "rights": rights}
        path = OUTPUT / f"gutenberg-{book_id}.jpg"
        if not path.exists():
            image = fetch(cover)
            if not image.content.startswith(b"\xff\xd8\xff") or len(image.content) < 1000:
                raise ValueError("Cover response was not a usable JPEG")
            path.write_bytes(image.content)
        return str(book_id), {
            "status": "downloaded", "source_page": page, "source_image": cover,
            "image_url": f"/images/{path.name}", "title": title, "rights": rights,
            "credit": "Project Gutenberg",
        }
    except (requests.RequestException, ET.ParseError, ValueError, RuntimeError) as error:
        return str(book_id), {"status": "fetch_error", "source_page": page, "error": str(error)}


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    previous = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}
    ids = load_ids()
    results = dict(previous)
    pending = [book_id for book_id in ids if previous.get(str(book_id), {}).get("status") != "downloaded"
               or not (OUTPUT / f"gutenberg-{book_id}.jpg").exists()]
    with ThreadPoolExecutor(max_workers=3) as pool:
        jobs = {pool.submit(get_cover, book_id): book_id for book_id in pending}
        for job in as_completed(jobs):
            book_id, result = job.result()
            results[book_id] = result
            print(f"{book_id}: {result['status']}", flush=True)
    MANIFEST.write_text(json.dumps({str(book_id): results[str(book_id)] for book_id in ids}, indent=2, ensure_ascii=False) + "\n")
    counts = {}
    for item in results.values():
        counts[item["status"]] = counts.get(item["status"], 0) + 1
    print(f"{len(ids)} source volumes: {counts}")


if __name__ == "__main__":
    main()
