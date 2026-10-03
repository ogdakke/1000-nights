# Link audit

Checked 2026-10-03 against the original [Archive.org DOCX](https://archive.org/download/1000-nights-reading-program/1000-Nights-Reading-Program.docx). The document has 1,000 numbered days and three linked readings per day. All displayed URLs match their DOCX hyperlink targets.

| Result                | Readings | Meaning                                                                                                                                                                                                    |
| --------------------- | -------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `verified`            |    1,728 | The target returned HTTP 200 and its text included the named work, or a numbered Shakespeare sonnet appeared in the complete sonnet collection.                                                            |
| `content_mismatch`    |      445 | The target book credits a different author or is a different standalone work. Poe stories that occur in another volume also fall here.                                                                     |
| `content_unconfirmed` |      529 | The destination responded, but an exact or simplified title phrase was absent from extractable text. This does not prove a mismatch, especially for anthologies, alternate translations, and broad labels. |
| `access_blocked`      |      269 | The target returned a challenge or access code, usually Poetry Foundation HTTP 403. The audit cannot establish whether a browser can open the page or whether it has the named poem.                       |
| `broken`              |       29 | The target returned HTTP 404. These are 20 distinct URLs.                                                                                                                                                  |

The inventory has 465 distinct URLs. `catalog.json` keeps a row for every reading; `link-audit.csv` is a review queue with status and evidence for every row. Each `id` is stable within the source document, such as `night-0001-1`. `corrected_url` is set only where a replacement was checked, rather than guessed.

The audit has checked replacements for 285 readings. This includes 15 readings with broken original links and 270 with original links that lead to the wrong work or the wrong volume. The supplied Gutenberg 1964 page for Sir Philip Sidney's _An Apology for Poetry_ returns 404. [Gutenberg 1962](https://www.gutenberg.org/ebooks/1962) contains the same work under the title _A Defence of Poesie_. Nine Poetry Foundation URLs whose current pages show the matching poem and author are also corrected. The exact replacements and their evidence are in `corrected_url` and `replacement_evidence`.

The checker downloads the public Gutenberg text file when available, and uses the original URL for other sites. A missing Gutenberg text derivative is not treated as a broken book page: the checker tests the canonical landing page with HEAD. It does not infer a replacement from a similar title. The script is `audit_source.py` and can regenerate the files.

Before publishing links as confirmed, review `content_unconfirmed` and `access_blocked` rows manually. The count of `verified` entries is evidence of a matching title or numbered section within a target, not a claim that every translation or edition is the exact one the reading program intended. The `content_mismatch` entries without `corrected_url` need a replacement source.
