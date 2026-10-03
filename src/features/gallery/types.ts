export type ReadingStatus = "want_to_read" | "reading" | "read";

export type Reading = {
  id: string;
  night: number;
  position: number;
  title: string;
  author: string | null;
  kind: string | null;
  original_url: string | null;
  resolved_url: string | null;
  link_status: string;
  evidence: string | null;
  author_slug: string;
  title_slug: string;
  image_url: string | null;
  image_source_url: string | null;
  image_credit: string | null;
  image_alt: string | null;
  appearance_nights?: string | null;
  progress: ReadingStatus | null;
};

export type ReadingPage = {
  items: Reading[];
  total: number;
  page: number;
  pageSize: number;
};

export type Profile = {
  user: { id: string; name: string; avatar_url: string | null } | null;
  counts: Record<string, number> | null;
  authAvailable: boolean;
};

export type JourneyNight = { night: number; total: number; finished: number };
export type JourneyReading = Reading & { finished_at?: string };
export type JourneyPage = {
  nights: JourneyNight[];
  tonight: JourneyReading[];
  history: JourneyReading[];
  page: number;
  hasMoreHistory: boolean;
};

export type ReadingRouteParams = { author: string; title: string; night?: number };
export type NavigationIntent = "initial" | "pointer" | "keyboard";
