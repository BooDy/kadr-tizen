# Sub-Project 5: Dedicated Music & Audiobook Player UI — Design Spec

**Date:** 2026-11-22
**Parent Roadmap:** `docs/superpowers/specs/2026-11-19-v1-milestone-roadmap.md` (Phase 5 of 7)
**Target Hardware:** Samsung Tizen TV (`Tizen 5.0+`, verified on `UA55TU7000UXEG` Tizen 5.5 / Chromium 69) & Web Dev Harness
**Repositories:**
- Server: `/home/boody/work/personal/kadr` (`crates/kadr-core/src/transcoding/builder.rs`)
- Client: `/home/boody/work/personal/kadr-tizenos`

---

## 1. Purpose & Problem Statement

Currently, playing `music` or `audiobook` items in `kadr-tizenos` launches the video-centric `PlayerScreen`:
1. **Unnecessary HLS Preflight Failure on Audio Files:** `PlayerScreen` defaults to HLS (`useHls = true`), calling `/api/v1/media/{id}/hls/master.m3u8` where `kadr-core`'s `build_ffmpeg_hls_args_for_source` unconditionally passes `-map 0:v:0` and video encoding flags—failing on audio-only `.mp3`, `.flac`, `.m4a`, `.m4b`, `.ogg`, and `.opus` files without a video stream, or wasting CPU re-encoding attached `mjpeg`/`png` cover art into `libx264`.
2. **No Living-Room Audio Interface or Audiobook Speed Control:** Video `PlayerOSD` auto-hides after 4 seconds, leaving a pitch-black screen with no cover art, artist/author metadata, chapter/book remaining time, pitch-preserved audiobook playback speed (`0.75x–2.0x`), or visible Up-Next queue. Moreover, Samsung Tizen's native `AVPlay.setSpeed()` only supports muted integer trickplay (`2x/4x/8x`), whereas Chromium 69's HTML5 media engine supports pitch-preserved fractional `playbackRate`.
3. **Panel Burn-In vs Audio Cutout:** Keeping full-brightness static UI on an OLED/LED panel for multi-hour audiobooks risks image retention, while enabling Tizen OS's native screensaver can suspend media playback.

Sub-Project 5 delivers a dedicated **Split Cover Stage + Live Up-Next Queue** audio experience inside `PlayerScreen` backed by Direct-Play-first HTML5 audio, audio-only HLS transcode fallback in `kadr`, folder album queueing, and a **60-second Auto-Dim Ambient Mode**.

---

## 2. Approved UX & Scope Decisions

1. **Split Cover Stage + Live Up-Next Queue Column (`<AudioPlayerOverlay />`):**
   - **Left Column (`flex-1 min-w-0` — Cover & Controls Stage):** Large `320×320` cover art, media-type & stream-mode badges (`MUSIC` / `AUDIOBOOK`, `DIRECT • FLAC` / `HLS • AAC`), `<h1 dir="auto">` track/book title, `<p dir="auto">` artist/author/series subtitle, overview snippet (for audiobooks or standalone tracks), interactive D-pad scrubber (`HH:MM:SS` formatting when `>= 1h` + remaining `-MM:SS` / `-HH:MM:SS`), and persistent transport controls (`Back`, `Prev`, `-15s`, `Play/Pause`, `+30s`/`+15s`, `Next`, plus `Speed` `0.75x–2.0x` for audiobooks or `Repeat` `Off / All / One` for music).
   - **Right Column (`w-[520px] shrink-0` — Live Up-Next Queue Column):** Displayed whenever `playlist.length > 1` (or a compact Track/Book Details card for single items), showing `Track X of N`, scrollable D-pad focusable track rows (`audio-queue-item-{idx}`), active equalizer/playing badge, and `[OK]` (`Enter`) to jump directly to any queued track.
