# TV Player Playlist, Scannable QR Diagnostics, Missing Media Detection & Sidebar Spacing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce sidebar button spacing to `32px` (`gap-8`), add Next/Previous episode navigation with remote key shortcuts and auto-advance in the video player, implement a low-density scannable error QR code with on-screen diagnostic details and remote log relay, and add pre-flight missing media file detection to prevent cryptic demuxer crashes.

**Architecture:** Update `BrowseScreen.tsx` to set the sidebar items container to `gap-8`. Enhance `PlayerOSD.tsx` to include Next and Previous episode buttons with spatial D-Pad navigation. Connect playlist state from `ItemDetailModal.tsx` and `App.tsx` through `PlayerScreen.tsx`, binding remote media track keys (`MediaTrackNext`, `MediaTrackPrevious`, `ChannelUp`, `ChannelDown`) and triggering an auto-advance overlay at video completion. Replace the dense QR code in `ErrorQRCode.tsx` with a compact format (<80 characters), provide an on-screen readable diagnostic dialog in `PlayerScreen.tsx`, and add a pre-flight stream check to catch HTTP 404 responses cleanly.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Lucide React, Vitest, Tizen Web APIs (AVPlay / TVKeys), qrcode (pure JS SVG generator).

## Global Constraints

- Platform Target: Samsung Tizen OS TV 5.5+ (Chromium 69 compatible CSS/JS, no unsupported CSS layers).
- TV remote control interaction (FocusContext, TVKeys, focus trapping).
- Low-density QR code SVG: text payload must remain under 80 characters for large block scannability from 3m couch distance.
- Zero TypeScript errors (`tsc -b`).
- Full test suite passing across all tests (`npm test`).
- Test-driven development (TDD): write failing tests first (RED), then implement to GREEN.

---

### Task 1: Sidebar Spacing Reduction in `BrowseScreen.tsx`

**Files:**
- Modify: `src/screens/BrowseScreen.tsx`
- Test: `tests/screens/BrowseScreen.test.tsx`

**Interfaces:**
- Consumes: Existing `BrowseScreen` props and focus handlers.
- Produces: Sidebar items container with `gap-8` (`32px`) spacing instead of `gap-[148px]`.

- [ ] **Step 1: Write the failing test**
Update `tests/screens/BrowseScreen.test.tsx` to assert that `data-testid="sidebar-items-container"` contains class `gap-8` and does not contain `gap-[148px]`.

- [ ] **Step 2: Run test to confirm RED**
Run: `npx vitest run tests/screens/BrowseScreen.test.tsx` and confirm failure.

- [ ] **Step 3: Implement minimal code to pass test**
In `src/screens/BrowseScreen.tsx`, change `gap-[148px]` to `gap-8`.

- [ ] **Step 4: Run test to confirm GREEN**
Run: `npx vitest run tests/screens/BrowseScreen.test.tsx` and confirm it passes.

- [ ] **Step 5: Commit**
`git add src/screens/BrowseScreen.tsx tests/screens/BrowseScreen.test.tsx && git commit -m "fix(sidebar): reduce item spacing to 32px (gap-8)"`

---

### Task 2: Player OSD Next & Previous Episode Buttons

**Files:**
- Modify: `src/components/osd/PlayerOSD.tsx`
- Test: `tests/components/osd/PlayerOSD.test.tsx` (or `tests/components/player/PlayerOSD.test.tsx`)

**Interfaces:**
- Consumes:
  ```typescript
  export interface PlayerOSDProps {
    // existing props...
    hasPrevious?: boolean;
    hasNext?: boolean;
    onPrevious?: () => void;
    onNext?: () => void;
  }
  ```
- Produces:
  - Render Previous button (`data-testid="player-osd-previous-btn"`) using `SkipBack` icon.
  - Render Next button (`data-testid="player-osd-next-btn"`) using `SkipForward` icon.
  - Disabled or dimmed styling when `!hasPrevious` or `!hasNext`.
  - Registered with `groupId="osd-controls"` for D-Pad left/right navigation between Previous, Play/Pause, Next, and Subtitles.

