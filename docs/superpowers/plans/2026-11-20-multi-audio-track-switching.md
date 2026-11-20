# Sub-Project 3: Multi-Audio Track Switching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver end-to-end multi-audio track probing, HLS & Direct-Play audio track switching, a TV-navigable `<AudioTrackModal>` via `PlayerOSD`, and persistent preferred audio language selection across the Kadr Rust server (`kadr`) and Samsung Tizen TV client (`kadr-tizenos`).

**Architecture:** Extract all audio streams during single-pass `ffprobe` into `TechnicalInfo.audio_tracks` (persisted via SQLite `audio_tracks_json` with lazy singleflight `ffprobe` backfill on `GET /api/v1/items/{item_id}/audio-tracks`), fix `evaluate_transcode` so HLS `?audio_track=<index>` inspects the selected track's codec, add native `AVPlay.setSelectTrack('AUDIO', idx)` switching with automatic seamless HLS fallback in `PlayerScreen`, and persist preferred audio language in `localStorage` (`kadr_audio_preference_v1`).

**Tech Stack:** Rust (`axum` 0.8, `rusqlite` / `deadpool-sqlite`, `tokio`), React 19, TypeScript 5.7, Vite 6 (`chrome69`), Tailwind CSS 4, Vitest 3 + React Testing Library.

## Global Constraints

- Target platform: Samsung Tizen 5.5 (`UA55TU7000UXEG`, Chromium 69 WebView) and Web Dev Harness.
- **Zero flex `gap-*` classes** in any new or modified JSX/CSS (`AudioTrackModal.tsx`, `PlayerOSD.tsx`, `PlayerScreen.tsx`); use explicit physical margins (`mr-*`, `mb-*`, `ml-*`).
- Keep `BrowseScreen` and browse modals unmounted while `view === 'player'`; `<AudioTrackModal>` mounts strictly inside `PlayerScreen` only when `isAudioModalOpen === true` and closes strictly one layer on `TVKeys.BACK_TIZEN` (`10009`) / `Escape` / `Backspace` without exiting playback.
- `PlayerOSD` renders the `"Audio"` button (`id="btn-audio"`, `data-testid="audio-button"`) **only** when `audioTracks && audioTracks.length >= 2`.
- `getPlaybackUrl` appends `audio_track=<index>` on HLS URLs **only** when `audioTrackIndex !== undefined && audioTrackIndex > 0` so default Track `0` HLS URLs remain 100% unchanged.
- `GET /api/v1/items/{item_id}/audio-tracks` **must** enforce `AuthUser` + `UnlockedLibraries` (`403 LIBRARY_LOCKED` on locked private libraries), and any child `ffprobe` process spawned for lazy backfill **must** set `kill_on_drop(true)` with a bounded timeout.

---

### Task 1: Kadr Server Multi-Audio Probing, SQLite Persistence, Lazy Backfill & HLS Codec Fix (`kadr`)

**Working Directory:** `/home/boody/work/personal/kadr`

**Files:**
- Modify: `/home/boody/work/personal/kadr/crates/kadr-core/src/models.rs:60-75`
- Modify: `/home/boody/work/personal/kadr/crates/kadr-core/src/transcoding/builder.rs:75-93`
- Modify: `/home/boody/work/personal/kadr/crates/kadr-core/tests/transcoding_test.rs`
- Modify: `/home/boody/work/personal/kadr/crates/kadr-ingest/src/probe/ffprobe.rs:33-199`
- Create: `/home/boody/work/personal/kadr/crates/kadr-storage/src/migrations/013_audio_tracks.sql`
- Modify: `/home/boody/work/personal/kadr/crates/kadr-storage/src/migrations.rs:15-21`
- Modify: `/home/boody/work/personal/kadr/crates/kadr-storage/src/repos/media_item_repo.rs:45-95,210-240,880-935`
- Modify: `/home/boody/work/personal/kadr/crates/kadr-storage/src/repos/widget_queries.rs:8-15,101-152`
- Create: `/home/boody/work/personal/kadr/crates/kadr-server/src/api/audio_routes.rs`
- Modify: `/home/boody/work/personal/kadr/crates/kadr-server/src/api/hls_routes.rs:51-65,149-165`
- Modify: `/home/boody/work/personal/kadr/crates/kadr-server/src/api/mod.rs`
- Create: `/home/boody/work/personal/kadr/crates/kadr-server/tests/audio_routes_test.rs`

