import { useEffect, useMemo, useRef, useState } from "react";
import { type InfiniteData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
    <section className="gallery-stage gallery-loading" aria-label="Loading the reading" aria-live="polite">
      <div className="gallery-loading-copy">
        <span className="gallery-loading-line gallery-loading-title" />
        <span className="gallery-loading-line gallery-loading-author" />
        <span className="gallery-loading-line gallery-loading-description" />
        <span className="gallery-loading-line gallery-loading-action" />
      </div>
      <span className="gallery-loading-artwork" aria-hidden="true" />
    </section>
  );
}

function GalleryShelfLoading() {
  return (
    <div className="gallery-shelf gallery-loading-shelf" aria-hidden="true">
      <div className="gallery-loading-shelf-toolbar" />
      <div className="gallery-loading-shelf-track">
        {Array.from({ length: 9 }, (_, index) => (
          <span key={index} />
        ))}
      </div>
    </div>
  );
}

export function GalleryPage({ route }: { route?: ReadingRouteParams }) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const searchInput = useRef<HTMLInputElement>(null);
  const carousel = useRef<HTMLDivElement>(null);
  const firstReveal = useRef(true);
  const pendingMove = useRef<{
    fromId: string;
    direction: -1 | 1;
    intent: NavigationIntent;
  } | null>(null);
  const initialRoute = useRef(route);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [anchorPage, setAnchorPage] = useState(1);
  const [notice, setNotice] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [intent, setIntent] = useState<NavigationIntent>("initial");

  useEffect(() => {
    const nextSearch = query.trim();
    if (nextSearch === search) return;
    const timeout = window.setTimeout(() => {
      setSearch(nextSearch);
      setAnchorPage(1);
      setSelectedId(null);
      pendingMove.current = null;
      initialRoute.current = undefined;
      carousel.current?.scrollTo({ left: 0 });
      if (route) void navigate({ to: "/app", replace: true });
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [query, search, route, navigate]);

  const routedReading = useQuery({
    queryKey: ["reading", route?.author, route?.title],
    queryFn: () => getReading(route?.author ?? "", route?.title ?? ""),
    enabled: Boolean(route),
    retry: false,
  });

  const initialPage = initialRoute.current && !search && routedReading.data
    ? Math.floor((routedReading.data.night - 1) / 10) + 1
    : anchorPage;
  const readings = useInfiniteQuery({
    queryKey: ["readings", search, initialPage],
    queryFn: ({ pageParam }) => getReadings(pageParam, search),
    initialPageParam: initialPage,
    getNextPageParam: (lastPage) =>
      lastPage.page * lastPage.pageSize < lastPage.total ? lastPage.page + 1 : undefined,
    getPreviousPageParam: (firstPage) => firstPage.page > 1 ? firstPage.page - 1 : undefined,
    enabled: !initialRoute.current || Boolean(routedReading.data || routedReading.isError || search),
  });

  useEffect(() => {
    if (!initialRoute.current) return;
    if (routedReading.data && !search) {
      setAnchorPage(Math.floor((routedReading.data.night - 1) / 10) + 1);
      initialRoute.current = undefined;
    } else if (routedReading.isError) {
      initialRoute.current = undefined;
    }
  }, [routedReading.data, routedReading.isError, search]);

  const profile = useQuery({ queryKey: ["profile"], queryFn: getProfile });

  const updateProgress = useMutation({
    mutationFn: ({ reading, status }: { reading: Reading; status: ReadingStatus | null }) =>
      saveProgress(reading, status),
    onMutate: async ({ reading, status }) => {
      setNotice("");
      await client.cancelQueries({ queryKey: ["readings"] });
      const snapshots = client.getQueriesData<InfiniteData<ReadingPage, number>>({ queryKey: ["readings"] });
      client.setQueriesData<InfiniteData<ReadingPage, number>>({ queryKey: ["readings"] }, (current) =>
        current
          ? {
              ...current,
              pages: current.pages.map((page) => ({
                ...page,
                items: page.items.map((item) =>
                  item.id === reading.id ? { ...item, progress: status } : item,
                ),
              })),
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
  const items = useMemo(() => data?.pages.flatMap((page) => page.items) ?? EMPTY_READINGS, [data]);
  const total = data?.pages[0]?.total ?? 0;
  const routeMatch = route
    ? items.find((reading) => reading.id === selectedId && routeMatches(reading, route.author, route.title)) ??
      items.find((reading) => routeMatches(reading, route.author, route.title))
    : null;
  const routedItem = routedReading.data;
  const selected = route
    ? routeMatch ?? (readings.isSuccess ? routedItem : null) ??
      (routedReading.isError && readings.isSuccess ? items[0] : null)
    : items.find((reading) => reading.id === selectedId) ?? items[0] ?? null;
  const quickRouteEntrance = Boolean(route && firstReveal.current);

  function selectReading(reading: Reading, nextIntent: NavigationIntent, replace = false) {
    pendingMove.current = null;
    if (nextIntent !== "initial") firstReveal.current = false;
    setIntent(nextIntent);
    setSelectedId(reading.id);
    const params = readingParams(reading);
    client.setQueryData(["reading", params.author, params.title], reading);
    void navigate({ to: "/read/$author/$title", params, replace });
  }

  useEffect(() => {
    if (!data || items.length === 0) return;
    if (pendingMove.current) {
      const { fromId, direction, intent: pendingIntent } = pendingMove.current;
      const fromIndex = items.findIndex((item) => item.id === fromId);
      const next = items[fromIndex + direction];
      if (next) {
        pendingMove.current = null;
        selectReading(next, pendingIntent);
      }
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
  }, [data, items, route, routeMatch, routedReading.isError, selectedId]);

  function moveSelection(direction: -1 | 1, nextIntent: NavigationIntent) {
    if (!selected || items.length === 0) return;
    const index = items.findIndex((item) => item.id === selected.id);
    const next = items[index + direction];
    if (next) {
      selectReading(next, nextIntent);
      return;
    }
    if (direction === 1 && !readings.hasNextPage) return;
    if (direction === -1 && !readings.hasPreviousPage) return;
    pendingMove.current = { fromId: selected.id, direction, intent: nextIntent };
    setIntent(nextIntent);
    if (direction === 1) void readings.fetchNextPage();
    else void readings.fetchPreviousPage();
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
    if (localIndex < 0) return (selected.night - 1) * 3 + selected.position;
    return (data.pages[0].page - 1) * data.pages[0].pageSize + localIndex + 1;
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
          quickEntrance={Boolean(route)}
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
              quickEntrance={quickRouteEntrance}
              saving={
                updateProgress.isPending && updateProgress.variables?.reading.id === selected.id
              }
              onProgressChange={(status) => setProgress(selected, status)}
            />
          )}
        </main>

        {!selected && (readings.isPending || (route && routedReading.isPending)) ? (
          <GalleryShelfLoading />
        ) : selected && items.length > 0 ? (
          <ReadingShelf
            carousel={carousel}
            items={items}
            selected={selected}
            position={selectedPosition}
            total={total}
            showNightGroups={!search}
            canGoBack={readings.hasPreviousPage || selected.id !== items[0]?.id}
            canGoForward={readings.hasNextPage || selected.id !== items.at(-1)?.id}
            hasNextPage={readings.hasNextPage}
            hasPreviousPage={readings.hasPreviousPage}
            isFetchingNextPage={readings.isFetchingNextPage}
            isFetchingPreviousPage={readings.isFetchingPreviousPage}
            hasLoadError={readings.isFetchNextPageError}
            quickEntrance={quickRouteEntrance}
            onLoadNext={() => void readings.fetchNextPage()}
            onLoadPrevious={() => void readings.fetchPreviousPage()}
            onMove={(direction) => moveSelection(direction, "pointer")}
            onSelect={(reading) => selectReading(reading, "pointer")}
          />
        ) : null}
      </div>
    </MotionConfig>
  );
}
