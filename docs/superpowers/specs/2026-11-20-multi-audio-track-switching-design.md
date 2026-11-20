# Sub-Project 3: Multi-Audio Track Switching — Design Spec

**Date:** 2026-11-20
**Parent Roadmap:** `docs/superpowers/specs/2026-11-19-v1-milestone-roadmap.md` (Phase 3 of 7)
**Target Hardware:** Samsung Tizen TV (`Tizen 5.0+`, verified on `UA55TU7000UXEG` Tizen 5.5 / Chromium 69) & Web Dev Harness
**Repositories:**
- Server: `/home/boody/work/personal/kadr` (`kadr-core`, `kadr-ingest`, `kadr-storage`, `kadr-server`)
- Client: `/home/boody/work/personal/kadr-tizenos`

---

## 1. Purpose & Problem Statement

Dual-audio and multi-audio media (anime with Japanese + English tracks, international films, and Blu-ray remuxes with surround + stereo or commentary tracks) currently play only Track `0`:
1. **Single-Stream Ingest Probe (`kadr`):** `kadr-ingest` runs a single `ffprobe` pass per media file, yet `ffprobe.rs` records only the first `codec_type == "audio"` stream (`audio_codec` / `audio_channels`) and discards all remaining audio streams, ISO-639 language tags, titles, and dispositions.
2. **HLS Transcode Codec Mismatch (`kadr`):** While `HlsQuery` (`hls_routes.rs`) already accepts `?audio_track=<u32>` and `build_ffmpeg_hls_args_for_source` (`builder.rs`) maps `-map 0:a:{audio_track_index}`, `evaluate_transcode` always checks `tech.audio_codec` (Track `0` only). Switching from Track `0` (`aac`) to Track `1` (`dts`, `truehd`, or `eac3`) erroneously selects `AudioAction::Copy` (`-c:a copy`), breaking HLS playback.
3. **No TV Audio Track Selector or Language Memory (`kadr-tizenos`):** Neither `PlayerOSD` nor `PlayerScreen` exposes an Audio Track selector, native `AVPlay.setSelectTrack('AUDIO', idx)` switching on Direct Play, seamless HLS `?audio_track=<index>` switching, or persistent preferred audio language selection across episodes and movies.

---

## 2. Approved UX & Scope Decisions

1. **Dedicated `"Audio"` Button on `PlayerOSD` + `<AudioTrackModal>`:**
   - Shown on `PlayerOSD` immediately beside `"Subtitles"` whenever `audioTracks.length >= 2` (displaying an `AUDIO` badge and active language code pill when known, e.g. `JPN`, `ENG`).
   - Activating `"Audio"` opens a dedicated, TV-navigable `<AudioTrackModal>` listing all audio tracks with human-readable language/title labels and badges (`5.1 EAC3`, `2.0 AAC`, `7.1 TRUEHD`, `Default`, `Commentary`, `Active`).
2. **Global Preferred Audio Language Memory (`localStorage`):**
   - Selecting an audio track persists `kadr_audio_preference_v1` globally in `localStorage` (`{ mode: 'auto' } | { mode: 'language', language: string, preferCommentary?: boolean }`).
   - On subsequent episodes and movies, Kadr automatically picks the matching main dialogue track (penalizing commentary / visual-impaired tracks unless `preferCommentary` is true, and breaking ties by `is_default` then channel count), falling back cleanly to the container's `is_default` track (or Track `0`) when no match exists. This same storage schema will be surfaced directly in Sub-Project 7's Settings tab.

---

## 3. Architecture & Component Design

### 3.1 Server Audio Probing, Storage, Lazy Backfill & HLS Codec Fix (`kadr`)

