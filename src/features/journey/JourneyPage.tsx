import { useEffect } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowUpRight, Check } from "lucide-react";
import { Button, buttonVariants } from "../../components/ui/button";
import { CoverArtwork } from "../gallery/CoverArtwork";
import { getJourney, getProfile, saveProgress } from "../gallery/api";
import { readingKind, readingParams } from "../gallery/reading";
import type { JourneyNight, JourneyReading } from "../gallery/types";
import "./journey.css";

function readingPath(reading: JourneyReading) {
  const { author, title } = readingParams(reading);
  return `/read/${author}/${title}?night=${reading.night}`;
}

function NightReading({ reading, onFinish, saving }: {
  reading: JourneyReading;
  onFinish: (reading: JourneyReading) => void;
  saving: boolean;
}) {
  return (
    <li className="journey-reading" data-finished={reading.progress === "read" || undefined}>
      <a className="journey-reading-cover" href={readingPath(reading)} aria-label={`Open ${reading.title}`}>
        <CoverArtwork reading={reading} compact />
      </a>
      <div className="journey-reading-copy">
        <a href={readingPath(reading)}>{reading.title}</a>
        <span>{reading.author || "Author not listed"} · {readingKind(reading)}</span>
      </div>
      <Button
        variant={reading.progress === "read" ? "secondary" : "ghost"}
        size="small"
        aria-label={`${reading.progress === "read" ? "Mark unread" : "Mark finished"}: ${reading.title}`}
        disabled={saving}
        onClick={() => onFinish(reading)}
      >
        <Check aria-hidden="true" />
        {reading.progress === "read" ? "Finished" : "Finish"}
      </Button>
    </li>
  );
}

function Chapter({ index, nights }: { index: number; nights: JourneyNight[] }) {
  const start = index * 100 + 1;
  const chapter = nights.filter((night) => night.night >= start && night.night < start + 100);
  const complete = chapter.filter((night) => night.finished === night.total).length;
  return (
    <div className="journey-chapter">
      <div><span>Nights {start}–{Math.min(start + 99, 1000)}</span><strong>{complete} / {chapter.length}</strong></div>
      <div className="journey-chapter-bar" role="progressbar" aria-label={`Nights ${start} to ${start + 99} completed`} aria-valuenow={complete} aria-valuemin={0} aria-valuemax={chapter.length}>
        <span style={{ width: `${chapter.length ? complete / chapter.length * 100 : 0}%` }} />
      </div>
    </div>
  );
}

export function JourneyPage() {
  const client = useQueryClient();

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "My journey · A Thousand Nights";
    return () => {
      document.title = previousTitle;
    };
  }, []);

  const profile = useQuery({ queryKey: ["profile"], queryFn: getProfile });
  const journey = useInfiniteQuery({
    queryKey: ["journey"],
    queryFn: ({ pageParam }) => getJourney(pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) => last.hasMoreHistory ? last.page + 1 : undefined,
    enabled: Boolean(profile.data?.user),
  });
  const finish = useMutation({
    mutationFn: (reading: JourneyReading) => saveProgress(reading, reading.progress === "read" ? null : "read"),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["journey"] });
      void client.invalidateQueries({ queryKey: ["profile"] });
      void client.invalidateQueries({ queryKey: ["readings"] });
    },
  });
  const data = journey.data?.pages[0];
  const nights = data?.nights ?? [];
  const finishedNights = nights.filter((night) => night.finished === night.total).length;
  const finishedReadings = nights.reduce((sum, night) => sum + night.finished, 0);
  const totalReadings = nights.reduce((sum, night) => sum + night.total, 0);
  const currentNight = data?.tonight[0]?.night;
  const history = journey.data?.pages.flatMap((page) => page.history) ?? [];

  return (
    <div className="journey-page">
      <header className="journey-header">
        <div className="journey-header-inner">
          <a href="/app/" className="journey-back"><ArrowLeft aria-hidden="true" /> Library</a>
          {profile.data?.user ? <span>{profile.data.user.name}</span> : null}
        </div>
      </header>
      <main className="journey-main">
        <div className="journey-intro">
          <h1>My journey</h1>
          <p>Your next unfinished night, the ground you’ve covered, and everything you’ve finished.</p>
        </div>

        {profile.isPending ? <p className="journey-state">Loading…</p> : !profile.data?.user ? (
          <div className="journey-signin">
            <h2>Save your place.</h2>
            <p>Sign in to see your next night and keep track of what you finish.</p>
            <a className={buttonVariants({ variant: "primary" })} href="/api/auth/github">Sign in with GitHub</a>
          </div>
        ) : journey.isPending ? <p className="journey-state">Loading your progress…</p> : journey.isError ? (
          <p className="journey-state" role="alert">{journey.error.message}</p>
        ) : data ? (
          <>
            <section className="journey-stats" aria-label="Reading progress">
              <div><strong>{finishedNights.toLocaleString()}</strong><span>Nights <small>of {nights.length.toLocaleString()}</small></span></div>
              <div><strong>{finishedReadings.toLocaleString()}</strong><span>Readings <small>of {totalReadings.toLocaleString()}</small></span></div>
              <div><strong>{Math.round(finishedReadings / Math.max(totalReadings, 1) * 100)}%</strong><span>Complete</span></div>
            </section>

            <section className="journey-tonight" aria-labelledby="journey-tonight-heading">
              <div className="journey-section-heading">
                <h2 id="journey-tonight-heading">{currentNight ? "Continue reading" : "The final page"}</h2>
                {currentNight ? <span>Night {currentNight} · {data.tonight.filter((reading) => reading.progress === "read").length} of {data.tonight.length} finished</span> : null}
              </div>
              {currentNight ? (
                <ul className="journey-reading-list">
                  {data.tonight.map((reading) => <NightReading key={reading.id} reading={reading} saving={finish.isPending && finish.variables?.id === reading.id} onFinish={(item) => finish.mutate(item)} />)}
                </ul>
              ) : <p className="journey-complete">You’ve finished all 1,000 nights. The library is still yours to revisit.</p>}
              {finish.isError ? <p className="journey-error" role="alert">{finish.error.message}</p> : null}
            </section>

            <section className="journey-map" aria-labelledby="journey-map-heading">
              <div className="journey-section-heading"><h2 id="journey-map-heading">A thousand nights</h2><span>{finishedNights.toLocaleString()} completed</span></div>
              <div className="journey-chapters">{Array.from({ length: 10 }, (_, index) => <Chapter key={index} index={index} nights={nights} />)}</div>
            </section>

            <section className="journey-history" aria-labelledby="journey-history-heading">
              <div className="journey-section-heading"><h2 id="journey-history-heading">Finished readings</h2><span>{finishedReadings.toLocaleString()} total</span></div>
              {history.length ? <ul className="journey-history-list">{history.map((reading) => (
                <li key={reading.id}><span className="journey-history-night">Night {reading.night}</span><a href={readingPath(reading)}>{reading.title}<ArrowUpRight aria-hidden="true" /></a><span>{reading.author || "Author not listed"}</span></li>
              ))}</ul> : <p className="journey-empty">Your first finished reading will appear here.</p>}
              {journey.hasNextPage ? <Button variant="secondary" onClick={() => void journey.fetchNextPage()} disabled={journey.isFetchingNextPage}>{journey.isFetchingNextPage ? "Loading…" : "Show more"}</Button> : null}
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}
