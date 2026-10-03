"""Copy reviewed public-domain work scans from Wikimedia Commons."""

from pathlib import Path
import json
import re

import requests


ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "public/images"
MANIFEST = ROOT / "data/work-image-sources.json"
HEADERS = {"User-Agent": "ThousandNightsImageCatalog/1.1 (public literary catalog; https://thousand-nights.dwe.workers.dev/)"}
WORKS = [
    ("William Langland", "Piers Plowman — Prologue (excerpt)", "Piers Ploughman Decoration 02.png", "Illustration from an early manuscript of Piers Plowman"),
    ("Walter Besant / Henry James", "The Art of Fiction (Besant lecture response context)", "The art of fiction (IA cu31924027192941).pdf", "Cover scan of The Art of Fiction (1884)"),
    ("Anonymous (Old Irish, tr.)", "The Scholar and His Cat, Pangur Bán", "Reichenauer Schulheft 1v 2r kl1.jpg", "Manuscript page containing Pangur Bán"),
    ("Various Japanese poets", "Manyōshū selections (tr.)", "Manyoshu Aigami vol9 p2.jpg", "Man'yōshū manuscript fragment"),
    ("Anonymous", "Everyman (morality play excerpt as poem)", "Everyman first page.jpg", "First page of an early edition of Everyman"),
]


def slug(value):
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    titles = "|".join(f"File:{filename}" for _, _, filename, _ in WORKS)
    response = requests.get("https://commons.wikimedia.org/w/api.php", params={
        "action": "query", "format": "json", "titles": titles,
        "prop": "imageinfo", "iiprop": "url|extmetadata|mime", "iiurlwidth": "420",
    }, headers=HEADERS, timeout=30)
    response.raise_for_status()
    files = {page["title"].casefold(): page for page in response.json()["query"]["pages"].values()}
    records = []
    for author, title, filename, alt in WORKS:
        page = files.get(f"File:{filename}".casefold(), {})
        info = (page.get("imageinfo") or [{}])[0]
        license_name = info.get("extmetadata", {}).get("LicenseShortName", {}).get("value", "")
        if license_name not in ("Public domain", "CC0"):
            raise ValueError(f"Unverified rights for {filename}: {license_name}")
        image_url = info.get("thumburl")
        if not image_url:
            raise ValueError(f"No thumbnail for {filename}")
        image = requests.get(image_url, headers=HEADERS, timeout=30)
        image.raise_for_status()
        content = image.content
        if content.startswith(b"\xff\xd8\xff"):
            extension = "jpg"
        elif content.startswith(b"\x89PNG\r\n\x1a\n"):
            extension = "png"
        else:
            raise ValueError(f"Unsupported image for {filename}")
        path = OUTPUT / f"work-{slug(author)}-{slug(title)[:56]}.{extension}"
        path.write_bytes(content)
        records.append({
            "author": author, "title": title, "status": "downloaded",
            "source_page": info["descriptionurl"], "source_image": info["url"],
            "image_url": f"/images/{path.name}", "rights": license_name,
            "credit": "Wikimedia Commons", "image_alt": alt,
        })
        print(f"{author}: {title} -> {path.name}")
    MANIFEST.write_text(json.dumps(records, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
