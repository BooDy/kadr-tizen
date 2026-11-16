# MKV Embedded Subtitle ("Translations") Detection & Rendering — Design Specification

**Date:** 2026-11-16
**Target Platforms:**
- **Backend:** Kadr Media Server (`/home/boody/work/personal/kadr`, Rust / Axum / SQLite / `ffprobe` + `ffmpeg`)
- **TV Client:** Kadr Samsung Tizen Client (`/home/boody/work/personal/kadr-tizenos`, Tizen 5.5 / Chromium 69 & Web Dev Harness)

---

## 1. Problem Statement

MKV (and MP4/WebM) video files routinely bundle embedded subtitle streams ("translations") inside the container—such as Arabic, English, Japanese, French, Signs & Songs, or Forced foreign-dialogue tracks. Currently, those embedded translations are neither detected nor rendered when playing MKVs on the Samsung TV:

1. **HLS Transcoding Strips Embedded Subtitle Streams:** Samsung Tizen TVs stream `.mkv` containers via Kadr's HLS transcoder (`/api/v1/media/{id}/hls/master.m3u8`), which maps video and audio into MPEG-TS segments without embedded subtitle streams. And even in Direct Play mode, `kadr-tizenos` silences `AVPlay`'s native subtitle renderer (`setSilentSubtitle(true)`) so `<SubtitleOverlay>` can render subtitles with user-configurable font size, color, placement, and `±delay` synchronization.
2. **Backend `ffprobe` Skips Subtitle Streams:** Although Kadr's SQLite `media_subtitles` table and `kadr_core::subtitles::SubtitleTrack` already define `SubtitleSource::Embedded` and `stream_index: Option<u32>`, `kadr-ingest`'s `ffprobe.rs` only inspects `video` and `audio` streams (`codec_type == "subtitle"` is ignored), and `worker.rs` deduplicates subtitles only by `(file_path, source)` rather than `(stream_index, source)` for embedded tracks.
3. **Already-Scanned MKVs Have Zero Embedded Rows:** Existing MKV items already in the user's SQLite database have not had their embedded subtitle streams indexed.
4. **Backend `SubtitleDeliveryService` Rejects Embedded Tracks:** `SubtitleDeliveryService::get_webvtt_path` (`crates/kadr-server/src/subtitles/service.rs`) requires a standalone `track.file_path` on disk; when `track.source == SubtitleSource::Embedded` (`file_path: None`, `stream_index: Some(idx)`), it returns `SubtitleServiceError::SourceFileNotFound` (`HTTP 404`) instead of extracting the container stream to WebVTT via `ffmpeg`.
5. **Client Track Selection, Labeling & RTL Rendering Gaps:**
   - `PlayerScreen` always resets to `tracks.find(t => t.is_default)` on every episode/movie instead of remembering the user's chosen language (e.g., Arabic `ara`) or explicit `Off` choice across episodes.
   - `SubtitleModal` and `PlayerOSD` do not badge `Embedded` / `Forced` tracks or normalize ISO-639 codes (`ara` -> `Arabic`), producing noisy labels like `Arabic (ara)` or `Track 4 (ara)`.
   - `<SubtitleOverlay>` lacks `dir="auto"` and `unicodeBidi: 'plaintext'`, causing RTL translations (Arabic, Hebrew, Persian) to misplace trailing punctuation (`!`, `?`, `.`, `-`), and `parseSubtitles` in `subtitles.ts` does not strip ASS vector drawing blocks (`{\p1}...{\p0}`) common in MKV fansubs/anime releases.

---

## 2. Goals & Non-Goals

