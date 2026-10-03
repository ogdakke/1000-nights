import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Search,
  Sparkles,
  UserRound,
} from "lucide-react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import "./style.css";

const cx = (...classes: Parameters<typeof clsx>) => twMerge(clsx(...classes));
const button = cva("ui-button", {
  variants: {
    variant: { gold: "ui-button-gold", outline: "ui-button-outline", ghost: "ui-button-ghost" },
    size: { normal: "", small: "ui-button-small" },
  },
  defaultVariants: { variant: "gold", size: "normal" },
});
function Button({
  asChild = false,
  variant,
  size,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof button> & { asChild?: boolean }) {
  const Component = asChild ? Slot : "button";
  return <Component className={cx(button({ variant, size }), className)} {...props} />;
}
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
  progress: string | null;
};
type Page = { items: Reading[]; total: number; page: number; pageSize: number };
type Profile = {
  user: { id: string; name: string; avatar_url: string | null } | null;
  counts: Record<string, number> | null;
  authAvailable: boolean;
};

function App() {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => {
      setSearch(query);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [query]);
  useEffect(() => {
    let live = true;
    setBusy(true);
    fetch(`/api/readings?page=${page}&q=${encodeURIComponent(search)}`)
      .then((r) => {
        if (!r.ok) throw new Error("Catalog unavailable");
        return r.json() as Promise<Page>;
      })
      .then((d) => {
        if (live) {
          setData(d);
          setError("");
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setBusy(false);
      });
    return () => {
      live = false;
    };
  }, [page, search]);
  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json() as Promise<Profile>)
      .then(setProfile)
      .catch(() => {});
  }, []);
  async function update(reading: Reading, status: string | null) {
    if (!profile?.user) {
      if (profile?.authAvailable) location.href = "/api/auth/github";
      else setError("Sign-in is being configured. You can still browse the library.");
      return;
    }
    const response = await fetch("/api/progress", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ readingId: reading.id, status }),
    });
    if (!response.ok) {
      setError("Progress could not be saved.");
      return;
    }
    setData(
      (old) =>
        old && {
          ...old,
          items: old.items.map((item) =>
            item.id === reading.id ? { ...item, progress: status } : item,
          ),
        },
    );
    fetch("/api/profile")
      .then((r) => r.json() as Promise<Profile>)
      .then(setProfile)
      .catch(() => {});
  }
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    location.reload();
  }
  const pageCount = Math.ceil((data?.total ?? 0) / 30);
  return (
    <div className="app-layout">
      <header className="app-header">
        <a className="wordmark" href="/">
          ✦ <span>A Thousand Nights</span>
        </a>
        <div className="app-header-right">
          <span className="header-label">The reading room</span>
          {profile?.user ? (
            <button className="profile-button" onClick={logout} title="Sign out">
              <UserRound size={17} />
              {profile.user.name}
              <span className="signout">Sign out</span>
            </button>
          ) : profile?.authAvailable ? (
            <Button asChild size="small">
              <a href="/api/auth/github">Sign in</a>
            </Button>
          ) : (
            <span className="header-label">Sign-in soon</span>
          )}
        </div>
      </header>
      <main className="catalog-shell">
        <aside className="sidebar">
          <div className="sidebar-top">
            <p className="eyebrow">Your journey</p>
            <h2>
              One night
              <br />
              at a time.
            </h2>
            <div className="sidebar-rule" />
            <p className="sidebar-description">
              A thousand evenings of stories, poems and essays. Follow the path or wander wherever
              curiosity leads.
            </p>
          </div>
          <div className="progress-panel">
            <div className="progress-icon">
              <BookOpen size={19} />
            </div>
            <p className="progress-label">Your reading shelf</p>
            {profile?.user ? (
              <>
                <strong>
                  {profile.counts?.read ?? 0} <span>read</span>
                </strong>
                <p>
                  {profile.counts?.reading ?? 0} in progress · {profile.counts?.want_to_read ?? 0}{" "}
                  saved
                </p>
              </>
            ) : (
              <>
                <strong>
                  Begin <span>anywhere</span>
                </strong>
                <p>Sign in to mark readings and keep your place.</p>
              </>
            )}
          </div>
          <div className="sidebar-bottom">✦ &nbsp; An archive of links, not texts</div>
        </aside>
        <section className="catalog">
          <div className="catalog-heading">
            <div>
              <p className="eyebrow">The complete program</p>
              <h1>
                Explore the <em>library.</em>
              </h1>
              <p>Find a work, open its source, and return when you are ready.</p>
            </div>
            <div className="catalog-count">
              <Sparkles size={17} />
              <span>{data?.total ?? "3,000"} readings</span>
            </div>
          </div>
          <label className="search-box">
            <Search size={20} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by title or author"
              aria-label="Search readings"
            />
            <span>⌘ K</span>
          </label>
          <div className="list-meta">
            <span>{search ? `Results for “${search}”` : "All readings"}</span>
            <span>{data?.total ?? 0} works</span>
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {busy && <p className="loading">Opening the shelves…</p>}
          {!busy && data?.items.length === 0 && (
            <div className="empty">No readings found. Try another title or author.</div>
          )}
          <div className="reading-list">
            {data?.items.map((item) => (
              <article className="reading" key={item.id}>
                <div className="night-badge">
                  <small>NIGHT</small>
                  <strong>{String(item.night).padStart(3, "0")}</strong>
                </div>
                <div className="reading-main">
                  <div className="reading-kicker">
                    {item.kind?.replaceAll("_", " ") ||
                      ["Short story", "Poem", "Essay"][item.position] ||
                      "Reading"}
                    <span>·</span>
                    <span className={`audit audit-${item.link_status.replace(/[^a-z0-9]/gi, "-")}`}>
                      {item.link_status.replace(/_/g, " ")}
                    </span>
                  </div>
                  <h3>{item.title}</h3>
                  <p>{item.author || "Author not listed"}</p>
                  {item.evidence && item.link_status !== "verified" && (
                    <details>
                      <summary>Link note</summary>
                      <span>{item.evidence}</span>
                    </details>
                  )}
                </div>
                <div className="reading-actions">
                  {!["broken", "mismatch", "content_mismatch"].includes(item.link_status) &&
                  (item.resolved_url || item.original_url) ? (
                    <a
                      className="open-link"
                      href={item.resolved_url || item.original_url || "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Open ${item.title}`}
                    >
                      <ExternalLink size={18} />
                    </a>
                  ) : (
                    <span className="missing-link">No link</span>
                  )}
                  <select
                    className="status-select"
                    value={item.progress || ""}
                    onChange={(e) => update(item, e.target.value || null)}
                    aria-label={`Reading status: ${item.title}`}
                  >
                    <option value="">No status</option>
                    <option value="want_to_read">Save for later</option>
                    <option value="reading">Reading</option>
                    <option value="read">Read</option>
                  </select>
                  <button
                    className={cx("read-toggle", item.progress === "read" && "is-read")}
                    onClick={() => update(item, item.progress === "read" ? null : "read")}
                    title={item.progress === "read" ? "Mark unread" : "Mark read"}
                    aria-label={`${item.progress === "read" ? "Mark unread" : "Mark read"}: ${item.title}`}
                  >
                    <Check size={18} />
                  </button>
                </div>
              </article>
            ))}
          </div>
          {pageCount > 1 && (
            <nav className="pagination" aria-label="Catalog pages">
              <Button
                variant="outline"
                size="small"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                <ChevronLeft size={16} /> Previous
              </Button>
              <span>
                Page {page} of {pageCount}
              </span>
              <Button
                variant="outline"
                size="small"
                disabled={page >= pageCount}
                onClick={() => setPage(page + 1)}
              >
                Next <ChevronRight size={16} />
              </Button>
            </nav>
          )}
        </section>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
