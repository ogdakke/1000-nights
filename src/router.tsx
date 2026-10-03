import { createRootRoute, createRoute, createRouter, useRouterState } from "@tanstack/react-router";
import { GalleryPage } from "./features/gallery/GalleryPage";
import { JourneyPage } from "./features/journey/JourneyPage";

function GalleryRoot() {
  const path = useRouterState({ select: (state) => state.location.pathname });
  if (path === "/progress" || path === "/progress/") return <JourneyPage />;
  const match = /^\/read\/([^/]+)\/([^/]+)\/?$/.exec(path);
  const night = Number.parseInt(new URLSearchParams(window.location.search).get("night") || "", 10);
  return <GalleryPage route={match ? { author: match[1], title: match[2], night: Number.isInteger(night) && night >= 1 && night <= 1000 ? night : undefined } : undefined} />;
}

const rootRoute = createRootRoute({
  component: GalleryRoot,
  notFoundComponent: () => (
    <main className="route-not-found">
      <h1>Page not found</h1>
      <a href="/app/">Browse the library</a>
    </main>
  ),
});

const libraryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/app",
});

const readingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/read/$author/$title",
});

const progressRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/progress",
});

const routeTree = rootRoute.addChildren([libraryRoute, readingRoute, progressRoute]);

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
