import { existsSync, readFileSync, writeFileSync } from "node:fs";

const catalog = JSON.parse(readFileSync("data/catalog.json", "utf8"));
const readings = Array.isArray(catalog) ? catalog : catalog.readings;
if (!Array.isArray(readings)) throw new Error("Expected an array or {readings: [...]}");
const images = existsSync("data/image-sources.json")
  ? JSON.parse(readFileSync("data/image-sources.json", "utf8"))
  : {};
const portraits = existsSync("data/author-images.json")
  ? JSON.parse(readFileSync("data/author-images.json", "utf8"))
  : {};
const workImages = existsSync("data/work-image-sources.json")
  ? new Map(JSON.parse(readFileSync("data/work-image-sources.json", "utf8")).map((item) => [JSON.stringify([item.author, item.title]), item]))
  : new Map();
const quote = (value) => (value == null ? "NULL" : `'${String(value).replaceAll("'", "''")}'`);
const slug = (value) =>
  String(value || "unknown")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "unknown";
const workKeys = [...new Set(readings.map((row) => JSON.stringify([row.author || "", row.title])))].sort();
const usedRoutes = new Set();
const workRoutes = new Map();
for (const key of workKeys) {
  const [author, title] = JSON.parse(key);
  const authorSlug = slug(author || "anonymous");
  const base = slug(title);
  let titleSlug = base;
  for (let suffix = 2; usedRoutes.has(`${authorSlug}/${titleSlug}`); suffix++) titleSlug = `${base}-${suffix}`;
  usedRoutes.add(`${authorSlug}/${titleSlug}`);
  workRoutes.set(key, { authorSlug, titleSlug });
}
const fields = [
  "id",
  "night",
  "position",
  "title",
  "author",
  "kind",
  "original_url",
  "resolved_url",
  "link_status",
  "evidence",
  "author_slug",
  "title_slug",
  "image_url",
  "image_source_url",
  "image_credit",
  "image_alt",
];
const sql = readings.map((row) => {
  if (!row.id || !Number.isInteger(row.night) || !row.title)
    throw new Error(`Invalid reading: ${JSON.stringify(row)}`);
  // resolved_url records the audit fetch target, which is often a plain-text
  // Gutenberg derivative. Readers should open the book page with format choices.
  const readingUrl = row.corrected_url || row.original_url || row.resolved_url;
  const { authorSlug, titleSlug } = workRoutes.get(JSON.stringify([row.author || "", row.title]));
  const bookId = /^https:\/\/www\.gutenberg\.org\/ebooks\/(\d+)$/.exec(readingUrl || "")?.[1];
  const image = (row.corrected_url || !["broken", "content_mismatch"].includes(row.link_status)) && bookId
    ? images[bookId]
    : null;
  const cover = image?.status === "downloaded" ? image : null;
  const workImage = !cover && workImages.get(JSON.stringify([row.author || "", row.title]))?.status === "downloaded"
    ? workImages.get(JSON.stringify([row.author || "", row.title]))
    : null;
  const portrait = !cover && !workImage && portraits[row.author]?.status === "downloaded"
    ? portraits[row.author]
    : null;
  const normalized = {
    ...row,
    resolved_url: readingUrl,
    link_status: row.corrected_url ? "corrected" : row.link_status,
    author_slug: authorSlug,
    title_slug: titleSlug,
    image_url: cover?.image_url ?? workImage?.image_url ?? portrait?.image_url ?? null,
    image_source_url: cover?.source_page ?? workImage?.source_page ?? portrait?.source_page ?? null,
    image_credit: cover?.credit ?? workImage?.credit ?? portrait?.credit ?? null,
    image_alt: cover ? `Cover of ${cover.title}, the source volume` : workImage?.image_alt ?? portrait?.image_alt ?? (portrait ? `Portrait of ${row.author}` : null),
  };
  return `INSERT INTO readings(${fields.join(",")}) VALUES (${fields.map((field) => quote(normalized[field])).join(",")}) ON CONFLICT(id) DO UPDATE SET ${fields
    .slice(1)
    .map((field) => `${field}=excluded.${field}`)
    .join(",")};`;
});
writeFileSync("data/catalog.sql", sql.join("\n") + "\n");
console.log(`Wrote ${readings.length} readings to data/catalog.sql`);
