import { useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { CoverImage } from "./CoverArtwork";
import { GalleryHeader } from "./GalleryHeader";
import { ReadingPreview } from "./ReadingPreview";
import { ReadingShelf } from "./ReadingShelf";
import { getProfile, getReading, getReadings, saveProgress, signOut } from "./api";
import { UI_EASE, readingParams, routeMatches } from "./reading";
import type {
  NavigationIntent,
  Reading,
  ReadingPage,
  ReadingRouteParams,
  ReadingStatus,
} from "./types";

const EMPTY_READINGS: Reading[] = [];

function GalleryLoading() {
  return (
    <div className="gallery-loading" aria-label="Loading the reading gallery" aria-live="polite">
      <span className="gallery-loading-line gallery-loading-title" />
      <span className="gallery-loading-line gallery-loading-author" />
      <span className="gallery-loading-line gallery-loading-copy" />
    </div>
  );
}

export function GalleryPage({ route }: { route?: ReadingRouteParams }) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const searchInput = useRef<HTMLInputElement>(null);
  const carousel = useRef<HTMLDivElement>(null);
  const firstReveal = useRef(true);
  const pendingEdge = useRef<{
    edge: "first" | "last";
    intent: NavigationIntent;
  } | null>(null);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [intent, setIntent] = useState<NavigationIntent>("initial");

  useEffect(() => {
    const nextSearch = query.trim();
    if (nextSearch === search) return;
    const timeout = window.setTimeout(() => {
      setSearch(nextSearch);
      setPage(1);
      pendingEdge.current = { edge: "first", intent: "pointer" };
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [query, search]);

  const readings = useQuery({
    queryKey: ["readings", page, search],
    queryFn: () => getReadings(page, search),
    placeholderData: keepPreviousData,
  });

  const routedReading = useQuery({
    queryKey: ["reading", route?.author, route?.title],
    queryFn: () => getReading(route?.author ?? "", route?.title ?? ""),
    enabled: Boolean(route),
    retry: false,
  });

  const profile = useQuery({ queryKey: ["profile"], queryFn: getProfile });

  const updateProgress = useMutation({
    mutationFn: ({ reading, status }: { reading: Reading; status: ReadingStatus | null }) =>
      saveProgress(reading, status),
    onMutate: async ({ reading, status }) => {
      setNotice("");
      await client.cancelQueries({ queryKey: ["readings"] });
      const snapshots = client.getQueriesData<ReadingPage>({ queryKey: ["readings"] });
      client.setQueriesData<ReadingPage>({ queryKey: ["readings"] }, (current) =>
        current
          ? {
              ...current,
              items: current.items.map((item) =>
                item.id === reading.id ? { ...item, progress: status } : item,
              ),
            }
          : current,
      );
      client.setQueriesData<Reading>({ queryKey: ["reading"] }, (current) =>
        current?.id === reading.id ? { ...current, progress: status } : current,
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
    mutationFn: signOut,
    onSuccess: () => window.location.reload(),
    onError: (error) => setNotice(error.message),
  });

  const data = readings.data;
  const items = data?.items ?? EMPTY_READINGS;
  const pageCount = Math.ceil((data?.total ?? 0) / 30);
  const routeMatch = route
    ? items.find((reading) => routeMatches(reading, route.author, route.title))
    : null;
  const routedItem = routedReading.data;
  const selected = route
    ? routeMatch ?? routedItem ?? (routedReading.isError ? items[0] : null)
    : items.find((reading) => reading.id === selectedId) ?? items[0] ?? null;

  function selectReading(reading: Reading, nextIntent: NavigationIntent, replace = false) {
    if (nextIntent !== "initial") firstReveal.current = false;
    setIntent(nextIntent);
    setSelectedId(reading.id);
    const params = readingParams(reading);
    client.setQueryData(["reading", params.author, params.title], reading);
    void navigate({ to: "/read/$author/$title", params, replace });
  }

  useEffect(() => {
    if (!routedItem) return;
    setSelectedId(routedItem.id);
    const routedPage = Math.floor((routedItem.night - 1) / 10) + 1;
    if (!search && routedPage !== page) setPage(routedPage);
  }, [page, routedItem, search]);

  useEffect(() => {
    if (!data || data.page !== page || items.length === 0) return;
    if (pendingEdge.current) {
      const { edge, intent: pendingIntent } = pendingEdge.current;
      const next = edge === "last" ? items.at(-1) : items[0];
      pendingEdge.current = null;
      if (next) selectReading(next, pendingIntent, true);
      return;
    }
    if (routeMatch) {
      setSelectedId(routeMatch.id);
      return;
    }
    if (route && !routedReading.isError) return;
    if (!selectedId || !items.some((reading) => reading.id === selectedId)) {
      selectReading(items[0], "initial", true);
    }
  }, [data, items, page, route, routeMatch, routedReading.isError, selectedId]);

  useEffect(() => {
    if (!selected?.id) return;
    const selectedCard = carousel.current?.querySelector<HTMLElement>(
      `[data-reading-id="${CSS.escape(selected.id)}"]`,
    );
    selectedCard?.scrollIntoView({
      behavior: intent === "keyboard" ? "auto" : "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [intent, selected?.id]);

  function moveSelection(direction: -1 | 1, nextIntent: NavigationIntent) {
    if (!selected || items.length === 0) return;
    const index = items.findIndex((item) => item.id === selected.id);
    const next = items[index + direction];
    if (next) {
      selectReading(next, nextIntent);
      return;
    }
    const nextPage = page + direction;
    if (nextPage < 1 || nextPage > pageCount) return;
    pendingEdge.current = {
      edge: direction === 1 ? "first" : "last",
      intent: nextIntent,
    };
    setIntent(nextIntent);
    setPage(nextPage);
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditing =
        target?.matches("input, textarea, select, [contenteditable='true']") ||
        target?.closest("[role='listbox']");
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInput.current?.focus();
        return;
      }
      if (isEditing || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        moveSelection(event.key === "ArrowLeft" ? -1 : 1, "keyboard");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const selectedPosition = useMemo(() => {
    if (!selected || !data) return 0;
    const localIndex = items.findIndex((item) => item.id === selected.id);
    return (data.page - 1) * data.pageSize + Math.max(localIndex, 0) + 1;
  }, [data, items, selected]);

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

  const error =
    (readings.error instanceof Error && readings.error.message) ||
    (routedReading.error instanceof Error && routedReading.error.message) ||
    "";

  return (
    <MotionConfig reducedMotion="user">
      <div className="gallery-app">
        <div className="gallery-backdrop" aria-hidden="true">
          <AnimatePresence initial={false} mode="sync">
            {selected ? (
              <motion.div
                className="gallery-backdrop-layer"
                data-kind={selected.kind}
                key={selected.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: intent === "keyboard" ? 0 : 0.24, ease: UI_EASE }}
              >
                <CoverImage reading={selected} decorative />
              </motion.div>
            ) : null}
          </AnimatePresence>
          <div className="gallery-backdrop-wash" />
        </div>

        <GalleryHeader
          profile={profile.data}
          query={query}
          searchInput={searchInput}
          signingOut={logout.isPending}
          onQueryChange={(event) => setQuery(event.target.value)}
          onSignIn={signIn}
          onSignOut={() => logout.mutate()}
        />

        <main className="gallery-main">
          {(notice || error) && (
            <p className="gallery-notice" role="alert">
              {notice || error}
            </p>
          )}
          {(readings.isPending || (route && routedReading.isPending)) && !selected ? (
            <GalleryLoading />
          ) : !selected ? (
            <div className="gallery-empty">
              <strong>No matches</strong>
              <span>Try another title or author.</span>
            </div>
          ) : (
            <ReadingPreview
              reading={selected}
              intent={intent}
              firstReveal={firstReveal}
              saving={
                updateProgress.isPending && updateProgress.variables?.reading.id === selected.id
              }
              onProgressChange={(status) => setProgress(selected, status)}
            />
          )}
        </main>

        {selected && items.length > 0 ? (
          <ReadingShelf
            carousel={carousel}
            items={items}
            selected={selected}
            position={selectedPosition}
            total={data?.total ?? 0}
            canGoBack={page > 1 || selected.id !== items[0]?.id}
            canGoForward={page < pageCount || selected.id !== items.at(-1)?.id}
            onMove={(direction) => moveSelection(direction, "pointer")}
            onSelect={(reading) => selectReading(reading, "pointer")}
          />
        ) : null}
      </div>
    </MotionConfig>
  );
}
