# Sub-Project 7 (Final): Settings Tab & `v1.0.0` Release Pipeline — Design Spec

**Date:** 2026-11-22
**Parent Roadmap:** `docs/superpowers/specs/2026-11-19-v1-milestone-roadmap.md` (Phase 7 of 7 — `v1.0.0` Milestone Completion)
**Target Hardware:** Samsung Tizen TV (`Tizen 5.0+`, verified on `UA55TU7000UXEG` Tizen 5.5 / Chromium 69) & Web Dev Harness
**Repositories:**
- Client: `/home/boody/work/personal/kadr-tizenos`
- Server (existing `/api/v1/discover` endpoint, zero backend changes): `/home/boody/work/personal/kadr`

---

## 1. Purpose & Problem Statement

Sub-Projects 1–6 delivered hardware lifecycle resilience, watch-state controls, multi-audio track switching, global search, the dedicated Music & Audiobook player, and row/strip virtualization. To ship `kadr-tizenos` **`v1.0.0`**, four final gaps remain:
1. **No Centralized TV Settings Screen:** Playback quality (`SAMSUNG_TV_HLS_MAX_HEIGHT = 1080`) is hardcoded, `forceHtml5` can only be toggled after a playback error, audio/subtitle/audiobook defaults can only be edited mid-playback, and unlocked private libraries cannot be re-locked without logging out.
2. **Legacy `gap-*` Remnants in 3 `v0.1.1` Components:** `CardCarouselWidget.tsx`, `HeroSpotlightWidget.tsx`, and `KeypadGrid.tsx` still contain the last 7 `gap-*` occurrences in `src/`, preventing a repo-wide zero-`gap-*` CI gate.
3. **Build Typecheck & Version Alignment (`0.1.1 -> 1.0.0`):** `npm run build` runs `tsc -b` without referencing `tsconfig.node.json` (`vite.config.ts`), and `package.json` + `config.xml` still report `0.1.1`.
4. **Automated CI & `.wgt` Release Pipeline:** No GitHub Actions workflow exists to enforce zero-`gap-*`, dual TypeScript compilation, the full Vitest suite, `chrome69` bundle compilation, and automated `.wgt` + `SHA256` GitHub Release publishing on `v*` tags.

---

## 2. Approved UX & Release Decisions

1. **Dedicated `Settings` Sidebar Tab (`<SettingsView />`) with Split Category Rail + Control Cards:**
   - Added in `BrowseScreen` sidebar (`id="nav-screen-settings"`, `order = screenItems.length + 3`, right below `Playlists` and above `Switch Profile`).
   - **Left Category Rail (`w-[380px] shrink-0 mr-10`):** 4 categories (`Playback & Quality`, `Audio & Subtitles`, `Account & Privacy`, `TV Diagnostics & About`).
   - **Right Control Panel (`flex-1 min-w-0`):** D-pad focusable setting cards and pill selectors that persist changes immediately to `localStorage`.
2. **GitHub Actions CI Gate + Tag-Triggered `v*` Release (Optional Secret-Backed Tizen Signing):**
   - Runs repo-wide `(! grep -rn "gap-" src/)`, dual TypeScript checks (`tsconfig.json` + `tsconfig.node.json`), full Vitest suite, `chrome69` build, and `.wgt` + `.sha256` artifact generation on every push/PR; on `v*` tags, signs with Tizen CLI if certificate secrets are configured (falling back cleanly to standard `.wgt` zip archive) and publishes a GitHub Release with `kadr.wgt` and `kadr.wgt.sha256`.

---

## 3. Architecture & Component Design

### 3.1 Playback Settings & Version Constants (`src/player/playbackSettings.ts` & `src/version.ts`)

1. **App Version Constant (`src/version.ts`):**
   - `export const APP_VERSION = '1.0.0';`
