# A Thousand Nights

A reading program with external links, search, and private reading progress. The landing page is static HTML. The catalog is a React app served by a Cloudflare Worker, with D1 storing the catalog and progress.

## Run locally

1. `pnpm install`
2. `pnpm db:local`
3. `pnpm import:sql && pnpm import:local`
4. `pnpm dev`

The audited input is `data/catalog.json`. Run `pnpm import:sql` to generate `data/catalog.sql`, then `pnpm import:local` or `pnpm import:remote` to load it.

Image provenance, scripts, and the work-slug database contract are in [data/IMAGE_SOURCES.md](data/IMAGE_SOURCES.md).

## Deploy

The D1 database is bound in `cloudflare.config.ts`, and the site is deployed at [thousand-nights.dwe.workers.dev](https://thousand-nights.dwe.workers.dev/). Apply migrations with `pnpm db:remote`, then import with `pnpm import:remote` when updating the catalog. Deploy with `pnpm deploy`.

## Finish GitHub sign-in

Create an [OAuth app in GitHub Developer settings](https://github.com/settings/applications/new) with:

- Application name: `A Thousand Nights`
- Homepage URL: `https://thousand-nights.dwe.workers.dev/`
- Authorization callback URL: `https://thousand-nights.dwe.workers.dev/api/auth/callback`

The client ID is configured in `cloudflare.config.ts`. The client secret is stored as a Cloudflare Worker secret in the dashboard. Keep it out of chat and source control. For local testing, replace the placeholder in ignored `.dev.vars`. GitHub's OAuth callback flow uses state and PKCE; the Worker only requests profile identity and discards the GitHub token after the callback.

The app publishes links only. Audit status is displayed next to each link. A reachable page is not treated as proof that it contains the named work.

Catalog links open the publisher's reading page. For Project Gutenberg, that is the `/ebooks/…` page where readers can choose HTML, EPUB, or another available format. The plain-text download used to verify a title stays in the audit file as evidence; it is not the default reading link.