### Goals
- Detect all text-based embedded subtitle streams (`subrip`/`srt`, `ass`/`ssa`, `webvtt`, `mov_text`, `text`) in MKV/MP4/WebM containers both **during library scans** and **lazily on-demand** in `GET /api/v1/items/{id}/subtitles` so existing library items work immediately without a manual library re-scan.
- Extract requested embedded subtitle streams on-demand via `ffmpeg` (`-map 0:<stream_index> -c:s webvtt`) into Kadr's subtitle WebVTT disk cache (`<cache_dir>/<subtitle_id>.vtt`) with per-track singleflight deduplication so concurrent requests never spawn duplicate `ffmpeg` processes.
- Remember the viewer's last subtitle preference (`language` or `Off`, defaulting to container `is_default` on first-ever use) across episodes and sessions in `kadr-tizenos`.
- Display clean, human-readable language labels and `Embedded` / `Forced` / `Default` badges in `SubtitleModal` and `PlayerOSD`, with zero CSS flexbox `gap-*` classes (100% Chromium 69 compatible).
- Render RTL (Arabic/Hebrew/Persian) and mixed-direction subtitle cues with proper punctuation ordering (`dir="auto"`, `unicodeBidi: 'plaintext'`) and clean ASS override/drawing stripping in `<SubtitleOverlay>`.

### Non-Goals
- Server-side video pixel burn-in or OCR for Blu-ray/DVD bitmap subtitle codecs (`hdmv_pgs_subtitle`, `dvd_subtitle`, `dvb_subtitle`, `xsub`). Non-text bitmap subtitle streams are explicitly skipped during text-subtitle indexing so unplayable/empty WebVTT tracks never clutter the TV subtitle menu.

---

## 3. Architecture & Data Flow

```
[MKV File on Disk]
       │
       ├── 1. Library Scan (kadr-ingest) OR Lazy Probe on GET /api/v1/items/{id}/subtitles
       │      ffprobe -show_streams -> extract text subtitle streams (index, lang, title, default, forced)
       │      -> persist SubtitleSource::Embedded rows in SQLite `media_subtitles`
       ▼
[kadr-tizenos PlayerScreen]
       │
       ├── 2. GET /api/v1/items/{id}/subtitles -> receives Sidecar + Embedded + Downloaded tracks
       │      Auto-selects track matching saved SubtitlePreference (language | off | first-run default)
       │
       ├── 3. GET /api/v1/subtitles/{subtitle_id}/stream.vtt
       │      SubtitleDeliveryService checks <cache_dir>/<subtitle_id>.vtt:
       │        • Cache hit -> streams immediately (<10ms)
       │        • Cache miss (Embedded) -> singleflight lock ->
       │          ffmpeg -nostdin -y -v error -i <media_path> -map 0:<stream_index> -c:s webvtt <tmp.vtt>
       │          -> atomic rename -> streams text/vtt
       ▼
[useSubtitleCues -> parseSubtitles -> <SubtitleOverlay dir="auto">]
       Renders styled, delay-synced, RTL-safe cues over AVPlay / HTML5 video
```

### 3.1 Kadr Server: Embedded Subtitle Probing (`kadr-ingest`)