**Interfaces:**
- Produces:
  - `kadr_core::models::AudioStreamInfo`:
    `{ audio_index: u32, stream_index: u32, codec: String, channels: Option<u8>, language: String, title: Option<String>, is_default: bool, is_commentary: bool }`
  - `TechnicalInfo.audio_tracks: Vec<AudioStreamInfo>` (`#[serde(default, skip_serializing_if = "Vec::is_empty")]`)
  - `MediaItemRepository::update_audio_tracks(&self, item_id: i64, tracks: &[AudioStreamInfo]) -> Result<()>`
  - `GET /api/v1/items/{item_id}/audio-tracks` -> `200 OK` `Vec<AudioStreamInfo>` JSON (`403 LIBRARY_LOCKED` on locked private library; `404` on missing item)
  - `GET /api/v1/media/{item_id}/hls/master.m3u8?audio_track=<u32>` -> `400 Bad Request` when `audio_tracks` is non-empty and `audio_track` is out of range; `evaluate_transcode` uses the selected track's codec.

- [ ] **Step 1: Write failing tests in `transcoding_test.rs`, `ffprobe.rs`, and `audio_routes_test.rs`**

1. In `crates/kadr-core/tests/transcoding_test.rs`, add test `test_evaluate_transcode_uses_selected_audio_track_codec`:
   - Item has `audio_codec: Some("aac")` and `audio_tracks` `[0: aac 2ch jpn, 1: dts 6ch eng, 2: aac 2ch eng commentary]`.
   - `audio_track_index = 0` -> `AudioAction::Copy`.
   - `audio_track_index = 1` (`dts`) -> `AudioAction::Transcode { codec: "aac", .. }`.
   - `audio_track_index = 2` (`aac`) -> `AudioAction::Copy`.
   - When `audio_tracks` is empty and `audio_track_index = 1` (unknown secondary codec) -> `AudioAction::Transcode { codec: "aac", .. }`.
2. In `crates/kadr-ingest/src/probe/ffprobe.rs` (`#[cfg(test)] mod tests`), add test `test_parse_audio_streams_from_json_multi_audio_and_dispositions` verifying `audio_index` (`0, 1, 2`), `stream_index` (`1, 2, 3`), ISO-639 normalization (`"jpn"`, `"eng"`), generic handler-title stripping (`"SoundHandler"` -> `None`), and `is_commentary` (`disposition.comment == 1` or `"Director's Commentary"` title).
3. Create `crates/kadr-server/tests/audio_routes_test.rs` testing:
   - `GET /api/v1/items/{id}/audio-tracks` returns persisted multi-audio tracks (`jpn` + `eng`), returns `403 LIBRARY_LOCKED` on locked private library (and `200` when unlocked via `x-kadr-unlocked`), synthesizes Track `0` when `audio_tracks` is empty and file is synthetic, lazily probes & persists `audio_tracks` via `ffprobe` when a real dual-audio MKV generated by `ffmpeg` exists on disk, and `GET /api/v1/media/{id}/hls/master.m3u8?audio_track=9` returns `400 BAD_REQUEST`.

- [ ] **Step 2: Run `cargo test` to verify failure (RED)**

Run in `/home/boody/work/personal/kadr`:
`cargo test -p kadr-core --test transcoding_test`
Expected: FAIL (`no field audio_tracks on type TechnicalInfo` / `AudioStreamInfo` not found).

- [ ] **Step 3: Implement `AudioStreamInfo`, `ffprobe` audio parser, migration `013`, `audio_routes`, and `hls_routes` updates**