- [ ] **Step 1: Write failing tests**
Create or update tests in `tests/components/osd/PlayerOSD.test.tsx` asserting:
- Renders Next and Previous buttons when callbacks are provided.
- Previous button has disabled state when `hasPrevious = false`.
- Next button has disabled state when `hasNext = false`.
- Clicking or triggering Enter on Next/Previous buttons fires `onNext` and `onPrevious`.

- [ ] **Step 2: Run test to confirm RED**
Run: `npx vitest run tests/components/osd/PlayerOSD.test.tsx` and confirm failure.

- [ ] **Step 3: Implement minimal code to pass test**
In `src/components/osd/PlayerOSD.tsx`, add `SkipBack` and `SkipForward` buttons inside the controls row, bind `onPrevious` and `onNext`, and apply disabled styling when `hasPrevious === false` / `hasNext === false`.

- [ ] **Step 4: Run test to confirm GREEN**
Run: `npx vitest run tests/components/osd/PlayerOSD.test.tsx` and confirm all tests pass.

- [ ] **Step 5: Commit**
`git add src/components/osd/PlayerOSD.tsx tests/components/osd/PlayerOSD.test.tsx && git commit -m "feat(osd): add next and previous episode buttons to player control bar"`

---

### Task 3: Playlist State, Media Track Remote Keys & Auto-Advance

**Files:**
- Modify: `src/screens/PlayerScreen.tsx`
- Modify: `src/screens/ItemDetailModal.tsx`
- Modify: `src/App.tsx`
- Test: `tests/screens/PlayerScreen.playlist.test.tsx`

**Interfaces:**
- Consumes:
  ```typescript
  export interface PlaylistItem {
    id: number;
    title: string;
    technical?: TechnicalMetadata;
  }
  ```
- Produces:
  - `PlayerScreen` accepts `playlist?: PlaylistItem[]`, `currentIndex?: number`, `onNext?: () => void`, `onPrevious?: () => void`.
  - Remote keys `TVKeys.MEDIA_TRACK_NEXT` (or `CH_UP`) trigger `onNext()`.
  - Remote keys `TVKeys.MEDIA_TRACK_PREVIOUS` (or `CH_DOWN`) trigger `onPrevious()`.
  - When video reaches `durationMs - 1500` or ends, show an auto-advance overlay with countdown timer and transition to next episode.
  - `ItemDetailModal.tsx` and `App.tsx` wire episodes of the active season into the playlist array and pass down next/previous handlers.

- [ ] **Step 1: Write failing tests**
Create `tests/screens/PlayerScreen.playlist.test.tsx` verifying:
- Pressing `MEDIA_TRACK_NEXT` invokes `onNext`.
- Pressing `MEDIA_TRACK_PREVIOUS` invokes `onPrevious`.
- When video ends and `hasNext` is true, auto-advance overlay appears and fires `onNext` upon timeout or Enter press.

- [ ] **Step 2: Run test to confirm RED**
Run: `npx vitest run tests/screens/PlayerScreen.playlist.test.tsx` and confirm failure.

- [ ] **Step 3: Implement minimal code to pass test**
In `src/screens/PlayerScreen.tsx`, `src/screens/ItemDetailModal.tsx`, and `src/App.tsx`, wire playlist navigation, remote media keys, and auto-advance overlay.

- [ ] **Step 4: Run test to confirm GREEN**
Run: `npx vitest run tests/screens/PlayerScreen.playlist.test.tsx` and confirm it passes.

- [ ] **Step 5: Commit**
`git add src/screens/PlayerScreen.tsx src/screens/ItemDetailModal.tsx src/App.tsx tests/screens/PlayerScreen.playlist.test.tsx && git commit -m "feat(player): add playlist support, media track keys, and auto-advance overlay"`

---

### Task 4: Pre-Flight Stream Check & Missing Media File Detection

**Files:**
- Modify: `src/screens/PlayerScreen.tsx`
- Test: `tests/screens/PlayerScreen.preflight.test.tsx`

**Interfaces:**
- Consumes: `streamUrl` generated by `apiClient.getPlaybackUrl`.
- Produces: Pre-flight check via `fetch` before video initialization.
  - If response status is `404 Not Found`, extract message (`"Media file missing from disk"`) and immediately transition player to error state with clear user-facing error `"Media File Missing: The file for this item is not found on the server disk (HTTP 404)."`
  - Avoids passing the 404 stream URL to `<video>` / AVPlay so the demuxer never crashes.