1. **Supported Text Subtitle Codecs (`crates/kadr-ingest/src/probe/ffprobe.rs`):**
   - Add `probe_embedded_subtitles<P: AsRef<Path>>(path: P) -> Result<Vec<DiscoveredSubtitle>>` (and reuse the single `ffprobe` JSON output inside `run_ffprobe` / `probe_media` so library ingestion runs `ffprobe` **once** per file, not twice):
     - Inspect streams where `codec_type == "subtitle"`.
     - Map text-based `codec_name` values to `SubtitleFormat`:
       - `"subrip"` | `"srt"` | `"text"` | `"mov_text"` -> `SubtitleFormat::Srt`
       - `"ass"` | `"ssa"` -> `SubtitleFormat::Ass`
       - `"webvtt"` -> `SubtitleFormat::Vtt`
       - Any other codec (e.g. `"hdmv_pgs_subtitle"`, `"dvd_subtitle"`, `"dvb_subtitle"`, `"xsub"`) -> skip (do not emit `DiscoveredSubtitle`).
     - Extract `stream_index = stream["index"].as_u64().and_then(|i| u32::try_from(i).ok())` (skip stream if missing).
     - Normalize `tags.language` (case-insensitive, e.g. `"en"`/`"eng"` -> `"eng"`, `"ar"`/`"ara"` -> `"ara"`, `"fr"`/`"fre"`/`"fra"` -> `"fre"`, `"es"`/`"spa"` -> `"spa"`, `"de"`/`"ger"`/`"deu"` -> `"ger"`, `"ja"`/`"jpn"` -> `"jpn"`, `"ko"`/`"kor"` -> `"kor"`, `"zh"`/`"zho"`/`"chi"` -> `"chi"`, `"ru"`/`"rus"` -> `"rus"`, `"tr"`/`"tur"` -> `"tur"`, `"pt"`/`"por"` -> `"por"`, `"hi"`/`"hin"` -> `"hin"`, preserving valid 2–3 letter alpha codes or falling back to `"und"`).
     - Read dispositions:
       - `is_default = disposition["default"] == 1`
       - `is_forced = disposition["forced"] == 1`
       - `is_sdh = disposition["hearing_impaired"] == 1`
     - Construct `title`:
       - Prefer non-empty trimmed `tags.title` (or `tags.handler_name` only if meaningful and not generic `"SubtitleHandler"` / `"GPAC Streaming Text Handler"`).
       - Otherwise fall back to human language display name (e.g. `"Arabic"`, `"English"`, or uppercase code), appending `" [SDH]"` when `is_sdh` and not already present, or `" [Forced]"` when `is_forced` and not already present.
     - Emit `DiscoveredSubtitle { source: SubtitleSource::Embedded, language, title: Some(title), format, file_path: None, stream_index: Some(idx), is_default, is_forced }`.

2. **Ingest Pipeline & Deduplication (`crates/kadr-ingest/src/watcher/pipeline.rs` & `worker.rs`):**
   - `IngestPipeline::process_file` merges embedded `DiscoveredSubtitle` entries (from `ffprobe`) with sidecar `DiscoveredSubtitle` entries (from `sidecar_scanner.find_subtitles(path)`).
   - In `worker.rs` (`lines 262-270`), update duplicate filtering before `sub_repo.batch_insert`:
     - For `SubtitleSource::Embedded`: consider existing if `e.source == SubtitleSource::Embedded && e.stream_index == t.stream_index`.
     - For `SubtitleSource::Sidecar` / `Downloaded`: keep `e.source == t.source && e.file_path == t.file_path`.

### 3.2 Kadr Server: Lazy On-Demand Discovery & Cached `ffmpeg` Extraction (`kadr-server`)

1. **Lazy Discovery for Existing Media Items (`SubtitleDeliveryService::ensure_embedded_probed`):**
   - Hold `probed_embedded_items: Arc<Mutex<HashSet<i64>>>` inside `SubtitleDeliveryService`.
   - When `list_subtitles` (`GET /api/v1/items/{item_id}/subtitles`) runs for a `MediaItem`:
     - Fetch `tracks = subtitle_repo.find_by_media_item(item_id)`.
     - If `tracks` already contains any `t.source == SubtitleSource::Embedded`, or `probed_embedded_items` already contains `item_id`, return `tracks` immediately with zero `ffprobe` overhead.
     - Otherwise, if the media file exists on disk and has a container extension capable of carrying text subtitle tracks (`.mkv`, `.mp4`, `.m4v`, `.webm`, `.mov`, `.avi`, `.ts`):
       - Run `kadr_ingest::probe::probe_embedded_subtitles(&item.file_path).await`.
       - Deduplicate by `(SubtitleSource::Embedded, stream_index)` against `tracks`, insert any new rows via `subtitle_repo.batch_insert(&new_tracks).await`, mark `item_id` in `probed_embedded_items`, and re-read `subtitle_repo.find_by_media_item(item_id)`.
       - Note: mark `item_id` in `probed_embedded_items` only when `probe_embedded_subtitles` succeeds (even if 0 tracks were found), so MKVs without embedded subtitles are probed at most once per server run while transient IO glitches can retry.

