# Player Controls, Subtitles, Season Navigation & QR Error Diagnostics Design

**Date:** 2026-10-19  
**Status:** Approved  
**Platform Target:** Samsung Tizen OS TV (Tizen 5.5+, Chromium 69 compatible) & Kadr Backend

---

## 1. Problem Statement & User Requirements

During physical Samsung TV testing (`UA55TU7000UXEG`), four major issues were identified:
1. **Subtitles in Player**: Cannot select existing subtitle tracks or search for new subtitles from within the video player.
2. **Fast Forwarding**: Fast forward does not function on the TV remote.
3. **Season Navigation**: In series/shows, navigating between seasons does not work; cannot select the season.
4. **Unsupported Format Buffering & Error Reporting**: When an unsupported video format is played, AVPlay hangs in buffering for 30–60+ seconds before failing. Need a clear list/detection of unsupported formats (fail fast) and diagnostic errors rendered as an on-screen QR code for effortless copy-pasting via mobile phone camera.

---

## 2. Technical Architecture & Component Design

### 2.1 Fast Forwarding & Seeking Engine

#### Remote Media Keys & Handling
- Extend `TVKeys` with dedicated media codes:
  - `TVKeys.FAST_FORWARD = 417`
  - `TVKeys.REWIND = 412`
  - Ensure keys are registered with `tizen.tvinputdevice.registerKey` (`MediaFastForward`, `MediaRewind`, `MediaPlay`, `MediaPause`, `MediaPlayPause`).
- **Seeking Jump Logic**:
  - `LEFT` / `RIGHT` (D-Pad): Fine seeks of **-10s / +10s**.
  - `FAST_FORWARD` (Dedicated remote key): Progressive jumps:
    - 1st press within window: **+30s**
    - 2nd press within window: **+60s**
    - 3rd+ press within window: **+120s**
  - `REWIND` (Dedicated remote key): Progressive jumps:
    - 1st press within window: **-30s**
    - 2nd press within window: **-60s**
    - 3rd+ press within window: **-120s**
  - Skip window resets after 1.5s of no key presses.

#### AVPlay Seek Fix & Debounce
- In `src/player/avplay-driver.ts`, fix the `seekTo` call signature for Samsung Tizen AVPlay:
  ```typescript
  seekTo(ms: number): void {
    if (this.isDestroyed) return;
    try {
      const avplay = (window as any).webapis?.avplay;
      if (avplay) {
        avplay.seekTo(
          Math.floor(ms),
          () => {
            /* success */
          },
          (err: any) => {
            console.error('[AVPlay] seekTo error:', err);
          }
        );
      }
    } catch (e) {
      console.error('[AVPlay] seekTo exception:', e);
    }
  }
  ```
- **Debounced Seek Dispatch**:
  - In `PlayerScreen.tsx`, maintain an immediate `seekTargetMs` ref and state for the UI, but debounce the actual driver `seekTo(target)` call by **300ms** so rapid remote presses don't flood the hardware decoder.

#### Visual Seek HUD
- A floating on-screen badge displayed over the video when seeking:
  - Format: `>> +30s (00:14:30 / 01:45:00)` or `<< -10s`.
  - Icon: FastForward or Rewind from `lucide-react`.
  - Automatically fades out 1.5s after the last seek action.

---

### 2.2 In-Player Subtitle Selection & Online Search

#### Unified Subtitle Modal (`src/components/player/SubtitleModal.tsx`)
- Triggered from the Player OSD subtitle button or dedicated remote shortcut.
- Renders a modal overlay with 2 tabs:
  1. **Tracks**:
     - Lists all embedded/downloaded tracks: e.g. "English [SRT]", "Arabic [VTT]", "Off".
     - Highlights the currently active track with an orange indicator.
     - Selecting a track immediately calls `driver.setSubtitleTrack(streamUrl)` and persists preference.
  2. **Search Online**:
     - Shows a remote-friendly **Language Picker**: `English`, `Arabic`, `French`, `Spanish`, `German`, `Any`.
     - Selecting a language calls backend: `GET /api/v1/subtitles/{item_id}/search?languages={lang}`.
     - Displays returned matches in a clean scrollable list showing:
       - Release name / subtitle title
       - Language code
       - Format (`srt` / `vtt`)
       - Download button
     - Selecting a search result calls backend: `POST /api/v1/subtitles/{item_id}/download` with `{ file_id, language, title, is_forced }`.
     - Once downloaded, the track is automatically appended to the item's subtitle list, activated in AVPlay, and the modal closes or displays confirmation.

#### Focus Trapping & Remote Integration
- When the Subtitle Modal is open:
  - Focus is trapped within `groupId="subtitle-modal"`.
  - Pressing `Back` / `Escape` closes the modal and returns focus to the player OSD.
  - Video playback continues in the background while browsing subtitles.

---

### 2.3 Season Navigation in `ItemDetailModal.tsx`

#### Vertical Zones & D-Pad Logic
1. **Detail Action Buttons Zone** (`item-detail-modal`):
   - Down from action buttons drops focus strictly to the active season tab: `season-tab-${selectedSeason}`.
