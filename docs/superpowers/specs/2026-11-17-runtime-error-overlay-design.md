# Boot-Scoped Error Trap & TV Recoverable ErrorBoundary — Design Specification

**Date:** 2026-11-17
**Target Platform:** Samsung Tizen TV (`UA55TU7000UXEG`, Tizen 5.5 / Chromium 69) & Web Dev Harness

---

## 1. Problem Statement

`vite.config.ts` (`tizenClassicBundlePlugin`) injects an inline `<script>` (`errorTrapScript`) into `dist/index.html` that listens to `window` `'error'` and `'unhandledrejection'` events for the entire lifetime of the application and appends a `#7f1d1d` red box (`#kadr-startup-error`, `position: fixed; bottom: 24px; left: 24px; right: 24px; z-index: 999999`) across the bottom quarter of the 1080p TV viewport.

Because that script:
1. **Never disarms after React boots**, any non-fatal background promise rejection or transient script warning during normal usage triggers the full-width red overlay even while video playback and app navigation continue working normally.
2. **Has no dismiss button or TV remote key handler**, once `#kadr-startup-error` is appended to `document.body`, the user cannot close it with `TVKeys.BACK_TIZEN` (`10009`), `Escape`, or `Enter`—forcing a full app restart.
3. **Lacks a React `<AppErrorBoundary>`**, meaning true fatal React render crashes have no structured, D-pad-operable recovery screen.

---

## 2. Goals & Non-Goals

### Goals
- Disarm the pre-boot HTML error trap (`window.__kadrDisarmBootTrap()`) immediately once React mounts `<App />`, removing its `error` / `unhandledrejection` overlay listeners and any `#kadr-startup-error` DOM element so background runtime errors or rejections never paint an overlay over active video or browse screens (logging to `console.warn` instead).
- Make the pre-boot `#kadr-startup-error` banner itself dismissible via TV remote **Back** (`10009`, `Escape`, `Backspace`, `461`) or **Enter** (`13`) and click, using ES5 syntax safe for Chromium 69 (`var`, `function`, zero modern syntax).
- Add a TV-navigable `<AppErrorBoundary>` wrapping `<App />` in `src/main.tsx` so genuine fatal React render crashes display a Kadr-themed recovery dialog where **Back** or **Try Again** resets the boundary and recovers in place, and **Reload App** reloads the WebView—with zero CSS flexbox `gap-*` classes.

### Non-Goals
- Changing `PlayerScreen`'s existing structured media playback error screen (`playbackError`), which already handles fatal stream/transcode failures cleanly.

---

## 3. Architecture & Components

### 3.1 Boot-Scoped Inline Trap (`src/utils/bootTrap.ts` & `vite.config.ts`)

1. **`buildBootErrorTrapScript(): string` (`src/utils/bootTrap.ts`):**
   - Pure function returning the self-contained ES5 inline `<script>` string injected into `index.html` by `tizenClassicBundlePlugin` in `vite.config.ts` (and executable in unit tests to verify exact DOM/key behavior):
     - Tracks `var disarmed = false;`.
     - `dismissStartupError()`: removes `#kadr-startup-error` from the DOM if present and detaches the temporary dismiss key listener.
     - When `showStartupError(title, err)` runs while `disarmed === false`:
       - Creates/updates `#kadr-startup-error` with clear hint text at the top-right (`Press BACK or OK to dismiss`) and a clickable close target, capped at `max-height: 28vh; overflow: hidden;` so even pre-boot diagnostics stay bounded.
       - Attaches a capture-phase `keydown` listener (`window.addEventListener('keydown', onBootErrorKeyDown, true)`) that checks `keyCode === 10009 || keyCode === 27 || keyCode === 8 || keyCode === 461 || keyCode === 13 || key === 'Escape' || key === 'Enter' || key === 'Backspace'`. When matched while `#kadr-startup-error` is mounted, calls `e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); dismissStartupError();`.
     - Exposes `window.__kadrDisarmBootTrap = function () { ... }`:
       - Sets `disarmed = true`.
       - Removes the pre-boot `window` `'error'` and `'unhandledrejection'` listeners (`removeEventListener`).
       - Calls `dismissStartupError()` so any transient pre-mount warning banner is cleared immediately upon successful boot.

