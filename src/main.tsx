import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ArrowUpRight, ChevronLeft, ChevronRight, Search } from "lucide-react";
import {
  keepPreviousData,
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Button } from "./components/ui/button";
import { Select, type SelectOption } from "./components/ui/select";
import "./coherent.css";

type ReadingStatus = "want_to_read" | "reading" | "read";

type Reading = {
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
  progress: ReadingStatus | null;
};

type Page = { items: Reading[]; total: number; page: number; pageSize: number };
type Profile = {
  user: { id: string; name: string; avatar_url: string | null } | null;
  counts: Record<string, number> | null;
  authAvailable: boolean;
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30_000,
    },
  },
});

const statusOptions: SelectOption[] = [
  { label: "Not saved", value: "none" },
  { label: "Save", value: "want_to_read" },
  { label: "Reading", value: "reading" },
  { label: "Finished", value: "read" },
];

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || "The library could not be reached.");
  }
  return response.json() as Promise<T>;
}

function groupByNight(items: Reading[]) {
  return items.reduce<Array<{ night: number; items: Reading[] }>>((groups, reading) => {
    const current = groups.at(-1);
    if (current?.night === reading.night) current.items.push(reading);
    else groups.push({ night: reading.night, items: [reading] });
    return groups;
  }, []);
}

