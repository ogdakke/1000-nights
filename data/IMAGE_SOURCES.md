# Reading images

`image-sources.json` maps Project Gutenberg ebook IDs to copied cover images in
`public/images/`. The downloader reads the ebook's RDF record and copies only
listed medium JPEG covers when the record says `Public domain in the USA.`.
`author-images.json` maps authors to portraits selected from their English
Wikipedia pages and copies only files whose Wikimedia Commons metadata says
`Public domain` or `CC0`. Both manifests retain the source page, source image,
rights information, and credit. Records requiring rights review stay out of the
site. Run `python3 scripts/fetch-gutenberg-images.py` and
`python3 scripts/fetch-author-images.py` to refresh them.

The SQL importer prefers the linked source volume's cover. If a cover is not
available or the linked source is a known content mismatch, it uses an author
portrait when one was checked. Otherwise `image_url` is `NULL`; the UI has no
invented cover. An anthology cover is labelled as the **source volume** in
`image_alt`, and a portrait is labelled as a portrait.

The `readings` table has `author_slug` and `title_slug` columns with a composite
index. Repeated appearances of the same author and title share a slug pair.
Their image may differ if the source volume differs. They can be fetched for an
`/author/title` route with:

```sql
SELECT * FROM readings
WHERE author_slug = ? AND title_slug = ?
ORDER BY night, position;
```

If two distinct works would otherwise produce the same slug pair, the importer
adds a numeric suffix to one title slug. Route code should use the stored slugs
instead of regenerating them. It can use `image_url`, `image_alt`, `image_credit`,
and `image_source_url` directly for the detail page and attribution.

Project Gutenberg asks third-party sites to [host eligible images themselves](https://www.gutenberg.org/policy/linking.html).
Wikimedia Commons asks reusers to [check each file's rights and credit](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia).