1. **Core Model (`crates/kadr-core/src/models.rs`):**
   - Define `AudioStreamInfo`:
     ```rust
     #[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
     pub struct AudioStreamInfo {
         pub audio_index: u32,
         pub stream_index: u32,
         pub codec: String,
         #[serde(default, skip_serializing_if = "Option::is_none")]
         pub channels: Option<u8>,
         pub language: String,
         #[serde(default, skip_serializing_if = "Option::is_none")]
         pub title: Option<String>,
         #[serde(default)]
         pub is_default: bool,
         #[serde(default)]
         pub is_commentary: bool,
     }
     ```
     where `audio_index` is the `0`-based audio-only ordinal (`0, 1, 2, ...`) matching `ffmpeg -map 0:a:<audio_index>`, and `stream_index` is the container stream index (`stream["index"]`).
   - Add `#[serde(default, skip_serializing_if = "Vec::is_empty")] pub audio_tracks: Vec<AudioStreamInfo>` onto `TechnicalInfo`.
2. **Single-Pass `ffprobe` Extraction (`crates/kadr-ingest/src/probe/ffprobe.rs`):**
   - Add `pub fn parse_audio_streams_from_json(json: &Value) -> Vec<AudioStreamInfo>`:
     - Iterates `streams` where `codec_type == "audio"`, assigning sequential `audio_index = 0, 1, ...` and reading `stream_index`, lowercase `codec_name`, `channels`, normalized ISO-639 `language` (`normalize_language_tag`, defaulting to `"und"`), `is_default` (`disposition.default`), and `is_commentary` (`disposition.comment` || `disposition.visual_impaired` || case-insensitive `"commentary"` in `tags.title`).
     - Cleans `tags.title` by filtering generic muxer handler strings (`SoundHandler`, `ISO Media file produced by Google Inc.`, `GPAC ISO Audio Handler`, `Core Media Audio`, `Stereo` when redundant).
   - In `run_ffprobe_full`: populate `info.audio_tracks = parse_audio_streams_from_json(&json)`, and derive `info.audio_codec` + `info.audio_channels` from `info.audio_tracks.iter().find(|t| t.is_default).or_else(|| info.audio_tracks.first())` so primary technical fields always reflect the default audio stream.
   - Add `pub async fn probe_audio_streams<P: AsRef<Path>>(path: P) -> Result<Vec<AudioStreamInfo>>` (using `Command::new("ffprobe")` with `kill_on_drop(true)` and a 15s timeout).
3. **SQLite Schema & Repository Persistence (`crates/kadr-storage`):**
   - Add migration `013_audio_tracks.sql` (registered in `crates/kadr-storage/src/migrations.rs`):
     ```sql
     ALTER TABLE media_items ADD COLUMN audio_tracks_json TEXT;
     ```
   - Update all three `media_items` column lists & row mappers so column indices stay 100% aligned:
     - `crates/kadr-storage/src/repos/media_item_repo.rs` (`MEDIA_ITEM_COLUMNS`, `map_media_item_row`, `batch_upsert` `INSERT ... ON CONFLICT DO UPDATE` preserving existing non-empty `audio_tracks_json` only when re-upserting without `ffprobe`, or updating with `excluded.audio_tracks_json` when non-null).
     - `crates/kadr-storage/src/repos/widget_queries.rs` (`MEDIA_ITEM_COLS` and `map_media_item_row`).
     - `crates/kadr-storage/src/repos/playlist_repo.rs` (`get_playlist_items_with_privacy` `SELECT` list).
   - Add `MediaItemRepository::update_audio_tracks(&self, item_id: i64, tracks: &[AudioStreamInfo]) -> Result<()>` to persist lazily-probed audio streams onto existing items.
