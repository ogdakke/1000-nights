import type { RefObject } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "../../components/ui/button";
import { CoverArtwork } from "./CoverArtwork";
import { INITIAL_EASE } from "./reading";
import type { Reading } from "./types";

type ReadingShelfProps = {
  carousel: RefObject<HTMLDivElement | null>;
  items: Reading[];
  selected: Reading;
  position: number;
  total: number;
  canGoBack: boolean;
  canGoForward: boolean;
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
  onMove,
  onSelect,
}: ReadingShelfProps) {
  return (
    <section className="gallery-shelf" aria-label="Reading gallery">
      <motion.div
        className="gallery-shelf-toolbar"
        initial={{ opacity: 0, filter: "blur(10px)", transform: "translateY(20%)" }}
        animate={{ opacity: 1, filter: "blur(0px)", transform: "translateY(0%)" }}
        transition={{ duration: 1, delay: 0.5, ease: INITIAL_EASE }}
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

      <div className="gallery-track" ref={carousel}>
        <ol>
          {items.map((reading, index) => {
            const active = reading.id === selected.id;
            return (
              <motion.li
                key={reading.id}
                initial={{ opacity: 0, filter: "blur(10px)", transform: "translateY(20px)" }}
                animate={{ opacity: 1, filter: "blur(0px)", transform: "translateY(0px)" }}
                transition={{
                  duration: 1,
                  delay: 0.5 + Math.min(index, 8) * 0.04,
                  ease: INITIAL_EASE,
                }}
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
              </motion.li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