2. **Playback Settings Store (`src/player/playbackSettings.ts`):**
   - Storage key: `export const PLAYBACK_SETTINGS_STORAGE_KEY = 'kadr_playback_settings_v1';`
   - Types & defaults:
     ```ts
     export type HlsQualityCap = 0 | 2160 | 1080 | 720 | 480; // 0 = Original (uncapped)
     export type PreferredPlayerEngine = 'auto' | 'html5';

     export interface PlaybackSettings {
       hlsMaxHeight: HlsQualityCap;
       preferredPlayerEngine: PreferredPlayerEngine;
     }

     export const DEFAULT_PLAYBACK_SETTINGS: PlaybackSettings = {
       hlsMaxHeight: 1080,
       preferredPlayerEngine: 'auto',
     };
     ```
   - Functions: `loadPlaybackSettings(): PlaybackSettings`, `savePlaybackSettings(next: PlaybackSettings): void`, `resetAllPlaybackPreferences(): void` (clears `kadr_playback_settings_v1`, `kadr_audio_preference_v1`, `kadr_subtitle_preference_v1`, `kadr_subtitle_settings`, `kadr_subtitle_delays`, and `kadr_audiobook_speed_v1`).
3. **`PlayerScreen.tsx` Integration:**
   - Initialize `playbackSettings` via `useMemo(() => loadPlaybackSettings(), [itemId])`:
     - Initialize `[forceHtml5, setForceHtml5]` to `useState(() => loadPlaybackSettings().preferredPlayerEngine === 'html5')` (and preserve `preferredPlayerEngine === 'html5'` across `handleRetry`).
     - Pass `maxHeight: playbackSettings.hlsMaxHeight > 0 ? playbackSettings.hlsMaxHeight : undefined` to `getPlaybackUrl(...)` instead of hardcoded `SAMSUNG_TV_HLS_MAX_HEIGHT`.

### 3.2 `<SettingsView />` Component & Deterministic 2-Pane D-Pad Matrix (`src/screens/SettingsView.tsx`)

1. **Props & Pure Helpers:**
   ```ts
   export interface SettingsViewProps {
     client: ApiClient;
     serverUrl: string;
     username?: string;
     userRole?: UserRole;
     onNavigateToSidebar?: () => void;
     onSwitchProfile?: () => void;
     onSwitchServer?: () => void;
     onUnlockedLibrariesChanged?: () => void;
   }
   ```
   - Exports `isSettingsContentNodeId(id)`, `isSettingsLeftmostNodeId(id)` (`true` **only** for the 4 left category buttons `settings-cat-playback`, `settings-cat-languages`, `settings-cat-account`, `settings-cat-diagnostics`), and `getFirstSettingsFocusableId()` (`'settings-cat-playback'`).
2. **Categories & Right-Pane Control Rows (Zero `gap-*`):**
   - **Category 1 (`settings-cat-playback` — Playback & Quality):**
     - `HLS Max Quality` (`settings-hls-height-{0|2160|1080|720|480}`: `Original`, `4K (2160p)`, `1080p (Recommended)`, `720p`, `480p`).
     - `Video Player Engine` (`settings-engine-{auto|html5}`: `Auto (Samsung AVPlay)`, `HTML5 Video`).
     - `Audiobook Default Speed` (`settings-audiobook-speed-{rate}`: `0.75x`, `1x`, `1.25x`, `1.5x`, `1.75x`, `2x`).
   - **Category 2 (`settings-cat-languages` — Audio & Subtitles):**
     - `Preferred Audio Language` (`settings-audio-lang-{auto|ara|eng|jpn|fra|spa|deu|kor}`: `Auto (Default)`, `Arabic`, `English`, `Japanese`, `French`, `Spanish`, `German`, `Korean`).
     - `Preferred Subtitle Mode / Language` (`settings-sub-lang-{auto|off|ara|eng|jpn|fra|spa}`: `Auto`, `Off`, `Arabic`, `English`, `Japanese`, `French`, `Spanish`).
     - `Subtitle Size` (`settings-sub-size-{small|medium|large|xlarge}`), `Subtitle Color` (`settings-sub-color-{white|yellow|cyan|green}`), `Subtitle Position` (`settings-sub-pos-{bottom|raised|top}`), plus a live sample subtitle preview box rendered with `FONT_SIZE_PX` and `COLOR_HEX`.
   - **Category 3 (`settings-cat-account` — Account & Privacy):**
     - Displays active profile (`username`, `userRole` badge) and connected `serverUrl`.
     - `settings-lock-libraries-btn`: **Re-lock Unlocked Private Libraries** (shows count `client.getUnlockTokens().length`; calls `client.clearLibraryUnlockTokens()` and `onUnlockedLibrariesChanged?.()`, updating count to `0` with confirmation text).
     - `settings-switch-profile-btn`: **Switch Profile** (`onSwitchProfile?.()`).
     - `settings-change-server-btn`: **Change Server** (`onSwitchServer?.()`, rendered when `onSwitchServer` is provided).
   - **Category 4 (`settings-cat-diagnostics` — TV Diagnostics & About):**
     - Read-only telemetry grid: `App Version` (`v1.0.0`), `TV Hardware Model` (`webapis.productinfo.getModel()` or `'Web Dev Harness'`), `Tizen Platform` (`tizen.systeminfo` `platform.version` or `'Browser'`), `AVPlay Engine` (`window.webapis?.avplay ? 'Hardware Ready' : 'HTML5 Fallback'`), `Viewport` (`${window.innerWidth}×${window.innerHeight}`), and `Server Connection` (fetches `${cleanServerUrl}/api/v1/discover` measuring round-trip `ms`, server `name`, and server `version`).
     - `settings-ping-server-btn`: **Refresh Server Diagnostics** (re-runs `/api/v1/discover` latency & version probe).
     - `settings-reset-prefs-btn`: **Reset All Playback & Subtitle Preferences** (calls `resetAllPlaybackPreferences()` and refreshes UI state to defaults).
