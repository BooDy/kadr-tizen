# Sub-Project 7 (Final): Settings Tab & `v1.0.0` Release Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete `kadr-tizenos` **`v1.0.0`** with a living-room **Settings** sidebar tab (`<SettingsView />`), persisted HLS quality & player engine settings, a repo-wide zero-`gap-*` sweep, dual `tsconfig` build hardening, `1.0.0` version alignment, SHA-256 `.wgt` packaging, and an automated GitHub Actions CI & `v*` Release workflow.

**Architecture:** Add `src/version.ts` (`APP_VERSION = '1.0.0'`) and `src/player/playbackSettings.ts` (`kadr_playback_settings_v1`) wired into `PlayerScreen.tsx`; build `<SettingsView />` with a 4-category Left Rail + Right Control Panel and mount it as a virtual tab (`nav-screen-settings`) in `BrowseScreen.tsx`; sweep the final 7 `gap-*` lines in legacy `v0.1.1` components so `(! grep -rn "gap-" src/)` passes repo-wide; and ship `1.0.0` build/packaging scripts plus `.github/workflows/ci-and-release.yml`.

**Tech Stack:** React 19, TypeScript 5.7, Vite 6 (`chrome69`), Tailwind CSS 4, Vitest 3 + React Testing Library, Node.js 22 (`package-wgt.mjs`), GitHub Actions.

## Global Constraints

- Target platform: Samsung Tizen 5.5 (`UA55TU7000UXEG`, Chromium 69 WebView) and Web Dev Harness.
- **Repo-Wide Zero `gap-*` Invariant:** Avoid any `gap-` substring anywhere in JSX/CSS or comments; after Task 3, `(! grep -rn "gap-" src/)` MUST exit `0` across the entire `src/` directory.
- Sidebar ordering invariant in `BrowseScreen.tsx`: `Home` (`order = 1`) and library tabs (`2..N`) remain contiguous; utility tabs sit at the bottom in order: `nav-screen-search` (`N + 1`), `nav-screen-playlists` (`N + 2`), `nav-screen-settings` (`N + 3`), and `nav-switch-profile` (`N + 4`).
- Strict layered Back navigation in `<SettingsView />`:
  1. Focused anywhere inside `<SettingsView />`: `Back` moves focus to sidebar `nav-screen-settings`.
  2. Focused on `nav-screen-settings`: `Back` triggers `onRequestExit` (`<ExitConfirmModal>`).
- Version `1.0.0` MUST match across `src/version.ts` (`APP_VERSION`), `package.json` (`version`), and `config.xml` (`widget[version]`).

---

### Task 1: `APP_VERSION` (`1.0.0`), Playback Settings Store & `PlayerScreen` Quality/Engine Wiring (`kadr-tizenos`)

**Working Directory:** `/home/boody/work/personal/kadr-tizenos`

**Files:**
- Create: `src/version.ts`
- Create: `src/player/playbackSettings.ts`
- Modify: `src/screens/PlayerScreen.tsx`
- Create: `tests/player/playbackSettings.test.ts`
- Create: `tests/screens/PlayerScreen.settings.test.tsx`

**Interfaces:**
- Produces:
  - `src/version.ts`: `export const APP_VERSION = '1.0.0';`
  - `src/player/playbackSettings.ts`:
    - `export const PLAYBACK_SETTINGS_STORAGE_KEY = 'kadr_playback_settings_v1';`
    - `export type HlsQualityCap = 0 | 2160 | 1080 | 720 | 480;`
    - `export type PreferredPlayerEngine = 'auto' | 'html5';`
    - `export interface PlaybackSettings { hlsMaxHeight: HlsQualityCap; preferredPlayerEngine: PreferredPlayerEngine; }`
    - `export const DEFAULT_PLAYBACK_SETTINGS: PlaybackSettings = { hlsMaxHeight: 1080, preferredPlayerEngine: 'auto' };`
    - `export const HLS_QUALITY_OPTIONS: ReadonlyArray<{ value: HlsQualityCap; label: string; description: string }>`
    - `export const PLAYER_ENGINE_OPTIONS: ReadonlyArray<{ value: PreferredPlayerEngine; label: string; description: string }>`
    - `export function loadPlaybackSettings(): PlaybackSettings`
    - `export function savePlaybackSettings(next: PlaybackSettings): void`
    - `export function resetAllPlaybackPreferences(): void`