- [ ] **Step 1: Write failing tests**
Create `tests/screens/PlayerScreen.preflight.test.tsx` verifying:
- Mock `fetch` returning 404 with `{"error": "Media file missing from disk"}`.
- Verify `PlayerScreen` displays `"Media File Missing"` error message and does not mount player driver.

- [ ] **Step 2: Run test to confirm RED**
Run: `npx vitest run tests/screens/PlayerScreen.preflight.test.tsx` and confirm failure.

- [ ] **Step 3: Implement minimal code to pass test**
In `src/screens/PlayerScreen.tsx`, add pre-flight check before driver initialization to detect HTTP 404/500 errors gracefully.

- [ ] **Step 4: Run test to confirm GREEN**
Run: `npx vitest run tests/screens/PlayerScreen.preflight.test.tsx` and confirm it passes.

- [ ] **Step 5: Commit**
`git add src/screens/PlayerScreen.tsx tests/screens/PlayerScreen.preflight.test.tsx && git commit -m "feat(player): add pre-flight stream check to catch missing media files gracefully"`

---

### Task 5: Scannable Low-Density QR Code, On-Screen Diagnostic Viewer & Remote Log Relay

**Files:**
- Modify: `src/components/player/ErrorQRCode.tsx`
- Modify: `src/screens/PlayerScreen.tsx`
- Test: `tests/components/player/ErrorQRCode.test.tsx`
- Test: `tests/screens/PlayerScreen.error.test.tsx`

**Interfaces:**
- Consumes: `DiagnosticPayload` in `ErrorQRCode.tsx` and error state in `PlayerScreen.tsx`.
- Produces:
  - Low-density QR code (<80 chars text payload: `KADR ERR | #{itemId} | {driver} | {shortError}`).
  - "View Technical Details" button in playback error modal toggling an on-screen monospace modal with full error details.
  - Background asynchronous POST to remote logger (`http://<window.location.hostname>:9999/log`).

- [ ] **Step 1: Write failing tests**
Update `tests/components/player/ErrorQRCode.test.tsx` to assert:
- Compact string payload (<80 chars).
- Generates low-density SVG with chunky modules.
In `tests/screens/PlayerScreen.error.test.tsx`:
- Assert "View Technical Details" button exists and toggles monospace diagnostic dialog.

- [ ] **Step 2: Run test to confirm RED**
Run: `npx vitest run tests/components/player/ErrorQRCode.test.tsx tests/screens/PlayerScreen.error.test.tsx` and confirm failure.

- [ ] **Step 3: Implement minimal code to pass test**
Update `src/components/player/ErrorQRCode.tsx` with compact payload, and update `src/screens/PlayerScreen.tsx` with "View Technical Details" dialog and non-blocking remote log relay.

- [ ] **Step 4: Run test to confirm GREEN**
Run: `npx vitest run tests/components/player/ErrorQRCode.test.tsx tests/screens/PlayerScreen.error.test.tsx` and confirm tests pass.

- [ ] **Step 5: Commit**
`git add src/components/player/ErrorQRCode.tsx src/screens/PlayerScreen.tsx tests/components/player/ErrorQRCode.test.tsx tests/screens/PlayerScreen.error.test.tsx && git commit -m "feat(diagnostics): reduce QR code density, add on-screen technical details, and remote log relay"`

---

### Task 6: Full Integration Verification, TypeScript Compile & WGT Packaging

**Files:**
- Verify: Full codebase
- Build Artifact: `kadr.wgt`

**Interfaces:**
- Consumes: All completed tasks 1-5.
- Produces: Passing full test suite, clean `tsc -b`, and deployable signed `kadr.wgt`.

- [ ] **Step 1: Run full test suite**
Run: `npm test` and verify 100% pass across all test files.

- [ ] **Step 2: Run TypeScript compile**
Run: `npx tsc -b` and verify 0 errors.

- [ ] **Step 3: Run production build & package**
Run: `npm run package:wgt` and verify `kadr.wgt` is created cleanly.

- [ ] **Step 4: Deploy to Samsung TV**
Run: `scripts/tizen-deploy.sh UA55TU7000UXEG` and verify app installs and launches on TV.

- [ ] **Step 5: Commit any lingering files**
`git status` and commit if needed.