4. **Audio Tracks Endpoint & Lazy Singleflight Backfill (`crates/kadr-server`):**
   - Add `AudioProbeService` (or `crates/kadr-server/src/api/audio_routes.rs` with per-item singleflight `Mutex<HashMap<i64, Arc<tokio::sync::Mutex<()>>>>` and `probed_items: Arc<Mutex<HashSet<i64>>>` registered as an `Extension` in `api/mod.rs`):
     - **`GET /api/v1/items/{item_id}/audio-tracks`**:
       1. Requires `AuthUser` + `UnlockedLibraries`. Looks up `item` (`404` if missing) and enforces `LibraryRepository` privacy (`403 LIBRARY_LOCKED` if locked).
       2. Fast path: if `!item.technical.audio_tracks.is_empty()`, returns `200 OK` `Json(item.technical.audio_tracks)`.
       3. Lazy backfill path (for libraries scanned before `013_audio_tracks` or with `ffprobe` off): if `item.plugin_ref().is_none()`, `!item.is_live()`, not yet in `probed_items`, and `tokio::fs::try_exists(&item.file_path)` is true, acquires the per-item singleflight lock, re-checks DB, runs `kadr_ingest::probe::ffprobe::probe_audio_streams(&item.file_path)`, persists via `media_repo.update_audio_tracks(item_id, &probed)` when non-empty, marks `probed_items.insert(item_id)`, and returns the probed list.
       4. Fallback: if `probed` is empty (e.g. `ffprobe` binary absent in minimal test environments) and `item.technical.audio_codec` is present (and not `"none"`), synthesizes a single Track `0` (`audio_index: 0, stream_index: 1, codec, channels: item.technical.audio_channels, language: "und", title: None, is_default: true, is_commentary: false`).
   - Also call this same `ensure_item_audio_tracks` helper inside `hls_routes::master_playlist` whenever `params.audio_track_index > 0 && item.technical.audio_tracks.is_empty()` on a local file so HLS multi-audio requests always know the target stream's true codec!
5. **HLS `evaluate_transcode` & Bounds Validation (`kadr-core` & `kadr-server`):**
   - In `crates/kadr-core/src/transcoding/builder.rs` (`evaluate_transcode`):
     - Resolve selected audio codec:
       - If `let Some(track) = tech.audio_tracks.iter().find(|t| t.audio_index == params.audio_track_index)` -> compare `track.codec.to_lowercase()` against `target_audio_codec`.
       - Else if `params.audio_track_index == 0` -> compare `tech.audio_codec.as_deref().unwrap_or("").to_lowercase()` against `target_audio_codec`.
       - Else (`params.audio_track_index > 0` with unprobed codec) -> always `AudioAction::Transcode` (`aac`, `2` channels, `192k`) so non-zero tracks never risk copying incompatible DTS/TrueHD/EAC3 into MPEG-TS!
   - In `crates/kadr-server/src/api/hls_routes.rs` (`master_playlist`):
     - If `!effective_tech.audio_tracks.is_empty()` and `!effective_tech.audio_tracks.iter().any(|t| t.audio_index == params.audio_track_index)`, return `400 Bad Request` (`{"error": "Invalid audio_track index"}`).

### 3.2 Client Types, API & Audio Language Memory (`kadr-tizenos`)

1. **Types & API (`src/types/kadr.ts`, `src/api/items.ts`, `src/api/audio.ts`):**
   - Add `AudioStreamInfo` to `src/types/kadr.ts` and optional `audio_tracks?: AudioStreamInfo[]` onto `TechnicalMetadata` (`src/api/items.ts` & `src/types/kadr.ts`).
   - Create `src/api/audio.ts`: `export async function fetchItemAudioTracks(client: ApiClient, itemId: number | string): Promise<AudioStreamInfo[]>` -> `GET /api/v1/items/${encodeURIComponent(String(itemId))}/audio-tracks`.
2. **Audio Preference & Formatting (`src/player/audioPreferences.ts`):**
   - `export type AudioPreference = { mode: 'auto' } | { mode: 'language'; language: string; preferCommentary?: boolean };`
   - `export const AUDIO_PREFERENCE_STORAGE_KEY = 'kadr_audio_preference_v1';`
   - `loadAudioPreference()` / `saveAudioPreference(pref)`: safe `localStorage` JSON helpers.
   - `pickInitialAudioTrackIndex(tracks: AudioStreamInfo[], pref: AudioPreference): number`:
     - Empty `tracks` -> `0`.
     - `pref.mode === 'auto'` -> `(tracks.find((t) => t.is_default) ?? tracks[0]).audio_index`.
     - `pref.mode === 'language'` -> normalize target via `normalizeSubtitleLanguageCode(pref.language)`; filter tracks with matching normalized language; if none match, fall back to `(tracks.find((t) => t.is_default) ?? tracks[0]).audio_index`. Among matches, rank by `(Boolean(t.is_commentary) === Boolean(pref.preferCommentary) ? 100 : 0) + (t.is_default ? 20 : 0) + Math.min(10, t.channels ?? 2)` descending.
   - `formatAudioChannelLayout(channels?: number | null): string` (`1 -> 'Mono'`, `2 -> '2.0'`, `6 -> '5.1'`, `8 -> '7.1'`, `n -> '${n}ch'`) and `formatAudioTrackLabel(track: AudioStreamInfo): { primaryLabel: string; codecBadge: string; languageBadge: string; isDefault: boolean; isCommentary: boolean }`.

