import React, { type MutableRefObject } from "react";
import { ArrowUpRight } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Button, buttonVariants } from "../../components/ui/button";
import { Select } from "../../components/ui/select";
import { CoverArtwork } from "./CoverArtwork";
import {
  INITIAL_EASE,
  UI_EASE,
  isUnavailable,
  previewFor,
  readingKind,
  statusOptions,
} from "./reading";
import type { NavigationIntent, Reading, ReadingStatus } from "./types";

type ReadingPreviewProps = {
  reading: Reading;
  intent: NavigationIntent;
  firstReveal: MutableRefObject<boolean>;
  quickEntrance?: boolean;
  saving: boolean;
  onProgressChange: (status: ReadingStatus | null) => void;
};

function reveal(
  intention: NavigationIntent,
  first: boolean,
  artwork = false,
  quickEntrance = false,
) {
  if (intention === "keyboard") return false;
  if (first && quickEntrance) return { opacity: 0, transform: "translateY(0px)" };
  return first
    ? { opacity: 0, filter: "blur(10px)", transform: `translateY(${artwork ? 20 : 8}px)` }
    : { opacity: 0, filter: "blur(4px)", transform: "translateY(0px)" };
}

export function ReadingPreview({
  reading,
  intent,
  firstReveal,
  quickEntrance = false,
  saving,
  onProgressChange,
}: ReadingPreviewProps) {
  const first = firstReveal.current;
  const preview = previewFor(reading);
  const transition =
    intent === "keyboard"
      ? { duration: 0 }
      : first && quickEntrance
        ? { duration: 0.18, ease: UI_EASE }
        : first
          ? { duration: 1, delay: 0.3, ease: INITIAL_EASE }
          : { duration: 0.18, ease: UI_EASE };
  const exit =
    intent === "keyboard"
      ? { opacity: 1 }
      : { opacity: 0, filter: "blur(4px)", transition: { duration: 0.1, ease: UI_EASE } };

  return (
    <section
      className="gallery-stage"
      aria-labelledby="selected-reading-title"
      data-has-image="true"
    >
      <AnimatePresence initial={first} mode="wait">
        <motion.div
          className="gallery-copy"
          key={reading.id}
          initial={reveal(intent, first, false, quickEntrance)}
          animate={{ opacity: 1, filter: "blur(0px)", transform: "translateY(0px)" }}
          exit={exit}
          transition={transition}
          onAnimationComplete={() => {
            firstReveal.current = false;
          }}
        >
          <h1 id="selected-reading-title">{reading.title}</h1>
          <p className="gallery-author">{reading.author || "Author not listed"}</p>
          {preview.description ? (
            <p className="gallery-description">{preview.description}</p>
          ) : null}

          <div className="gallery-actions">
            {!isUnavailable(reading) && (reading.resolved_url || reading.original_url) ? (
              <a
                className={buttonVariants({ variant: "primary" })}
                href={reading.resolved_url || reading.original_url || undefined}
                target="_blank"
                rel="noopener noreferrer"
              >
                Read
                <ArrowUpRight aria-hidden="true" data-icon="inline-end" />
              </a>
            ) : (
              <Button disabled>Source unavailable</Button>
            )}
            <Select
              aria-label={`Reading status: ${reading.title}`}
              options={statusOptions}
              value={reading.progress ?? "none"}
              disabled={saving}
              onValueChange={(value) =>
                onProgressChange(value === "none" ? null : (value as ReadingStatus))
              }
            />
          </div>

          <p className="gallery-meta">
            {[readingKind(reading), preview.length, preview.published]
              .filter(Boolean)
              .map((part, index) => (
                <React.Fragment key={String(part)}>
                  {index > 0 ? <span aria-hidden="true"> · </span> : null}
                  <span>{part}</span>
                </React.Fragment>
              ))}
            <span aria-hidden="true"> · </span>
            <span>Night {reading.night}</span>
          </p>
        </motion.div>
      </AnimatePresence>

      <AnimatePresence initial={first} mode="wait">
        <motion.figure
          className="gallery-artwork"
          key={reading.id}
          initial={reveal(intent, first, true, quickEntrance)}
          animate={{ opacity: 1, filter: "blur(0px)", transform: "translateY(0px)" }}
          exit={exit}
          transition={first && !quickEntrance ? { ...transition, delay: 0.34 } : transition}
        >
          <CoverArtwork reading={reading} />
          {reading.image_source_url ? (
            <figcaption className="gallery-image-credit">
              <a href={reading.image_source_url} target="_blank" rel="noopener noreferrer">
                Image: {reading.image_credit || "source"}
              </a>
            </figcaption>
          ) : null}
        </motion.figure>
      </AnimatePresence>
    </section>
  );
}
