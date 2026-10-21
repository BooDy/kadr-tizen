# TV UI Sidebar Spacing and Video Action Button Scaling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance TV user experience on 1080p television screens by doubling sidebar navigation spacing with auto-scrolling on focus, doubling font size, and increasing padding and spacing on all video page action buttons.

**Architecture:** 
- In `BrowseScreen.tsx`, isolate the screens/libraries list into an `overflow-y-auto scrollbar-none` flex container spaced with `gap-[148px]` (~2x item height) and synchronize remote D-Pad focus with `scrollIntoView({ block: 'nearest', behavior: 'smooth' })`.
- In `ItemDetailModal.tsx`, enlarge action buttons (`Play`, `Resume`, `Play from Beginning`, `Browse Folder`) with `!py-6 !px-12 !text-4xl font-extrabold gap-8 mb-4` and `w-10 h-10` icons.
- In `HeroSpotlightWidget.tsx`, scale `Play` and `Details` buttons with `px-12 py-6 text-3xl font-extrabold gap-8` and `w-10 h-10` icons.
- In `PlayerScreen.tsx`, scale playback error screen buttons (`Retry`, `HLS`, `HTML5`, `Exit`) with `px-10 py-6 text-2xl font-bold space-y-6`.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Lucide React, Vitest, Testing Library.

## Global Constraints

- Target platform: Samsung Tizen OS TV 5.5+ (Chromium 69 compatible CSS/JS, no unsupported CSS layers).
- Remote interaction: TV D-Pad remote control interaction (FocusContext, TVKeys, focus trapping).
- Sizing requirements: Sidebar spacing is ~2x item height (~148px gap); video action buttons have doubled font size (~36px / `text-4xl`), increased padding (`py-6 px-12` or `py-10 px-6`), and increased button spacing (`gap-8`).
- TDD: Test-driven development (failing tests first before implementation changes).

---

### Task 1: Sidebar Spacing & Auto-Scroll Navigation in `BrowseScreen.tsx`

**Files:**
- Modify: `src/screens/BrowseScreen.tsx:350-435`
- Test: `tests/screens/BrowseScreen.test.tsx`

**Interfaces:**
- Consumes: `displayScreens`, `TVButton`, `FocusContext`
- Produces: Sidebar list container with `data-testid="sidebar-items-container"`, `gap-[148px]`, `overflow-y-auto scrollbar-none`, and focus scroll-into-view.

- [ ] **Step 1: Write the failing tests**

In `tests/screens/BrowseScreen.test.tsx`, add a test verifying the sidebar items container has the 148px spacing class and scroll container classes, and that focused sidebar items invoke `scrollIntoView`:

```tsx
it('renders sidebar navigation items with 2x item height spacing (148px gap) in an auto-scroll container', async () => {
  renderWithProviders(<BrowseScreen onSelectMedia={vi.fn()} onSwitchProfile={vi.fn()} />);
  await waitFor(() => {
    expect(screen.getByTestId('sidebar-items-container')).toBeInTheDocument();
  });
  const container = screen.getByTestId('sidebar-items-container');
  expect(container.className).toContain('gap-[148px]');
  expect(container.className).toContain('overflow-y-auto');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/screens/BrowseScreen.test.tsx -t "renders sidebar navigation items with 2x item height spacing"`
Expected: FAIL (no element with `data-testid="sidebar-items-container"` or missing `gap-[148px]`).

- [ ] **Step 3: Implement sidebar spacing & auto-scroll in `BrowseScreen.tsx`**