3. **Deterministic 2-Pane D-Pad Navigation (`capture: true` listener in `SettingsView`):**
   - Inactive when any modal trap is open.
   - Focusing or pressing `[OK]` on a left category button (`settings-cat-*`) switches `activeCategory` immediately; `ArrowUp`/`ArrowDown` steps across the 4 categories; `ArrowLeft` calls `onNavigateToSidebar?.()`; `ArrowRight` moves focus to the first control in Row `0` of the right panel.
   - Right panel rows (`controlRows: string[][]`):
     - `ArrowLeft`: `col > 0` -> `row[col - 1]`; `col === 0` -> returns focus to `settings-cat-${activeCategory}`!
     - `ArrowRight`: `col < row.length - 1` -> `row[col + 1]` (clamped at right edge).
     - `ArrowUp` / `ArrowDown`: moves between control rows (`0 .. controlRows.length - 1`), preserving active/selected pill in the target row when available (else `row[0]`).

### 3.3 `BrowseScreen.tsx` & `App.tsx` Integration

- In `BrowseScreen.tsx`:
  - Render `SidebarCard` `id="nav-screen-settings"` (`order={screenItems.length + 3}`, `Settings` icon from `lucide-react`, `title="Settings"`, `subtitle="Quality, languages & TV info"`, `chip="/settings"`) right below `nav-screen-playlists` (`order={screenItems.length + 2}`), shifting `nav-switch-profile` to `order={screenItems.length + 4}`.
  - Treat `activeTab === 'settings'` identically to `'search'` and `'playlists'` (skip `fetchScreenLayout('settings')`, preserve `'settings'` in `fetchScreens`, wire `isLeftmostContentNode` -> `isSettingsLeftmostNodeId`, `isValidContentNode` -> `isSettingsContentNodeId`, `ArrowRight` from sidebar -> `getFirstSettingsFocusableId()`, and `Back` from `<SettingsView />` -> `nav-screen-settings` -> `<ExitConfirmModal>`).
  - Pass `username` and `userRole` from `App.tsx` -> `BrowseScreen` -> `<SettingsView />`, plus `onUnlockedLibrariesChanged={() => setScreenRefreshKey((k) => k + 1)}` so re-locking private libraries immediately refreshes lock badges in `BrowseScreen`!

### 3.4 Repo-Wide Zero-`gap-*` Sweep, `1.0.0` Bump & GitHub Actions Pipeline

1. **Final 3-File Zero-`gap-*` Cleanup:**
   - `src/components/widgets/CardCarouselWidget.tsx`: remove `gap-6` on line `24` (each card wrapper already has `mr-6`; add `last:mr-0`).
   - `src/components/widgets/HeroSpotlightWidget.tsx`: replace `gap-3`, `gap-1`, `gap-8`, and `gap-4` with explicit `mr-*` margins on child badges/icons/buttons.
   - `src/components/pin/KeypadGrid.tsx`: replace `gap-3` with inline `style={{ gridGap: '12px' }}`.
   - Result: `(! grep -rn "gap-" src/)` exits `0` across the **entire** `src/` directory.