2. **60-Second Auto-Dim Ambient Mode:**
   - Keeps `setTvScreenSaver(false)` active while playing so Tizen OS never suspends audio output.
   - After `60_000ms` of no user input while `playerState === 'playing'` (with no modal or playback error open), transitions smoothly into Ambient Mode (`~25%` stage brightness over `#050101` near-black canvas + subtle `"Ambient Mode • Press any key to wake"` pill).
   - Pressing any navigation/`OK`/`Back` key while dimmed wakes the UI to `100%` brightness and consumes that key press so the user never triggers a blind seek or exit; dedicated hardware media keys (`PLAY`, `PAUSE`, `PLAY_PAUSE`, `STOP`) execute immediately **and** wake the display.

---

## 3. Architecture & Component Design

### 3.1 Backend Audio-Only HLS Support (`kadr`: `crates/kadr-core/src/transcoding/builder.rs`)

1. **`VideoAction::None` Variant:**
   - Extend `VideoAction` with `None`:
     ```rust
     pub enum VideoAction {
         None,
         Copy,
         Transcode {
             codec: String,
             max_height: Option<u32>,
             hwaccel: Option<String>,
         },
     }
     ```
2. **Audio-Only Detection in `evaluate_transcode`:**
   - Let `source_video_codec = tech.video_codec.as_deref().unwrap_or("").trim().to_lowercase();` and `target_video_codec = params.video_codec.trim().to_lowercase();`.
   - Let `has_known_audio = tech.audio_codec.as_deref().is_some_and(|c| !c.trim().is_empty() && !c.eq_ignore_ascii_case("none")) || !tech.audio_tracks.is_empty();`.
   - Let `is_attached_image_video = matches!(source_video_codec.as_str(), "mjpeg" | "png" | "bmp" | "webp" | "gif");`.
   - Emit `VideoAction::None` when:
     - `target_video_codec == "none"`, OR
     - `is_attached_image_video`, OR
     - `(source_video_codec.is_empty() || source_video_codec == "none") && has_known_audio`.
   - *(Note: Unprobed live IPTV or plugin streams where both `video_codec` and `audio_codec` are `None` and `target_video_codec != "none"` retain `VideoAction::Transcode`, preserving existing live-stream behavior.)*
3. **FFmpeg Argument Generation (`build_ffmpeg_hls_args_for_source`):**
   - When `decision.video == VideoAction::None`:
     - Do **not** push `-map 0:v:0` or any `-c:v` / `-vf` flags.
     - Push `-vn` and `-map 0:a:{params.audio_track_index}` followed by the existing audio codec and MPEG-TS HLS muxer flags.
   - `HlsSessionManager` (`matches!(decision.video, VideoAction::Transcode { .. })`) naturally treats `VideoAction::None` as a lightweight audio session rather than consuming a full video-transcode semaphore slot.

### 3.2 Client Audio Compatibility, Engine & Speed Persistence (`kadr-tizenos`)

1. **Audio Detection & Direct-Play-First Routing (`src/player/compatibility.ts`):**
   - `export const AUDIO_MEDIA_TYPES = ['music', 'audiobook'] as const;`
   - `export function isAudioMediaType(mediaType?: string | null): boolean` (`'music'` or `'audiobook'`, case-insensitive).
   - Supported HTML5 direct-play audio codecs: `['aac', 'mp3', 'flac', 'pcm', 'pcm_s16le', 'pcm_s24le', 'vorbis', 'opus', 'mp4a']`; supported audio containers: `['mp3', 'flac', 'm4a', 'm4b', 'mp4', 'ogg', 'oga', 'opus', 'wav', 'webm', 'aac']`.
   - Extend `PlaybackStreamOptions` with `isAudioOnly?: boolean;`:
     - When `isAudioOnly` is `true`, `checkAudioCompatibility(audioCodec, container)` determines `isSupported` (ignoring attached `mjpeg`/`png` `videoCodec` and allowing `flac`/`mp3`/`m4a`/`m4b`/`ogg`/`opus`/`wav` containers without flagging them as unsupported video containers).
     - When `isAudioOnly && isHls`, set `params.set('video_codec', 'none')` and `params.set('audio_codec', 'aac')` (omitting `max_height`).
