# Theo Azriel — Web

One repository holds the personal sites, each deployed as its own Cloudflare
Worker.

```text
apps/
├── notes/      # theoazriel.com — the index and the notes (Astro)
├── gallery/    # gallery.theoazriel.com — the photographs (React, Vite)
├── home/       # home.theoazriel.com — a room of sunlight (one HTML file)
├── health/     # theoazriel.com/health/ — Fitbit dashboard (React, Vite, Worker)
└── cms-auth/   # GitHub OAuth relay for the notes editor (Worker script)
```

**notes** is a static Astro site. Its index is a quiet typographic table of
contents, and the Markdown files in `apps/notes/src/content/notes` are the
published notes. It also serves an RSS feed, a 404 page, and the notes editor
at `/admin`. `notes.theoazriel.com` stays attached to the same Worker so old
links keep resolving.

**gallery** is a photo journal: a React grid of images processed at build time
by `vite-imagetools`, with a lightbox. The source photographs live in
`apps/gallery/src/photos`.

**home** is a single hand-written page, a shadow of leaves and blinds on a
sunlit wall, after Chloe Yan's sunlit.place. The foliage is generated in the
page and there is a small tuning panel behind the icon in the corner.

**cms-auth** is a small Worker that completes the GitHub sign-in for the notes
editor. It has no domain of its own; the editor reaches it on its
`workers.dev` URL. The client id is a plain var in its `wrangler.toml`; the
secret is stored at Cloudflare with `wrangler secret put`.

**health** is the Fitbit dashboard. The local app handles Google sign-in and
account setup. The public page uses its own Worker, `theo-health`, and its
existing Durable Object. It deploys separately from the notes site. See
[`apps/health/README.md`](apps/health/README.md) for setup and data-sharing rules.
The public page shows daily steps and active zone minutes after a seven-day delay.
Blood oxygen, sleep, heart rate, HRV, and breathing rate stay private.
Credentials and health records must stay out of Git.

## Run

Bun installs the packages and runs the scripts. Node.js (the version in
`.nvmrc`) still runs the tools, the local health server, and the tests.

```bash
bun install
bun run dev:notes
bun run dev:gallery
bun run dev:home
bun run dev:cms-auth
bun run dev:health
```

## Check

```bash
bun run check
```

That runs Prettier, ESLint, `astro check`, the notes and gallery builds, and a
dry-run deploy of the two Workers that have no build step. The same command
runs in CI on every pull request. It also builds the public health page, runs
its tests, and checks its Worker without deploying. `bun run format` rewrites files to the house
style.

## Deploy

Merging to `main` deploys. Each app has a workflow in `.github/workflows`
that runs only when that app, the lockfile, or the workflow itself changed.
To deploy by hand:

```bash
bun run deploy:notes
bun run deploy:gallery
bun run deploy:home
bun run deploy:cms-auth
bun run deploy:health
```

## Publish a note

1. Add a Markdown file to `apps/notes/src/content/notes`, or write it in the
   editor at `theoazriel.com/admin`.
2. While `draft: true`, the note renders only at the unlisted, noindex
   `theoazriel.com/drafts/<slug>` for proofreading.
3. Set `draft: false` in its frontmatter.
4. Commit and push, or publish from the editor.
5. The notes workflow builds and deploys; the note appears on the index and at
   `theoazriel.com/notes/<slug>`.

The editor is Sveltia CMS, loaded from a pinned version with an integrity
hash in `apps/notes/public/admin/index.html`, since that script ends up with
write access to this repository. The comment there explains how to upgrade
it. Its collection fields in `apps/notes/public/admin/config.yml` must match
the content schema in `apps/notes/src/content.config.ts`.

## Credits

The gallery began as a fork of
[dmitrykurash/holocloth](https://github.com/dmitrykurash/holocloth) and once
showed the photographs on a simulated cloth. That simulation has since been
removed, but the site's bones and its name in the git history come from
there.