- [ ] **Step 1: Write failing unit & integration tests in `tests/player/playbackSettings.test.ts` and `tests/screens/PlayerScreen.settings.test.tsx`**

1. Create `tests/player/playbackSettings.test.ts` testing:
   - `APP_VERSION` equals `'1.0.0'`.
   - `loadPlaybackSettings()` defaults to `{ hlsMaxHeight: 1080, preferredPlayerEngine: 'auto' }`, persists/loads all valid `HlsQualityCap` values (`0`, `2160`, `1080`, `720`, `480`) and `'html5'`, and falls back cleanly on corrupt JSON or invalid numbers.
   - `resetAllPlaybackPreferences()` removes `kadr_playback_settings_v1`, `kadr_audio_preference_v1`, `kadr_subtitle_preference_v1`, `kadr_subtitle_settings`, `kadr_subtitle_delays`, and `kadr_audiobook_speed_v1`.
2. Create `tests/screens/PlayerScreen.settings.test.tsx` testing:
   - When `savePlaybackSettings({ hlsMaxHeight: 720, preferredPlayerEngine: 'auto' })` is saved, `PlayerScreen` requests `/api/v1/media/{id}/hls/master.m3u8` with `max_height=720` (instead of `1080`).
   - When `hlsMaxHeight: 0` (`Original`) is saved, `PlayerScreen` omits `max_height` from the HLS master playlist URL.
   - When `preferredPlayerEngine: 'html5'` is saved even while `window.webapis.avplay` is present on TV, `PlayerScreen` initializes `Html5PlayerDriver` (`<video>`) instead of `TizenAvplayDriver`, and preserves `forceHtml5 === true` across `handleRetry()`.

- [ ] **Step 2: Run Vitest on targeted tests to verify RED failure**

Run: `npx vitest run tests/player/playbackSettings.test.ts tests/screens/PlayerScreen.settings.test.tsx`
Expected: FAIL (`Cannot find module '../../src/player/playbackSettings'`).

- [ ] **Step 3: Implement `src/version.ts`, `src/player/playbackSettings.ts`, and `PlayerScreen.tsx` wiring**

1. Create `src/version.ts`:
   ```ts
   export const APP_VERSION = '1.0.0';
   ```
2. Create `src/player/playbackSettings.ts` implementing `loadPlaybackSettings`, `savePlaybackSettings`, `HLS_QUALITY_OPTIONS`, `PLAYER_ENGINE_OPTIONS`, and `resetAllPlaybackPreferences` (importing the storage key constants from `./audioPreferences` and `./subtitleSettings` so keys stay single-sourced!).
3. Update `src/screens/PlayerScreen.tsx`:
   - Read `playbackSettings = useMemo(() => loadPlaybackSettings(), [itemId])`.
   - Initialize `[forceHtml5, setForceHtml5] = useState(() => loadPlaybackSettings().preferredPlayerEngine === 'html5')` (and in `if (prevStreamItemId !== itemId)` / `handleRetry`, keep `forceHtml5` `true` whenever `loadPlaybackSettings().preferredPlayerEngine === 'html5'`, while still allowing manual error fallback `handleSwitchToHtml5` when `'auto'`!).
   - Pass `maxHeight: playbackSettings.hlsMaxHeight > 0 ? playbackSettings.hlsMaxHeight : undefined` into `getPlaybackUrl(...)` instead of `SAMSUNG_TV_HLS_MAX_HEIGHT`.

- [ ] **Step 4: Run zero-gap check, Vitest, and `tsc -b` to verify GREEN**

Run: `(! grep -rn "gap-" src/version.ts src/player/playbackSettings.ts src/screens/PlayerScreen.tsx) && npx vitest run tests/player/playbackSettings.test.ts tests/screens/PlayerScreen.settings.test.tsx tests/screens/PlayerScreen.test.tsx && npx tsc -b`
Expected: PASS (100% green, `0` `gap-*` matches, `tsc -b` exit `0`).

- [ ] **Step 5: Commit Task 1**

```bash
git add src/version.ts src/player/playbackSettings.ts src/screens/PlayerScreen.tsx tests/player/playbackSettings.test.ts tests/screens/PlayerScreen.settings.test.tsx
git commit -m "feat(settings): add playback settings store, APP_VERSION 1.0.0, and PlayerScreen quality/engine wiring"
```

---

### Task 2: `<SettingsView />` Split Category Rail, Live Preferences, Privacy Controls & TV Diagnostics (`kadr-tizenos`)