2. **Pitch-Preserved Playback Rate in `PlayerDriver` & `Html5PlayerDriver` (`src/player/driver.ts`, `src/player/html5-driver.ts`, `src/player/avplay-driver.ts`):**
   - Add optional `setPlaybackRate?(rate: number): boolean;` to `PlayerDriver`.
   - In `Html5PlayerDriver`:
     - Store `private playbackRate = 1;` and apply `this.video.playbackRate = this.playbackRate` (plus `(this.video as any).preservesPitch = true`) in `init()`, `loadedmetadata`, `playing`, and `setPlaybackRate(rate)` (clamping `0.5 <= rate <= 3.0`), returning `true`.
   - In `TizenAvplayDriver`: delegate `setPlaybackRate(rate)` to `html5Fallback` when active, returning `false` on native `AVPlay`.
3. **Audiobook Speed & Music Repeat Preferences (`src/player/audioPreferences.ts`):**
   - `export const AUDIOBOOK_SPEED_OPTIONS = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;`
   - `loadAudiobookSpeed(): number` / `saveAudiobookSpeed(rate: number): void` persisted under `localStorage` key `'kadr_audiobook_speed_v1'` (default `1`).
   - `export type AudioRepeatMode = 'off' | 'all' | 'one';` (in-session state for `music`, default `'off'`).

### 3.3 `<AudioPlayerOverlay />` & D-Pad Navigation (`src/components/player/AudioPlayerOverlay.tsx`)

1. **Props & Metadata Display:**
   - Receives `mediaType` (`'music' | 'audiobook'`), `title`, `subtitle` (`series_title || director || actors[0] || card?.subtitle || library_name`), `overview`, `releaseYear`, `posterUrl` (authenticated via `getAuthenticatedImageUrl`), `streamModeLabel` (`DIRECT • FLAC`, `HLS • AAC`, etc.), `playerState`, `positionMs`, `durationMs`, `playbackRate`, `repeatMode`, `isAmbientDimmed`, `playlist`, `currentIndex`, and callbacks (`onTogglePlayPause`, `onSeekRelative`, `onSeekTo`, `onPrevious`, `onNext`, `onSelectQueueIndex`, `onCycleSpeed`, `onCycleRepeat`, `onExit`).
   - Long-form time formatting helper `formatAudioDuration(seconds: number)`: formats `>= 3600s` as `H:MM:SS` (`1:04:12`) and `< 3600s` as `M:SS`, plus remaining label `-H:MM:SS` / `-M:SS`.
2. **Deterministic D-Pad Focus Layout (Zero `gap-*` classes):**
   - Uses `useFocusContext` / `useFocusable` (with standalone fallback when rendered outside `FocusProvider` in unit tests):
     - **Scrubber Row:** `audio-progress-bar` (`ArrowLeft` seeks `-10s` for music / `-15s` for audiobook; `ArrowRight` seeks `+10s` for music / `+30s` for audiobook; `ArrowDown` moves to `audio-btn-play-pause`; `ArrowRight` when holding/at right edge stays on scrubber so seeking never jumps into the queue accidentally!).
     - **Transport Controls Row (`mr-3 last:mr-0`):**
       - `audio-btn-exit` (`Back`)
       - `audio-btn-prev` (`Prev` — restarts current track to `0ms` if `positionMs > 5000` or `!hasPrev`, else calls `onPrevious()`)
       - `audio-btn-rewind` (`-15s`)
       - `audio-btn-play-pause` (`Play` / `Pause`, initial focus on mount)
       - `audio-btn-forward` (`+30s` for `audiobook`, `+15s` for `music`)
       - `audio-btn-next` (`Next`, enabled when `hasNext || repeatMode === 'all'`)
       - Mode button: `audio-btn-speed` (`{playbackRate}x` for `audiobook`) OR `audio-btn-repeat` (`Repeat: Off/All/One` for `music`).
       - Pressing `ArrowRight` from the rightmost transport button moves focus into the active/first queue item (`audio-queue-item-{activeOrFirst}`) when `playlist.length > 1`.
     - **Right Queue Column (`w-[520px] shrink-0 ml-10`, rendered when `playlist.length > 1`):**
       - Focusable rows `audio-queue-item-{idx}` (`mb-2.5 last:mb-0`, auto-scrolled into view when focused).
       - `ArrowUp` / `ArrowDown` steps through `0 .. playlist.length - 1`.
       - `ArrowLeft` returns focus to the rightmost transport button (`audio-btn-speed` / `audio-btn-repeat` / `audio-btn-next`).
       - `[OK]` (`Enter`) calls `onSelectQueueIndex(idx)`.

