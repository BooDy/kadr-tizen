# Kadr Tizen OS Media Server Client — Design Specification

- **Date**: 2026-10-07
- **Target OS**: Samsung Tizen OS (Tizen 5.5+ / 2020+ Smart TVs, Chromium 69+)
- **Resolution**: 1080p Canvas (1920 × 1080)
- **Status**: Approved

---

## 1. Overview & Goals

The objective is to build a high-performance, TV-optimized client for the [Kadr](file:///home/boody/work/personal/kadr) media server for Samsung Tizen OS Smart TVs.

### Key Goals:
- **10-Foot Living Room UI**: Designed exclusively for remote control navigation (D-pad arrow keys, Enter, Back, Media controls, numeric keys). High contrast focus indicators, large typography, and zero reliance on mouse/hover interactions.
- **Zero-Friction Discovery**: Automatic local network subnet scanning to find Kadr servers (`/api/v1/discovery`) on the same Wi-Fi / Ethernet network, falling back gracefully to manual IP entry.
- **PIN-Based Authentication**: Seamless profile switching and PIN entry supporting both physical remote number buttons and an on-screen TV keypad.
- **Declarative AST Widget Hydration**: Dynamic rendering of Kadr's screen layouts (`/api/v1/screens/home`, `/movies`, `/shows`), including Hero spotlights, horizontal carousels, and catalog grids with resume badges.
- **Hybrid Video Playback**: Samsung hardware-accelerated playback via Tizen AVPlay (`webapis.avplay`) on TV hardware, paired with an HTML5 `<video>` fallback for browser development.
- **Continuous Scrobbling**: 10-second playback progress heartbeats (`/api/v1/playback/progress`), automatic resume points, and subtitle track selection.
- **Self-Contained Packaging**: A lightweight Node.js packaging script to generate standard `.wgt` widgets without requiring Tizen Studio, plus optional CLI scripts for official Tizen SDK deployment.

---

## 2. Architecture & Tech Stack

### Technology Stack
- **Framework**: React 19 + TypeScript
- **Bundler & Build Tool**: Vite (configured with `@vitejs/plugin-react` and browser targets compatible with Chromium 69+)
- **Styling**: Tailwind CSS (tuned with a custom 1080p TV scale and glow focus rings)
- **Testing**: Vitest + React Testing Library

### Directory Structure
```
kadr-tizenos/
├── config.xml                          # Tizen application manifest (App ID, privileges, resolution)
├── index.html                          # Entry HTML loading Tizen WebAPIs
├── package.json
├── tsconfig.json
├── vite.config.ts                      # Vite build configuration (relative base, chrome69 target)
├── scripts/
│   ├── package-wgt.mjs                 # Zero-dependency Node.js .wgt packager
│   └── tizen-deploy.sh                 # Optional helper for Tizen Studio CLI
├── src/
│   ├── main.tsx                        # Application bootstrap & error boundary
│   ├── App.tsx                         # Main router & screen coordinator
│   ├── api/
│   │   ├── client.ts                   # Base HTTP fetch wrapper with auth header
│   │   ├── discovery.ts                # LAN subnet scanner & server verification
│   │   ├── auth.ts                     # Profile listing & PIN verification
│   │   ├── screens.ts                  # AST screen layout endpoints
│   │   ├── playback.ts                 # Scrobble progress & session heartbeat
│   │   └── subtitles.ts                # Subtitle listing and track fetching
│   ├── types/
│   │   ├── kadr.ts                     # Shared domain models (User, MediaItem)
│   │   ├── ast.ts                      # Declarative AST widget definitions
│   │   └── navigation.ts               # Focus engine types and interfaces
│   ├── navigation/
│   │   ├── FocusContext.tsx            # Global focus provider & spatial registry
│   │   ├── useFocusable.ts             # Hook for focusable TV components
│   │   ├── useFocusGroup.ts            # Hook for rows/grids/lists
│   │   └── keys.ts                     # TV Remote key codes & event listeners
│   ├── player/
│   │   ├── driver.ts                   # Unified PlayerDriver interface
│   │   ├── html5-driver.ts             # HTML5 <video> driver (dev & browser fallback)
│   │   ├── avplay-driver.ts            # Samsung Tizen AVPlay driver (webapis.avplay)
│   │   └── usePlayer.ts                # Player coordinator (progress, OSD, scrobbling)
│   ├── components/
│   │   ├── tv/
│   │   │   ├── TVFocusRing.tsx         # Visual focus highlight container
│   │   │   ├── TVButton.tsx            # Focusable button
│   │   │   ├── TVCard.tsx              # Focusable media card (posters, badges)
│   │   │   └── TVModal.tsx             # Modal container with focus trap
│   │   ├── widgets/
│   │   │   ├── HeroSpotlightWidget.tsx # AST Hero banner renderer
│   │   │   ├── CardCarouselWidget.tsx  # Horizontal auto-scrolling row
│   │   │   ├── CatalogGridWidget.tsx   # 2D catalog grid renderer
│   │   │   └── WidgetRenderer.tsx      # AST node dispatcher
│   │   ├── osd/
│   │   │   ├── PlayerOSD.tsx           # Full playback controls overlay
│   │   │   ├── SubtitleSelector.tsx    # Audio & Subtitle track picker
│   │   │   └── ProgressBar.tsx         # Scrub bar with timecode
│   │   └── pin/
│   │       ├── PinPadModal.tsx         # 4-digit PIN dialog
│   │       └── KeypadGrid.tsx          # 3x4 on-screen numeric keypad
│   └── screens/
│       ├── ServerConnectScreen.tsx     # LAN discovery & manual server config
│       ├── ProfileSelectScreen.tsx     # User selection & PIN login
│       ├── BrowseScreen.tsx            # Main catalog & AST layout viewer
│       ├── ItemDetailModal.tsx         # Metadata preview & Play/Resume action
│       └── PlayerScreen.tsx            # Cinema playback view
```

---

## 3. Spatial Navigation & TV Remote Input System

### 3.1 Remote Key Mapping
Tizen Smart TVs emit standard keyboard events augmented by Samsung Tizen input codes:
- **Directional D-pad**: `ArrowUp` (`38`), `ArrowDown` (`40`), `ArrowLeft` (`37`), `ArrowRight` (`39`)
- **Select / Enter**: `Enter` (`13`)
- **Back / Return**: `10009` on Tizen TV, mapped to `Escape` or `Backspace` in desktop browser dev mode.
- **Media Controls**: `MediaPlay` (`415`), `MediaPause` (`19`), `MediaPlayPause` (`10252`), `MediaStop` (`413`), `MediaFastForward` (`417`), `MediaRewind` (`412`).
- **Numeric Keys**: `0`–`9` (key codes `48`–`57`).

### 3.2 Key Registration on Tizen
On launch, the app registers TV remote keys via Samsung's TV input device API:
```ts
if (window.tizen?.tvinputdevice) {
  const keysToRegister = [
    'MediaPlay', 'MediaPause', 'MediaPlayPause', 'MediaStop',
    'MediaFastForward', 'MediaRewind',
    '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'
  ];
  for (const key of keysToRegister) {
    try {
      window.tizen.tvinputdevice.registerKey(key);
    } catch (_) {}
  }
}
```

### 3.3 Focus Registry & Focus Tree
- **Hierarchical Groups**: UI elements belong to named focus groups (`sidebar`, `hero`, `carousel-{rowId}`, `modal`, `pinpad`).
- **Group Navigation Rules**:
  - Horizontal rows (carousels) handle `Left`/`Right` internally, and pass `Up`/`Down` to the parent container.
  - Pressing `Left` from the leftmost element of any content row moves focus to the collapsible left navigation sidebar.
- **Focus Stack (Modal Trapping)**: Opening a modal pushes the current `focusedNodeId` onto an internal stack and confines focus to the modal's focus group. Closing the modal or pressing `Back` pops the stack and restores focus to the exact previous card.
- **Centering & Auto-Scroll**: When a carousel card gains focus, its container calculates `scrollLeft` to keep the active card centered on the 1080p viewport with smooth CSS transitions.

---

## 4. Local Network Discovery & Server Connection

### 4.1 Automated LAN Subnet Scanning
1. **IP Detection**:
   - On Tizen: `tizen.systeminfo.getPropertyValue("WIFI_NETWORK")` (or `ETHERNET_NETWORK`) retrieves the TV's local IPv4 (e.g., `192.168.1.45`).
   - In browser: Checks `http://localhost:8492` and common gateway defaults.
2. **Subnet Sweep**:
   - Scans the `/24` subnet (`192.168.1.1` – `254`) by firing concurrent requests to `http://<ip>:8492/api/v1/discovery` in chunks of 25 with a 1.2-second timeout using `AbortController`.
   - Checks response payload: `{ "app": "kadr", "name": "...", "status": "online" }`.
3. **Connection Behavior**:
   - Single server found: Automatically connects and saves URL to `localStorage`.
   - Multiple servers found: Displays a selectable list of server cards.
   - No servers found: Displays "No Kadr Server Found" with a prominent "Manual IP Entry" button.

### 4.2 Manual Fallback
Provides a numeric/text input screen to enter the IP or hostname with port pre-filled to `:8492`, validating connectivity via `GET /api/v1/discovery` before saving.

---

## 5. Profile Selection & PIN Authentication

1. **Profile Listing**:
   - Unauthenticated call to `GET /api/v1/users/profiles`.
   - Renders a horizontal list of profile cards with avatars and user names.
2. **PIN Modal**:
   - Selecting a profile opens the PIN Pad dialog with 4 masked PIN dot indicators.
   - Supports direct remote numeric input (`0`–`9`) as well as D-pad navigation on an on-screen 3×4 numeric keypad.
   - Backspace key deletes the last entered digit.
3. **Authentication**:
   - Submits `POST /api/v1/auth/pin` with `{ user_id, pin }`.
   - On success: Saves JWT token and user info, then navigates to the Browse screen.
   - On error: Clears PIN dots and shakes the indicator.
   - On rate limit (HTTP 429 `LockedOut`): Displays the lockout countdown timer returned in `Retry-After`.

---

## 6. Main Browse Screen & AST Widget Hydration

### 6.1 Layout & Navigation Bar
- **Collapsible TV Sidebar**: Left-docked bar displaying icons for `Home`, `Movies`, `Shows`, `Switch Profile`, and `Settings`. Expands with labels when focused.
- **Top Bar Header**: Shows current screen title, server status, and active user avatar.

### 6.2 AST Widget Rendering
Fetches screen AST from `GET /api/v1/screens/{screen_id}` with `Authorization: Bearer <token>` and maps AST nodes to components:
- **`HeroSpotlight`**: Top cinematic banner with title, backdrop artwork, badges (`4K`, `HDR`, runtime), synopsis, and "Play" / "More Info" buttons.
- **`HorizontalCardCarousel`**: Horizontal scrolling row of cards with poster images, title headers, badge computation (watched percentage bar, `RESUME` badge, `NEW` badge).
- **`CatalogGrid`**: Multi-row 2D grid of media items for extensive library exploration.

### 6.3 Item Detail Modal
- Triggered when pressing `Enter` on any card in the carousel or grid.
- Shows expanded metadata: poster, backdrop, full description, release year, resolution, and audio channels.
- Actions:
  - **Resume Playback**: Displayed if `resume_position_ms > 0` with timestamp.
  - **Play from Beginning**: Starts from 0:00.
- Pressing `Back` closes the modal and returns focus to the calling card.

---

## 7. Dual Video Playback Engine & Scrobbling

### 7.1 Unified `PlayerDriver` Interface
```ts
export type PlayerState = 'idle' | 'buffering' | 'playing' | 'paused' | 'ended' | 'error';

export interface PlayerDriver {
  init(container: HTMLElement, streamUrl: string, startMs: number): Promise<void>;
  play(): void;
  pause(): void;
  seekTo(ms: number): void;
  destroy(): void;
  setSubtitleTrack(trackUrl: string | null): void;
  onTimeUpdate(callback: (posMs: number, durationMs: number) => void): void;
  onStateChange(callback: (state: PlayerState) => void): void;
  onError(callback: (error: string) => void): void;
}
```

### 7.2 Implementations
1. **`TizenAvplayDriver`** (Hardware on TV):
   - Uses `webapis.avplay.open(streamUrl)`.
   - Sets display dimensions: `webapis.avplay.setDisplayRect(0, 0, 1920, 1080)`.
   - Registers AVPlay event listeners (`oncurrentplaytime`, `onbufferingstart`, `onbufferingcomplete`).
   - Plays direct HTTP 206 range streams without CPU transcoding overhead.
2. **`Html5PlayerDriver`** (Browser / Desktop Dev):
   - Creates and mounts a standard `<video>` DOM element.
   - Synchronizes time updates and playback events for seamless local development.

### 7.3 Scrobbling & Heartbeat
- **Heartbeat**: A 10-second interval sends `POST /api/v1/playback/progress`:
  ```json
  {
    "item_id": "...",
    "position_ms": 145000,
    "is_paused": false
  }
  ```
- **Completion**: If playback reaches $\ge 90\%$ of total media duration, the server marks the item as fully watched.
- **Teardown**: When exiting via `Back` or completing the video, a final progress update is dispatched immediately.

### 7.4 On-Screen Display (OSD)
- Shows media title, current position, total duration, and visual scrub bar.
- Remote Key Actions during playback:
  - `Enter` / `MediaPlayPause`: Toggle play/pause.
  - `Left` / `Right`: Seek backward / forward 10 seconds.
  - `Up` / `Down`: Show OSD or toggle Subtitle/Audio selection menu.
  - `Back`: Exit player, sync final progress, and return to Browse view.
- OSD automatically fades out after 4 seconds of inactivity.

---

## 8. Build, Packaging & Deployment Pipeline

### 8.1 Scripts
- `npm run dev`: Starts Vite dev server with remote key emulation enabled.
- `npm run build`: Type-checks with `tsc -b` and compiles bundle into `dist/`.
- `npm run package:wgt`: Runs `scripts/package-wgt.mjs` to zip `dist/`, `config.xml`, and icons into `kadr.wgt`.
- `npm run deploy:tizen`: Shell script to install and launch on TV via `tizen` CLI.

### 8.2 Tizen `config.xml` Manifest
Includes required TV privileges:
- `http://tizen.org/privilege/internet`
- `http://tizen.org/privilege/tv.inputdevice`
- `http://tizen.org/feature/screen.size.all`
- `<access origin="*" subdomains="true"/>` (permits local LAN HTTP discovery and streaming)

---

## 9. Verification & Testing Strategy

- **Spatial Navigation Unit Tests**:
  - Focus shifting across horizontal and vertical focus groups.
  - Focus stack preservation and restoration on modal open/close.
  - D-pad wrapping and boundary prevention.
- **Discovery Tests**:
  - Subnet scanner batching and timeout abort logic.
  - Server validation matching Kadr discovery schema.
- **Authentication & PIN Tests**:
  - Profile selection, 4-digit input handling, and 429 lockout countdown formatting.
- **Playback Controller Tests**:
  - Timer-based scrobble heartbeats (10s interval) using Vitest fake timers.
  - Auto-resume seek calculation.
- **AST Rendering Tests**:
  - Verification that Kadr AST payloads render the expected widgets and badge states.