1. **`crates/kadr-core/src/models.rs`:**
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

   #[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
   pub struct TechnicalInfo {
       pub duration_seconds: i64,
       pub resolution: Option<String>,
       pub video_codec: Option<String>,
       pub audio_codec: Option<String>,
       pub audio_channels: Option<u8>,
       pub container: Option<String>,
       #[serde(default, skip_serializing_if = "Vec::is_empty")]
       pub audio_tracks: Vec<AudioStreamInfo>,
   }
   ```
   (Fix any struct literal initializers of `TechnicalInfo` across workspace crates/tests by adding `audio_tracks: Vec::new()` or `..Default::default()`.)

2. **`crates/kadr-core/src/transcoding/builder.rs` (`evaluate_transcode`):**
   ```rust
   let target_audio_codec = params.audio_codec.to_lowercase();
   let selected_source_audio_codec: Option<String> = tech
       .audio_tracks
       .iter()
       .find(|t| t.audio_index == params.audio_track_index)
       .map(|t| t.codec.to_lowercase())
       .or_else(|| {
           if params.audio_track_index == 0 {
               tech.audio_codec.as_deref().map(|c| c.to_lowercase())
           } else {
               None
           }
       });

   let audio_action = match selected_source_audio_codec {
       Some(src_codec) if !src_codec.is_empty() && src_codec == target_audio_codec => {
           AudioAction::Copy
       }
       _ => AudioAction::Transcode {
           codec: target_audio_codec,
           channels: 2,
           bitrate_kbps: 192,
       },
   };
   ```

3. **`crates/kadr-ingest/src/probe/ffprobe.rs`:**
   - Implement `is_generic_audio_handler_title(title: &str) -> bool` (`soundhandler`, `gpac iso audio handler`, `core media audio`, `iso media file produced by google inc.`, empty).
   - Implement `pub fn parse_audio_streams_from_json(json: &Value) -> Vec<AudioStreamInfo>`:
     - Track `let mut audio_ordinal = 0u32;` across `codec_type == "audio"` streams.
     - Normalize `language = normalize_language_tag(raw_lang)`.
     - `is_default = disposition_flag(stream, "default")`.
     - `is_commentary = disposition_flag(stream, "comment") || disposition_flag(stream, "visual_impaired") || raw_title.is_some_and(|t| t.to_ascii_lowercase().contains("commentary"))`.
     - Populate `info.audio_tracks = parse_audio_streams_from_json(&json)` in `run_ffprobe_full`, and set `primary_audio = info.audio_tracks.iter().find(|t| t.is_default).or_else(|| info.audio_tracks.first())` -> `info.audio_codec = primary_audio.map(|t| t.codec.clone())`, `info.audio_channels = primary_audio.and_then(|t| t.channels)`.
   - Add `pub async fn probe_audio_streams<P: AsRef<Path>>(path: P) -> Result<Vec<AudioStreamInfo>>` using `Command::new("ffprobe")` with `cmd.kill_on_drop(true)` and `tokio::time::timeout(std::time::Duration::from_secs(15), cmd.output())`.

4. **`crates/kadr-storage` (`013_audio_tracks.sql`, `migrations.rs`, `media_item_repo.rs`, `widget_queries.rs`):**
   - `013_audio_tracks.sql`: `ALTER TABLE media_items ADD COLUMN audio_tracks_json TEXT;`
   - Register in `migrations.rs`.
   - In `media_item_repo.rs`:
     - Append `, audio_tracks_json` to `SELECT_COLUMNS`.
     - In `batch_upsert`: include `audio_tracks_json` (`?18`), serializing `None` when `item.technical.audio_tracks.is_empty()` and `Some(json)` when non-empty; in `ON CONFLICT(file_path) DO UPDATE SET`, use `audio_tracks_json = COALESCE(excluded.audio_tracks_json, media_items.audio_tracks_json)` so re-scanning with `use_ffprobe = false` never wipes previously probed tracks!
     - Add `pub async fn update_audio_tracks(&self, item_id: i64, tracks: &[AudioStreamInfo]) -> Result<()>`.
     - In `map_media_item_row` (both `media_item_repo.rs` and `widget_queries.rs`), read by column name:
       ```rust
       let audio_tracks: Vec<kadr_core::models::AudioStreamInfo> = row
           .get::<_, Option<String>>("audio_tracks_json")
           .ok()
           .flatten()
           .and_then(|s| serde_json::from_str(&s).ok())
           .unwrap_or_default();
       ```
       and include `m.audio_tracks_json` in `widget_queries.rs` `MEDIA_ITEM_COLS` (reading by column name with `.ok()` also keeps `playlist_repo.rs` positional indices `17`/`18` 100% intact!).

5. **`crates/kadr-server/src/api/audio_routes.rs`, `hls_routes.rs`, and `api/mod.rs`:**
   - Implement `AudioProbeService` (`Clone`, holding `probed_items: Arc<std::sync::Mutex<HashSet<i64>>>` and `in_flight: Arc<std::sync::Mutex<HashMap<i64, Arc<tokio::sync::Mutex<()>>>>>` with singleflight cleanup matching `SubtitleDeliveryService`):
     - `pub async fn list_or_probe_audio_tracks(&self, media_repo: &MediaItemRepository, item: &MediaItem) -> Vec<AudioStreamInfo>`
     - Handler `pub async fn list_audio_tracks(...)` for `GET /api/v1/items/{item_id}/audio-tracks` enforcing `AuthUser` and `UnlockedLibraries` (`403 LIBRARY_LOCKED`).
   - Register `Extension(Arc::new(AudioProbeService::new()))` and `.route("/api/v1/items/{item_id}/audio-tracks", get(audio_routes::list_audio_tracks))` in `crates/kadr-server/src/api/mod.rs`.
   - In `crates/kadr-server/src/api/hls_routes.rs` (`master_playlist`):
     - Accept `audio_probe: Option<Extension<Arc<crate::api::audio_routes::AudioProbeService>>>`.
     - Build `let mut effective_tech = item.technical.clone();`: if `params.audio_track_index > 0 && effective_tech.audio_tracks.is_empty()` and `item.plugin_ref().is_none() && !item.is_live()`, populate `effective_tech.audio_tracks = audio_probe_svc.list_or_probe_audio_tracks(&media_repo, &item).await`.
     - If `!effective_tech.audio_tracks.is_empty() && !effective_tech.audio_tracks.iter().any(|t| t.audio_index == params.audio_track_index)`, return `(StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": "Invalid audio_track index" }))).into_response()`.
     - Pass `&effective_tech` into `session_mgr.get_or_create_session_for_source(...)`.

- [ ] **Step 4: Run `cargo test`, `clippy`, and build release binary (GREEN)**

Run in `/home/boody/work/personal/kadr`:
`cargo test --workspace && cargo clippy --all-targets -- -D warnings && cargo build --release --bin kadr`
Expected: PASS (100% green, 0 clippy warnings, `/home/boody/work/personal/kadr/target/release/kadr` compiled).

- [ ] **Step 5: Commit Task 1 in `/home/boody/work/personal/kadr`**

```bash
git -C /home/boody/work/personal/kadr add crates/
git -C /home/boody/work/personal/kadr commit -m "feat(audio): probe multi-audio streams, expose audio-tracks API, and fix HLS track codec selection"
```

---

### Task 2: Client Audio Types, API, Preferences & Hybrid Driver Track Selection (`kadr-tizenos`)

**Working Directory:** `/home/boody/work/personal/kadr-tizenos`

**Files:**
- Modify: `src/types/kadr.ts:73-90`
- Modify: `src/api/items.ts:15-35`
- Create: `src/api/audio.ts`
- Create: `src/player/audioPreferences.ts`
- Modify: `src/player/compatibility.ts:7-22,128-140`
- Modify: `src/player/driver.ts:10-44`
- Modify: `src/player/avplay-driver.ts:250-265,560-655,705-755`
- Modify: `src/player/html5-driver.ts:175-205`
- Create: `tests/player/audioPreferences.test.ts`
- Modify: `tests/player/driver.test.ts`

**Interfaces:**
- Produces:
  - `src/types/kadr.ts`: `export interface AudioStreamInfo { audio_index: number; stream_index: number; codec: string; channels?: number; language: string; title?: string; is_default?: boolean; is_commentary?: boolean; }` (and `audio_tracks?: AudioStreamInfo[]` on `MediaItemDetail['technical']`)
  - `src/api/audio.ts`: `export async function fetchItemAudioTracks(client: ApiClient, itemId: number | string): Promise<AudioStreamInfo[]>`
  - `src/player/audioPreferences.ts`:
    - `export type AudioPreference = { mode: 'auto' } | { mode: 'language'; language: string; preferCommentary?: boolean };`
    - `export const AUDIO_PREFERENCE_STORAGE_KEY = 'kadr_audio_preference_v1';`
    - `export function loadAudioPreference(): AudioPreference`
    - `export function saveAudioPreference(pref: AudioPreference): void`
    - `export function pickInitialAudioTrackIndex(tracks: AudioStreamInfo[], pref: AudioPreference): number`
    - `export function formatAudioChannelLayout(channels?: number | null): string`
    - `export function formatAudioTrackLabel(track: AudioStreamInfo): { primaryLabel: string; codecBadge: string; languageBadge: string; isDefault: boolean; isCommentary: boolean }`
  - `PlaybackStreamOptions.audioTrackIndex?: number` (`src/player/compatibility.ts`)
  - `VideoLayoutHints.initialAudioIndex?: number; initialAudioStreamIndex?: number;` and `PlayerDriver.selectAudioTrack?(audioIndex: number, streamIndex?: number): boolean;`

- [ ] **Step 1: Write failing unit tests in `tests/player/audioPreferences.test.ts` and `tests/player/driver.test.ts`**

1. Create `tests/player/audioPreferences.test.ts` testing:
   - `loadAudioPreference` / `saveAudioPreference` round-trip and malformed JSON fallback to `{ mode: 'auto' }`.
   - `pickInitialAudioTrackIndex`:
     - `'auto'` picks `is_default` track (`audio_index: 1`), falling back to `tracks[0]`.
     - `{ mode: 'language', language: 'ja' }` matches `'jpn'` via ISO-639 normalization, preferring main dialogue over `is_commentary: true` unless `preferCommentary: true`, and falls back to `is_default` when language is absent.
   - `formatAudioChannelLayout` (`1 -> 'Mono'`, `2 -> '2.0'`, `6 -> '5.1'`, `8 -> '7.1'`) and `formatAudioTrackLabel` (`"Japanese"`, `"5.1 EAC3"`, `"JPN"`).
   - `getPlaybackUrl`: omits `audio_track` when `audioTrackIndex` is `undefined` or `0`, and appends `audio_track=1` on HLS URLs when `audioTrackIndex === 1`.
   - `fetchItemAudioTracks`: calls `GET /api/v1/items/42/audio-tracks`.
2. Add tests to `tests/player/driver.test.ts`:
   - `TizenAvplayDriver`:
     - Applies `initialAudioIndex: 1` inside `prepareAsync` on Direct Play via `avplay.getTotalTrackInfo()` + `avplay.setSelectTrack('AUDIO', 2)`.
     - `selectAudioTrack(1, 2)` switches natively in `PLAYING` state and returns `true`; re-applies selected track inside `restore(30000, false)` after Smart Hub suspend; returns `false` on HLS `.m3u8` streams or when `setSelectTrack` throws.
   - `Html5PlayerDriver`:
     - `selectAudioTrack` returns `false` when `video.audioTracks` is undefined, and toggles `audioTracks[i].enabled` returning `true` when `video.audioTracks` is present.

- [ ] **Step 2: Run Vitest on audio preference & driver tests to verify failure (RED)**

Run: `npx vitest run tests/player/audioPreferences.test.ts tests/player/driver.test.ts`
Expected: FAIL (`Cannot find module '../../src/player/audioPreferences'`).

- [ ] **Step 3: Implement `audio.ts`, `audioPreferences.ts`, `compatibility.ts`, and driver `selectAudioTrack`**

1. Add `AudioStreamInfo` to `src/types/kadr.ts` (and `audio_tracks?: AudioStreamInfo[]` on `MediaItemDetail['technical']` and `TechnicalMetadata` in `src/api/items.ts` if duplicated there).
2. Create `src/api/audio.ts`:
   ```ts
   import { ApiClient } from './client';
   import { AudioStreamInfo } from '../types/kadr';

   export async function fetchItemAudioTracks(
     client: ApiClient,
     itemId: number | string
   ): Promise<AudioStreamInfo[]> {
     return client.fetch<AudioStreamInfo[]>(
       `/api/v1/items/${encodeURIComponent(String(itemId))}/audio-tracks`
     );
   }
   ```
3. Create `src/player/audioPreferences.ts` implementing `loadAudioPreference`, `saveAudioPreference`, `pickInitialAudioTrackIndex`, `formatAudioChannelLayout`, and `formatAudioTrackLabel` (reusing `normalizeSubtitleLanguageCode` and `getSubtitleLanguageName` from `./subtitles`).
4. Update `src/player/compatibility.ts`: add `audioTrackIndex?: number` to `PlaybackStreamOptions`, and inside `if (isHls)`:
   ```ts
   if (options.audioTrackIndex !== undefined && options.audioTrackIndex > 0) {
     params.set('audio_track', String(Math.floor(options.audioTrackIndex)));
   }
   ```
5. Update `src/player/driver.ts`, `src/player/avplay-driver.ts`, and `src/player/html5-driver.ts`:
   - Add `initialAudioIndex?: number; initialAudioStreamIndex?: number;` to `VideoLayoutHints` and `selectAudioTrack?(audioIndex: number, streamIndex?: number): boolean;` to `PlayerDriver`.
   - In `TizenAvplayDriver`: track `selectedAudioIndex` & `selectedStreamIndex`, implement `applyNativeAudioSelection(avplay, audioIndex, streamIndex)` using `avplay.getTotalTrackInfo?.()` (`String(t.type).toUpperCase() === 'AUDIO'`, matching `audioEntries[audioIndex]` or `Number(t.index) === streamIndex`) + `avplay.setSelectTrack('AUDIO', Number(entry.index))`, invoke in `prepareAsync` (when `!isHls && this.selectedAudioIndex > 0`), in `selectAudioTrack`, and in `restore()` (when `!this.currentIsHls && this.selectedAudioIndex > 0`).
   - In `Html5PlayerDriver`: implement `selectAudioTrack(audioIndex: number): boolean` checking `(this.video as any)?.audioTracks`.

- [ ] **Step 4: Run Vitest & `tsc -b` to verify GREEN**

Run: `npx vitest run tests/player/audioPreferences.test.ts tests/player/driver.test.ts tests/player/compatibility.test.ts && npx tsc -b`
Expected: PASS (100% green, `tsc -b` exit 0).

- [ ] **Step 5: Commit Task 2**

```bash
git add src/types/kadr.ts src/api/items.ts src/api/audio.ts src/player/audioPreferences.ts src/player/compatibility.ts src/player/driver.ts src/player/avplay-driver.ts src/player/html5-driver.ts tests/player/audioPreferences.test.ts tests/player/driver.test.ts
git commit -m "feat(player): add audio track preferences, HLS param, and native driver selection"
```

---

### Task 3: `<AudioTrackModal>` & `PlayerOSD` `"Audio"` Selector UI (`kadr-tizenos`)

**Working Directory:** `/home/boody/work/personal/kadr-tizenos`

**Files:**
- Create: `src/components/player/AudioTrackModal.tsx`
- Modify: `src/components/osd/PlayerOSD.tsx:10-65,175-180,270-366`
- Create: `tests/components/player/AudioTrackModal.test.tsx`
- Modify: `tests/components/PlayerOSD.test.tsx`

**Interfaces:**
- Consumes: `AudioStreamInfo` from `src/types/kadr.ts`, `formatAudioTrackLabel` from `src/player/audioPreferences.ts`
- Produces:
  - `src/components/player/AudioTrackModal.tsx`:
    `export interface AudioTrackModalProps { isOpen: boolean; audioTracks: AudioStreamInfo[]; selectedAudioTrackIndex: number; onSelectAudioTrack: (audioIndex: number) => void; onClose: () => void; }`
  - `PlayerOsdFocusItem = 'progress' | 'prev' | 'next' | 'audio' | 'subtitles'`
  - `PlayerOSDProps`: `audioTracks?: AudioStreamInfo[]; selectedAudioTrackIndex?: number; onOpenAudioModal?: () => void;`

- [ ] **Step 1: Write failing unit tests in `tests/components/player/AudioTrackModal.test.tsx` and the existing `PlayerOSD` test file**

1. Create `tests/components/player/AudioTrackModal.test.tsx`:
   - Renders zero `gap-*` classes.
   - Pushes FocusContext trap `'audio-modal'` and focuses the currently active track button (`audio-track-btn-1`) on open.
   - Displays formatted labels and badges (`Japanese`, `2.0 AAC`, `Default`, `English`, `5.1 EAC3`, `Commentary`, `Active`).
   - Navigates via `ArrowUp` / `ArrowDown` and selects a track on `Enter` (calling `onSelectAudioTrack(0)` and `onClose()`).
   - Dismisses on `TVKeys.BACK_TIZEN` (`10009`) with `stopImmediatePropagation()` without invoking parent listeners.
2. Add tests to `PlayerOSD` test file:
   - Hides `data-testid="audio-button"` when `audioTracks` is undefined or has length `1`.
   - Renders `data-testid="audio-button"` (showing active language code e.g. `JPN` and focus ring when `focusedItem === 'audio'`) immediately before `subtitles-button` when `audioTracks.length >= 2`, with zero `gap-*` classes.

- [ ] **Step 2: Run Vitest on `AudioTrackModal` & `PlayerOSD` tests to verify failure (RED)**

Run: `npx vitest run tests/components/player/AudioTrackModal.test.tsx`
Expected: FAIL (`Cannot find module '../../../src/components/player/AudioTrackModal'`).

- [ ] **Step 3: Implement `AudioTrackModal.tsx` and update `PlayerOSD.tsx`**

1. Create `src/components/player/AudioTrackModal.tsx`:
   - Uses `FocusContext` (`pushTrap('audio-modal')` / `popTrap('audio-modal')`), focuses `audio-track-btn-${selectedAudioTrackIndex}` (falling back to first track button) on open.
   - Capture-phase `window.addEventListener('keydown', ..., true)` guarded by `(focusCtx?.getActiveTrap?.() ?? activeTrapRef.current) === 'audio-modal'`:
     - `BACK_TIZEN` / `Escape` / `Backspace`: `e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); onClose();`
     - `ArrowUp` / `ArrowDown`: cycles cleanly through `focusOrderIds` (`[...audioTracks.map(t => \`audio-track-btn-${t.audio_index}\`), 'audio-modal-close-btn']`), syncing both `setFocusedId` and DOM `.focus()`.
   - Renders each track button (`TVButton` with `groupId="audio-modal"`) showing `primaryLabel`, `codecBadge`, `Default` badge, `Commentary` badge, and `Active` indicator, with explicit `mb-2.5`, `mr-3`, `ml-2` margins (**zero `gap-*` classes**).
2. Update `src/components/osd/PlayerOSD.tsx`:
   - Extend `PlayerOsdFocusItem = 'progress' | 'prev' | 'next' | 'audio' | 'subtitles'`.
   - Add `audioTracks?: AudioStreamInfo[]`, `selectedAudioTrackIndex?: number`, `onOpenAudioModal?: () => void`.
   - `const hasAudio = Boolean(audioTracks && audioTracks.length >= 2 && onOpenAudioModal);`
   - Update `hasControlsRow = Boolean(onPrevious || onNext || hasAudio || hasSubtitles);` and button right margins (`mr-4` when a subsequent button exists, zero `gap-*`).
   - Render `id="btn-audio"` (`data-testid="audio-button"`) before `btn-subtitles` with an `AUDIO` badge + `"Audio"` + active track uppercase language tag (when `languageBadge && languageBadge !== 'UND'`).

- [ ] **Step 4: Run Vitest & `tsc -b` to verify GREEN**

Run: `npx vitest run tests/components/player/AudioTrackModal.test.tsx tests/components/PlayerOSD.test.tsx && npx tsc -b`
Expected: PASS (100% green, `tsc -b` exit 0).

- [ ] **Step 5: Commit Task 3**

```bash
git add src/components/player/AudioTrackModal.tsx src/components/osd/PlayerOSD.tsx tests/components/player/AudioTrackModal.test.tsx tests/components/PlayerOSD.test.tsx
git commit -m "feat(osd): add AudioTrackModal and PlayerOSD multi-audio selector button"
```

---

### Task 4: `PlayerScreen` Multi-Audio Discovery, Live Track Switching & Language Persistence (`kadr-tizenos`)

**Working Directory:** `/home/boody/work/personal/kadr-tizenos`

**Files:**
- Modify: `src/screens/PlayerScreen.tsx`
- Create: `tests/screens/PlayerScreen.audio.test.tsx`

**Interfaces:**
- Consumes: `fetchItemAudioTracks`, `loadAudioPreference`, `saveAudioPreference`, `pickInitialAudioTrackIndex`, `AudioTrackModal`, `PlayerOSD` (`audioTracks`, `selectedAudioTrackIndex`, `onOpenAudioModal`), `PlayerDriver.selectAudioTrack`

- [ ] **Step 1: Write failing integration tests in `tests/screens/PlayerScreen.audio.test.tsx`**

Create `tests/screens/PlayerScreen.audio.test.tsx` testing:
1. **OSD visibility & modal navigation:** Single-audio item hides `audio-button`; dual-audio item (`Japanese 2.0 AAC` + `English 5.1 EAC3`) shows `audio-button`; pressing `ArrowDown` on OSD progress bar focuses `'audio'` (before `'subtitles'`), `Enter` opens `<AudioTrackModal>`, `BACK_TIZEN` closes `<AudioTrackModal>` without exiting `PlayerScreen`.
2. **Direct Play instant native `AVPlay` switch:** On a Direct-Playable MP4 (`h264` + `aac` + `ac3`), selecting Track `1` in `<AudioTrackModal>` calls `avplay.setSelectTrack('AUDIO', 2)` in-place without restarting/re-opening the stream, and persists `kadr_audio_preference_v1` (`language: 'eng'`).
3. **Direct Play -> HLS automatic fallback when secondary track codec is unsupported (or HTML5 lacks `audioTracks`):** When Track `0` is `aac` (Direct Play) and Track `1` is `dts` (unsupported on Samsung TV), selecting Track `1` switches `PlayerScreen` to HLS (`/api/v1/media/{id}/hls/master.m3u8?...&audio_track=1&start_time=...`) preserving current playback timestamp!
4. **HLS mid-stream audio track switch:** While playing HLS at `45s`, selecting Track `1` opens a new HLS session with `audio_track=1` and `start_time=45.000` (and deletes the old HLS session cleanly).
5. **Preferred audio language memory across episodes:** With `kadr_audio_preference_v1` set to `jpn` (`preferCommentary: false`), mounting `PlayerScreen` on the next episode (`[0: eng default, 1: jpn commentary, 2: jpn main]`) auto-selects Track `2` (`jpn` main dialogue, skipping commentary!).

- [ ] **Step 2: Run Vitest on `PlayerScreen.audio.test.tsx` to verify failure (RED)**

Run: `npx vitest run tests/screens/PlayerScreen.audio.test.tsx`
Expected: FAIL (`Unable to find an element by: [data-testid="audio-button"]`).

- [ ] **Step 3: Wire multi-audio discovery, hybrid switching, OSD controls, and `<AudioTrackModal>` in `src/screens/PlayerScreen.tsx`**

1. Add state & refs in `PlayerScreen.tsx`:
   - `const [audioTracks, setAudioTracks] = useState<AudioStreamInfo[]>(() => technical?.audio_tracks ?? []);` (`audioTracksRef`)
   - `const [selectedAudioTrackIndex, setSelectedAudioTrackIndex] = useState<number>(() => pickInitialAudioTrackIndex(technical?.audio_tracks ?? [], loadAudioPreference()));` (`selectedAudioTrackIndexRef`)
   - `const [isAudioModalOpen, setIsAudioModalOpen] = useState(false);` (`isAudioModalOpenRef`)
   - Reset `audioTracks`, `selectedAudioTrackIndex`, and `isAudioModalOpen(false)` when `itemId` changes.
2. Fetch audio tracks on `itemId` mount (`fetchItemAudioTracks(apiClient, numericItemId)`):
   - Ignore empty/failed responses silently (falling back to `detail.technical?.audio_tracks ?? []`).
   - Compute `initialIdx = pickInitialAudioTrackIndex(tracks, loadAudioPreference())`.
   - Set `setAudioTracks(tracks)` and `setSelectedAudioTrackIndex(initialIdx)`.
   - If `initialIdx > 0`:
     - Find `chosen = tracks.find((t) => t.audio_index === initialIdx)`.
     - If `!isHlsRef.current`:
       - Check `const trackSupported = isSupportedOnSamsungTv(activeTech?.video_codec, chosen?.codec, activeTech?.container, forceHtml5 || isBrowserEnv);`
       - If `!trackSupported`: set `seamlessSwapRef.current = true`, `hlsSeekOffsetMsRef.current = positionMsRef.current`, `setHlsSeekOffsetMs(positionMsRef.current)`, `setUseHls(true)`.
       - Else if `isDriverInitializedRef.current`: call `const switched = driverRef.current?.selectAudioTrack?.(initialIdx, chosen?.stream_index) ?? false;` — if `!switched`, switch to HLS at `positionMsRef.current`!
3. Pass `audioTrackIndex: selectedAudioTrackIndex` into `getPlaybackUrl(...)` and pass `initialAudioIndex: selectedAudioTrackIndex, initialAudioStreamIndex: activeAudioTrack?.stream_index` inside `mediaHints` to `driver.init(...)` (if `!isHls` and `selectedAudioTrackIndex > 0` on a driver where `driver.name === 'HTML5 Video'` without `video.audioTracks`, `PlayerScreen` can also force `useHls = true` when `selectedAudioTrackIndex > 0 && (forceHtml5 || isBrowserEnv)` unless native `audioTracks` exists!). Include `selectedAudioTrackIndex` in the main playback `useEffect` dependency array ONLY via HLS reload / explicit `reloadKey`?
   - **Important:** Do **NOT** put `selectedAudioTrackIndex` directly into the driver `useEffect` dependency array if Direct Play `selectAudioTrack` switches in-place without reloading the driver! Instead, read `selectedAudioTrackIndexRef.current` inside `getPlaybackUrl` / `initDriver`, and bump `setReloadKey((k) => k + 1)` (or `setUseHls(true)`) explicitly in `handleSelectAudioTrack` / initial HLS switch whenever a stream reload is required! That guarantees Direct Play `avplay.setSelectTrack` switches with **zero** driver teardown/re-init!
4. Implement `handleSelectAudioTrack(audioIndex: number)`:
   - Close modal (`setIsAudioModalOpen(false)`).
   - Find `chosen = audioTracksRef.current.find((t) => t.audio_index === audioIndex)`.
   - If `chosen?.language && chosen.language.toLowerCase() !== 'und'`, call `saveAudioPreference({ mode: 'language', language: chosen.language, preferCommentary: Boolean(chosen.is_commentary) })`.
   - If `audioIndex === selectedAudioTrackIndexRef.current`, return.
   - Update `selectedAudioTrackIndexRef.current = audioIndex` and `setSelectedAudioTrackIndex(audioIndex)`.
   - If `!isHlsRef.current`:
     - Check `const activeTech = technicalInfoRef.current ?? technical;`
     - `const supported = isSupportedOnSamsungTv(activeTech?.video_codec, chosen?.codec, activeTech?.container, forceHtml5 || isBrowserEnv);`
     - If `supported && (driverRef.current?.selectAudioTrack?.(audioIndex, chosen?.stream_index) ?? false)`: return immediately (0ms hardware switch!).
   - Otherwise (HLS stream, unsupported Direct Play audio codec, or HTML5 fallback):
     - `const resumePos = positionMsRef.current;`
     - `seamlessSwapRef.current = true;`
     - `hlsSeekOffsetMsRef.current = resumePos;`
     - `setHlsSeekOffsetMs(resumePos);`
     - If `!isHlsRef.current`, `setUseHls(true);`
     - `setReloadKey((k) => k + 1);`
5. Update OSD controls & modal guards in `PlayerScreen.tsx`:
   - Include `isAudioModalOpenRef.current` in `isModalOpen` and `resetOsdTimer` so OSD stays paused while `<AudioTrackModal>` is open and Back/D-pad keys don't leak into `PlayerScreen`.
   - Build `osdControls` helper: `['prev' (if enabled), 'next' (if enabled), 'audio' (if audioTracksRef.current.length >= 2), 'subtitles']` used identically in `ArrowDown`, `ArrowLeft`, `ArrowRight`, and `Enter` (`osdFocusedItemRef.current === 'audio' -> setIsAudioModalOpen(true)`).
   - Pass `audioTracks={audioTracks}`, `selectedAudioTrackIndex={selectedAudioTrackIndex}`, and `onOpenAudioModal={() => setIsAudioModalOpen(true)}` to `<PlayerOSD>`, and render `<AudioTrackModal>` when `isAudioModalOpen` is true.

- [ ] **Step 4: Run zero-gap check, full Vitest suite, `chrome69` build, and `.wgt` packaging (GREEN)**

Run:
1. `(! grep -rn "gap-" src/api/audio.ts src/player/audioPreferences.ts src/player/compatibility.ts src/player/driver.ts src/player/avplay-driver.ts src/player/html5-driver.ts src/components/player/AudioTrackModal.tsx src/components/osd/PlayerOSD.tsx src/screens/PlayerScreen.tsx)`
2. `npm test -- --run`
3. `npm run build && npm run package:wgt -- --no-build`
Expected: 100% test suites passing, 0 `gap-*` matches, `chrome69` build green, and `kadr.wgt` signed cleanly.

- [ ] **Step 5: Commit Task 4**

```bash
git add src/screens/PlayerScreen.tsx tests/screens/PlayerScreen.audio.test.tsx
git commit -m "feat(player): wire multi-audio discovery, hybrid AVPlay/HLS switching, and language memory"
```