### 3.4 `PlayerScreen`, `FolderBrowserModal`, and `App.tsx` Integration

1. **`PlayerScreen.tsx` Audio Mode:**
   - Derive `effectiveMediaType = itemMediaType || mediaType` and `isAudioMode = isAudioMediaType(effectiveMediaType)`.
   - When `isAudioMode` is `true`:
     - Force `Html5PlayerDriver` (`useHtml5Driver = true`) so fractional `playbackRate` works with pitch preservation on Samsung Tizen hardware and no hardware video plane cutout is opened.
     - Default `useHls` to `!checkAudioCompatibility(activeTech?.audio_codec, activeTech?.container).isSupported` so compatible `.mp3`/`.flac`/`.m4a`/`.m4b`/`.ogg`/`.opus`/`.wav` streams **Direct Play immediately** without a wasted HLS preflight, while incompatible audio codecs seamlessly use audio-only HLS (`?video_codec=none&audio_codec=aac`).
     - Apply `playbackRate` (`loadAudiobookSpeed()` for `audiobook`, `1.0` for `music`) whenever the driver initializes or `playbackRate` changes.
     - Suppress the 5-second video `"Next episode in 5s..."` countdown overlay; instead, when `playerState === 'ended'`:
       - If `repeatMode === 'one'` (`music`): `driver.seekTo(0); driver.play();`
       - Else if `hasNext`: flush snapshot and invoke `onNext()` immediately (`0s` gap)
       - Else if `repeatMode === 'all'` and `playlist.length > 1`: flush snapshot and invoke `onSelectQueueIndex(0)`.
     - Manage the **60s Ambient Auto-Dim Timer**:
       - Resets `isAmbientDimmed` to `false` and restarts a `60_000ms` timeout on any `keydown`, `mousemove`, `mousedown`, or `touchstart` while `isAudioMode && playerState === 'playing' && !playbackError && !isModalOpen`.
       - Clears timeout and wakes immediately if `playerState !== 'playing'` or an error/modal opens.
       - In capture-phase `keydown`: if `isAmbientDimmed` is `true` and the key is **not** a dedicated hardware media transport key (`PLAY`, `PAUSE`, `PLAY_PAUSE`, `STOP`), set `isAmbientDimmed(false)`, `e.preventDefault()`, `e.stopPropagation()`, and return (waking cleanly without firing a blind action).
     - Render `<AudioPlayerOverlay />` in place of `<PlayerOSD />` (while keeping `<ErrorQRCode>` / playback error recovery dialog intact if a network/file error occurs).