In `src/screens/BrowseScreen.tsx`:
1. In the sidebar `<nav data-testid="tv-sidebar" ...>`, separate the top logo (`shrink-0`), middle screens container, and bottom profile switcher (`shrink-0`).
2. Wrap the middle `displayScreens` map in:
```tsx
<div
  data-testid="sidebar-items-container"
  className="flex-1 overflow-y-auto scrollbar-none flex flex-col gap-[148px] py-4"
>
  {displayScreens.map((screenItem, index) => {
    ...
    return (
      <TVButton
        key={screenItem.id}
        id={`nav-screen-${screenItem.id}`}
        groupId="sidebar"
        order={index + 1}
        variant={isActive ? 'nav-active' : 'nav-inactive'}
        onEnter={() => handleSelectScreen(screenItem.id)}
        onClick={() => handleSelectScreen(screenItem.id)}
        className="w-full justify-start px-5 py-5 shrink-0"
      >
        ...
      </TVButton>
    );
  })}
</div>
```
3. Attach a focus effect or listener so that whenever a sidebar button gains focus, it calls `element.scrollIntoView({ block: 'nearest', behavior: 'smooth' })`.
4. Render the bottom switch profile button in a fixed footer:
```tsx
<div className="pt-4 border-t border-[rgba(245,229,229,0.08)] shrink-0">
  <TVButton
    id="nav-switch-profile"
    groupId="sidebar"
    order={displayScreens.length + 1}
    variant="nav-inactive"
    onEnter={onSwitchProfile}
    onClick={onSwitchProfile}
    className="w-full justify-start px-5 py-5"
  >
    <Users className="w-9 h-9 shrink-0 mr-4" />
    <span
      className={`${
        isSidebarFocused ? 'inline' : 'hidden group-hover:inline group-focus-within:inline'
      } text-3xl font-extrabold tracking-wide truncate`}
    >
      Switch Profile
    </span>
  </TVButton>
</div>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/screens/BrowseScreen.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/screens/BrowseScreen.tsx tests/screens/BrowseScreen.test.tsx
git commit -m "feat(sidebar): double sidebar item spacing to 148px with auto-scroll container"
```

---

### Task 2: Action Buttons Scaling & Spacing on Video Details (`ItemDetailModal.tsx`)

**Files:**
- Modify: `src/screens/ItemDetailModal.tsx:290-375`
- Test: `tests/screens/ItemDetailModal.test.tsx`

**Interfaces:**
- Consumes: `ItemDetailModalProps`, `TVButton`
- Produces: Scaled action buttons with `!py-6 !px-12 !text-4xl font-extrabold`, `w-10 h-10` icons, and `gap-8 mb-4` container.

- [ ] **Step 1: Write the failing tests**

In `tests/screens/ItemDetailModal.test.tsx`, add a test verifying the updated button classes and container gap:

```tsx
it('renders primary video action buttons with enlarged padding, gap-8 spacing, and text-4xl font size', async () => {
  renderWithProviders(
    <ItemDetailModal
      item={{ id: 10, title: 'Big Movie', type: 'movie', library_id: 1, path: '/movies/big.mkv' }}
      onClose={vi.fn()}
      onPlay={vi.fn()}
    />
  );
  const playBtn = screen.getByRole('button', { name: /play/i });
  expect(playBtn.className).toContain('!py-6');
  expect(playBtn.className).toContain('!px-12');
  expect(playBtn.className).toContain('!text-4xl');
  expect(playBtn.parentElement?.className).toContain('gap-8');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/screens/ItemDetailModal.test.tsx -t "renders primary video action buttons with enlarged padding"`
Expected: FAIL (contains `!py-4`, `!px-8`, `!text-2xl`, and `gap-4`).

- [ ] **Step 3: Implement scaled action buttons in `ItemDetailModal.tsx`**

In `src/screens/ItemDetailModal.tsx`:
1. Change the button row container:
```tsx
<div className="flex mt-auto flex-row items-center flex-wrap gap-8 mb-4">
```
2. Update all action buttons (`detail-resume-btn`, `detail-play-btn`, `detail-restart-btn`, `detail-browse-folder-btn`):
- Change `className` from:
  `!py-4 !px-8 !text-2xl font-bold rounded-2xl gap-4 mr-4 mb-2`
  to:
  `!py-6 !px-12 !text-4xl font-extrabold rounded-2xl gap-5`
