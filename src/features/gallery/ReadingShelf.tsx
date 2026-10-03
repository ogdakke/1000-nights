import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
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
  selected: Reading;
  position: number;
  total: number;
  canGoBack: boolean;
  canGoForward: boolean;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  isFetchingNextPage: boolean;
  isFetchingPreviousPage: boolean;
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
  selected,
  position,
  total,
  canGoBack,
  canGoForward,
  hasNextPage,
  hasPreviousPage,
  isFetchingNextPage,
  isFetchingPreviousPage,
  hasLoadError,
  quickEntrance = false,
  onLoadNext,
  onLoadPrevious,
  onMove,
  onSelect,
}: ReadingShelfProps) {
  const firstItem = useRef(items[0]?.id);
  const lastCentered = useRef<string | null>(null);
  const virtualizer = useVirtualizer({
    horizontal: true,
    count: items.length + (hasNextPage ? 1 : 0),
    getScrollElement: () => carousel.current,
    estimateSize: () => CARD_STRIDE,
    overscan: 6,
  });
  const visible = virtualizer.getVirtualItems();
  const selectedIndex = items.findIndex((item) => item.id === selected.id);

  // Keep the same card under the pointer when an earlier page is prepended.
  useLayoutEffect(() => {
    const oldFirst = firstItem.current;
    const added = oldFirst ? items.findIndex((item) => item.id === oldFirst) : 0;
    if (added > 0 && carousel.current) carousel.current.scrollLeft += added * CARD_STRIDE;
    firstItem.current = items[0]?.id;
  }, [items, carousel]);

  useEffect(() => {
    if (selectedIndex >= 0 && lastCentered.current !== selected.id) {
      virtualizer.scrollToIndex(selectedIndex, { align: "center" });
      lastCentered.current = selected.id;
    }
  }, [selectedIndex, selected.id, virtualizer]);

  useEffect(() => {
    const last = visible.at(-1);
    if (last && last.index >= items.length - 4 && hasNextPage && !isFetchingNextPage && !hasLoadError)
      onLoadNext();
  }, [visible, items.length, hasNextPage, isFetchingNextPage, hasLoadError, onLoadNext]);

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
          <Button variant="ghost" size="icon" onClick={() => onMove(-1)} disabled={!canGoBack} aria-label="Previous reading">
            <ChevronLeft aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => onMove(1)} disabled={!canGoForward} aria-label="Next reading">
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
        <span aria-live="polite">{position.toLocaleString()} of {total.toLocaleString()}</span>
        {(isFetchingNextPage || isFetchingPreviousPage) && <span className="gallery-loading-more">Loading more…</span>}
      </motion.div>

      <div
        className="gallery-track"
        ref={carousel}
        onScroll={(event) => {
          if (event.currentTarget.scrollLeft < CARD_STRIDE * 3 && hasPreviousPage && !isFetchingPreviousPage)
            onLoadPrevious();
        }}
      >
        <ol className="gallery-virtual-list" style={{ width: virtualizer.getTotalSize() }}>
          {visible.map((virtualItem) => {
            const reading = items[virtualItem.index];
            if (!reading)
              return (
                <li className="gallery-virtual-item gallery-load-item" key="load-next" style={{ transform: `translateX(${virtualItem.start}px)` }}>
                  <button type="button" onClick={onLoadNext} disabled={isFetchingNextPage}>
                    {hasLoadError ? "Retry" : "More"}
                  </button>
                </li>
              );
            const active = reading.id === selected.id;
            return (
              <li
                className="gallery-virtual-item"
                key={reading.id}
                style={{ transform: `translateX(${virtualItem.start}px)` }}
                aria-setsize={total}
                aria-posinset={selectedIndex >= 0 ? position - selectedIndex + virtualItem.index : undefined}
              >
                <button
                  type="button"
                  className="gallery-card"
                  data-active={active || undefined}
                  data-reading-id={reading.id}
                  aria-current={active ? "true" : undefined}
                  aria-label={`${reading.title} by ${reading.author || "unknown author"}`}
                  onClick={() => onSelect(reading)}
                >
                  <CoverArtwork reading={reading} compact />
                  <span className="gallery-card-title">{reading.title}</span>
                  <span className="gallery-card-author">{reading.author || "Author not listed"}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