2. **TypeScript, Version Bump & Packaging (`1.0.0`):**
   - Bump `"version": "1.0.0"` in `package.json` and `version="1.0.0"` in `config.xml`.
   - Fix `unwrapPlugin.postcss = true as const` in `vite.config.ts` (`line 108`) so `npx tsc -p tsconfig.node.json` compiles with zero errors, and update `package.json` `"build": "tsc -p tsconfig.json && tsc -p tsconfig.node.json && vite build"`.
   - Update `scripts/package-wgt.mjs`:
     - Support `process.env.TIZEN_CLI_BIN || '/home/boody/tizen-studio/tools/ide/bin/tizen'` and `process.env.TIZEN_SECURITY_PROFILE || 'kadr'`.
     - Compute SHA-256 digest via `node:crypto` and write `kadr.wgt.sha256` (`<hex>  kadr.wgt\n`) alongside `kadr.wgt` (ensure `kadr.wgt.sha256` is git-ignored alongside `*.wgt`).
3. **GitHub Actions CI & Release Workflow (`.github/workflows/ci-and-release.yml`):**
   - Triggers: `push` (`branches: [main]`, `tags: ['v*']`) and `pull_request` (`branches: [main]`).
   - Steps:
     1. Checkout + Node.js 22 (`npm ci`).
     2. Enforce Chromium 69 CSS invariant: `(! grep -rn "gap-" src/)`.
     3. Run Vitest suite: `npm test -- --run`.
     4. Build `chrome69` bundle (with dual `tsconfig` check): `npm run build`.
     5. Optional Tizen signing setup (if `TIZEN_CLI_BIN` or `TIZEN_AUTHOR_P12_BASE64` secret is provided) + `npm run package:wgt -- --no-build`.
     6. Upload `kadr.wgt` and `kadr.wgt.sha256` workflow artifacts (`actions/upload-artifact@v4`).
     7. On `startsWith(github.ref, 'refs/tags/v')`: publish GitHub Release (`softprops/action-gh-release@v2`, `permissions: contents: write`) attaching `kadr.wgt` and `kadr.wgt.sha256` with generated release notes.

---

## 4. Platform Invariants & Testing Strategy

1. **`tests/player/playbackSettings.test.ts`:** Persists/loads `hlsMaxHeight` (`0`, `2160`, `1080`, `720`, `480`) and `preferredPlayerEngine` (`'auto'`, `'html5'`), handles malformed storage safely, and verifies `resetAllPlaybackPreferences()` clears all 6 playback/audio/subtitle storage keys.
2. **`tests/screens/SettingsView.test.tsx` & `tests/screens/PlayerScreen.settings.test.tsx`:**
   - Zero `gap-*` classes across all 4 categories; deterministic 2-pane D-pad navigation (`Category Rail` ↔ `Control Rows` ↔ `Sidebar`); changing `HLS Max Quality` (`720p`), `Video Player Engine` (`HTML5 Video`), audio/subtitle preferences, and audiobook speed persists to `localStorage` and drives `PlayerScreen`'s stream URL (`max_height=720` or uncapped `Original`) & driver selection; `Re-lock Unlocked Private Libraries` clears tokens; `TV Diagnostics` displays `v1.0.0` and live `/api/v1/discover` ping latency; `Reset All` restores defaults.
3. **`tests/screens/BrowseScreen.test.tsx` & `tests/App.test.tsx`:**
   - `nav-screen-settings` renders below `Playlists` without calling `fetchScreenLayout('settings')`, bridges D-pad focus & 2-layer `Back` (`SettingsView` -> `nav-screen-settings` -> `<ExitConfirmModal>`), re-locks private libraries end-to-end, and verifies repo-wide `(! grep -rn "gap-" src/)`, `1.0.0` version alignment across `package.json` / `config.xml` / `APP_VERSION`, dual `tsconfig` build, and signed `kadr.wgt` + `kadr.wgt.sha256`.
