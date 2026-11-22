# Sub-Project 5: Dedicated Music & Audiobook Player UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a living-room **Music & Audiobook Player** experience across `kadr` and `kadr-tizenos` with Direct-Play-first HTML5 audio, audio-only HLS transcode fallback (`-vn`), pitch-preserved `0.75x–2.0x` audiobook playback speed, a Split Cover Stage + Live Up-Next Queue UI (`<AudioPlayerOverlay />`), folder `"Play All"` album queueing, and a 60-second Auto-Dim Ambient Mode.

**Architecture:** Extend `kadr-core`'s HLS builder with `VideoAction::None` so audio-only and cover-art-attached files transcode cleanly without `-map 0:v:0`; add audio compatibility helpers, pitch-preserved `setPlaybackRate` on `Html5PlayerDriver`, and persisted audiobook speed preferences; build `<AudioPlayerOverlay />` with deterministic 2-pane D-pad navigation; and integrate audio mode, `60s` Ambient Auto-Dim, queue track jumping (`onSelectQueueIndex`), and folder `"Play All"` queueing across `PlayerScreen.tsx`, `FolderBrowserModal.tsx`, and `App.tsx`.

**Tech Stack:** Rust 2021 (`kadr-core`, `kadr-server`), React 19, TypeScript 5.7, Vite 6 (`chrome69`), Tailwind CSS 4, Vitest 3 + React Testing Library.

## Global Constraints

- Target platform: Samsung Tizen 5.5 (`UA55TU7000UXEG`, Chromium 69 WebView) and Web Dev Harness.
- **Zero flex `gap-*` classes** in any new or modified JSX/CSS (`AudioPlayerOverlay.tsx`, `PlayerScreen.tsx`, `FolderBrowserModal.tsx`, `PlaylistDetailModal.tsx`, `BrowseScreen.tsx`, `App.tsx`); avoid even literal `gap-` substrings in comments so `(! grep -rn "gap-" ...)` exits `0`. Use explicit physical margins (`mr-*`, `mb-*`, `ml-*`) and inline styles.
- Keep `setTvScreenSaver(true)` (`SCREEN_SAVER_OFF`, preventing Tizen OS sleep) active throughout playing/buffering audio, including while `isAmbientDimmed === true`.
- Route `music` and `audiobook` items through `Html5PlayerDriver` (`forceHtml5Driver = true`) so pitch-preserved fractional `playbackRate` (`0.75x–2.0x`) works on Samsung TV hardware, defaulting to Direct Stream (`/api/v1/stream/{id}`) when `checkAudioCompatibility` passes and falling back to audio-only AAC HLS (`?video_codec=none&audio_codec=aac`) otherwise.
- Strict layered Back navigation in Audio Mode:
  1. When `isAmbientDimmed === true`: `Back` (and any non-media D-pad/`OK` key) wakes to `100%` brightness and consumes the key press without exiting or seeking; dedicated hardware media keys (`PLAY`, `PAUSE`, `PLAY_PAUSE`, `STOP`, `MEDIA_TRACK_NEXT`, `MEDIA_TRACK_PREVIOUS`) execute immediately **and** wake the display.
  2. When a player modal (`AudioTrackModal` / error details) is open: `Back` closes that modal.
  3. Otherwise in `<AudioPlayerOverlay />`: `Back` flushes playback progress once and exits `PlayerScreen` directly (never hiding the audio overlay like video `PlayerOSD`).

---

### Task 1: Backend Audio-Only HLS Transcode Support (`kadr`)

**Working Directory:** `/home/boody/work/personal/kadr`

**Files:**
- Modify: `crates/kadr-core/src/transcoding/builder.rs:6-75, 156-200`
- Modify: `crates/kadr-core/tests/transcoding_test.rs`

**Interfaces:**
- Produces:
  - `VideoAction::None` in `kadr_core::transcoding::VideoAction`
  - `evaluate_transcode` returning `VideoAction::None` when `params.video_codec.trim().eq_ignore_ascii_case("none")`, when `source_video_codec` is an attached cover image (`"mjpeg"`, `"png"`, `"bmp"`, `"webp"`, `"gif"`), or when `(source_video_codec.is_empty() || source_video_codec == "none") && has_known_audio` (preserving `VideoAction::Transcode` when both `video_codec` and `audio_codec` are unknown/empty and `params.video_codec != "none"`).
  - `build_ffmpeg_hls_args_for_source` emitting `-vn` and `-map 0:a:{audio_track_index}` (without `-map 0:v:0` or `-c:v`) when `decision.video == VideoAction::None`.

- [ ] **Step 1: Write failing unit tests in `crates/kadr-core/tests/transcoding_test.rs`**

Append tests to `crates/kadr-core/tests/transcoding_test.rs`:

