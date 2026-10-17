# Picture Viewer, Directory Thumbnails & Filmstrip Slideshow Carousel Design

## Overview
This design adds complete picture viewing capabilities to Kadr Tizen OS. It enables authenticated thumbnail loading in directory file listings, provides 1-click photo viewing and automated slideshow playback, and equips the full-screen photo viewer with a TV-friendly horizontal filmstrip thumbnail carousel and remote control navigation.

---

## 1. Problem Statement
1. **Broken Thumbnails in Directory Browser**: When browsing folders containing images, `<img>` tags load images directly via HTTP GET without the required auth token (`token`) or private library unlock tokens (`unlocked`), resulting in 401/403 errors and broken image icons.
2. **Missing Picture Carousel in Player**: The previous viewer was a rudimentary lightbox without a thumbnail carousel filmstrip, making it difficult to scrub through a photo album or preview neighboring images.
3. **Remote Control Experience**: Navigating between full-screen view, slideshow playback, and filmstrip scrubbing requires intuitive TV remote keybindings (`Left`/`Right`, `Up`/`Down`, `Enter`/`PlayPause`, `Back`).

---

## 2. Architecture & Data Flow

### 2.1 Authenticated Image URL Resolution
Kadr streams image files from `/api/v1/libraries/{id}/image?path={path}`. Because image elements cannot pass custom HTTP authorization headers, tokens must be supplied in query strings:
- JWT Token: `token=<jwt_token>`
- Unlocked Tokens: `unlocked=<comma_separated_library_unlock_tokens>`

A centralized helper utility `getAuthenticatedImageUrl(serverUrl, imagePath, token, unlockTokens)` will construct fully authenticated URLs for both thumbnail cards and full-screen view.

### 2.2 Component State Hierarchy
```
App.tsx
 ├── FolderBrowserModal (client, serverUrl, token, libraryId, initialPath)
 │    ├── Folder Directory Cards
 │    ├── Media Item Cards
 │    └── Folder Image Cards (Authenticated Thumbnails, Fallback Icon, File Size)
 │         └── "Start Slideshow" Button
 └── ImageViewerModal (images, initialIndex, autoPlay, serverUrl, token, client, onClose)
      ├── Full-Screen Stage (Centered Image, Cross-fade Transition)
      ├── Top HUD (Title, Index Counter, File Size, Close Button)
      ├── Bottom Filmstrip Carousel (Horizontal Thumbnail Strip, Centered Active Item)
      └── Bottom HUD (Playback Status Pill, Remote Control Hints)
```

---

## 3. UI & Interaction Design

### 3.1 Directory Listing Thumbnails (`FolderBrowserModal`)
- **Grid Layout**: 6-column TV responsive grid (`grid-cols-6 gap-6`) for photos within the folder browser modal.
- **Card Design**:
  - `aspect-square` thumbnail container with dark canvas backdrop (`#2A0A0A`).
  - Authenticated thumbnail image loaded with `object-cover`.
  - Fallback icon (`ImageIcon`) displayed if the image fails to load.
  - File name truncated with ellipsis.
  - Formatted file size (e.g., `3.2 MB`).
  - Active focus ring (`tv-focus-ring`) and scale transition (`scale-105`) on TV focus.
- **Actions**:
  - **Start Slideshow**: Button in the section header `Photos (N)` that launches the photo player in slideshow mode (`autoPlay: true, initialIndex: 0`).
  - **Single Photo Click**: Clicking any image opens the viewer at that image's index (`autoPlay: false`).
  - **Return Focus**: Closing the viewer restores remote focus directly to the last viewed image card.

### 3.2 Full-Screen Picture Player & Filmstrip Carousel (`ImageViewerModal`)
- **Main Display**:
  - High-resolution image centered in viewport with `object-contain`.
  - Smooth opacity cross-fade when switching images.
- **Top HUD**:
  - Semi-transparent gradient bar (`from-[#2A0A0A]/90 to-transparent`).
  - Image file name in bold.
  - Position counter (`12 / 85`).
  - Formatted file size (`formatBytes`).
  - Close button.
- **Bottom Filmstrip Carousel**:
  - Horizontal scroll container above the bottom status bar.
  - Displays thumbnail previews (`w-24 h-16 rounded-lg`) of surrounding photos.
  - The currently active photo has a prominent border and focus highlight (`#FF6B00`).
  - Automatically scrolls to keep the active thumbnail centered as slides advance.
- **Bottom HUD**:
  - Status indicator:
    - Slideshow active: `Playing Slideshow (4s)` with pulsing indicator and play icon.
    - Paused: `Paused` with pause icon.
  - Remote shortcut legend: `◄ / ► Navigate • ▼ Filmstrip • ⏯ Play/Pause • Back Exit`.
- **Auto-hide Behavior**:
  - Overlays auto-hide after 4 seconds of inactivity during slideshow or when viewing.
  - Any keypress or mouse movement immediately reveals the HUD and resets the timer.

---

## 4. TV Remote Keybindings & Navigation Scheme

| Key | Focused Element | Action |
|---|---|---|
| `Left` | Main View | Previous image (wraps to end if at beginning) |
| `Right` | Main View | Next image (wraps to start if at end) |
| `Down` | Main View | Move focus into bottom Filmstrip Carousel |
| `Left` / `Right` | Filmstrip Carousel | Scrub through thumbnails; updates main image preview |
| `Up` | Filmstrip Carousel | Return focus to Main View |
| `Enter` / `Space` | Main View | Toggle Slideshow Play/Pause |
| `Enter` / `Space` | Filmstrip Carousel | Select thumbnail and return focus to Main View |
| `Play` / `Pause` / `PlayPause` | Any | Toggle Slideshow Play/Pause |
| `Back` / `Escape` | Any | Close picture viewer, restore focus in folder browser |

---

## 5. Error Handling & Edge Cases
- **Missing or Broken Images**: Fallback placeholder with image icon rendered if URL cannot be fetched or returns 404/500.
- **Single Image Folders**: If only 1 image exists, navigation controls, filmstrip, and slideshow buttons adapt gracefully (no prev/next buttons, slideshow disabled).
- **Private Libraries**: Uses unlocked tokens stored in `client` to stream protected photos without 403 Forbidden errors.
- **Rapid Navigation**: Debounced/immediate image index updates without memory leaks from timer intervals.

---

## 6. Testing & Verification Plan
- **Unit Tests**:
  - Test authenticated URL generator with and without token and unlock tokens.
  - Test thumbnail rendering and fallback handling in `FolderBrowserModal`.
  - Test `ImageViewerModal` filmstrip rendering, active thumbnail centering, and auto-play interval.
  - Test D-Pad keydown events (`Left`, `Right`, `Down`, `Up`, `Enter`, `Play/Pause`, `Back`).
- **Regression Verification**:
  - Ensure all existing tests in `FolderBrowserModal.test.tsx`, `ImageViewerModal.test.tsx`, and `App.test.tsx` pass without regressions.
