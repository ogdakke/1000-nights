import { useEffect, useState } from "react";
import { cn } from "../../lib/utils";
import { coverFor } from "./reading";
import type { Reading } from "./types";

export function CoverImage({
  reading,
  decorative = false,
}: {
  reading: Reading;
  decorative?: boolean;
}) {
  const source = coverFor(reading);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setFailed(false);
    setLoaded(false);
  }, [source]);

  if (!source || failed) return null;
  return (
    <img
      src={source}
      alt={decorative ? "" : reading.image_alt || ""}
      aria-hidden={decorative || undefined}
      data-loaded={loaded || undefined}
      onLoad={() => setLoaded(true)}
      onError={() => setFailed(true)}
      draggable={false}
    />
  );
}

export function CoverArtwork({ reading, compact = false }: { reading: Reading; compact?: boolean }) {
  if (!reading.image_url) return null;
  return (
    <div className={cn("book-cover", compact && "book-cover-compact")} data-kind={reading.kind}>
      <CoverImage reading={reading} decorative={compact} />
    </div>
  );
}
