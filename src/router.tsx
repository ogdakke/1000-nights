import { Outlet, createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { GalleryPage } from "./features/gallery/GalleryPage";

const rootRoute = createRootRoute({
  component: Outlet,
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
  component: GalleryPage,
});

const readingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/read/$author/$title",
  component: function ReadingGalleryRoute() {
    return <GalleryPage route={readingRoute.useParams()} />;
  },
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