2. **On-Demand `ffmpeg` WebVTT Extraction (`SubtitleDeliveryService::get_webvtt_path`):**
   - Hold `in_flight_extractions: Arc<Mutex<HashMap<i64, Arc<tokio::sync::Mutex<()>>>>>` inside `SubtitleDeliveryService` so simultaneous requests for the same `subtitle_id` wait on a single extraction rather than spawning duplicate `ffmpeg` jobs.
   - After checking `<cache_dir>/<subtitle_id>.vtt`:
     - Acquire the per-`subtitle_id` async mutex and re-check `<cache_dir>/<subtitle_id>.vtt` (fast path if a peer request just populated it).
     - Branch on `track.source`:
       - **`Sidecar` / `Downloaded`**: existing file conversion path (`srt_to_webvtt_stream` / WebVTT pass-through, plus ASS-to-WebVTT support via `ffmpeg` when `track.format == SubtitleFormat::Ass` so sidecar/downloaded `.ass` files also convert cleanly to valid WebVTT on the server!).
       - **`Embedded`**:
         - Require `stream_index = track.stream_index.ok_or(SubtitleServiceError::SourceFileNotFound)?`.
         - Fetch parent `media_item = media_repo.find_by_id(track.media_item_id).await?.ok_or(SubtitleServiceError::SourceFileNotFound)?`.
         - Verify `tokio::fs::try_exists(&media_item.file_path).await` (else `SourceFileNotFound`).
         - Spawn `ffmpeg`:
           ```text
           ffmpeg -nostdin -y -v error -i <media_item.file_path> -map 0:<stream_index> -c:s webvtt -f webvtt <tmp_path>
           ```
           bounded by a `60s` timeout (`tokio::time::timeout`).
         - On exit code `0` and non-empty file, atomically `tokio::fs::rename(&tmp_path, &cached_path)` and return `Ok(cached_path)`. On failure/timeout, remove `tmp_path` and return `SubtitleServiceError::ExtractionFailed(String)` (`HTTP 500` with clear log).

3. **API Metadata Enhancement (`SubtitleTrackResponse` in `subtitle_routes.rs`):**
   - Add `#[serde(skip_serializing_if = "Option::is_none")] pub stream_index: Option<u32>` to `SubtitleTrackResponse` (backward-compatible optional field for diagnostics and UI).

### 3.3 Samsung Tizen Client (`kadr-tizenos`)

