# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Trimble Connect 3D Viewer side-panel extension ("Søk Armering") that lists visible reinforcement grouped by posisjonsnummer, with bidirectional click-to-select-and-zoom between the list and the 3D model. See [README.md](README.md) for user-facing feature docs and the property-name mapping table.

## Commands

```bash
npm install       # only dependency is trimble-connect-workspace-api (dist copied into vendor/, see below)
npm run dev        # starts http-server on :8080 with --cors, for local sanity-checking only
```

No build step, bundler, or test suite — this is plain HTML/JS served as static files. `npm run dev` only proves the page loads without JS errors; `WorkspaceAPI.connect()` won't get real viewer data unless the page is actually running as an iframe inside Trimble Connect (see Deployment/testing below).

## Architecture

Everything lives in two files:

- **`index.html`** — markup, inline `<style>`, loads `vendor/trimbleconnect.workspace.api.js` then `app.js`.
- **`app.js`** — all logic, in this data flow:
  1. `main()` calls `TrimbleConnectWorkspace.connect(window.parent, callback, 30000)` once on load.
  2. `fetchRebarList()` (triggered by the "Oppdater liste" button) calls `viewer.getObjects(undefined, {visible: true})` to get visible object ids per model, then `viewer.getObjectProperties(modelId, ids)` per model to get full properties.
  3. `isRebar()` filters objects by IFC class (`IfcReinforcingBar`/`IfcReinforcingMesh`) or the `Common Type` property, as a fallback for models where the class field isn't populated.
  4. `findProperty()` reads a named property out of an object's `PropertySet[]`, scanning across all property sets (exact match, then case-insensitive fallback) — this is intentionally not scoped to one Pset name, since the same-named field could land in different Psets depending on the model/export.
  5. Matching objects are grouped by posisjonsnummer into `rows` (a `Map` keyed by postnr, each value carrying `entries: [{modelId, runtimeId}]` for every physical bar with that number).
  6. `renderTable()` draws `rows` into `<tbody>`; clicking a row calls `selectAndZoom()`, which builds a `modelObjectIds` selector via `buildSelector()` and calls `viewer.setSelection()` + `viewer.setCamera()`.
  7. The reverse direction: the `connect()` callback listens for `viewer.onSelectionChanged` and calls `handleViewerSelection()`, which finds which `rows` group contains the picked object, **re-issues `setSelection()` with the whole group's entries** (so clicking one bar in the viewer highlights every bar sharing that postnr, not just the one clicked), and reorders that row to the top of `rows` with a `.selected` CSS class.
  8. **Feedback-loop guard:** `handleViewerSelection` is only invoked when `args.origin.isSelf` is falsy. Our own `setSelection()` calls (from both directions) fire `onSelectionChanged` again with `origin.isSelf: true` — without this check, expanding a selection would re-trigger the handler recursively.

### Coupling to model authoring conventions

`findProperty(propertySets, names)` accepts either a single property name or an array of candidate names, tried in order (see README's property table for the current Tekla ↔ RIB mapping) — this was added 2026-07 after adding the extension to the real Kolbotn project surfaced a RIB-exported model where every element landed in "(mangler postnr)" despite being correctly detected as rebar, because RIB uses `"ARM.07 - Posnr"`-style names instead of Tekla's `"Posisjonsnummer"`. The `REBAR_CLASSES`/`REBAR_COMMON_TYPES` constants didn't need equivalent per-convention lists — IFC class detection worked unchanged across both.

This is shared code — one repo, one deployed URL, used by every Trimble Connect project that adds the extension via manifest.json. Adding a new export convention's candidate names is additive and safe (existing conventions keep matching), but changing an *existing* candidate name's value affects every project relying on it, not just one model.

**How the RIB names were confirmed, not guessed:** Trimble Connect's own property panel display isn't guaranteed to be the literal raw property name. To get ground truth, the actual `ARM.XX - ...` names were read via the browser console, in the extension's own iframe (not the Trimble Connect host page, which has unrelated noise) — `API.viewer.getSelection()` → `API.viewer.getObjectProperties(modelId, [runtimeId])` → `console.log(JSON.stringify(props[0].properties, null, 2))` — against a real selected element in the live Kolbotn project. Same technique to use if another project surfaces yet another naming convention.

## Deployment / testing loop

- `manifest.json.url` and `.icon` point at GitHub Pages (`https://kasterna.github.io/rebar-postliste/...`). Trimble Connect fetches `manifest.json` once when an admin adds the Custom Extension in a project's Project Settings → Extensions, and **does not** re-fetch it automatically when the file changes — title/icon changes require removing and re-adding the extension in that UI (there's also an edit/pencil option to try first).
- GitHub Pages free tier requires the repo to stay **public** — there's no secrets/keys in this codebase, so that's an accepted tradeoff.
- This machine has **no `gh` CLI** — pushing is done through GitHub Desktop by the user, not `git push` from the agent. After committing locally, tell the user to push via GitHub Desktop and wait ~1 minute for Pages to rebuild before re-testing in Trimble Connect.
- Because there's no real Trimble Connect parent frame in local dev, the only thing `npm run dev` can validate is "no console errors, DOM renders." Functional testing (does the table populate, does selection sync work) requires the user to reload the extension panel inside an actual Trimble Connect project with a loaded model.