2. **Season Tabs Row Zone** (`season-tabs`):
   - **Left / Right**: Cycles focus strictly through the season tabs (`season-tab-${season}`). Navigation is prevented from jumping into the episode cards below by explicit key interception in `handleKeyDown`.
   - **Enter / OK**: Commits the season switch: `setSelectedSeason(season)`. This updates `selectedSeason` and loads that season's episode cards.
   - **Down**: Drops focus directly into the first episode of that season (`episode-card-${firstEpisodeId}`).
   - **Up**: Returns focus to the primary action button (`detail-primary-btn`).
3. **Episode Cards Row Zone** (`season-episodes-${selectedSeason}`):
   - **Left / Right**: Scrolls horizontally across episode cards.
   - **Up**: Returns focus directly back up to the active season tab (`season-tab-${selectedSeason}`).
   - **Enter / OK**: Starts playback of the highlighted episode (`onPlay(ep.id, progress)`).

---

### 2.4 Unsupported Formats, Fail-Fast Watchdog & QR Code Diagnostics

#### Hardware Compatibility Matrix (`src/player/compatibility.ts`)
- **Supported on Samsung Tizen OS**:
  - Video: H.264 (AVC) up to High Profile 5.2, H.265 (HEVC) 8/10-bit up to 4K Main10, VP9 Profile 0/2, MPEG4.
  - Audio: AAC, AC3 (Dolby Digital), EAC3 (Dolby Digital Plus), MP3, FLAC, PCM.
  - Containers: MP4, MKV, TS, WebM.
- **Known Unsupported / Problematic**:
  - Audio: **DTS, DTS-HD, DTS-X** (hardware DTS decoder removed from all Samsung TVs since 2018), Dolby TrueHD.
  - Video: **AV1** (unsupported on pre-2021 budget chipsets like TU7000), **Hi10P** (H.264 10-bit anime profile).
  - Containers: ISO, raw VOB, RMVB.

#### Pre-Flight Check & 10s Fail-Fast Timeout
- If backend item metadata indicates known unsupported audio (`dts`, `truehd`) or video (`hi10p`, `av1`), display a clear diagnostic warning or recommendation to use transcode/HTML5.
- In `PlayerScreen.tsx`, establish a **10-second fail-fast watchdog**:
  - If AVPlay remains in `buffering` or does not transition to `playing` within 10,000ms after init, abort playback immediately with a descriptive error:
    `Buffering timeout after 10s. The stream may contain an unsupported codec (e.g. DTS audio or AV1 video) or network stalls.`

#### Structured QR Code Error Renderer (`src/components/player/ErrorQRCode.tsx`)
- Pure-JS SVG QR Code generator (zero external network requests, Chromium 69 compatible).
- Encodes a structured diagnostic payload:
  ```json
  {
    "app": "kadr-tizen",
    "item_id": 1234,
    "title": "Movie / Show Title",
    "video_codec": "hevc",
    "audio_codec": "dts",
    "stream_url": "http://192.168.1.109:8492/api/v1/stream/1234",
    "driver": "Tizen AVPlay",
    "error": "Buffering timeout after 10s (Likely unsupported codec: dts)",
    "tv_model": "UA55TU7000UXEG",
    "tizen_version": "5.5",
    "timestamp": "2026-10-19T22:50:00Z"
  }
  ```
- Renders an error screen containing:
  - Error description & likely cause (e.g. "DTS audio is not supported on Samsung TV hardware").
  - QR Code clearly visible for mobile phone camera scanning to copy/paste payload.
  - Formats Compatibility Reference cheatsheet.
  - Retry, Switch to HTML5 Video, and Exit buttons.

---

## 3. Testing Strategy

1. **Unit & Integration Tests**:
   - `tests/screens/PlayerScreen.seeking.test.tsx`: Verify fast forward / rewind keydown events (417/412/37/39), progressive jump amounts (30s/60s/120s), debounced driver seeking, and HUD visibility.
   - `tests/player/avplay-driver.test.ts`: Verify `seekTo` calls `webapis.avplay.seekTo(ms, successCb, errorCb)` with 3 arguments and handles errors safely.
   - `tests/components/player/SubtitleModal.test.tsx`: Verify track listing, language picker search querying, track download API integration, and track activation.
   - `tests/screens/ItemDetailModal.seasons.test.tsx`: Verify season tab Left/Right navigation, Enter committing season switch, and Down/Up focus transitions between action buttons, season tabs, and episode cards.
   - `tests/player/compatibility.test.ts`: Verify format detection logic (DTS, AV1, Hi10P, etc.).
   - `tests/components/player/ErrorQRCode.test.tsx`: Verify QR code SVG generation with diagnostic payload.
   - `tests/screens/PlayerScreen.timeout.test.tsx`: Verify 10-second fail-fast buffering watchdog triggers error screen.
2. **End-to-End TV Deployment Verification**:
   - Package `.wgt` and deploy to physical Samsung TV (`UA55TU7000UXEG`).
   - Test seeking with physical remote FF/REW and Left/Right.
   - Test subtitle search with OpenSubtitles and language picker.
   - Test season navigation on a TV series.
   - Test unsupported file format fail-fast and scan QR code with mobile camera.