**Working Directory:** `/home/boody/work/personal/kadr-tizenos`

**Files:**
- Create: `src/screens/SettingsView.tsx`
- Create: `tests/screens/SettingsView.test.tsx`

**Interfaces:**
- Consumes: `APP_VERSION` from `src/version.ts`; `loadPlaybackSettings`, `savePlaybackSettings`, `resetAllPlaybackPreferences`, `HLS_QUALITY_OPTIONS`, `PLAYER_ENGINE_OPTIONS` from `src/player/playbackSettings.ts`; `loadAudioPreference`, `saveAudioPreference`, `AUDIOBOOK_SPEED_OPTIONS`, `loadAudiobookSpeed`, `saveAudiobookSpeed` from `src/player/audioPreferences.ts`; `loadSubtitlePreference`, `saveSubtitlePreference`, `loadSubtitleSettings`, `saveSubtitleSettings`, `FONT_SIZE_OPTIONS`, `COLOR_OPTIONS`, `PLACEMENT_OPTIONS`, `FONT_SIZE_PX`, `COLOR_HEX` from `src/player/subtitleSettings.ts`
- Produces:
  - `src/screens/SettingsView.tsx`:
    - `export interface SettingsViewProps { client: ApiClient; serverUrl: string; username?: string; userRole?: UserRole; onNavigateToSidebar?: () => void; onSwitchProfile?: () => void; onSwitchServer?: () => void; onUnlockedLibrariesChanged?: () => void; }`
    - `export function SettingsView(props: SettingsViewProps): JSX.Element`
    - `export function isSettingsContentNodeId(id: string | null | undefined): boolean`
    - `export function isSettingsLeftmostNodeId(id: string | null | undefined): boolean`
    - `export function getFirstSettingsFocusableId(): string`

- [ ] **Step 1: Write failing component & D-pad tests in `tests/screens/SettingsView.test.tsx`**

Create `tests/screens/SettingsView.test.tsx` testing:
1. Renders zero `gap-*` classes across all 4 categories (`playback`, `languages`, `account`, `diagnostics`).
2. Deterministic 2-pane D-pad navigation:
   - Mounts with initial focus on `settings-cat-playback` (`SettingsFocusBridge`).
   - `ArrowLeft` from `settings-cat-*` calls `onNavigateToSidebar`.
   - `ArrowDown` / `ArrowUp` on the Category Rail switches `activeCategory` (`playback -> languages -> account -> diagnostics`) immediately.
   - `ArrowRight` from `settings-cat-playback` enters Row 0 of the right panel (`settings-hls-height-1080` or `settings-hls-height-0`), `ArrowRight`/`ArrowLeft` steps across pills in that row, `ArrowDown`/`ArrowUp` steps between rows (`HLS Max Quality` -> `Video Player Engine` -> `Audiobook Default Speed`), and `ArrowLeft` from col `0` of any right-panel row returns to `settings-cat-${activeCategory}` (never jumping straight to the sidebar!).
3. Persists changes immediately:
   - Selecting `settings-hls-height-720`, `settings-engine-html5`, and `settings-audiobook-speed-1.5` updates `loadPlaybackSettings()` and `loadAudiobookSpeed()`.
   - Switching to `settings-cat-languages`: selecting `settings-audio-lang-jpn`, `settings-sub-lang-ara`, `settings-sub-size-large`, `settings-sub-color-yellow`, and `settings-sub-pos-raised` updates `loadAudioPreference()`, `loadSubtitlePreference()`, `loadSubtitleSettings()`, and updates the live subtitle preview (`fontSize: 52px`, `color: #FFE14D`).
4. Account & Privacy (`settings-cat-account`):
   - Displays `username`, `userRole`, `serverUrl`, and unlocked private library count (`2`).
   - Activating `settings-lock-libraries-btn` calls `client.clearLibraryUnlockTokens()` and `onUnlockedLibrariesChanged`, updating count to `0`.
   - Activating `settings-switch-profile-btn` and `settings-change-server-btn` invokes `onSwitchProfile` and `onSwitchServer`.
5. TV Diagnostics & About (`settings-cat-diagnostics`):
   - Displays `v1.0.0`, TV hardware model (`UA55TU7000UXEG` when `window.webapis.productinfo.getModel` is mocked), `AVPlay` status, and fetches `${serverUrl}/api/v1/discover` displaying server name/version & latency; activating `settings-reset-prefs-btn` resets all preferences back to defaults.

