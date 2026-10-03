import { readFileSync, writeFileSync } from "node:fs";

const catalog = JSON.parse(readFileSync("data/catalog.json", "utf8"));
const readings = Array.isArray(catalog) ? catalog : catalog.readings;
if (!Array.isArray(readings)) throw new Error("Expected an array or {readings: [...]}");
const quote = (value) => (value == null ? "NULL" : `'${String(value).replaceAll("'", "''")}'`);
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
];
const sql = readings.map((row) => {
  if (!row.id || !Number.isInteger(row.night) || !row.title)
    throw new Error(`Invalid reading: ${JSON.stringify(row)}`);
  // resolved_url records the audit fetch target, which is often a plain-text
  // Gutenberg derivative. Readers should open the book page with format choices.
  const readingUrl = row.corrected_url || row.original_url || row.resolved_url;
  const normalized = {
    ...row,
    resolved_url: readingUrl,
    link_status: row.corrected_url ? "corrected" : row.link_status,
  };
  return `INSERT INTO readings(${fields.join(",")}) VALUES (${fields.map((field) => quote(normalized[field])).join(",")}) ON CONFLICT(id) DO UPDATE SET ${fields
    .slice(1)
    .map((field) => `${field}=excluded.${field}`)
    .join(",")};`;
});
writeFileSync("data/catalog.sql", sql.join("\n") + "\n");
console.log(`Wrote ${readings.length} readings to data/catalog.sql`);
