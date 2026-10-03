"""Inspect Gutenberg source metadata and exact content evidence for catalog rows."""
import csv
import json
import re
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import requests

from audit_source import HEADERS, normalize, title_variants

BASE = Path(__file__).parent
AUTHOR_ALIASES = {"dostoevsky": "dostoyevsky", "petrarch": "petrarca"}
STANDALONE_BOOK_IDS = {41, 131, 375, 910, 986, 4517, 5200, 68283}


def credited_names(value):
    names = []
    for part in re.split(r"\s*/\s*", value):
        before = part.split("(", 1)[0].strip()
        inside = re.findall(r"\(([^)]+)\)", part)
        for candidate in [before, *inside]:
            words = re.findall(r"[a-z]+", normalize(candidate))
            if words:
                names.append(AUTHOR_ALIASES.get(words[-1], words[-1]))
    return {name for name in names if len(name) >= 4}


def same_author(row, result):
    author = normalize(result["book_author"])
    names = credited_names(row["author"])
    if not author or not names:
        return None
    if row["original_url"] == "https://www.gutenberg.org/ebooks/1404" and "madison" in names:
        # Hamilton, Madison and Jay wrote the Federalist papers together.
        return True
    return any(name in author for name in names)


def structural_title(title):
    return bool(re.search(r"(?i)\b(chapter|book\s+[ivx0-9]+|part\s+[ivx0-9]+|excerpt|opening|selection|selected|companion|sonnet|no\.\s*\d+|quatrains|psalm\s*\d+|corinthians|isaiah|job\s*\d+|ecclesiastes|gospel)\b", title))


def standalone_target(url):
    match = re.fullmatch(r"https://www.gutenberg.org/ebooks/(\d+)", url)
    return bool(match and int(match.group(1)) in STANDALONE_BOOK_IDS)


def has_title(row, result):
    content = result["content"]
    for variant in title_variants(row["title"]):
        if re.search(r"(?<![a-z0-9])" + re.escape(variant) + r"(?![a-z0-9])", content):
            return variant
        compact = variant.replace(" ", "")
        if len(compact) >= 12 and compact in result["content_compact"]:
            return variant + " (spacing variant)"
    return None


def get(url):
    match = re.fullmatch(r"https://www.gutenberg.org/ebooks/(\d+)", url)
    fetch = f"https://www.gutenberg.org/cache/epub/{match.group(1)}/pg{match.group(1)}.txt" if match else url
    try:
        response = requests.get(fetch, headers=HEADERS, timeout=35)
        response.encoding = response.apparent_encoding or response.encoding
        raw = response.text
        if response.status_code == 404 and match:
            canonical = requests.head(url, headers=HEADERS, timeout=20)
            return {"url": url, "fetch_url": fetch, "text_status": 404, "canonical_status": canonical.status_code,
                    "book_title": "", "book_author": "", "content": ""}
        header = raw.split("*** START OF", 1)[0][:12000]
        title = re.search(r"(?im)^Title:\s*(.+)$", header)
        author = re.search(r"(?im)^Author:\s*(.+)$", header)
        if not title:
            title = re.search(r"(?i)Project Gutenberg eBook of ([^\r\n<]+)", raw[:1000])
        return {"url": url, "fetch_url": fetch, "text_status": response.status_code, "canonical_status": response.status_code,
                "book_title": title.group(1).strip() if title else "", "book_author": author.group(1).strip() if author else "",
                "content": normalize(raw), "content_compact": normalize(raw).replace(" ", "")}
    except requests.RequestException as error:
        return {"url": url, "fetch_url": fetch, "text_status": None, "canonical_status": None,
                "book_title": "", "book_author": "", "content": "", "error": str(error)}


def main():
    catalog = json.loads((BASE / "catalog.json").read_text())
    rows = catalog["readings"]
    grouped = defaultdict(list)
    for row in rows:
        if "gutenberg.org" in row["original_url"]:
            grouped[row["original_url"]].append(row)
    results = {}
    with ThreadPoolExecutor(max_workers=8) as pool:
        jobs = {pool.submit(get, url): url for url in grouped}
        for i, task in enumerate(as_completed(jobs), 1):
            results[jobs[task]] = task.result()
            if i % 50 == 0:
                print(f"read {i}/{len(grouped)} Gutenberg targets", flush=True)
    fieldnames = ["url", "readings", "book_title", "book_author", "text_status", "canonical_status", "unconfirmed_titles", "verified_titles"]
    with (BASE / "gutenberg-targets.csv").open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for url in sorted(grouped):
            result = results[url]
            writer.writerow({"url": url, "readings": len(grouped[url]), "book_title": result["book_title"], "book_author": result["book_author"],
                             "text_status": result["text_status"], "canonical_status": result["canonical_status"],
                             "unconfirmed_titles": "; ".join(sorted(set(row["title"] for row in grouped[url] if row["link_status"] == "content_unconfirmed"))),
                             "verified_titles": "; ".join(sorted(set(row["title"] for row in grouped[url] if row["link_status"] == "verified")))})
    # Retain normalized text only for this run. This source is much larger than
    # the catalog and contains the works themselves.
    for row in rows:
        if row["original_url"] not in results:
            continue
        result = results[row["original_url"]]
        row["gutenberg_book_title"] = result["book_title"] or None
        row["gutenberg_book_author"] = result["book_author"] or None
        if row["link_status"] not in ("verified", "content_unconfirmed") or result["text_status"] != 200:
            continue
        author_match = same_author(row, result)
        title_match = has_title(row, result)
        mismatch_reason = None
        if author_match is False:
            mismatch_reason = "the target book credits a different author"
        elif row["original_url"] == "https://www.gutenberg.org/ebooks/10834":
            mismatch_reason = "the target is The History of Insects, not The Rambler"
        elif row["link_status"] == "content_unconfirmed" and not title_match and author_match is True and standalone_target(row["original_url"]) and not structural_title(row["title"]):
            mismatch_reason = "the named work was not found in the complete target text"
        if mismatch_reason:
            row["previous_link_status"] = row["link_status"]
            row["previous_evidence"] = row["evidence"]
            row["link_status"] = "content_mismatch"
            row["evidence"] = (f"GET {result['fetch_url']}: HTTP 200; target book '{result['book_title']}' "
                               f"by {result['book_author'] or 'uncredited author'}; {mismatch_reason}")
        elif row["link_status"] == "content_unconfirmed" and title_match and author_match is not False:
            row["previous_link_status"] = row["link_status"]
            row["previous_evidence"] = row["evidence"]
            row["link_status"] = "verified"
            row["evidence"] = f"GET {result['fetch_url']}: HTTP 200; '{title_match}' found in target text; target book '{result['book_title']}' by {result['book_author']}"
    (BASE / "catalog.json").write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n")
    fields = ["id", "night", "position", "kind", "title", "author", "original_url", "resolved_url", "link_status", "evidence", "corrected_url", "gutenberg_book_title", "gutenberg_book_author", "previous_link_status", "previous_evidence"]
    with (BASE / "link-audit.csv").open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)
    print("saved metadata for", len(results), "targets")


if __name__ == "__main__":
    main()
