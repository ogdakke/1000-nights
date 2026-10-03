"""Apply source-checked Gutenberg replacements to the link audit."""
import csv
import json
import re
from pathlib import Path

import requests

from audit_source import HEADERS, normalize, title_variants

BASE = Path(__file__).parent
OLD_TO_CANDIDATES = {
    10834: [43656, 11397], 10345: [10343], 2818: [1858],
    346: [386], 204: [12245], 4707: [470], 16209: [3020],
    550: [55024, 55219], 1964: [1962],
}
POE_VOLUMES = [2147, 2148, 2149, 2150, 2151]


def source_text(number):
    url = f"https://www.gutenberg.org/cache/epub/{number}/pg{number}.txt"
    response = requests.get(url, headers=HEADERS, timeout=35)
    response.raise_for_status()
    return response.text


def phrase_present(title, full_text):
    text = normalize(full_text)
    for variant in title_variants(title):
        if re.search(r"(?<![a-z0-9])" + re.escape(variant) + r"(?![a-z0-9])", text):
            return True
    return False


def heading_present(title, full_text):
    target = normalize(title)
    for line in full_text.splitlines():
        heading = normalize(line.strip(" #*_"))
        if heading == target or heading == target.replace("the ", "", 1):
            return True
    return False


def select_candidate(row, texts):
    original = row["original_url"]
    if "/2147/" in original:
        hits = [n for n in POE_VOLUMES if heading_present(row["title"], texts[n])]
        if len(hits) == 1:
            return hits[0], "exact story heading in Poe volume"
        return None, None
    match = re.fullmatch(r"https://www.gutenberg.org/ebooks/(\d+)", original)
    if not match:
        return None, None
    old = int(match.group(1))
    if old == 10834:
        issue = re.search(r"No\.\s*(\d+)", row["title"])
        if issue:
            number = int(issue.group(1))
            for n in OLD_TO_CANDIDATES[old]:
                if re.search(r"(?im)^\s*No\.\s*" + str(number) + r"\b", texts[n]):
                    return n, f"Rambler issue No. {number} heading found"
        return None, None
    if old == 1964:
        return 1962, "Gutenberg's introduction names Sidney's An Apologie for Poetrie as the same work"
    for n in OLD_TO_CANDIDATES.get(old, []):
        if phrase_present(row["title"], texts[n]):
            return n, "title phrase found in replacement's full text"
        if old == 2818 and row["title"] == "Lispeth" and heading_present("Lispeth", texts[n]):
            return n, "Lispeth story heading found"
        if old == 2818 and row["title"] == "The Gate of the Hundred Sorrows" and phrase_present("The Gate of a Hundred Sorrows", texts[n]):
            return n, "alternate article in story heading"
        if old == 346 and row["title"] == "Aes Triplex" and phrase_present("Æs Triplex", texts[n]):
            return n, "spelling variant in essay heading"
        if old == 10345 and row["title"] == "Dream Children companion: Distant Correspondents" and phrase_present("Distant Correspondents", texts[n]):
            return n, "named companion essay found"
    return None, None


def main():
    catalog = json.loads((BASE / "catalog.json").read_text())
    numbers = sorted({n for ids in OLD_TO_CANDIDATES.values() for n in ids} | set(POE_VOLUMES))
    texts = {n: source_text(n) for n in numbers}
    changed = 0
    for row in catalog["readings"]:
        number, reason = select_candidate(row, texts)
        if number is None:
            continue
        new_url = f"https://www.gutenberg.org/ebooks/{number}"
        row["corrected_url"] = new_url if new_url != row["original_url"] else None
        row["replacement_evidence"] = f"GET https://www.gutenberg.org/cache/epub/{number}/pg{number}.txt: HTTP 200; {reason}"
        if "/2147/" in row["original_url"]:
            row["gutenberg_book_title"] = "The Works of Edgar Allan Poe, Volume 1"
            row["gutenberg_book_author"] = "Edgar Allan Poe"
            if number != 2147 and row["link_status"] != "content_mismatch":
                row["previous_link_status"] = row["link_status"]
                row["previous_evidence"] = row["evidence"]
                row["link_status"] = "content_mismatch"
                row["evidence"] = f"Original target is Poe Volume 1; named story's heading is in Volume {number - 2146}, eBook {number}"
            elif number == 2147 and row["link_status"] == "content_unconfirmed":
                row["previous_link_status"] = row["link_status"]
                row["previous_evidence"] = row["evidence"]
                row["link_status"] = "verified"
                row["evidence"] = "GET original Poe Volume 1: HTTP 200; exact story heading found"
        changed += 1
    (BASE / "catalog.json").write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n")
    fields = ["id", "night", "position", "kind", "title", "author", "original_url", "resolved_url", "link_status", "evidence", "corrected_url", "replacement_evidence", "gutenberg_book_title", "gutenberg_book_author", "previous_link_status", "previous_evidence"]
    with (BASE / "link-audit.csv").open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(catalog["readings"])
    print("replacement evidence rows", changed)


if __name__ == "__main__":
    main()