- Change Play icon from `w-7 h-7 fill-current mr-3` to `w-10 h-10 fill-current mr-4`.
- Change RotateCcw icon from `w-7 h-7 mr-3` to `w-10 h-10 mr-4`.
- Change FolderOpen icon from `w-7 h-7 mr-3` to `w-10 h-10 mr-4`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/screens/ItemDetailModal.test.tsx tests/screens/ItemDetailModal.seasons.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/screens/ItemDetailModal.tsx tests/screens/ItemDetailModal.test.tsx
git commit -m "feat(details): enlarge video action buttons with text-4xl font, py-6 px-12 padding, and gap-8 spacing"
```

---

### Task 3: Button Scaling on Hero Spotlight and Player Error Screens

**Files:**
- Modify: `src/components/widgets/HeroSpotlightWidget.tsx:73-95`
- Modify: `src/screens/PlayerScreen.tsx:750-810`
- Test: `tests/screens/PlayerScreen.hls.test.tsx`

**Interfaces:**
- Consumes: `HeroSpotlightWidget`, `PlayerScreen`
- Produces: Scaled buttons in hero spotlight and player error dialog.

- [ ] **Step 1: Write the failing tests**

In `tests/screens/PlayerScreen.hls.test.tsx`, verify the error screen action buttons have `px-10 py-6` and `text-2xl font-bold` or `text-3xl`:

```tsx
it('renders error action buttons with enlarged padding and spacing', async () => {
  // Setup player in error state
  ...
  const retryBtn = screen.getByRole('button', { name: /retry playback/i });
  expect(retryBtn.className).toContain('py-6');
  expect(retryBtn.className).toContain('px-10');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/screens/PlayerScreen.hls.test.tsx -t "renders error action buttons with enlarged padding"`
Expected: FAIL (currently `px-6 py-4`).

- [ ] **Step 3: Update `HeroSpotlightWidget.tsx` and `PlayerScreen.tsx`**

1. In `src/components/widgets/HeroSpotlightWidget.tsx`:
- Update button container from `flex gap-4` to `flex gap-8`:
```tsx
<div className="flex gap-8">
  <TVButton
    id={`hero-play-${widget.id}`}
    groupId="hero"
    variant="primary"
    onEnter={() => onPlay(item.id, resumeMs)}
    onClick={() => onPlay(item.id, resumeMs)}
    className="!px-12 !py-6 !text-3xl font-extrabold rounded-2xl gap-4"
    autoFocus
  >
    <Play className="w-10 h-10 fill-current" />
    {hasResume ? 'Resume' : 'Play'}
  </TVButton>
  <TVButton
    id={`hero-details-${widget.id}`}
    groupId="hero"
    variant="secondary"
    onEnter={() => onDetails(item.id)}
    className="!px-12 !py-6 !text-3xl font-extrabold rounded-2xl gap-4"
  >
    <Info className="w-10 h-10" /> Details
  </TVButton>
</div>
```

2. In `src/screens/PlayerScreen.tsx`:
- In the error modal buttons container, change `space-y-3` to `space-y-6`:
```tsx
<div className="flex flex-col space-y-6 w-full">
  <TVButton
    id="player-error-retry-btn"
    groupId="player-error"
    variant="primary"
    className="w-full !py-6 !px-10 !text-2xl font-bold rounded-2xl"
    onEnter={handleRetryPlayback}
    onClick={handleRetryPlayback}
  >
    Retry Playback
  </TVButton>
  ...
```
- Apply the same `w-full !py-6 !px-10 !text-2xl font-bold rounded-2xl` to all other buttons in this error container (`player-error-hls-btn`, `player-error-html5-btn`, `player-error-exit-btn`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/screens/PlayerScreen.hls.test.tsx tests/screens/PlayerScreen.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/widgets/HeroSpotlightWidget.tsx src/screens/PlayerScreen.tsx tests/screens/PlayerScreen.hls.test.tsx
git commit -m "feat(player,hero): enlarge hero spotlight and player error buttons with 2x padding and spacing"
```

---

### Task 4: Full Test Suite Verification, TypeScript Compile & WGT Packaging

**Files:**
- Verification only

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: 31+ test files pass (320+ unit/integration tests).

- [ ] **Step 2: Run TypeScript build check**

Run: `npx tsc -b`
Expected: 0 errors.

- [ ] **Step 3: Run production build**

Run: `npm run build`
Expected: Clean Vite production build in `dist/`.

- [ ] **Step 4: Run WGT package build**

Run: `npm run package:wgt`
Expected: Successfully packaged and signed `kadr.wgt`.

- [ ] **Step 5: Commit any lingering files if any**

```bash
git status
```
