# Kadr Samsung Tizen Client — `v1.0.0` Milestone Roadmap

**Date:** 2026-11-19
**Target Hardware:** Samsung Tizen TV (`Tizen 5.0+`, verified on `UA55TU7000UXEG` Tizen 5.5 / Chromium 69) & Web Dev Harness
**Companion Server:** Kadr Media Server (`/home/boody/work/personal/kadr`)

---

## Overview & Decomposition

To take `kadr-tizenos` from `v0.1.1` to a production-ready **`v1.0.0`** living-room release, the remaining capabilities are decomposed into **7 independent, ordered sub-projects**. Each sub-project goes through its own focused **Design Spec → Implementation Plan → Subagent-Driven Implementation & Verification** cycle so every phase ships working, tested software on `main`.

| Order | Sub-Project | Scope | Primary Areas |
| :--- | :--- | :--- | :--- |
| **1** | **Tizen Hardware Lifecycle & Session Resilience** | `kadr-tizenos` | `config.xml`, `avplay-driver.ts`, `PlayerScreen.tsx`, `BrowseScreen.tsx`, `api/client.ts`, `App.tsx` |
| **2** | **Episode & Media Watch Controls** | `kadr-tizenos` (+ `kadr` check) | `ItemDetailModal.tsx`, `api/playback.ts`, `utils/playbackProgress.ts`, `App.tsx` |
| **3** | **Multi-Audio Track Switching** | `kadr` + `kadr-tizenos` | `kadr-ingest` (`ffprobe`), `kadr-server` (HLS audio map & item streams), `PlayerOSD.tsx`, `avplay-driver.ts`, `PlayerScreen.tsx` |
| **4** | **Global Search Screen** | `kadr-tizenos` | `api/search.ts`, `screens/SearchView.tsx` (D-pad keyboard + IME + type filters), `BrowseScreen.tsx` |
| **5** | **Dedicated Music & Audiobook Player UI** | `kadr-tizenos` | `components/player/AudioPlayerOverlay.tsx`, `PlayerScreen.tsx`, screensaver/dimming rules |
| **6** | **Large-Folder & Season Row Virtualization** | `kadr-tizenos` | `FolderBrowserModal.tsx`, `ItemDetailModal.tsx`, viewport row windowing (`> 60` items) + `CH_UP`/`CH_DOWN` focus |
| **7** | **Settings Tab & `v1.0.0` Release Pipeline** | `kadr-tizenos` | `screens/SettingsView.tsx` (HLS quality cap, audio/subtitle defaults, diagnostics), `tsconfig.node.json`, `config.xml` & `package.json` (`1.0.0`), `.github/workflows/ci.yml` |

---

## Dependency Rationale

1. **Sub-Project 1 first** establishes Samsung TV hardware lifecycle rules (`webapis.appcommon.setScreenSaver`, `visibilitychange` `avplay.suspend`/`restore`, root Back exit via `tizen.application.getCurrentApplication().exit()`) and global `401` token-expiry recovery in `ApiClient` before new screens and player modes build on them.
2. **Sub-Project 2 second** completes `ItemDetailModal` watch-state controls (*Play from Beginning* on resumable episodes + manual *Mark Watched / Unwatched*).
3. **Sub-Project 3 third** pairs with the existing MKV embedded subtitle pipeline to add multi-audio stream probing, HLS/Direct-Play audio track switching, and preferred audio language persistence—which Sub-Project 7's Settings tab later surfaces globally.
4. **Sub-Project 4 fourth** adds global search against Kadr's existing `/api/v1/search` FTS5 endpoint as an isolated sidebar view.
5. **Sub-Project 5 fifth** builds the dedicated cover-art & track-queue player UI for `music` and `audiobook` libraries atop finalized audio/lifecycle primitives.
6. **Sub-Project 6 sixth** adds DOM row windowing over finalized `FolderBrowserModal` and `ItemDetailModal` card layouts to protect 1.5 GB RAM TVs on `200+` item folders.
7. **Sub-Project 7 last** unifies all player/quality/language preferences into a Settings view, bumps version metadata to `1.0.0`, and locks in automated CI + `.wgt` packaging.

---

## Global Platform Invariants (All Sub-Projects)

- **Chromium 69 / Tizen 5.5 CSS Safety:** Zero CSS flexbox `gap-*` utility classes anywhere in JSX or stylesheets; use explicit physical margins.
- **AVPlay Hardware Plane Transparency:** Keep browse screens and modal trees unmounted whenever video `AVPlay` is active, and render zero opaque wrapper layers above the video container.
- **Strict Layered Back Navigation:** Every modal, popup, keyboard, and view must unwind strictly one UI layer at a time on `TVKeys.BACK_TIZEN` (`10009`) / `Escape` / `Backspace` (outside text inputs).
