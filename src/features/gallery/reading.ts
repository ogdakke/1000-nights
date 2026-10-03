import type { SelectOption } from "../../components/ui/select";
import type { Reading } from "./types";

export const INITIAL_EASE = [0.25, 0.1, 0.25, 1] as const;
export const UI_EASE = [0.23, 1, 0.32, 1] as const;

export const statusOptions: SelectOption[] = [
  { label: "Not saved", value: "none" },
  { label: "Save for later", value: "want_to_read" },
  { label: "Reading", value: "reading" },
  { label: "Finished", value: "read" },
];

type PreviewNote = {
  description?: string;
  length?: string;
  published?: string;
};

const previewNotes: Record<string, PreviewNote> = {
  "the-duel": {
    description:
      "A Russian physician confronts a civil servant who wants to abandon both his lover and the life he has built on the Caucasian coast.",
    length: "About 2 hr",
    published: "1891",
  },
  "the-song-of-songs-chapter-2": {
    description:
      "A springtime passage of longing, invitation, and natural imagery from the biblical Song of Songs.",
    length: "About 2 min",
    published: "Ancient poetry",
  },
  "good-bad-books": {
    description:
      "Orwell considers why some clumsy, unfashionable books remain more readable and memorable than polished literary works.",
    length: "About 9 min",
    published: "1945",
  },
  "tomorrow-and-tomorrow-macbeth": {
    description:
      "Macbeth's brief meditation on time, futility, and the emptiness of life after he learns of his wife's death.",
    length: "About 1 min",
    published: "c. 1606",
  },
  "of-idleness": {
    description:
      "Montaigne observes what happens when an unoccupied mind is left to wander without a subject or discipline.",
    length: "About 4 min",
    published: "1580",
  },
  "the-town-mouse-and-the-country-mouse": {
    description:
      "A country mouse discovers that luxury loses its appeal when every meal comes with danger.",
    length: "About 3 min",
    published: "Ancient fable",
  },
  "sonnet-81": {
    description:
      "Shakespeare contrasts the speaker's mortality with the lasting life granted by the written word.",
    length: "About 2 min",
    published: "1609",
  },
  poetics: {
    description:
      "Aristotle examines tragedy, plot, character, and the principles that make dramatic imitation persuasive.",
    length: "About 1 hr",
    published: "c. 335 BCE",
  },
  "the-red-headed-league": {
    description:
      "Sherlock Holmes investigates an absurdly well-paid clerical job and uncovers the practical crime hidden beneath it.",
    length: "About 50 min",
    published: "1891",
  },
};

export function slugify(value: string) {
  return (
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "unknown"
  );
}

export function readingParams(reading: Reading) {
  return {
    author: reading.author_slug || slugify(reading.author || "anonymous"),
    title: reading.title_slug || slugify(reading.title),
  };
}

export function routeMatches(reading: Reading, author: string, title: string) {
  const params = readingParams(reading);
  return params.author === author && params.title === title;
}

export function readingKind(reading: Reading) {
  const value =
    reading.kind?.replaceAll("_", " ") ||
    ["Reading", "Short story", "Poem", "Essay"][reading.position] ||
    "Reading";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function previewFor(reading: Reading) {
  return previewNotes[slugify(reading.title)] ?? {};
}

export function coverFor(reading: Reading) {
  return reading.image_url;
}

export function isUnavailable(reading: Reading) {
  return ["broken", "mismatch", "content_mismatch"].includes(reading.link_status);
}