1. **Persistent Subtitle Language / Off Preference (`src/player/subtitleSettings.ts` & `src/screens/PlayerScreen.tsx`):**
   - Add `SubtitlePreference` to `src/player/subtitleSettings.ts`:
     ```ts
     export type SubtitlePreference =
       | { mode: 'auto' }
       | { mode: 'off' }
       | { mode: 'language'; language: string; preferForced?: boolean };
     ```
     stored under `kadr_subtitle_preference_v1` in `localStorage` (`loadSubtitlePreference` / `saveSubtitlePreference`, defaulting to `{ mode: 'auto' }`).
   - Add pure helper `pickInitialSubtitleTrack(tracks: SubtitleTrack[], pref: SubtitlePreference): number | null`:
     - `tracks.length === 0` -> `null`.
     - `pref.mode === 'off'` -> `null`.
     - `pref.mode === 'language'`:
       - Match tracks whose normalized language code matches `normalizeSubtitleLanguageCode(pref.language)` (treating 2-letter and 3-letter aliases equivalently, e.g. `ar` <-> `ara`, `en` <-> `eng`, `fr` <-> `fre`/`fra`, `es` <-> `spa`, `de` <-> `ger`/`deu`, `ja` <-> `jpn`).
       - Rank matching tracks: prefer `is_forced === Boolean(pref.preferForced)` first, then `is_default`, then non-SDH full dialogue over `[SDH]`/Signs, then first track order.
       - If **no** track matches the preferred language on this video, fall back to `tracks.find(t => t.is_default)?.id ?? null` (so watching a show in an unfamiliar language still activates its default translation rather than silently showing nothing).
     - `pref.mode === 'auto'` (first-ever use before user touches subtitles):
       - Return `tracks.find(t => t.is_default)?.id ?? null`.
   - Whenever the user explicitly selects a track in `SubtitleModal` or `PlayerOSD` (via a dedicated `handleUserSelectSubtitle(id: number | null)` handler in `PlayerScreen`):
     - If `id === null`: `saveSubtitlePreference({ mode: 'off' })`.
     - If `id !== null`: look up `track = subtitles.find(s => s.id === id)` and `saveSubtitlePreference({ mode: 'language', language: track.language, preferForced: Boolean(track.is_forced) })`.
   - When `itemId` changes (e.g. advancing to Episode 2), reset `selectedSubtitleId` to `null` before fetching Episode 2's tracks, then apply `pickInitialSubtitleTrack(tracks, loadSubtitlePreference())` so Episode 1's stale `subtitle_id` never leaks into Episode 2!

2. **Clean Track Formatting & Source Badges (`src/player/subtitles.ts`, `src/components/player/SubtitleModal.tsx`, `src/components/osd/PlayerOSD.tsx`):**
   - Add `formatSubtitleTrackLabel(track: SubtitleTrack): string` and `getSubtitleLanguageName(code?: string): string` in `src/player/subtitles.ts`:
     - Maps common ISO-639-1/2 codes (`ara`/`ar` -> `Arabic`, `eng`/`en` -> `English`, `fre`/`fra`/`fr` -> `French`, `spa`/`es` -> `Spanish`, `ger`/`deu`/`de` -> `German`, `ita`/`it` -> `Italian`, `jpn`/`ja` -> `Japanese`, `kor`/`ko` -> `Korean`, `chi`/`zho`/`zh` -> `Chinese`, `rus`/`ru` -> `Russian`, `tur`/`tr` -> `Turkish`, `por`/`pt` -> `Portuguese`, `hin`/`hi` -> `Hindi`).
     - Resolves `baseTitle = track.title?.trim() || getSubtitleLanguageName(track.language) || \`Track ${track.id}\``, formatting `${baseTitle} (${track.language})` in `SubtitleModal` (when `track.language` is non-empty and not `'und'`) so untitled MKV streams render `"Arabic (ara)"` instead of `"Track 4 (ara)"` while preserving existing titled track labels like `"English [Original] (eng)"`.
   - In `SubtitleModal.tsx` (`Current Tracks` tab) and `PlayerOSD.tsx` quick popup:
     - Render badges using explicit `ml-2` / `mr-2` margins (**zero `gap-*` classes**):
       - `Embedded` badge when `track.source === 'embedded'`
       - `Forced` badge when `track.is_forced`
       - `Default` badge when `track.is_default`

3. **RTL / Bidirectional Punctuation & ASS Drawing Cleanup (`src/components/player/SubtitleOverlay.tsx` & `src/player/subtitles.ts`):**
   - In `SubtitleOverlay.tsx`: set `dir="auto"` on the cue `<span data-testid="subtitle-overlay-text">` and `unicodeBidi: 'plaintext'` in `textStyle` (fully supported in Chromium 69!), ensuring each newline-separated cue line resolves its own RTL/LTR base direction so Arabic sentences render `!`, `?`, `.`, `,`, and `-` on the correct visual side.
   - In `src/player/subtitles.ts` (`cleanText`): strip ASS vector drawing sequences (`\{\\p[1-9]\d*\}[\s\S]*?(?:\{\\p0\}|$)`) before stripping standard `{...}` override tags so MKV ASS tracks containing decorative vector shapes never display coordinate numbers (`m 0 0 l 100 0 100 100`) as dialogue text, and unescape `\h` (ASS hard space) into `' '`.