2. **Queue Jumping & Folder Album Queueing (`src/App.tsx`, `src/screens/FolderBrowserModal.tsx`, `src/screens/ItemDetailModal.tsx`):**
   - Extend `PlaylistItem` / `PlaylistQueuePlayItem` with optional `subtitle?: string; posterUrl?: string; mediaType?: string; durationSeconds?: number;`.
   - Pass `mediaType={playerItem.mediaType}` and `onSelectQueueIndex={handleSelectQueueIndex}` into `<PlayerScreen />` from `App.tsx` (inferring `mediaType` synchronously from `activeItem?.media_type`, `queue[idx].mediaType`, or optional `mediaType` argument on `onPlayItem`, while `PlayerScreen`'s `fetchMediaItem` fallback also hydrates `itemMediaType` if omitted).
   - In `FolderBrowserModal.tsx`: when `folderData.items.length > 0`, render a `"Play All"` header `PillButton` (`id="play-folder-all-btn"`, `groupId="folder-browser-modal"`, placed beside `"Add Folder to Playlist"`), calling `onPlayQueue(queueItems, 0)` so music album folders and multi-file audiobook folders play straight through with the full Up-Next queue populated!

---

## 4. Platform Invariants & Error Handling

- **Chromium 69 / Tizen 5.5 CSS Safety:** Zero flex `gap-*` classes anywhere in `AudioPlayerOverlay.tsx`, `PlayerScreen.tsx`, `FolderBrowserModal.tsx`, or `App.tsx` (verified via `! grep -rn "gap-"`).
- **Screensaver & Smart Hub Resilience:** `setTvScreenSaver(false)` stays active throughout playing audio (including during `isAmbientDimmed`), and Smart Hub `visibilitychange` flushes playback position on hide and restores cleanly on foreground return.
- **Layered Back Navigation:**
  1. If `isAmbientDimmed === true`: `Back` wakes the screen to `100%` brightness without exiting playback.
  2. If `AudioTrackModal` / error details modal is open: `Back` closes that modal.
  3. Otherwise in `<AudioPlayerOverlay />`: `Back` flushes progress (`buildAndFlushSnapshot`) and exits `PlayerScreen` back to the originating view (`PlaylistDetailModal`, `FolderBrowserModal`, `ItemDetailModal`, `SearchView`, or `BrowseScreen`).

---

## 5. Testing & Verification Strategy

1. **Rust Backend Unit Tests (`crates/kadr-core/tests/transcoding_test.rs`):**
   - Verify `evaluate_transcode` returns `VideoAction::None` for audio-only `TechnicalInfo` (`mp3`/`flac`/`ogg`), attached cover art (`video_codec: Some("mjpeg" | "png")`), and explicit `params.video_codec == "none"`, while keeping `VideoAction::Transcode` for unprobed live streams (`video_codec: None, audio_codec: None`).
   - Verify `build_ffmpeg_hls_args` omits `-map 0:v:0` and `-c:v`, includes `-vn` and `-map 0:a:{idx}`, and build release binary (`cargo test --workspace` + `cargo clippy` + `cargo build --release --bin kadr`).
2. **Client Unit & Component Tests (`kadr-tizenos`):**
   - `tests/player/compatibility.test.ts` & `tests/player/html5-driver.test.ts`: audio Direct-Play vs audio-only HLS URL generation (`video_codec=none`), `setPlaybackRate` persistence, and `kadr_audiobook_speed_v1` storage.
   - `tests/components/player/AudioPlayerOverlay.test.tsx`: zero `gap-*` classes, `HH:MM:SS` & remaining time formatting, cover art & metadata rendering, `-15s`/`+30s` seeks, `Prev` (`> 5s` restart vs previous track), audiobook speed cycling, music repeat cycling, and D-pad navigation between controls and the Live Up-Next Queue Column.
   - `tests/screens/PlayerScreen.audioPlayer.test.tsx`, `tests/screens/FolderBrowserModal.test.tsx`, & `tests/App.test.tsx`: Direct-Play launch on `.flac`/`.m4b` without HLS preflight, `0s` immediate track auto-advance & Repeat One/All, `60s` Ambient Auto-Dim + wake-key consumption, queue track jumping (`onSelectQueueIndex`), and `FolderBrowserModal` `"Play All"` album queue launch.
3. **Full Suite + Build + `.wgt` Verification:**
   - Zero `gap-*` grep check, `npm test -- --run`, `npm run build`, and `npm run package:wgt -- --no-build`.
