# TV UI Enhancements: Sidebar Spacing, Player Playlist Navigation, Scannable Error Diagnostics, and Pre-flight Missing Media Detection

## Problem Statement

1. **Sidebar Spacing**: The previous spacing between sidebar buttons was increased to `148px` (~2x button height), creating excessive vertical gaps that pushed items off-screen.
2. **Video Player Playlist Navigation**: When viewing a TV series season or playlist of episodes, users cannot navigate to next or previous episodes directly inside the player or using remote control media keys, and there is no automatic transition when an episode finishes.
3. **Diagnostic QR Code Density & Error Copying**: The error QR code encodes a 500+ character raw JSON payload containing long stream URLs and auth tokens. The resulting dense, high-frequency dot matrix is difficult or impossible for phone cameras to scan on a TV screen from couch distance (2-3 meters). Furthermore, TV users have no way to view the detailed server response or send it to developers.
4. **Missing Media Demuxer Crash**: When a media item's file is missing on the server disk (e.g. *Dexter New Blood*), the server returns `HTTP 404 {"error": "Media file missing from disk"}`. The HTML5/AVPlay player attempts to demux this JSON payload as video bytes, producing a confusing and misleading `MEDIA_ERR_SRC_NOT_SUPPORTED (4) - PipelineStatus::DEMUXER_ERROR_COULD_NOT_PARSE` error instead of informing the user that the file is missing from disk.

---

## Architecture & Design Decisions

### 1. Sidebar Spacing Reduction in `BrowseScreen.tsx`
- Replace `gap-[148px]` in the sidebar items container with `gap-8` (`32px`).
- Retain the auto-scrolling container (`overflow-y-auto scrollbar-none flex flex-col gap-8 py-4`) with smooth focus synchronization (`scrollIntoView({ block: 'nearest', behavior: 'smooth' })`).
- Retain fixed `shrink-0` header logo and bottom profile/status sections.

### 2. Video Player Playlist & Episode Navigation
- **Data Flow & State**:
  - In `ItemDetailModal.tsx` and `App.tsx`, when an episode is selected from a series or season, construct a playlist:
    ```typescript
    export interface PlaylistItem {
      id: number;
      title: string;
      technical?: TechnicalMetadata;
    }
    ```
  - Pass `playlist: PlaylistItem[]`, `currentIndex: number`, `onNext?: () => void`, and `onPrevious?: () => void` to `PlayerScreen`.
  - When `onNext` is called, `App.tsx` switches `activeItem` to `playlist[currentIndex + 1]`.
  - When `onPrevious` is called, `App.tsx` switches `activeItem` to `playlist[currentIndex - 1]`.
- **On-Screen Controls (`PlayerOSD.tsx`)**:
  - Add Previous (`SkipBack` icon) and Next (`SkipForward` icon) buttons to the player control bar.
  - Buttons participate in the spatial navigation row (`groupId="osd-controls"`).
  - Previous button is disabled/dimmed when `currentIndex === 0` or `!onPrevious`.
  - Next button is disabled/dimmed when `currentIndex === playlist.length - 1` or `!onNext`.
- **Remote Key Shortcuts (`PlayerScreen.tsx`)**:
  - Map `TVKeys.MEDIA_TRACK_NEXT` (and `TVKeys.CH_UP`) to `onNext()`.
  - Map `TVKeys.MEDIA_TRACK_PREVIOUS` (and `TVKeys.CH_DOWN`) to `onPrevious()`.
- **Auto-Advance at Episode Completion**:
  - When playback position reaches within 1.5 seconds of duration (or player reports `ended`), display an auto-advance overlay:
    *"Next episode starting in 5s... Press Enter to play now or Back to cancel"*.
  - A 5-second countdown timer automatically triggers `onNext()` upon expiration unless cancelled.

### 3. Pre-Flight Stream Check & Missing File Detection
- Before attaching the stream URL to `<video>` or AVPlay, `PlayerScreen` executes a lightweight pre-flight `fetch(streamUrl, { method: 'HEAD' })` (or `GET` with abort).
- If the server responds with `HTTP 404`:
  - Read the JSON response body (`{"error": "Media file missing from disk"}`).
  - Directly display a clear error state:
    `"Media File Missing: The file for this item is not found on the server storage (HTTP 404)."`
  - Prevent the demuxer from ever executing against the 404 response.

### 4. Low-Density QR Code & Multi-Channel Diagnostic Reporting
- **Low-Density QR Code (`ErrorQRCode.tsx`)**:
  - Minimize the QR payload string to under 80 characters:
    `KADR ERR | #{itemId} | {driver} | {shortError}`
  - Uses QR Error Correction Level L with low-density modules, rendering large chunky blocks that phones can scan reliably from 3+ meters away.
- **On-Screen Diagnostic Viewer**:
  - In `PlayerScreen.tsx`, add a `"View Technical Details"` button in the error action list.
  - Toggling this displays an on-screen readable monospace dialog showing:
    - Item ID & Title
    - HTTP Status & Server Error Message
    - Requested Stream URL (redacting sensitive tokens)
    - Video / Audio Codecs
    - Driver Name & Stack Trace
- **Automatic Dev Remote Log Relay**:
  - On playback failure, fire an asynchronous non-blocking POST to `http://<dev-ip>:9999/log` (or local logging server) containing the full diagnostic JSON payload.

---

## Testing & Verification Plan

1. **`BrowseScreen.test.tsx`**: Verify sidebar container has `gap-8` and auto-scrolling synchronization remains intact.
2. **`PlayerOSD.test.tsx`**: Verify Previous and Next buttons render, disable appropriately at boundaries, trigger callbacks on click/Enter, and participate in D-pad navigation.
3. **`PlayerScreen.playlist.test.tsx`**: Verify remote keys `MediaTrackNext`, `MediaTrackPrevious`, `ChannelUp`, `ChannelDown`, and auto-advance at video end.
4. **`PlayerScreen.error.test.tsx` & `ErrorQRCode.test.tsx`**:
   - Verify HTTP 404 missing media file displays clear error without demuxer failure.
   - Verify low-density QR code string length and rendering.
   - Verify "View Technical Details" modal toggle and remote log relay.
5. **Full Suite**: `npm test` passing with 0 failures, clean `tsc -b`, and clean `npm run package:wgt`.
6. **TV Deployment**: Deploy to Samsung TV and verify on real hardware.
