# learn-dsh

DSH port of the pi-based [`learn`](https://github.com/amosblomqvist/learn) study
system: graded quiz tool + lesson-log mirroring, plus the `teach` / `visualize`
skills that drive them (skills live in the repository's `.dsh/skills/`).

Status: complete (quiz + lesson-log + client slots). Installation, render
dependencies, degradation notes and rollback are documented in
`docs/migrate-learn-to-dsh.md` in the repository root.

## Load channels (development)

1. Overlay (no install):

   ```sh
   dsh web --patch ./plugins/learn-dsh/cordis.dev.yml
   ```

   `cordis.dev.yml` inserts the plugin by absolute path; startup prints
   `[learn-dsh] plugin loaded`.

2. Bundle install into a profile:

   ```sh
   dsh plugin --profile desktop add link:./plugins/learn-dsh
   ```

   Requires `pnpm install && pnpm run build` in this directory first (linked
   checkouts keep their own `node_modules` / build output).

## Render dependencies (P3)

The `visualize` skill delegates diagrams to maker subagents that render PNGs
locally. Both render chains are system-level dependencies — nothing in this
plugin installs them. Each maker checks its chain FIRST (Step 0 of its prompt)
and returns an explicit `UNAVAILABLE` report naming the missing binary and the
install command; it never silently fails or returns an unverified image.

### Mermaid chain (structure / relation / flow diagrams)

Needs the `mmdc` CLI plus a Chrome/Chromium it can drive:

```sh
npm install -g @mermaid-js/mermaid-cli   # provides mmdc (drives Chrome via puppeteer)
```

Chrome is usually auto-detected; on a bare machine install Google Chrome or
Chromium. Smoke test:

```sh
printf 'graph TD\n  A-->B\n' > .mmdc-smoke.mmd && mmdc -i .mmdc-smoke.mmd -o .mmdc-smoke.png && rm -f .mmdc-smoke.*
```

### SVG chain (geometry / spatial pictures)

Needs `rsvg-convert` (preferred) or ImageMagick's `magick` (fallback):

```sh
brew install librsvg       # provides rsvg-convert
brew install imagemagick   # fallback: provides magick
```

Smoke test: `command -v rsvg-convert || command -v magick`.

### Degradation behavior

- Missing mermaid chain → mermaid diagrams report unavailable; SVG diagrams
  are unaffected (and vice versa).
- A maker that cannot verify its render reports `UNAVAILABLE` + the missing
  dependency; the teaching session then skips the visual instead of embedding
  an unverified image.
