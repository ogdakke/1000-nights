# Reading images

`image-sources.json` maps Project Gutenberg ebook IDs to copied cover images in
`public/images/`. The downloader reads the ebook's RDF record and copies only
listed medium JPEG covers when the record says `Public domain in the USA.`.
`author-images.json` maps authors to portraits selected from their English
Wikipedia pages or reviewed Commons files. `work-image-sources.json` holds five
reviewed scans for works without an identifiable author portrait. Both downloaders
accept only Commons files marked `Public domain` or `CC0`; the manifests retain
the source page, source image, rights information, and credit. Records requiring
rights review stay out of the site. Run `python3 scripts/fetch-gutenberg-images.py`,
`python3 scripts/fetch-author-images.py`, and `python3 scripts/fetch-work-images.py`
to refresh them.

The SQL importer prefers the linked source volume's cover. If a cover is not
available or the linked source is a known content mismatch, it uses a reviewed
work scan, then an author portrait. An anthology cover is labelled as the
**source volume** in `image_alt`; historical artwork is described as a depiction
rather than a contemporary portrait. All 3,000 current catalog rows now have a
verified image URL. The UI retains a designed fallback for image load failures.

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