### 3.3 Hybrid Driver Switching & `PlayerScreen` Orchestration (`kadr-tizenos`)

1. **Playback URL Builder (`src/player/compatibility.ts`):**
   - Add `audioTrackIndex?: number` to `PlaybackStreamOptions`.
   - When `isHls` is `true` and `options.audioTrackIndex !== undefined && options.audioTrackIndex > 0`, set `params.set('audio_track', String(options.audioTrackIndex))`. Omitting `audio_track` when `0` or `undefined` preserves 100% URL compatibility with existing single-audio streams while explicitly selecting non-zero tracks on the server.
2. **`PlayerDriver` Extensions (`src/player/driver.ts`, `avplay-driver.ts`, `html5-driver.ts`):**
   - Extend `PlayerDriver.init`: `init(container: HTMLElement, streamUrl: string, isHls: boolean, startTimeMs?: number, mediaHints?: VideoLayoutHints, initialAudioTrackIndex?: number): Promise<void>;`
   - Add optional `selectAudioTrack?(audioIndex: number, streamIndex?: number): boolean;` on `PlayerDriver`.
   - **`TizenAvplayDriver`:**
     - Store `private selectedAudioIndex = 0;` and `private selectedStreamIndex?: number;` (initialized from `initialAudioTrackIndex ?? 0` in `init`, reset in `destroy`).
     - Helper `applyNativeAudioSelection(avplay, audioIndex, streamIndex)`:
       - Only runs when `!this.currentIsHls` (in HLS, `ffmpeg` already muxed the single chosen audio stream!).
       - Reads `const tracks = avplay.getTotalTrackInfo?.();` (`Array.isArray(tracks)`), filters `String(t.type).toUpperCase() === 'AUDIO'`.
       - Matches either the `audioIndex`-th AUDIO entry (`audioEntries[audioIndex]`) or an entry whose `Number(t.index) === streamIndex`.
       - Calls `avplay.setSelectTrack('AUDIO', Number(target.index))` inside `try/catch`, returning `true` on success and `false` if `getTotalTrackInfo` / `setSelectTrack` is absent, out of bounds, or throws.
     - In `prepareAsync` success callback (when `!isHls && this.selectedAudioIndex > 0`): calls `this.applyNativeAudioSelection(avplay, this.selectedAudioIndex, this.selectedStreamIndex)`.
     - In `restore()` (when Direct Play fast-restore succeeds and `this.selectedAudioIndex > 0`): re-applies `this.applyNativeAudioSelection(...)` so Smart Hub foreground resume preserves the active audio track!
     - `selectAudioTrack(audioIndex, streamIndex)`: if `this.isDestroyed || this.isSuspended || !this.isReady || this.currentIsHls`, returns `false`; on `applyNativeAudioSelection` success, updates `this.selectedAudioIndex = audioIndex; this.selectedStreamIndex = streamIndex;` and returns `true`.
   - **`Html5PlayerDriver`:**
     - Checks `(this.video as any)?.audioTracks`; if present and `length > audioIndex`, sets `audioTracks[i].enabled = (i === audioIndex)` and returns `true`; otherwise returns `false` (triggering `PlayerScreen`'s clean HLS `?audio_track=<index>` switch!).
3. **`PlayerScreen` Audio Lifecycle (`src/screens/PlayerScreen.tsx`):**
   - State: `audioTracks` (`AudioStreamInfo[]`), `selectedAudioTrackIndex` (`number`, default `0`), `isAudioModalOpen` (`boolean`).
   - On `itemId` mount: fetches `fetchItemAudioTracks(apiClient, numericItemId)` (falling back to `detail.technical?.audio_tracks`), computes `initialIdx = pickInitialAudioTrackIndex(tracks, loadAudioPreference())`, and sets `selectedAudioTrackIndex(initialIdx)`.
   - Compatibility check for auto-picked non-zero track: if `initialIdx > 0` while `!useHls`, checks whether the chosen track's codec is supported (`isSupportedOnSamsungTv(videoCodec, chosenTrack.codec, container, forceHtml5 || isBrowserEnv)`) and, if already initialized, tries `driverRef.current?.selectAudioTrack?.(initialIdx, chosenTrack.stream_index)`. If unsupported or `selectAudioTrack` returns `false`, switches to HLS (`seamlessSwapRef.current = true`, `hlsSeekOffsetMs = positionMsRef.current`, `setUseHls(true)`) so preferred audio language works seamlessly even on HTML5 or DTS secondary tracks!
   - `handleSelectAudioTrack(audioIndex: number)`:
     - Updates `selectedAudioTrackIndex` and saves `AudioPreference` when `track.language && track.language !== 'und'`.
     - If `!isHlsRef.current`:
       - Checks `isSupportedOnSamsungTv(activeTech?.video_codec, track?.codec, activeTech?.container, forceHtml5 || isBrowserEnv)`.
       - If supported and `driverRef.current?.selectAudioTrack?.(audioIndex, track?.stream_index)` returns `true`: done in 0ms!
     - Otherwise (currently HLS, or Direct Play track requires transcoding / driver lacks native multi-audio):
       - Captures `resumePos = positionMsRef.current`.
       - Sets `seamlessSwapRef.current = true`.
       - Sets `hlsSeekOffsetMsRef.current = resumePos` and `setHlsSeekOffsetMs(resumePos)`.
       - If `!isHlsRef.current`, sets `setUseHls(true)`; else bumps `setReloadKey((k) => k + 1)` if URL params wouldn't otherwise re-trigger.

### 3.4 `PlayerOSD` & `<AudioTrackModal>` UI (`kadr-tizenos`)

1. **`PlayerOSD` (`src/components/osd/PlayerOSD.tsx`):**
   - Extend `PlayerOsdFocusItem = 'progress' | 'prev' | 'next' | 'audio' | 'subtitles'`.
   - New optional props: `audioTracks?: AudioStreamInfo[]`, `selectedAudioTrackIndex?: number`, `onOpenAudioModal?: () => void`.
   - `hasAudioSelector = Boolean(audioTracks && audioTracks.length >= 2 && onOpenAudioModal)`.
   - Renders `id="btn-audio"` (`data-testid="audio-button"`, `mr-4` when `hasSubtitles` follows, zero `gap-*` classes) immediately before `"Subtitles"`, showing a compact `AUDIO` badge + `"Audio"` (plus uppercase language tag e.g. `• JPN` when active track language is known).
   - In `PlayerScreen.tsx`: include `'audio'` before `'subtitles'` in the OSD controls D-pad array whenever `audioTracksRef.current.length >= 2`, and pause OSD auto-hide while `isAudioModalOpenRef.current === true`.
2. **`<AudioTrackModal>` (`src/components/player/AudioTrackModal.tsx`):**
   - Props: `isOpen: boolean`, `audioTracks: AudioStreamInfo[]`, `selectedAudioTrackIndex: number`, `onSelectAudioTrack: (audioIndex: number) => void`, `onClose: () => void`.
   - Uses `FocusContext` (`pushTrap('audio-modal')` / `popTrap('audio-modal')`), focuses the active track button (`audio-track-btn-${selectedAudioTrackIndex}`) on open, and registers a capture-phase `keydown` listener (`activeTrap === 'audio-modal'`):
     - `BACK_TIZEN` (`10009`) / `Escape` / `Backspace`: `e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); onClose();` (closes **only** `<AudioTrackModal>`, keeping `PlayerScreen` playing).
     - `ArrowUp` / `ArrowDown`: cycles through track buttons and close button (`audio-modal-close-btn`) deterministically (works in both JSDOM and real TV WebView).
   - Zero `gap-*` classes (`mb-3`, `mr-3`, `ml-2`).

---

## 4. Platform Invariants & Error Handling

- **Chromium 69 / Tizen 5.5 CSS Safety:** Zero flex `gap-*` classes anywhere in `<AudioTrackModal>`, `PlayerOSD.tsx`, or `PlayerScreen.tsx`.
- **AVPlay Hardware Plane Transparency:** `<AudioTrackModal>` renders lightweight translucent card UI (`bg-[#121318]/95`) inside `PlayerScreen` only while open and unmounts completely when closed.
- **Private Library Enforcement:** `GET /api/v1/items/{item_id}/audio-tracks` enforces `UnlockedLibraries` (`403 LIBRARY_LOCKED`).
- **Back-Compat for Existing HLS Calls:** `getPlaybackUrl` omits `audio_track` when `audioTrackIndex` is `undefined` or `0`, preserving 100% URL compatibility with existing single-audio streams and pre-flight probe tests.

---

## 5. Testing & Verification Strategy

1. **`kadr` Rust Tests (`cargo test` + release binary build):**
   - `kadr-ingest`: unit test `parse_audio_streams_from_json` covering multi-audio MKV JSON (Japanese 2.0 AAC default + English 5.1 EAC3 + English Commentary), ISO-639 normalization, handler-title filtering, and `TechnicalInfo` primary `audio_codec` selection.
   - `kadr-core`: unit tests in `transcoding_test.rs` verifying `evaluate_transcode` transcodes Track `1` (`dts` / `eac3`) to `aac` even when Track `0` is `aac`, and copies Track `1` when Track `1` itself is `aac`.
   - `kadr-storage`: test migration `013_audio_tracks.sql`, `batch_upsert`, `widget_queries`, `playlist_repo`, and `update_audio_tracks` round-trip.
   - `kadr-server`: integration tests verifying `GET /api/v1/items/{id}/audio-tracks` (persisted tracks, lazy `ffprobe` backfill on real generated dual-audio file when `ffmpeg`/`ffprobe` present, synthesized fallback when absent, and `403 LIBRARY_LOCKED` on locked private library) and `GET /api/v1/media/{id}/hls/master.m3u8?audio_track=99` returning `400`.
   - Rebuild `/home/boody/work/personal/kadr/target/release/kadr`.
2. **`kadr-tizenos` Vitest + Build + `.wgt` Verification:**
   - Unit tests for `audioPreferences.ts` (`loadAudioPreference`, `saveAudioPreference`, `pickInitialAudioTrackIndex` main-dialogue vs commentary scoring, `formatAudioTrackLabel`).
   - Driver unit tests (`tests/player/driver.test.ts`) verifying `TizenAvplayDriver` `getTotalTrackInfo` + `setSelectTrack('AUDIO', nativeIdx)` on `init`, live `selectAudioTrack`, and Smart Hub `restore()`, plus returning `false` on HLS.
   - Component tests (`tests/components/player/AudioTrackModal.test.tsx`) verifying zero `gap-*` classes, `ArrowUp`/`ArrowDown`/`Enter` track selection, and capture-phase `BACK_TIZEN` dismissal.
   - `PlayerScreen` integration tests (`tests/screens/PlayerScreen.audio.test.tsx`) verifying OSD `"Audio"` button visibility (`>= 2` tracks only), Direct Play instant `setSelectTrack` switch, Direct Play -> HLS `?audio_track=1` automatic switch when selecting a DTS track or on HTML5, HLS mid-stream `?audio_track=1` switch preserving playback timestamp, and `localStorage` preferred audio language auto-selection across episodes.
   - Zero `gap-*` check, full Vitest suite, `chrome69` build, and `kadr.wgt` packaging.