---

## 4. Error Handling & Edge Cases

- **Large MKV First-Time Extraction Latency:** `ApiClient.fetchText` in `kadr-tizenos` uses standard `fetch` (no short 2s abort), while `useSubtitleCues` already exposes `loading: true` (`SubtitleModal` displays loading state) while video playback continues uninterrupted; once `ffmpeg` finishes, cues appear automatically at the current `positionMs`.
- **Episode Transition Isolation:** Resetting `subtitles` and `selectedSubtitleId` immediately on `itemId` change prevents `useSubtitleCues` from holding Episode 1's cues while Episode 2 loads.
- **Corrupt Stream or Unsupported Codec:** If `ffmpeg` fails to convert a malformed subtitle stream, Kadr logs the stderr reason, cleans up `tmp_path`, and returns `500`; `useSubtitleCues` catches the error cleanly and displays it inside `SubtitleModal` without interrupting video playback.
- **Sidecar `.ass` Bonus Fix:** Routing `SubtitleFormat::Ass` sidecar/downloaded files through `ffmpeg -c:s webvtt` (with fallback to text copy) in `SubtitleDeliveryService` prevents `srt_to_webvtt_stream` from mangling `.ass` files on the server.

---

## 5. Testing Strategy

1. **Kadr Backend Unit & Integration Tests (`cargo test` in `/home/boody/work/personal/kadr`):**
   - **`kadr-ingest` (`tests/probe_test.rs` & `watcher`):** Generate a real synthetic multi-track `.mkv` via `ffmpeg` (video + audio + embedded `subrip` Arabic + embedded `ass` English `[default]`) and verify `probe_embedded_subtitles` extracts exact `stream_index`, normalized `language`, `title`, `format`, `is_default`, and `is_forced`, while ignoring bitmap codecs (`dvd_subtitle` / `hdmv_pgs_subtitle`), and verify `worker` deduplication inserts multiple embedded tracks (`stream_index: 2`, `stream_index: 3`) on the same MKV without colliding on `file_path == None`.
   - **`kadr-server` (`tests/subtitle_routes_test.rs` & `tests/subtitle_service_test.rs`):**
     - Verify `GET /api/v1/items/{id}/subtitles` lazily probes an existing MKV item with zero prior DB subtitle rows, persists its embedded tracks, and returns them with `source: "embedded"`.
     - Verify `GET /api/v1/subtitles/{id}/stream.vtt` extracts the embedded MKV subtitle stream to valid `WEBVTT` cues via `ffmpeg` and serves subsequent requests from `<cache_dir>/<id>.vtt`.
2. **Tizen Client Unit & Integration Tests (`npm test -- --run` in `/home/boody/work/personal/kadr-tizenos`):**
   - **`tests/player/subtitles.test.ts`:** Verify `formatSubtitleTrackLabel`, ISO language normalization (`ara`/`ar` -> `Arabic`), ASS drawing command (`{\p1}...{\p0}`) and `\h` cleanup, and `pickInitialSubtitleTrack` across `auto`, `off`, and `language` modes.
   - **`tests/components/player/SubtitleOverlay.test.tsx` & `SubtitleModal.test.tsx`:** Verify `dir="auto"` + `unicodeBidi: 'plaintext'` on `<SubtitleOverlay>`, `Embedded` / `Forced` / `Default` badges in `SubtitleModal`, and zero `gap-*` classes.
   - **`tests/screens/PlayerScreen.subtitles.test.tsx`:** Verify selecting an embedded Arabic track persists `{ mode: 'language', language: 'ara' }`, switching `itemId` to Episode 2 auto-selects Episode 2's Arabic embedded track (without leaking Episode 1's track ID), and selecting `Off` keeps Episode 2 `Off`.