2. **`disarmBootErrorTrap()` (`src/utils/bootTrap.ts` & `src/App.tsx`):**
   - Exported TypeScript helper called inside a mount `useEffect` in `src/App.tsx`:
     - Invokes `window.__kadrDisarmBootTrap?.()` and removes any stray `#kadr-startup-error` node.
     - Attaches a lightweight passive `unhandledrejection` logger (`console.warn('[Kadr] Unhandled background rejection:', e.reason)`) in non-test environments without rendering any UI overlay.

### 3.2 TV-Navigable `<AppErrorBoundary>` (`src/components/tv/AppErrorBoundary.tsx` & `src/main.tsx`)

1. **Component Contract (`AppErrorBoundary`):**
   - React class error boundary (`getDerivedStateFromError` + `componentDidCatch`) wrapping `<App />` in `src/main.tsx` (with optional `onReload?: () => void` prop for deterministic unit testing).
   - State: `{ error: Error | null; focusedAction: 'recover' | 'reload'; showDetails: boolean }`.
   - When `error === null`: renders `this.props.children` with zero wrapper DOM nodes (preserving 100% transparent hardware `AVPlay` plane during normal operation).
   - When `error !== null`:
     - Logs `console.error('[AppErrorBoundary] Fatal React render crash:', error, info)`.
     - Renders a centered Kadr recovery dialog (`role="alertdialog"`, `aria-modal="true"`) using explicit margins (`mr-4`, `mb-4`, `mb-6` — **zero `gap-*` classes**):
       - Primary action button (`focusedAction === 'recover'`, focused by default): **Try Again** -> clears `error: null` and increments `resetKey` on children to remount cleanly in place.
       - Secondary action button (`focusedAction === 'reload'`): **Reload App** -> invokes `onReload ?? (() => window.location.reload())`.
       - Optional collapsible single-line error message summary for diagnostics.
     - Binds a capture-phase `window` `'keydown'` listener while `error !== null`:
       - `LEFT` / `RIGHT`: toggles `focusedAction` between `'recover'` and `'reload'`.
       - `ENTER`: triggers the focused action (`recover` or `reload`).
       - `TVKeys.BACK_TIZEN` (`10009`) / `Escape` / `Backspace`: `e.preventDefault(); e.stopImmediatePropagation();` and recovers in place (`error: null`).

---

## 4. Error Handling & Edge Cases

- **Chromium 69 / ES5 Inline Script Safety:** `buildBootErrorTrapScript()` uses strictly ES5 constructs (`var`, `function`, `indexOf`, standard `addEventListener`/`removeEventListener` with matching `useCapture` flags) so it never throws a syntax error on Tizen 5.5 even if main bundle execution fails.
- **Error Loop Protection:** Remounting children via `key={this.state.resetCount}` inside `<AppErrorBoundary>` gives `<App />` a clean component tree on **Try Again** / **Back**; if startup state itself is corrupt on a second attempt, **Reload App** remains directly accessible via Right + Enter.
- **AVPlay Transparency:** `<AppErrorBoundary>` renders `children` directly with no extra wrapper `<div>` unless `state.error !== null`.

---

## 5. Testing Strategy

1. **Boot Trap Unit Tests (`tests/utils/bootTrap.test.ts`):**
   - Execute `buildBootErrorTrapScript()` in `jsdom` and verify:
     - Pre-boot `error` and `unhandledrejection` events render `#kadr-startup-error`.
     - Pressing `TVKeys.BACK_TIZEN` (`10009`), `Escape`, or `Enter` removes `#kadr-startup-error` and stops propagation.
     - Calling `disarmBootErrorTrap()` clears any existing `#kadr-startup-error` and ensures subsequent `window` `'error'` and `'unhandledrejection'` events **never** create `#kadr-startup-error` (simulating a runtime error while video is playing).
2. **`AppErrorBoundary` Unit & Integration Tests (`tests/components/AppErrorBoundary.test.tsx` & `tests/App.test.tsx`):**
   - Verify normal children render with zero extra wrapper elements.
   - Verify a component throwing during render displays the recovery dialog (`role="alertdialog"`) with zero `gap-*` classes.
   - Verify pressing `TVKeys.BACK_TIZEN` (`10009`) or clicking **Try Again** resets the boundary and renders recovered children cleanly, and pressing `ArrowRight` + `Enter` invokes `onReload`.
   - Verify mounting `<App />` automatically calls `window.__kadrDisarmBootTrap()`.
