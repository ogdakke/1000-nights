import { createRootRoute, createRoute, createRouter, useRouterState } from "@tanstack/react-router";
import { GalleryPage } from "./features/gallery/GalleryPage";

function GalleryRoot() {
  const path = useRouterState({ select: (state) => state.location.pathname });
  const match = /^\/read\/([^/]+)\/([^/]+)\/?$/.exec(path);
  return <GalleryPage route={match ? { author: match[1], title: match[2] } : undefined} />;
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

const routeTree = rootRoute.addChildren([libraryRoute, readingRoute]);

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