```rust
#[test]
fn test_evaluate_transcode_audio_only_and_attached_cover_art() {
    let base_params = TranscodeParameters::default();

    // 1. Pure audio file (no video_codec, known audio_codec) -> VideoAction::None
    let flac_tech = TechnicalInfo {
        container: Some("flac".to_string()),
        video_codec: None,
        audio_codec: Some("flac".to_string()),
        audio_channels: Some(2),
        duration_seconds: 240,
        ..Default::default()
    };
    let d_flac = evaluate_transcode(&flac_tech, &base_params, None);
    assert_eq!(d_flac.video, VideoAction::None);
    assert!(matches!(d_flac.audio, AudioAction::Transcode { ref codec, .. } if codec == "aac"));

    // 2. MP3 / M4B with embedded MJPEG/PNG cover art -> VideoAction::None
    let cover_tech = TechnicalInfo {
        container: Some("mp3".to_string()),
        video_codec: Some("mjpeg".to_string()),
        audio_codec: Some("mp3".to_string()),
        duration_seconds: 1800,
        ..Default::default()
    };
    let d_cover = evaluate_transcode(&cover_tech, &base_params, None);
    assert_eq!(d_cover.video, VideoAction::None);

    // 3. Explicit video_codec=none query param -> VideoAction::None even if unprobed
    let unprobed = TechnicalInfo::default();
    let explicit_audio_params = TranscodeParameters {
        video_codec: "none".to_string(),
        ..base_params.clone()
    };
    let d_explicit = evaluate_transcode(&unprobed, &explicit_audio_params, None);
    assert_eq!(d_explicit.video, VideoAction::None);

    // 4. Unprobed live IPTV / plugin stream (both video & audio None, target h264) -> keeps VideoAction::Transcode
    let d_unprobed_live = evaluate_transcode(&unprobed, &base_params, None);
    assert!(matches!(d_unprobed_live.video, VideoAction::Transcode { .. }));
}

#[test]
fn test_build_ffmpeg_hls_args_audio_only_omits_video_map_and_adds_vn() {
    let decision = TranscodeDecision {
        video: VideoAction::None,
        audio: AudioAction::Transcode {
            codec: "aac".to_string(),
            channels: 2,
            bitrate_kbps: 192,
        },
    };
    let params = TranscodeParameters {
        video_codec: "none".to_string(),
        audio_codec: "aac".to_string(),
        max_height: None,
        audio_track_index: 0,
        start_time: 12.0,
    };

    let args = build_ffmpeg_hls_args(
        Path::new("/media/audiobook.m4b"),
        Path::new("/tmp/hls_audio"),
        &decision,
        &params,
    );

    assert!(args.contains(&"-vn".to_string()));
    assert!(args.contains(&"0:a:0".to_string()));
    assert!(!args.contains(&"0:v:0".to_string()));
    assert!(!args.contains(&"-c:v".to_string()));
    assert!(args.contains(&"-c:a".to_string()));
    assert!(args.contains(&"aac".to_string()));
}
```

- [ ] **Step 2: Run `cargo test -p kadr-core --test transcoding_test` to verify RED failure**

Run: `cargo test -p kadr-core --test transcoding_test`
Expected: FAIL (`no variant or associated item named None found for enum VideoAction`).

- [ ] **Step 3: Implement `VideoAction::None` in `crates/kadr-core/src/transcoding/builder.rs`**

