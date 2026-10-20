# TV UI Scaling, Seeking Lock, Season Focus, and Library Folder Browser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix fast-forward position snap-back with a seek lock window, ensure deterministic TV remote focus navigation into season tabs via capture-phase interception, eliminate random scrollbars on Chromium 69, scale `ItemDetailModal` to full-screen with giant 10-foot TV typography and buttons, and add a "Browse Folders" button to each library screen in `BrowseScreen`.

**Architecture:**
- Seeking Lock: Prevent `onTimeUpdate` from resetting position for 1.5s after seek or until seek callback fires.
- Season Navigation: Attach `ItemDetailModal` keydown listener in capture phase (`{ capture: true }`) to bypass spatial candidate threshold failures in `FocusContext`.
- Scrollbars: Global CSS WebKit scrollbar suppression in `src/index.css`.
- UI Scaling: Expand `ItemDetailModal` to full-screen (`fixed inset-0 w-screen h-screen p-16`) with giant buttons and text.
- Folder Browsing: Add `onBrowseFolder` handler to `BrowseScreen` and render a top header button on library tabs.

**Tech Stack:**
- React 19, TypeScript 5.7, Tailwind CSS v4, Lucide React, Vitest, Testing Library, Samsung Tizen AVPlay.

## Global Constraints
- Target platform: Samsung Tizen OS TV (Chromium 69 compatible CSS/JS).
- Zero scrollbar visibility across all screens.
- TV remote D-Pad navigation must be deterministic.
- Full test suite must pass with 0 regressions.

---

### Task 1: Global Scrollbar Suppression (`src/index.css`)
- Modify: `src/index.css`
- Test: Build check `npm run build` and visual inspection.
- Add WebKit and standard scrollbar hiding rules.

### Task 2: AVPlay Seeking Lock & Smoothing (`src/screens/PlayerScreen.tsx`, `src/player/avplay-driver.ts`, `src/player/driver.ts`)
- Modify: `src/player/driver.ts`
- Modify: `src/player/avplay-driver.ts`
- Modify: `src/screens/PlayerScreen.tsx`
- Test: `tests/screens/PlayerScreen.seeking.test.tsx`
- Implement `seekLockUntilMsRef` ignoring stale time updates for 1500ms post-seek or until completion callback.

### Task 3: Deterministic Season Focus Capture & Full-Screen Scaling (`src/screens/ItemDetailModal.tsx`)
- Modify: `src/screens/ItemDetailModal.tsx`
- Test: `tests/screens/ItemDetailModal.seasons.test.tsx`
- Test: `tests/screens/ItemDetailModal.test.tsx`
- Use capture phase on keydown to unconditionally intercept Down/Up/Left/Right.
- Transform layout into full screen (`fixed inset-0 w-screen h-screen p-16`) with giant buttons (`!py-5 !px-8 !text-2xl`), giant title (`text-6xl`), and large season tabs.

### Task 4: Library Directory Browsing Button (`src/screens/BrowseScreen.tsx`, `src/App.tsx`)
- Modify: `src/screens/BrowseScreen.tsx`
- Modify: `src/App.tsx`
- Test: `tests/screens/BrowseScreen.test.tsx`
- Test: `tests/App.test.tsx`
- Render "Browse Folders" button when viewing a library screen and wire into `FolderBrowserModal`.

### Task 5: Integration Verification, Full Test Suite, Build, and TV Deployment
- Run full test suite `npm test`.
- Compile `npx tsc -b`.
- Build and package `kadr.wgt`.
- Deploy and launch on Samsung TV (`192.168.1.100:26101`).
