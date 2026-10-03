import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { motion } from "motion/react";
import { Button } from "../../components/ui/button";
import { CoverArtwork } from "./CoverArtwork";
import { INITIAL_EASE, UI_EASE } from "./reading";
import type { Reading } from "./types";

const CARD_STRIDE = 100;

type ReadingShelfProps = {
  carousel: RefObject<HTMLDivElement | null>;
  items: Reading[];
  firstItemIndex: number;
  selected: Reading;
  position: number;
  total: number;
  showNightGroups: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  isFetchingNextPage: boolean;
  isFetchingPreviousPage: boolean;
  hasPreviousLoadError: boolean;
  hasLoadError: boolean;
  quickEntrance?: boolean;
  onLoadNext: () => void;
  onLoadPrevious: () => void;
  onMove: (direction: -1 | 1) => void;
  onSelect: (reading: Reading) => void;
};

export function ReadingShelf({
  carousel,
  items,
  firstItemIndex,
  selected,
  position,
  total,
  showNightGroups,
  canGoBack,
  canGoForward,
  hasNextPage,
  hasPreviousPage,
  isFetchingNextPage,
  isFetchingPreviousPage,
  hasPreviousLoadError,
  hasLoadError,
  quickEntrance = false,
  onLoadNext,
  onLoadPrevious,
  onMove,
  onSelect,
}: ReadingShelfProps) {
  const lastCentered = useRef<string | null>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const sidePadding = Math.max(0, (viewportWidth - CARD_STRIDE) / 2);
  const previousLoadThreshold =
    sidePadding + firstItemIndex * CARD_STRIDE + Math.max(viewportWidth / 2, CARD_STRIDE * 6);
  const lastItemIndex = firstItemIndex + items.length - 1;
  const virtualizer = useVirtualizer({
    horizontal: true,
    count: total,
    getScrollElement: () => carousel.current,
    estimateSize: () => CARD_STRIDE,
    getItemKey: (index) => items[index - firstItemIndex]?.id ?? index,
    overscan: 6,
    paddingStart: sidePadding,
    paddingEnd: sidePadding,
  });
  const visible = virtualizer.getVirtualItems();
  const selectedIndex = items.findIndex((item) => item.id === selected.id);

  useLayoutEffect(() => {
    const element = carousel.current;
    if (!element) return;
    const measure = () => setViewportWidth(element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [carousel]);

  useLayoutEffect(() => {
    const centeredKey = `${selected.id}:${viewportWidth}`;
    if (selectedIndex >= 0 && viewportWidth > 0 && lastCentered.current !== centeredKey) {
      virtualizer.scrollToIndex(firstItemIndex + selectedIndex, {
        align: "center",
        behavior: "auto",
      });
      lastCentered.current = centeredKey;
    }
  }, [firstItemIndex, selectedIndex, selected.id, viewportWidth, virtualizer]);

  useEffect(() => {
    const last = visible.at(-1);
    if (
      last &&
      last.index >= lastItemIndex - 3 &&
      hasNextPage &&
      !isFetchingNextPage &&
      !hasLoadError
    )
      onLoadNext();
  }, [visible, lastItemIndex, hasNextPage, isFetchingNextPage, hasLoadError, onLoadNext]);

  // Start loading before the first card reaches the viewport's left edge.
  // Recheck after a page arrives in case the user is still near the loaded boundary.
  useEffect(() => {
    const element = carousel.current;
    if (
      element &&
      viewportWidth > 0 &&
      hasPreviousPage &&
      !isFetchingPreviousPage &&
      !hasPreviousLoadError &&
      element.scrollLeft <= previousLoadThreshold
    )
      onLoadPrevious();
  }, [
    items,
    viewportWidth,
    previousLoadThreshold,
    hasPreviousPage,
    isFetchingPreviousPage,
    hasPreviousLoadError,
    onLoadPrevious,
    carousel,
  ]);

  return (
    <section className="gallery-shelf" aria-label="Reading gallery">
      <motion.div
        className="gallery-shelf-toolbar"
        initial={
          quickEntrance
            ? { opacity: 0 }
            : { opacity: 0, filter: "blur(10px)", transform: "translateY(20%)" }
        }
        animate={{ opacity: 1, filter: "blur(0px)", transform: "translateY(0%)" }}
        transition={
          quickEntrance
            ? { duration: 0.18, ease: UI_EASE }
            : { duration: 1, delay: 0.5, ease: INITIAL_EASE }
        }
      >
        <div className="gallery-shelf-arrows">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onMove(-1)}
            disabled={!canGoBack}
            aria-label="Previous reading"
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onMove(1)}
            disabled={!canGoForward}
            aria-label="Next reading"
          >
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
        <span aria-live="polite">
          {position.toLocaleString()} of {total.toLocaleString()}
        </span>
      </motion.div>

      <div
        className="gallery-track"
        ref={carousel}
        onScroll={(event) => {
          if (
            event.currentTarget.scrollLeft <= previousLoadThreshold &&
            hasPreviousPage &&
            !isFetchingPreviousPage &&
            !hasPreviousLoadError
          )
            onLoadPrevious();
        }}
      >
        <ol className="gallery-virtual-list" style={{ width: virtualizer.getTotalSize() }}>
          {visible.map((virtualItem) => {
            const reading = items[virtualItem.index - firstItemIndex];
            if (!reading && virtualItem.index === lastItemIndex + 1 && hasNextPage)
              return (
                <li
                  className="gallery-virtual-item gallery-load-item"
                  key={virtualItem.key}
                  style={{ transform: `translateX(${virtualItem.start}px)` }}
                >
                  <button type="button" onClick={onLoadNext} disabled={isFetchingNextPage}>
                    {hasLoadError ? "Retry" : "More"}
                  </button>
                </li>
              );
            if (!reading)
              return (
                <li
                  className="gallery-virtual-item"
                  key={virtualItem.key}
                  style={{ transform: `translateX(${virtualItem.start}px)` }}
                  aria-hidden="true"
                >
                  <span className="gallery-card-placeholder" />
                </li>
              );
            const active = reading.id === selected.id;
            const nights = reading.appearance_nights
              ?.split(",")
              .map(Number)
              .sort((a, b) => a - b) ?? [reading.night];
            const nightLabel = showNightGroups
              ? reading.position === 1
                ? `Night ${reading.night}`
                : null
              : nights.length > 2
                ? `Nights ${nights[0]} +${nights.length - 1}`
                : `${nights.length === 1 ? "Night" : "Nights"} ${nights.join(", ")}`;
            const nightTitle =
              nights.length > 1
                ? `Scheduled for nights ${nights.join(", ")}`
                : `Scheduled for night ${nights[0]}`;
            return (
              <li
                className="gallery-virtual-item"
                key={reading.id}
                style={{ transform: `translateX(${virtualItem.start}px)` }}
                data-active={active || undefined}
                data-has-night-marker={Boolean(nightLabel) || undefined}
                aria-setsize={total}
                aria-posinset={virtualItem.index + 1}
              >
                {nightLabel && (
                  <span className="gallery-night-marker" title={nightTitle} aria-hidden="true">
                    {nightLabel}
                  </span>
                )}
                <button
                  type="button"
                  className="gallery-card"
                  data-active={active || undefined}
                  data-reading-id={reading.id}
                  aria-current={active ? "true" : undefined}
                  aria-label={`${reading.title} by ${reading.author || "unknown author"}. ${nightTitle}`}
                  onClick={() => onSelect(reading)}
                >
                  <CoverArtwork reading={reading} compact />
                  <span className="gallery-card-title">{reading.title}</span>
                  <span className="gallery-card-author">
                    {reading.author || "Author not listed"}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