1. Add `None` variant to `VideoAction`:
   ```rust
   #[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
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
2. Update `evaluate_transcode`:
   ```rust
   let source_video_codec = tech
       .video_codec
       .as_deref()
       .unwrap_or("")
       .trim()
       .to_lowercase();
   let target_video_codec = params.video_codec.trim().to_lowercase();

   let has_known_audio = tech
       .audio_codec
       .as_deref()
       .is_some_and(|c| !c.trim().is_empty() && !c.eq_ignore_ascii_case("none"))
       || !tech.audio_tracks.is_empty();
   let is_attached_image_video = matches!(
       source_video_codec.as_str(),
       "mjpeg" | "png" | "bmp" | "webp" | "gif"
   );
   let is_audio_only = target_video_codec == "none"
       || is_attached_image_video
       || ((source_video_codec.is_empty() || source_video_codec == "none") && has_known_audio);

   let height_ok = match (tech.height(), params.max_height) {
       (Some(src_h), Some(max_h)) => src_h <= max_h,
       _ => true,
   };

   let video_action = if is_audio_only {
       VideoAction::None
   } else if source_video_codec == target_video_codec && height_ok {
       VideoAction::Copy
   } else {
       VideoAction::Transcode {
           codec: target_video_codec,
           max_height: params.max_height,
           hwaccel: hwaccel.map(|s| s.to_string()),
       }
   };
   ```
3. Update `build_ffmpeg_hls_args_for_source`:
   ```rust
   match &decision.video {
       VideoAction::None => {
           args.push("-vn".into());
           args.push("-map".into());
           args.push(format!("0:a:{}", params.audio_track_index));
       }
       VideoAction::Copy => {
           args.push("-map".into());
           args.push("0:v:0".into());
           args.push("-map".into());
           args.push(format!("0:a:{}", params.audio_track_index));
           args.push("-c:v".into());
           args.push("copy".into());
       }
       VideoAction::Transcode {
           max_height,
           hwaccel,
           ..
       } => {
           args.push("-map".into());
           args.push("0:v:0".into());
           args.push("-map".into());
           args.push(format!("0:a:{}", params.audio_track_index));
           if let Some(scale_h) = max_height {
               args.push("-vf".into());
               args.push(format!("scale=-2:'min(ih,{})'", scale_h));
           }
           // ... existing vaapi / nvenc / libx264 match ...
       }
   }
   ```

- [ ] **Step 4: Run workspace tests, clippy, and release binary build (GREEN)**

Run: `cargo test --workspace && cargo clippy --workspace --all-targets -- -D warnings && cargo build --release --bin kadr`
Expected: 100% workspace tests passing, 0 clippy warnings, `target/release/kadr` built cleanly.

- [ ] **Step 5: Commit Task 1 in `/home/boody/work/personal/kadr`**

```bash
git add crates/kadr-core/src/transcoding/builder.rs crates/kadr-core/tests/transcoding_test.rs
git commit -m "feat(transcode): support audio-only HLS sessions via VideoAction::None"
```

---

### Task 2: Client Audio Compatibility, Pitch-Preserved Playback Rate & Speed Persistence (`kadr-tizenos`)

**Working Directory:** `/home/boody/work/personal/kadr-tizenos`

**Files:**
- Modify: `src/player/compatibility.ts`
- Modify: `src/player/driver.ts`
- Modify: `src/player/html5-driver.ts`
- Modify: `src/player/avplay-driver.ts`
- Modify: `src/player/audioPreferences.ts`
- Create: `tests/player/audioModePrimitives.test.ts`

**Interfaces:**
- Produces:
  - `src/player/compatibility.ts`:
    - `export const AUDIO_MEDIA_TYPES = ['music', 'audiobook'] as const;`
    - `export function isAudioMediaType(mediaType?: string | null): boolean`
    - `export function checkAudioCompatibility(audioCodec?: string | null, container?: string | null): CompatibilityResult`
    - `PlaybackStreamOptions.isAudioOnly?: boolean` (when `true`, uses `checkAudioCompatibility`, and if `isHls` sets `video_codec=none`, `audio_codec=aac`, omitting `max_height`)
  - `src/player/driver.ts` & `src/player/html5-driver.ts` & `src/player/avplay-driver.ts`:
    - `setPlaybackRate?(rate: number): boolean` on `PlayerDriver` (implemented on `Html5PlayerDriver` with clamping `0.5..3.0` and `preservesPitch = true`, preserved across `init`/`loadedmetadata`/`playing`; returns `false` on `TizenAvplayDriver`)
  - `src/player/audioPreferences.ts`:
    - `export const AUDIOBOOK_SPEED_STORAGE_KEY = 'kadr_audiobook_speed_v1';`
    - `export const AUDIOBOOK_SPEED_OPTIONS = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;`
    - `export type AudioRepeatMode = 'off' | 'all' | 'one';`
    - `export function loadAudiobookSpeed(): number`
    - `export function saveAudiobookSpeed(rate: number): void`
    - `export function cycleAudiobookSpeed(current: number): number`
    - `export function cycleAudioRepeatMode(current: AudioRepeatMode): AudioRepeatMode`

- [ ] **Step 1: Write failing unit tests in `tests/player/audioModePrimitives.test.ts`**

Create `tests/player/audioModePrimitives.test.ts` testing:
1. `isAudioMediaType` matches `'music'`, `'MUSIC'`, `'audiobook'`, `'Audiobook'`, and rejects `'movie'`, `'episode'`, `undefined`.
2. `checkAudioCompatibility` & `getPlaybackUrl({ isAudioOnly: true, ... })`:
   - Allows `.flac`, `.mp3`, `.m4a`, `.m4b`, `.ogg`, `.opus`, `.wav` with `flac`/`mp3`/`aac`/`vorbis`/`opus`/`pcm_s16le` as Direct Stream (`/api/v1/stream/{id}`) even when `videoCodec` is `'mjpeg'` (cover art).
   - Routes unsupported audio codecs/containers (`wma`, `alac`, `dts`, `ape`) to `/api/v1/media/{id}/hls/master.m3u8?video_codec=none&audio_codec=aac` (without `max_height`).
3. `Html5PlayerDriver.setPlaybackRate(1.5)` sets `video.playbackRate = 1.5` and `preservesPitch = true`, retains `1.5` when called before or after `init()` / `loadedmetadata`, and clamps out-of-range inputs cleanly.
4. `loadAudiobookSpeed`, `saveAudiobookSpeed`, `cycleAudiobookSpeed` (`0.75 -> 1 -> 1.25 -> 1.5 -> 1.75 -> 2 -> 0.75`), and `cycleAudioRepeatMode` (`'off' -> 'all' -> 'one' -> 'off'`).

- [ ] **Step 2: Run Vitest on `tests/player/audioModePrimitives.test.ts` to verify RED failure**

Run: `npx vitest run tests/player/audioModePrimitives.test.ts`
Expected: FAIL (`isAudioMediaType is not a function`).

- [ ] **Step 3: Implement audio compatibility, driver `setPlaybackRate`, and audiobook speed helpers**

1. In `src/player/compatibility.ts`:
   ```ts
   export const AUDIO_MEDIA_TYPES = ['music', 'audiobook'] as const;

   export const HTML5_DIRECT_AUDIO_CODECS = [
     'aac',
     'mp4a',
     'mp3',
     'mpeg',
     'flac',
     'pcm',
     'vorbis',
     'opus',
   ];

   export const HTML5_DIRECT_AUDIO_CONTAINERS = [
     'mp3',
     'flac',
     'm4a',
     'm4b',
     'mp4',
     'ogg',
     'oga',
     'opus',
     'wav',
     'webm',
     'aac',
   ];

   export function isAudioMediaType(mediaType?: string | null): boolean {
     if (!mediaType) return false;
     const normalized = mediaType.trim().toLowerCase();
     return normalized === 'music' || normalized === 'audiobook';
   }

   export function checkAudioCompatibility(
     audioCodec?: string | null,
     container?: string | null
   ): CompatibilityResult {
     const a = audioCodec?.toLowerCase().trim() || '';
     const c = container?.toLowerCase().trim() || '';
     const reasons: string[] = [];
     const warnings: string[] = [];

     if (a && !HTML5_DIRECT_AUDIO_CODECS.some((ok) => a.includes(ok))) {
       reasons.push(`Audio codec "${audioCodec}" requires AAC HLS transcoding on TV.`);
     }
     if (
       c &&
       !HTML5_DIRECT_AUDIO_CONTAINERS.some(
         (ok) => c === ok || c.split(',').map((p) => p.trim()).includes(ok)
       )
     ) {
       reasons.push(`Audio container "${container}" requires HLS packaging on TV.`);
     }

     return {
       isSupported: reasons.length === 0,
       reasons,
       warnings,
     };
   }
   ```
   And in `getPlaybackUrl(options)`:
   - Add `isAudioOnly?: boolean;` to `PlaybackStreamOptions`.
   - Compute `compat = options.isAudioOnly ? checkAudioCompatibility(options.audioCodec, options.container) : checkMediaCompatibility(...)`.
   - When `isHls`: if `options.isAudioOnly`, set `params.set('video_codec', 'none')` and `params.set('audio_codec', 'aac')` (do **not** set `max_height`); otherwise keep `video_codec=h264`, `audio_codec=aac`, and `max_height`.
2. In `src/player/driver.ts`, `src/player/html5-driver.ts`, and `src/player/avplay-driver.ts`:
   - Add `setPlaybackRate?(rate: number): boolean;` to `PlayerDriver`.
   - In `Html5PlayerDriver`: store `private playbackRate = 1;`, create helper `private applyPlaybackRate()` that sets `this.video.playbackRate = this.playbackRate; (this.video as any).preservesPitch = true; (this.video as any).webkitPreservesPitch = true;`, call `this.applyPlaybackRate()` in `init()`, `loadedmetadata`, `playing`, and `setPlaybackRate(rate: number): boolean` (clamping `Math.min(3, Math.max(0.5, rate))`).
   - In `TizenAvplayDriver`: add `setPlaybackRate(_rate: number): boolean { return false; }`.
3. In `src/player/audioPreferences.ts`:
   - Export `AUDIOBOOK_SPEED_STORAGE_KEY = 'kadr_audiobook_speed_v1'`, `AUDIOBOOK_SPEED_OPTIONS = [0.75, 1, 1.25, 1.5, 1.75, 2] as const`, `AudioRepeatMode = 'off' | 'all' | 'one'`, `loadAudiobookSpeed()`, `saveAudiobookSpeed(rate)`, `cycleAudiobookSpeed(current)`, and `cycleAudioRepeatMode(current)`.

- [ ] **Step 4: Run Vitest & `tsc -b` to verify GREEN**

Run: `(! grep -rn "gap-" src/player/compatibility.ts src/player/driver.ts src/player/html5-driver.ts src/player/avplay-driver.ts src/player/audioPreferences.ts) && npx vitest run tests/player/audioModePrimitives.test.ts tests/player/ && npx tsc -b`
Expected: PASS (all player unit tests green, `tsc -b` exit `0`).

- [ ] **Step 5: Commit Task 2**

```bash
git add src/player/compatibility.ts src/player/driver.ts src/player/html5-driver.ts src/player/avplay-driver.ts src/player/audioPreferences.ts tests/player/audioModePrimitives.test.ts
git commit -m "feat(player): add audio-only compatibility, HTML5 playbackRate, and audiobook speed prefs"
```

---

### Task 3: `<AudioPlayerOverlay />` Split Cover Stage + Live Up-Next Queue Column (`kadr-tizenos`)

**Working Directory:** `/home/boody/work/personal/kadr-tizenos`

**Files:**
- Create: `src/components/player/AudioPlayerOverlay.tsx`
- Create: `tests/components/player/AudioPlayerOverlay.test.tsx`

**Interfaces:**
- Consumes: `AudioRepeatMode` from `src/player/audioPreferences.ts`; `PlayerState` from `src/player/driver.ts`; `AudioStreamInfo` from `src/types/kadr.ts`
- Produces:
  - `src/components/player/AudioPlayerOverlay.tsx`:
    - `export interface AudioQueueEntry { id: number | string; title: string; subtitle?: string; posterUrl?: string; durationSeconds?: number; }`
    - `export function formatAudioDuration(seconds: number): string` (`1:04:12` when `>= 3600`, `4:05` when `< 3600`)
    - `export interface AudioPlayerOverlayProps { mediaType: 'music' | 'audiobook'; title: string; subtitle?: string; overview?: string; releaseYear?: number; posterUrl?: string; streamModeLabel: string; playerState: PlayerState; positionMs: number; durationMs: number; playbackRate: number; repeatMode: AudioRepeatMode; isAmbientDimmed: boolean; hasPrevious: boolean; hasNext: boolean; queue?: AudioQueueEntry[]; currentIndex?: number; audioTracks?: AudioStreamInfo[]; onOpenAudioModal?: () => void; onTogglePlayPause: () => void; onSeekRelative: (deltaMs: number) => void; onRestartTrack: () => void; onPrevious?: () => void; onNext?: () => void; onSelectQueueIndex?: (index: number) => void; onCycleSpeed?: () => void; onCycleRepeat?: () => void; onExit: () => void; }`
    - `export function AudioPlayerOverlay(props: AudioPlayerOverlayProps): JSX.Element`

- [ ] **Step 1: Write failing component & D-pad tests in `tests/components/player/AudioPlayerOverlay.test.tsx`**

Create `tests/components/player/AudioPlayerOverlay.test.tsx` testing:
1. Renders zero `gap-*` classes in both `music` (with multi-track queue) and `audiobook` (single or multi-part) modes, including when `isAmbientDimmed={true}`.
2. `formatAudioDuration` formats `< 1h` as `M:SS` (`4:05`) and `>= 1h` as `H:MM:SS` (`2:15:09`), and displays elapsed, total, and remaining (`-2:10:00`) timestamps accurately.
3. Cover art renders `<img>` when `posterUrl` is provided and falls back cleanly to a vinyl (`Music`) or book (`BookOpen`) icon on missing URL or `onError`.
4. Transport controls & D-pad navigation (both inside `FocusProvider` and standalone):
   - Mounts with initial focus on `audio-btn-play-pause`; `[OK]` (`Enter`) calls `onTogglePlayPause`.
   - `ArrowUp` from transport row focuses `audio-progress-bar`; `ArrowLeft` / `ArrowRight` on `audio-progress-bar` calls `onSeekRelative(-10000)` / `+10000` for `music` and `-15000` / `+30000` for `audiobook` without escaping to the queue column; `ArrowDown` returns to `audio-btn-play-pause`.
   - `audio-btn-prev` calls `onRestartTrack()` when `positionMs > 5000` (or `!hasPrevious`), and calls `onPrevious()` when `positionMs <= 5000 && hasPrevious`.
   - `audio-btn-speed` renders in `audiobook` mode (`1.25x`) calling `onCycleSpeed`, while `audio-btn-repeat` renders in `music` mode (`Repeat: Off/All/One`) calling `onCycleRepeat` (and `audio-btn-tracks` renders when `audioTracks.length >= 2 && onOpenAudioModal`).
   - `ArrowRight` from the rightmost transport control enters the Live Up-Next Queue Column (`audio-queue-item-{currentIndex ?? 0}`), `ArrowDown`/`ArrowUp` steps through queue items, `[OK]` (`Enter`) calls `onSelectQueueIndex(idx)`, and `ArrowLeft` returns focus to the rightmost transport control.
5. When `isAmbientDimmed={true}`, renders the dimmed stage (`data-ambient-dimmed="true"`, opacity `0.25`) and `"Ambient Mode • Press any key to wake"` indicator.

- [ ] **Step 2: Run Vitest on `tests/components/player/AudioPlayerOverlay.test.tsx` to verify RED failure**

Run: `npx vitest run tests/components/player/AudioPlayerOverlay.test.tsx`
Expected: FAIL (`Cannot find module '../../../src/components/player/AudioPlayerOverlay'`).

- [ ] **Step 3: Implement `src/components/player/AudioPlayerOverlay.tsx`**

Implement `AudioPlayerOverlay.tsx`:
- Zero `gap-*` substrings anywhere in JSX, styles, or comments (`mr-*`, `mb-*`, `ml-*`).
- Full-screen container `data-testid="audio-player-overlay"` (`fixed inset-0 z-20 bg-[#080202] text-[#F5E5E5] flex flex-col justify-center p-14 select-none overflow-hidden`).
- Inner stage wrapper `data-testid="audio-player-stage"` `data-ambient-dimmed={isAmbientDimmed ? 'true' : 'false'}` transitioning opacity cleanly (`style={{ opacity: isAmbientDimmed ? 0.25 : 1, transition: 'opacity 400ms ease' }}`), plus a subtle ambient badge (`data-testid="audio-ambient-badge"`) when `isAmbientDimmed` is true.
- Self-contained D-pad navigation controller (`capture: false` or `capture: true` skipped when `isAmbientDimmed` or any modal `[aria-modal="true"]` is open!) synchronizing local `focusedControlId` + `FocusContext` (when present) + DOM `.focus({ preventScroll: true })` so `<AudioPlayerOverlay />` works identically inside `FocusProvider` (`App.tsx`) and standalone `<PlayerScreen />` tests!
- Left Column (`flex-1 min-w-0 flex flex-col justify-between`) + Right Column (`w-[520px] shrink-0 ml-12` showing Live Up-Next Queue `audio-queue-item-{idx}` when `(queue?.length ?? 0) > 1`, or a Track/Audiobook Details card when single-item).

- [ ] **Step 4: Run zero-gap check, Vitest, and `tsc -b` to verify GREEN**

Run: `(! grep -rn "gap-" src/components/player/AudioPlayerOverlay.tsx) && npx vitest run tests/components/player/AudioPlayerOverlay.test.tsx && npx tsc -b`
Expected: PASS (all tests green, `0` `gap-*` matches, `tsc -b` exit `0`).

- [ ] **Step 5: Commit Task 3**

```bash
git add src/components/player/AudioPlayerOverlay.tsx tests/components/player/AudioPlayerOverlay.test.tsx
git commit -m "feat(player): add split-stage AudioPlayerOverlay with live queue and ambient dim UI"
```

---

### Task 4: `PlayerScreen` Audio Mode, `60s` Ambient Auto-Dim, Queue Jumping & `FolderBrowserModal` `"Play All"` (`kadr-tizenos`)

**Working Directory:** `/home/boody/work/personal/kadr-tizenos`

**Files:**
- Modify: `src/screens/PlaylistDetailModal.tsx:42-48, 453-465`
- Modify: `src/screens/FolderBrowserModal.tsx`
- Modify: `src/screens/BrowseScreen.tsx`
- Modify: `src/screens/SearchView.tsx`
- Modify: `src/screens/PlayerScreen.tsx`
- Modify: `src/App.tsx`
- Create: `tests/screens/PlayerScreen.audioPlayer.test.tsx`
- Modify: `tests/screens/FolderBrowserModal.test.tsx`
- Modify: `tests/App.test.tsx`

**Interfaces:**
- Consumes: Task 2 (`isAudioMediaType`, `checkAudioCompatibility`, `setPlaybackRate`, `loadAudiobookSpeed`, `saveAudiobookSpeed`, `cycleAudiobookSpeed`, `cycleAudioRepeatMode`, `AudioRepeatMode`) & Task 3 (`AudioPlayerOverlay`, `AudioQueueEntry`)
- Produces:
  - Extended `PlaylistQueuePlayItem` (`subtitle?: string; posterUrl?: string; mediaType?: string; durationSeconds?: number;`) and `PlaylistItem`
  - `PlayerScreenProps.onSelectQueueIndex?: (index: number) => void`
  - `FolderBrowserModalProps.onPlayQueue?: (queue: PlaylistQueuePlayItem[], startIndex: number) => void` + `"Play All"` button (`id="play-folder-all-btn"`)

- [ ] **Step 1: Write failing integration tests in `tests/screens/PlayerScreen.audioPlayer.test.tsx`, `tests/screens/FolderBrowserModal.test.tsx`, and `tests/App.test.tsx`**

1. Create `tests/screens/PlayerScreen.audioPlayer.test.tsx` testing:
   - Launching `PlayerScreen` with `mediaType="audiobook"` (or `mediaType="music"`) on a compatible `.m4b` / `.flac` item uses `Html5PlayerDriver` + Direct Stream (`/api/v1/stream/{id}`) immediately without a `/hls/master.m3u8` preflight, renders `<AudioPlayerOverlay />` instead of `<PlayerOSD />`, restores saved `kadr_audiobook_speed_v1`, and updates `video.playbackRate` + `localStorage` when cycling `audio-btn-speed`.
   - Launching `PlayerScreen` with `mediaType="music"` and an unsupported audio codec (`wma`) requests audio-only HLS (`/api/v1/media/{id}/hls/master.m3u8?video_codec=none&audio_codec=aac` without `max_height`).
   - Track completion (`ended`): advances immediately (`0s` gap, no `auto-advance-overlay` countdown) to `onNext()`, loops to `0ms` when `repeatMode === 'one'`, and wraps to `onSelectQueueIndex(0)` when `repeatMode === 'all'` on the final track.
   - `60s` Auto-Dim Ambient Mode: keeps `setTvScreenSaver(true)` active while playing; after `60_000ms` idle while playing, sets `data-ambient-dimmed="true"`; pressing `Back` (or `ArrowRight`) while dimmed wakes to `data-ambient-dimmed="false"` **without** calling `onExit` or seeking; pressing `Back` a second time (while awake) flushes progress and calls `onExit`; pressing `TVKeys.PLAY_PAUSE` while dimmed pauses **and** wakes immediately.
2. In `tests/screens/FolderBrowserModal.test.tsx`:
   - Add test verifying `#play-folder-all-btn` renders when `folderData.items.length > 0` and `onPlayQueue` is provided, and activating it calls `onPlayQueue` with all folder items (`id`, `title`, `subtitle`, `posterUrl`, `mediaType`, `resumeMs`) starting at index `0`.
3. In `tests/App.test.tsx`:
   - Add end-to-end test verifying playing a Music album folder via `FolderBrowserModal` `"Play All"` opens `PlayerScreen` in `<AudioPlayerOverlay />` mode with the full Up-Next queue, and pressing `[OK]` on `audio-queue-item-1` jumps directly to track `2` via `onSelectQueueIndex`.

- [ ] **Step 2: Run targeted Vitest files to verify RED failure**

Run: `npx vitest run tests/screens/PlayerScreen.audioPlayer.test.tsx`
Expected: FAIL (`audio-player-overlay` not rendered / `onSelectQueueIndex` missing).

- [ ] **Step 3: Implement `PlayerScreen` Audio Mode, `FolderBrowserModal` `"Play All"`, and `App.tsx` queue wiring**

1. **`src/screens/PlaylistDetailModal.tsx` & `src/screens/FolderBrowserModal.tsx`:**
   - Extend `PlaylistQueuePlayItem` with `subtitle?: string; posterUrl?: string; mediaType?: string; durationSeconds?: number;` and populate them in `PlaylistDetailModal`'s `startQueueFromItems`.
   - In `FolderBrowserModal.tsx`: add optional `onPlayQueue?: (queue: PlaylistQueuePlayItem[], startIndex: number) => void;`, render `PillButton` `id="play-folder-all-btn"` (`"Play All"`, `Play` icon, `marginRight="12px"`) in the header action row whenever `!loading && !isLocked && (folderData?.items?.length ?? 0) > 0 && Boolean(onPlayQueue)` (registering `'play-folder-all-btn'` in `validNodeIds` and header action order), building the queue from `folderData.items` (`toResumePercentageSentinel(item.playback_progress)` for non-live items) and calling `onPlayQueue(queue, 0)`.
2. **`src/App.tsx`, `src/screens/BrowseScreen.tsx`, & `src/screens/SearchView.tsx`:**
   - Extend `playerItem` state in `App.tsx` with `mediaType?: string; posterUrl?: string; subtitle?: string;` and add optional `mediaTypeOverride?: string` to `handlePlayItem` (resolving `mediaType` from `mediaTypeOverride ?? queueItem?.mediaType ?? (activeItem && String(activeItem.id) === String(itemId) ? activeItem.media_type : undefined)`).
   - Pass `matched.item_type` as `mediaType` when `TVKeys.PLAY` triggers `onPlayItem` in `SearchView.tsx`.
   - Add `handleSelectQueueIndex(index: number)` in `App.tsx` (calling `handlePlayItem` for `playerItem.playlist[index]`) and pass `mediaType={playerItem.mediaType}`, `onSelectQueueIndex={handleSelectQueueIndex}`, and `onPlayQueue={handlePlayPlaylistQueue}` on `<FolderBrowserModal />` (closing `FolderBrowserModal` or preserving return path just like `onSelectItem` / `PlaylistDetailModal` — keep `folderBrowserContext` open or restorable on exit so `Back` from `PlayerScreen` returns cleanly to the album folder!).
3. **`src/screens/PlayerScreen.tsx`:**
   - Derive `effectiveMediaType = itemMediaType || mediaType` and `isAudioMode = isAudioMediaType(effectiveMediaType)` (`isAudioModeRef`). Also store `itemDetailMeta` (`posterUrl`, `subtitle`, `overview`, `releaseYear`) from `fetchMediaItem` (falling back to `playlist?.[currentIndex]` fields while loading).
   - Compute initial/reset `useHls`: when `isAudioMediaType(mediaType)` is true on mount/item change, set `useHls` to `!checkAudioCompatibility(technical?.audio_codec, technical?.container).isSupported` (so compatible audio files Direct-Play immediately with zero HLS preflight!). Also if `mediaType` prop was initially undefined and `fetchMediaItem` discovers `isAudioMediaType(detail.media_type)` while `AVPlay` was used, switch cleanly to HTML5 audio mode.
   - Pass `isAudioOnly: isAudioMode` to `getPlaybackUrl(...)` and `createPlayerDriver(forceHtml5 || isAudioMode)` so audio mode always runs on `Html5PlayerDriver`.
   - Manage `playbackRate` (`loadAudiobookSpeed()` when `effectiveMediaType === 'audiobook'`, `1` when `'music'`) and `repeatMode` (`'off' | 'all' | 'one'`), calling `driverRef.current?.setPlaybackRate?.(effectiveRate)` on driver ready and rate change.
   - In the auto-advance effect: when `isAudioMode` is true, skip the 5s countdown; on `playerState === 'ended'`, handle `repeatMode === 'one'` (`seekTo(0)` + `play()`), `hasNext` (`buildAndFlushSnapshot` + `onNext()`), or `repeatMode === 'all'` (`buildAndFlushSnapshot` + `onSelectQueueIndex?.(0)`).
   - Implement the `60_000ms` Ambient Auto-Dim effect (`isAmbientDimmed` / `isAmbientDimmedRef`) active when `isAudioMode && playerState === 'playing' && !playbackError && !isModalOpen && !isDocumentHidden`, plus capture-phase wake-key interception (waking and consuming non-media keys while allowing `PLAY`/`PAUSE`/`PLAY_PAUSE`/`STOP`/`MEDIA_TRACK_NEXT`/`MEDIA_TRACK_PREVIOUS` through while waking).
   - In `PlayerScreen`'s `keydown` listener: when `isAudioModeRef.current` is true, `Back` (when awake and no modal open) flushes and calls `onExit(snap)` directly without toggling `showOSD`, and `PlayerOSD` D-pad branches (`ArrowUp/Down/Left/Right/Enter`) yield to `<AudioPlayerOverlay />`.
   - Render `<AudioPlayerOverlay />` when `isAudioMode && !playbackError` (hiding video `<PlayerOSD />` and `<SubtitleOverlay />`).

- [ ] **Step 4: Run zero-gap check, full Vitest suite, `chrome69` build, and `.wgt` packaging (GREEN)**

Run:
1. `(! grep -rn "gap-" src/player/compatibility.ts src/player/driver.ts src/player/html5-driver.ts src/player/avplay-driver.ts src/player/audioPreferences.ts src/components/player/AudioPlayerOverlay.tsx src/screens/PlayerScreen.tsx src/screens/FolderBrowserModal.tsx src/screens/PlaylistDetailModal.tsx src/screens/BrowseScreen.tsx src/screens/SearchView.tsx src/App.tsx)`
2. `npm test -- --run`
3. `npm run build && npm run package:wgt -- --no-build`
Expected: 100% test suites passing, `0` `gap-*` matches, `chrome69` build green, and `kadr.wgt` signed cleanly.

- [ ] **Step 5: Commit Task 4**

```bash
git add src/screens/PlaylistDetailModal.tsx src/screens/FolderBrowserModal.tsx src/screens/BrowseScreen.tsx src/screens/SearchView.tsx src/screens/PlayerScreen.tsx src/App.tsx tests/screens/PlayerScreen.audioPlayer.test.tsx tests/screens/FolderBrowserModal.test.tsx tests/App.test.tsx
git commit -m "feat(audio-player): wire PlayerScreen audio mode, 60s ambient dim, and folder Play All queue"
```
