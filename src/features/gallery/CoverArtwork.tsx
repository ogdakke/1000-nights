import { useEffect, useState } from "react";
import { cn } from "../../lib/utils";
import { coverFor } from "./reading";
import type { Reading } from "./types";

const FALLBACK_COVER = "/images/fallback-cover.webp";

export function CoverImage({
  reading,
  decorative = false,
}: {
  reading: Reading;
  decorative?: boolean;
}) {
  const source = coverFor(reading);
  const [fallback, setFallback] = useState(!source);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setFallback(!source);
    setFailed(false);
    setLoaded(false);
  }, [source]);

  if (failed) return null;
  const imageSource = fallback ? FALLBACK_COVER : source;

  return (
    <img
      src={imageSource || FALLBACK_COVER}
      alt={decorative || fallback ? "" : reading.image_alt || ""}
      aria-hidden={decorative || fallback || undefined}
      data-loaded={loaded || undefined}
      onLoad={() => setLoaded(true)}
      onError={() => {
        if (fallback) setFailed(true);
        else {
          setFallback(true);
          setLoaded(false);
        }
      }}
      draggable={false}
    />
  );
}

export function CoverArtwork({
  reading,
  compact = false,
}: {
  reading: Reading;
  compact?: boolean;
}) {
  return (
    <div className={cn("book-cover", compact && "book-cover-compact")} data-kind={reading.kind}>
      <CoverImage reading={reading} decorative={compact} />
    </div>
  );
}
