import type { ChangeEvent, RefObject } from "react";
import { Search } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "../../components/ui/button";
import { INITIAL_EASE } from "./reading";
import type { Profile } from "./types";

type GalleryHeaderProps = {
  profile?: Profile;
  query: string;
  searchInput: RefObject<HTMLInputElement | null>;
  signingOut: boolean;
  onQueryChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onSignIn: () => void;
  onSignOut: () => void;
};

export function GalleryHeader({
  profile,
  query,
  searchInput,
  signingOut,
  onQueryChange,
  onSignIn,
  onSignOut,
}: GalleryHeaderProps) {
  return (
    <motion.header
      className="gallery-header"
      initial={{ opacity: 0, filter: "blur(10px)", transform: "translateY(20%)" }}
      animate={{ opacity: 1, filter: "blur(0px)", transform: "translateY(0%)" }}
      transition={{ duration: 1, delay: 0.1, ease: INITIAL_EASE }}
    >
      <div className="gallery-header-inner">
        <a className="gallery-home" href="/">
          A Thousand Nights
        </a>
        <label className="gallery-search">
          <Search aria-hidden="true" />
          <input
            ref={searchInput}
            value={query}
            onChange={onQueryChange}
            placeholder="Search titles and authors"
            aria-label="Search readings"
            enterKeyHint="search"
          />
          <kbd>⌘ K</kbd>
        </label>
        <div className="gallery-account">
          {profile?.user ? (
            <>
              <span>{profile.user.name}</span>
              <Button variant="ghost" size="small" onClick={onSignOut} disabled={signingOut}>
                Sign out
              </Button>
            </>
          ) : (
            <Button variant="ghost" size="small" onClick={onSignIn} disabled={!profile}>
              Sign in
            </Button>
          )}
        </div>
      </div>
    </motion.header>
  );
}