- [ ] **Step 2: Run Vitest on `tests/screens/SettingsView.test.tsx` to verify RED failure**

Run: `npx vitest run tests/screens/SettingsView.test.tsx`
Expected: FAIL (`Cannot find module '../../src/screens/SettingsView'`).

- [ ] **Step 3: Implement `src/screens/SettingsView.tsx`**

Implement `SettingsView.tsx` following Spec §3.2 verbatim:
- Zero `gap-*` substrings anywhere in JSX, styles, or comments (`mr-*`, `mb-*`, `ml-*`).
- Export `isSettingsContentNodeId`, `isSettingsLeftmostNodeId` (`true` strictly for the 4 `settings-cat-*` IDs), and `getFirstSettingsFocusableId` (`'settings-cat-playback'`).
- Include `SettingsFocusBridge` + capture-phase D-pad router (inactive when any modal trap is active) syncing `setFocusedId(targetId)` and `document.getElementById(targetId)?.focus({ preventScroll: true })`.
- Guard `/api/v1/discover` diagnostics probe with `AbortController` on unmount so no state updates occur after unmount.

- [ ] **Step 4: Run zero-gap check, Vitest, and `tsc -b` to verify GREEN**

Run: `(! grep -rn "gap-" src/screens/SettingsView.tsx) && npx vitest run tests/screens/SettingsView.test.tsx && npx tsc -b`
Expected: PASS (all tests green, `0` `gap-*` matches, `tsc -b` exit `0`).

- [ ] **Step 5: Commit Task 2**

```bash
git add src/screens/SettingsView.tsx tests/screens/SettingsView.test.tsx
git commit -m "feat(settings): implement split-rail SettingsView with quality, language, privacy, and diagnostics"
```

---

### Task 3: `BrowseScreen` `Settings` Sidebar Tab, `App.tsx` Wiring & Repo-Wide Zero-`gap-*` Sweep (`kadr-tizenos`)

**Working Directory:** `/home/boody/work/personal/kadr-tizenos`

**Files:**
- Modify: `src/screens/BrowseScreen.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/widgets/CardCarouselWidget.tsx`
- Modify: `src/components/widgets/HeroSpotlightWidget.tsx`
- Modify: `src/components/pin/KeypadGrid.tsx`
- Modify: `tests/screens/BrowseScreen.test.tsx`
- Modify: `tests/App.test.tsx`

**Interfaces:**
- Consumes: `SettingsView`, `isSettingsContentNodeId`, `isSettingsLeftmostNodeId`, `getFirstSettingsFocusableId` from `src/screens/SettingsView.tsx`

- [ ] **Step 1: Write failing integration & repo-wide zero-`gap-*` tests in `tests/screens/BrowseScreen.test.tsx` and `tests/App.test.tsx`**

1. In `tests/screens/BrowseScreen.test.tsx`:
   - Add test verifying `nav-screen-settings` renders right below `nav-screen-playlists` and above `nav-switch-profile`, mounts `<SettingsView />` without calling `fetchScreenLayout(client, 'settings')`, bridges `ArrowRight` (`settings-cat-playback`) / `ArrowLeft` (`nav-screen-settings`), and follows 2-layer `Back` (`SettingsView` -> `nav-screen-settings` -> `onRequestExit`).
2. In `tests/App.test.tsx`:
   - Add end-to-end test verifying opening `nav-screen-settings` displays the logged-in profile's username & role, changing `HLS Max Quality` to `720p` persists into `PlayerScreen`, and clicking `settings-lock-libraries-btn` clears unlocked private libraries and triggers `BrowseScreen` refresh.

- [ ] **Step 2: Run targeted Vitest tests to verify RED failure**

Run: `npx vitest run tests/screens/BrowseScreen.test.tsx tests/App.test.tsx -t "Settings"`
Expected: FAIL (`nav-screen-settings` not found).

- [ ] **Step 3: Wire `SettingsView` into `BrowseScreen.tsx` & `App.tsx` and sweep the final 3 legacy `gap-*` files**