function readingKind(reading: Reading) {
  const value =
    reading.kind?.replaceAll("_", " ") ||
    ["Reading", "Short story", "Poem", "Essay"][reading.position] ||
    "Reading";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function LoadingRows() {
  return (
    <div className="night-list" aria-label="Loading readings" aria-live="polite">
      {[0, 1].map((group) => (
        <section className="night-group loading-group" key={group}>
          <span className="skeleton skeleton-heading" />
          {[0, 1, 2].map((row) => (
            <div className="reading reading-skeleton" key={row}>
              <div>
                <span className="skeleton skeleton-title" />
                <span className="skeleton skeleton-author" />
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

function App() {
  const client = useQueryClient();
  const searchInput = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSearch(query.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInput.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const readings = useQuery({
    queryKey: ["readings", page, search],
    queryFn: () => requestJson<Page>(`/api/readings?page=${page}&q=${encodeURIComponent(search)}`),
    placeholderData: keepPreviousData,
  });

  const profile = useQuery({
    queryKey: ["profile"],
    queryFn: () => requestJson<Profile>("/api/profile"),
  });

  const updateProgress = useMutation({
    mutationFn: ({ reading, status }: { reading: Reading; status: ReadingStatus | null }) =>
      requestJson<{ ok: true }>("/api/progress", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ readingId: reading.id, status }),
      }),
    onMutate: async ({ reading, status }) => {
      setNotice("");
      await client.cancelQueries({ queryKey: ["readings"] });
      const snapshots = client.getQueriesData<Page>({ queryKey: ["readings"] });
      client.setQueriesData<Page>({ queryKey: ["readings"] }, (current) =>
        current
          ? {
              ...current,
              items: current.items.map((item) =>
                item.id === reading.id ? { ...item, progress: status } : item,
              ),
            }
          : current,
      );
      return { snapshots };
    },
    onError: (error, _variables, context) => {
      context?.snapshots.forEach(([key, value]) => client.setQueryData(key, value));
      setNotice(error.message || "Progress could not be saved.");
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: ["profile"] });
    },
  });

  const logout = useMutation({
    mutationFn: () => requestJson<{ ok: true }>("/api/auth/logout", { method: "POST" }),
    onSuccess: () => window.location.reload(),
    onError: (error) => setNotice(error.message),
  });

  function signIn() {
    if (profile.data?.authAvailable) window.location.href = "/api/auth/github";
    else setNotice("Sign-in has not been configured for this environment yet.");
  }

  function setProgress(reading: Reading, status: ReadingStatus | null) {
    if (!profile.data?.user) {
      signIn();
      return;
    }
    updateProgress.mutate({ reading, status });
  }

  const data = readings.data;
  const groups = groupByNight(data?.items ?? []);
  const error = readings.error instanceof Error ? readings.error.message : "";
  const pageCount = Math.ceil((data?.total ?? 0) / 30);
  const readCount = profile.data?.counts?.read ?? 0;

  return (
    <div className="app-layout simple-library">
      <header className="app-header">
        <div className="header-inner shell">
          <a className="header-link" href="/">About</a>
          <div className="app-header-actions">
            {profile.data?.user ? (
              <>
                <span className="account-name">{profile.data.user.name}</span>
                <Button
                  variant="ghost"
                  size="small"
                  onClick={() => logout.mutate()}
                  disabled={logout.isPending}
                >
                  Sign out
                </Button>
              </>
            ) : (
              <Button variant="ghost" size="small" onClick={signIn} disabled={profile.isPending}>
                Sign in
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="simple-library-shell">
        <section className="library">
          <header className="simple-library-heading">
            <h1>Reading list</h1>
            <p>
              {profile.data?.user
                ? `${readCount.toLocaleString()} finished · ${profile.data.counts?.reading ?? 0} reading · ${profile.data.counts?.want_to_read ?? 0} saved`
                : "A short story, a poem, and an essay for each night."}
            </p>
          </header>

          <label className="search-field">
            <Search aria-hidden="true" size={18} strokeWidth={1.8} />
            <input
              ref={searchInput}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search titles and authors"
              aria-label="Search readings"
            />
            <kbd>⌘ K</kbd>
          </label>

          <div className="list-meta" aria-live="polite">
            <span>{search ? `Results for "${search}"` : `${data?.total ?? 0} readings`}</span>
            {readings.isFetching && data ? <span>Updating...</span> : null}
          </div>

          {(notice || error) && (
            <p className="error" role="alert">
              {notice || error}
            </p>
          )}

          {readings.isPending ? (
            <LoadingRows />
          ) : groups.length === 0 ? (
            <div className="empty">
              <strong>No matches</strong>
              <span>Try another title or author.</span>
            </div>
          ) : (
            <div className="night-list">
              {groups.map((group) => (
                <section className="night-group" key={group.night}>
                  <h2>Night {group.night}</h2>
                  <div className="night-readings">
                    {group.items.map((item) => {
                      const link = item.resolved_url || item.original_url;
                      const isUnavailable = ["broken", "mismatch", "content_mismatch"].includes(
                        item.link_status,
                      );
                      const needsAttention = !item.link_status.includes("verified");
                      const itemIsUpdating =
                        updateProgress.isPending &&
                        updateProgress.variables?.reading.id === item.id;

                      return (
                        <article className="reading" key={item.id}>
                          <div className="reading-main">
                            <h3>{item.title}</h3>
                            <p>
                              <span>{readingKind(item)}</span>
                              <span aria-hidden="true"> · </span>
                              <span>{item.author || "Author not listed"}</span>
                              {needsAttention ? (
                                <>
                                  <span aria-hidden="true"> · </span>
                                  <span className={isUnavailable ? "link-problem" : "link-note"}>
                                    {isUnavailable ? "Link unavailable" : "Link not fully verified"}
                                  </span>
                                </>
                              ) : null}
                            </p>
                            {item.evidence && needsAttention ? (
                              <details>
                                <summary>Link details</summary>
                                <span>{item.evidence}</span>
                              </details>
                            ) : null}
                          </div>
                          <div className="reading-actions">
                            {link && !isUnavailable ? (
                              <a
                                className="open-reading"
                                href={link}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={`Open ${item.title}`}
                              >
                                Open
                                <ArrowUpRight aria-hidden="true" size={15} strokeWidth={1.9} />
                              </a>
                            ) : null}
                            <Select
                              aria-label={`Reading status: ${item.title}`}
                              options={statusOptions}
                              value={item.progress ?? "none"}
                              disabled={itemIsUpdating}
                              onValueChange={(value) =>
                                setProgress(
                                  item,
                                  value === "none" ? null : (value as ReadingStatus),
                                )
                              }
                            />
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}

          {pageCount > 1 && (
            <nav className="pagination" aria-label="Catalog pages">
              <Button
                variant="secondary"
                size="small"
                disabled={page === 1}
                onClick={() => setPage((current) => current - 1)}
              >
                <ChevronLeft aria-hidden="true" data-icon="inline-start" /> Previous
              </Button>
              <span>
                {page} of {pageCount}
              </span>
              <Button
                variant="secondary"
                size="small"
                disabled={page >= pageCount}
                onClick={() => setPage((current) => current + 1)}
              >
                Next <ChevronRight aria-hidden="true" data-icon="inline-end" />
              </Button>
            </nav>
          )}
        </section>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
