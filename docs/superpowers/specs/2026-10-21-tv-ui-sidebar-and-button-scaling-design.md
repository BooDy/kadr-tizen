# Design Specification: TV UI Sidebar Spacing and Video Action Button Scaling

**Date**: 2026-10-21  
**Target Platform**: Samsung Tizen OS TV (1920x1080 canvas, Chromium 69 compatible CSS/JS)  
**Status**: Approved by User  

---

## 1. Overview & Goals

On 10-foot TV viewing distances (typically 2 to 4 meters away from a 55"+ 1080p/4K television screen), standard desktop and mobile UI button sizes and vertical margins appear cramped and hard to read. Remote navigation requires clear spatial separation and prominent focus states.

This specification addresses two key UI enhancements requested by the user:
1. **Sidebar Navigation Spacing**: Sidebar navigation items in `BrowseScreen.tsx` must have vertical spacing between them equal to double their item height (~148px gap), wrapped in a dedicated auto-scroll container so items smoothly scroll into view during remote D-Pad navigation.
2. **Video Action Buttons Scaling**: Action buttons on video-related screens (`ItemDetailModal.tsx`, `HeroSpotlightWidget.tsx`, and `PlayerScreen.tsx`) must have increased padding (`py-6 px-12` / `py-7 px-14`), enlarged button-to-button spacing (`gap-8` / 32px), and doubled font sizes (`text-3xl` / `text-4xl font-extrabold`) with matching enlarged icons (`w-10 h-10`).

---

## 2. Component Design & Changes

### 2.1 Sidebar Navigation (`src/screens/BrowseScreen.tsx`)

#### Dimensions & Spacing
- Current sidebar button height: ~74px (padding `py-5` + icon/text `36px` + border).
- Requirement: "The sidebar items need to have double their height in spacing between them".
- Vertical spacing between items: `gap-[148px]` (or `space-y-[148px]`), exactly doubling their ~74px height.

#### Layout Hierarchy & Scrolling
```tsx
<nav data-testid="tv-sidebar" className="...">
  {/* Top Fixed Section: Logo */}
  <div className="h-24 flex items-center justify-center mb-8 shrink-0">
    <img src="./kadr-logo.png" ... />
  </div>

  {/* Middle Scrollable Section: Screen/Library Items */}
  <div
    data-testid="sidebar-items-container"
    className="flex-1 overflow-y-auto scrollbar-none flex flex-col gap-[148px] py-4"
  >
    {displayScreens.map((screenItem, index) => (
      <TVButton
        key={screenItem.id}
        id={`nav-screen-${screenItem.id}`}
        ...
        className="w-full justify-start px-5 py-5 shrink-0"
      >
        ...
      </TVButton>
    ))}
  </div>

  {/* Bottom Fixed Section: Switch Profile */}
  <div className="pt-4 border-t border-[rgba(245,229,229,0.08)] shrink-0">
    <TVButton
      id="nav-switch-profile"
      ...
    />
  </div>
</nav>
```

#### D-Pad Auto-Scroll Synchronization
- When navigating up or down with the remote D-Pad, the focused element receives focus via `FocusContext`.
- We add an auto-scroll hook or focus listener in `BrowseScreen` (or on the TVButton mount/focus) that invokes:
  ```ts
  element.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  ```
- This ensures the active item remains visible within the 1080p viewport as the user navigates between libraries.

---

### 2.2 Video Details Screen (`src/screens/ItemDetailModal.tsx`)

#### Action Button Row
- Target buttons:
  - `detail-play-btn` ("Play")
  - `detail-resume-btn` ("Resume (XXm)")
  - `detail-restart-btn` ("Play from Beginning")
  - `detail-browse-folder-btn` ("Browse Folder")
- **Styling Changes**:
  - **Padding**: Changed from `!py-4 !px-8` to `!py-6 !px-12` (24px vertical, 48px horizontal).
  - **Font Size**: Changed from `!text-2xl` (~24px) to `!text-4xl font-extrabold tracking-wide` (~36px).
  - **Icon Size**: Changed from `w-7 h-7 mr-3` to `w-10 h-10 mr-4`.
  - **Spacing / Margins**: Button container uses `flex flex-row items-center flex-wrap gap-8 mb-4` (replacing `gap-4 mr-4 mb-2`), ensuring 32px of clean spacing between each button with full-width line wrapping when necessary.
  - **Border Radius**: `rounded-2xl`.

---

### 2.3 Hero Spotlight Widget (`src/components/widgets/HeroSpotlightWidget.tsx`)

#### Action Buttons
- Target buttons:
  - `hero-play-${widget.id}` ("Play" / "Resume")
  - `hero-details-${widget.id}` ("Details")
- **Styling Changes**:
  - **Padding**: Explicitly styled with `px-12 py-6 rounded-2xl`.
  - **Font Size**: `text-3xl font-extrabold tracking-wide`.
  - **Icon Size**: `w-10 h-10`.
  - **Spacing**: Button row container gap increased from `gap-4` to `gap-8`.

---

### 2.4 Player Error Screen (`src/screens/PlayerScreen.tsx`)

#### Action Buttons
- Target buttons:
  - `player-error-retry-btn` ("Retry Playback")
  - `player-error-hls-btn` ("Transcode to HLS (Server)")
  - `player-error-html5-btn` ("Try HTML5 Video Player")
  - `player-error-exit-btn` ("Exit to Browse")
- **Styling Changes**:
  - **Padding**: Increased from `px-6 py-4` to `px-10 py-6 rounded-2xl`.
  - **Font Size**: Increased from `text-lg` to `text-2xl font-bold` / `text-3xl font-extrabold`.
  - **Spacing**: Container spacing increased from `space-y-3` to `space-y-6`.

---

## 3. Compatibility & Accessibility Constraints

1. **Samsung Tizen OS 5.5+ (Chromium 69)**:
   - Use standard Flexbox and standard Tailwind classes compiled by PostCSS.
   - Avoid modern CSS features like CSS subgrid or `@layer` reset directives not supported in Chromium 69.
   - Scrollbar hiding: Use utility class `scrollbar-none` or CSS `::-webkit-scrollbar { display: none; }`.
2. **TV Remote Navigation**:
   - `FocusContext` geometric calculations and manual overrides remain intact.
   - Pushed traps (`item-detail-modal`, `player-error`) continue to capture all remote D-Pad events without focus leakage.
3. **No Unintentional Regressions**:
   - Modals like `PinPadModal` or folder browser navigation cards will not be bloated by global base overrides; all scaling is targeted to video pages and sidebar as specified.

---

## 4. Testing Strategy

1. **Unit & Integration Tests**:
   - `tests/screens/BrowseScreen.test.tsx`:
     - Verify sidebar items container renders with `gap-[148px]` and `overflow-y-auto`.
     - Verify active item focus and navigation.
   - `tests/screens/ItemDetailModal.test.tsx`:
     - Verify action buttons have updated padding (`!py-6 !px-12`), font size (`!text-4xl`), and gap (`gap-8`).
   - `tests/screens/PlayerScreen.test.tsx` & `tests/screens/PlayerScreen.hls.test.tsx`:
     - Verify error screen button sizing and remote navigation.
2. **Full Test Suite & Build Verification**:
   - `npm test`: All 31+ test files must pass.
   - `npx tsc -b`: TypeScript compiler must report 0 errors.
   - `npm run package:wgt`: Production package artifact must compile and sign cleanly.