1. **`src/screens/BrowseScreen.tsx`:**
   - Import `Settings` icon from `lucide-react` and `SettingsView`, `getFirstSettingsFocusableId`, `isSettingsContentNodeId`, `isSettingsLeftmostNodeId` from `./SettingsView`.
   - Add optional `currentUsername?: string; currentUserRole?: UserRole; onUnlockedLibrariesChanged?: () => void;` to `BrowseScreenProps`.
   - Render `SidebarCard` `id="nav-screen-settings"` (`order={screenItems.length + 3}`, `title="Settings"`, `subtitle="Quality, languages & TV info"`, `chip="/settings"`, `tile={<Settings className="w-6 h-6" />}`) right after `nav-screen-playlists` (`order={screenItems.length + 2}`) and shift `nav-switch-profile` to `order={screenItems.length + 4}`.
   - Mirror `'search'` / `'playlists'` virtual-tab handling for `activeTab === 'settings'` (`loading` init, `fetchScreens` preservation, `fetchScreenLayout` skip, `displayScreens` filter, `targetLibId` filter, `isLeftmostContentNode`, `isValidContentNode`, `ArrowRight` from sidebar, `Back` while `currentTab === 'settings'`, and `<SettingsView />` render in `BrowseMainContent`).
2. **`src/App.tsx`:**
   - Persist `kadr_username` and `kadr_user_role` on `handleLogin` (and clear in `handleUnauthorized`, `handleSwitchServer`, and `onSwitchProfile`), falling back to `profiles.find((p) => p.id === currentUserId)`.
   - Pass `currentUsername`, `currentUserRole`, and `onUnlockedLibrariesChanged={() => setScreenRefreshKey((k) => k + 1)}` to `<BrowseScreen />`.
3. **Final 3-File Legacy `gap-*` Sweep:**
   - `src/components/widgets/CardCarouselWidget.tsx`: change `className="flex gap-6 overflow-x-auto scrollbar-none py-2 px-2"` -> `className="flex overflow-x-auto scrollbar-none py-2 px-2"` and `className="shrink-0 mr-6 last:mr-0"` on card wrappers.
   - `src/components/widgets/HeroSpotlightWidget.tsx`: replace `gap-3`, `gap-1`, `gap-8`, and `gap-4` with explicit `mr-3 last:mr-0`, `mr-1`, `mr-8`, and `mr-4` on child elements/icons.
   - `src/components/pin/KeypadGrid.tsx`: replace `className="grid grid-cols-3 gap-3 my-4"` with `className="grid grid-cols-3 my-4"` + `style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gridGap: '12px' }}`.

- [ ] **Step 4: Verify repo-wide zero `gap-*`, targeted Vitest suites, and `tsc -b` (GREEN)**

Run: `(! grep -rn "gap-" src/) && npx vitest run tests/screens/BrowseScreen.test.tsx tests/App.test.tsx tests/components/ && npx tsc -b`
Expected: PASS (**0 `gap-*` matches across the entire `src/` tree**, all tests green, `tsc -b` exit `0`).

- [ ] **Step 5: Commit Task 3**

```bash
git add src/screens/BrowseScreen.tsx src/App.tsx src/components/widgets/CardCarouselWidget.tsx src/components/widgets/HeroSpotlightWidget.tsx src/components/pin/KeypadGrid.tsx tests/screens/BrowseScreen.test.tsx tests/App.test.tsx
git commit -m "feat(browse): integrate Settings sidebar tab and complete repo-wide zero-gap sweep"
```

---

### Task 4: `v1.0.0` Version Bump, Dual `tsconfig` Hardening, SHA-256 `.wgt` Packaging & GitHub Actions CI/Release Workflow (`kadr-tizenos`)

**Working Directory:** `/home/boody/work/personal/kadr-tizenos`

**Files:**
- Modify: `package.json`
- Modify: `config.xml`
- Modify: `vite.config.ts`
- Modify: `.gitignore`
- Modify: `scripts/package-wgt.mjs`
- Create: `.github/workflows/ci-and-release.yml`
- Create: `tests/release/versionAlignment.test.ts`

**Interfaces:**
- Consumes: `APP_VERSION` from `src/version.ts`

- [ ] **Step 1: Write failing release-alignment test in `tests/release/versionAlignment.test.ts`**

Create `tests/release/versionAlignment.test.ts` asserting:
1. `APP_VERSION` (`src/version.ts`), `package.json` `"version"`, and `config.xml` `<widget ... version="...">` all equal `'1.0.0'`.
2. `.github/workflows/ci-and-release.yml` exists and enforces `grep -rn "gap-" src/`, `npm test`, `npm run build`, and `package:wgt`.
3. Every file under `src/` contains zero `gap-` substrings (automated Vitest guard so `npm test` catches `gap-*` regressions locally too!).

