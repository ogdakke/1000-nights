import type { JourneyPage, Profile, Reading, ReadingPage, ReadingStatus } from "./types";

export async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || "The library could not be reached.");
  }
  return response.json() as Promise<T>;
}

export function getReadings(page: number, search: string) {
  return requestJson<ReadingPage>(
    `/api/readings?page=${page}&q=${encodeURIComponent(search)}`,
  );
}

export function getReading(author: string, title: string, night?: number) {
  return requestJson<Reading>(
    `/api/reading?author=${encodeURIComponent(author)}&title=${encodeURIComponent(title)}${night ? `&night=${night}` : ""}`,
  );
}

export function getProfile() {
  return requestJson<Profile>("/api/profile");
}

export function getJourney(page: number) {
  return requestJson<JourneyPage>(`/api/journey?page=${page}`);
}

export function saveProgress(reading: Reading, status: ReadingStatus | null) {
  return requestJson<{ ok: true }>("/api/progress", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ readingId: reading.id, status }),
  });
}

export function signOut() {
  return requestJson<{ ok: true }>("/api/auth/logout", { method: "POST" });
}