- [ ] **Step 2: Run Vitest on `tests/release/versionAlignment.test.ts` to verify RED failure**

Run: `npx vitest run tests/release/versionAlignment.test.ts`
Expected: FAIL (`package.json` version is `'0.1.1'`).

- [ ] **Step 3: Implement `1.0.0` bump, dual `tsconfig` fix, SHA-256 `.wgt` packaging, and `.github/workflows/ci-and-release.yml`**

1. **`package.json` & `config.xml`:**
   - Update `"version": "1.0.0"` and `"build": "tsc -p tsconfig.json && tsc -p tsconfig.node.json && vite build"` in `package.json`.
   - Update `version="1.0.0"` on `<widget ...>` in `config.xml`.
2. **`vite.config.ts` & `.gitignore`:**
   - Change line `107` of `vite.config.ts` from `unwrapPlugin.postcss = true;` to `unwrapPlugin.postcss = true as const;` so `npx tsc -p tsconfig.node.json` compiles with zero errors.
   - Add `*.sha256` to `.gitignore`.
3. **`scripts/package-wgt.mjs`:**
   - Read `const tizenBin = process.env.TIZEN_CLI_BIN || '/home/boody/tizen-studio/tools/ide/bin/tizen';` and `const securityProfile = process.env.TIZEN_SECURITY_PROFILE || 'kadr';` (using `execFileSync` instead of shell interpolation for safety!).
   - Compute SHA-256 of `outWgt` using `crypto.createHash('sha256')` and write `${outWgt}.sha256` (`${sha256}  kadr.wgt\n`), logging both file size and SHA-256 digest.
4. **`.github/workflows/ci-and-release.yml`:**
   - Configure `on: push: { branches: [main], tags: ['v*'] }` and `pull_request: { branches: [main] }`.
   - `build-and-verify` job (`ubuntu-latest`, `permissions: { contents: write }`):
     - `actions/checkout@v4` + `actions/setup-node@v4` (`node-version: '22'`, `cache: 'npm'`) + `sudo apt-get update && sudo apt-get install -y zip` (ensuring `zip` is present).
     - `npm ci`
     - Repo-wide Chromium 69 CSS gate: `(! grep -rn "gap-" src/)`
     - Dual TypeScript check: `npx tsc -p tsconfig.json && npx tsc -p tsconfig.node.json`
     - Unit & integration tests: `npm test -- --run`
     - Optional Tizen certificate staging step (`if: startsWith(github.ref, 'refs/tags/v')`, decoding `secrets.TIZEN_AUTHOR_P12_BASE64` / `secrets.TIZEN_DISTRIBUTOR_P12_BASE64` when configured, and passing `TIZEN_CLI_BIN` / `TIZEN_SECURITY_PROFILE` into `package:wgt` with automatic fallback to standard `.wgt` packaging when secrets/CLI are absent).
     - Production `chrome69` bundle + `.wgt` & `.sha256` package: `npm run build && npm run package:wgt -- --no-build`
     - Upload `kadr.wgt` & `kadr.wgt.sha256` via `actions/upload-artifact@v4`.
     - Release step (`if: startsWith(github.ref, 'refs/tags/v')`): `softprops/action-gh-release@v2` with `files: | kadr.wgt \n kadr.wgt.sha256` and `generate_release_notes: true`.

- [ ] **Step 4: Run full `v1.0.0` verification suite (GREEN)**

Run:
1. `(! grep -rn "gap-" src/)`
2. `npx tsc -p tsconfig.json && npx tsc -p tsconfig.node.json`
3. `npm test -- --run`
4. `npm run build && npm run package:wgt -- --no-build && cat kadr.wgt.sha256`
Expected: `0` `gap-*` matches across `src/`, dual `tsconfig` exit `0`, 100% Vitest suites green, `chrome69` bundle green, and signed `kadr.wgt` + `kadr.wgt.sha256` generated cleanly.

- [ ] **Step 5: Commit Task 4**

```bash
git add package.json config.xml vite.config.ts .gitignore scripts/package-wgt.mjs .github/workflows/ci-and-release.yml tests/release/versionAlignment.test.ts
git commit -m "chore(release): bump to v1.0.0, enforce dual tsconfig & zero-gap CI, and add .wgt release workflow"
```
