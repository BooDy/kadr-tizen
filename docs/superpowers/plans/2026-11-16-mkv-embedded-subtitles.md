# MKV Embedded Subtitles Detection & Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect embedded text subtitle streams ("translations") inside MKV/MP4/WebM containers (both during library scans and lazily for existing items), extract them on-demand to cached WebVTT via `ffmpeg`, and render them on Samsung Tizen TVs with remembered language preferences, `Embedded`/`Forced` badges, ASS drawing cleanup, and RTL punctuation ordering.

**Architecture:** Extend `kadr-ingest` (`ffprobe`) and `kadr-server` (`SubtitleDeliveryService`) in `/home/boody/work/personal/kadr` to catalog container subtitle streams (`SubtitleSource::Embedded`, `stream_index`), lazily backfill existing MKVs on `GET /api/v1/items/{id}/subtitles`, and extract requested streams via `ffmpeg -map 0:<stream_index> -c:s webvtt` with singleflight locking and disk caching. Update `kadr-tizenos` in `/home/boody/work/personal/kadr-tizenos` to persist `SubtitlePreference` (`auto` | `off` | `language`), format untitled ISO language tracks cleanly with `Embedded`/`Forced`/`Default` badges, strip ASS vector drawings, and render `<SubtitleOverlay>` cues with `dir="auto"` and `unicodeBidi: 'plaintext'`.

**Tech Stack:** Rust 2021 (`tokio`, `axum`, `serde_json`, `rusqlite`, `ffprobe`/`ffmpeg`), React 19, TypeScript 5.7, Vite 6 (`chrome69` legacy bundle), Tailwind CSS 4, Vitest 3 + React Testing Library.

## Global Constraints

- **Two Repositories:**
  - Backend tasks (Tasks 1–2) execute in `/home/boody/work/personal/kadr`.
  - Tizen client tasks (Tasks 3–4) execute in `/home/boody/work/personal/kadr-tizenos`.
- **Samsung Tizen 5.5 / Chromium 69 Compatibility (`kadr-tizenos`):**
  - **Zero flex `gap-*` classes** in any new or modified JSX/CSS (use explicit margins such as `ml-2`, `mr-2`, `mr-3`).
  - Keep `<SubtitleOverlay>` styling compatible with Chromium 69 (`dir="auto"` + `unicodeBidi: 'plaintext'`).
- **Bitmap Subtitle Filtering:** Only index text-based container subtitle codecs (`subrip`, `srt`, `text`, `mov_text`, `ass`, `ssa`, `webvtt`); skip non-text bitmap codecs (`hdmv_pgs_subtitle`, `dvd_subtitle`, `dvb_subtitle`, `xsub`) so unconvertible tracks never appear in the TV menu.
- **Git Safety:** `/home/boody/work/personal/kadr-tizenos` contains unrelated unstaged working-tree changes; never run `git checkout`, `git restore`, `git reset`, `git clean`, or `git stash`, and do not sweep unrelated files into commits.

---

### Task 1: Embedded Subtitle Stream Probing & Multi-Track Ingest Deduplication (`kadr-ingest`)

**Working Directory:** `/home/boody/work/personal/kadr`

**Files:**
- Modify: `crates/kadr-ingest/src/sidecars/subtitles.rs:36-65`
- Modify: `crates/kadr-ingest/src/probe/ffprobe.rs:1-76`
- Modify: `crates/kadr-ingest/src/probe/mod.rs:1-43`
- Modify: `crates/kadr-ingest/src/watcher/pipeline.rs:72-82,169-188`
- Modify: `crates/kadr-ingest/src/watcher/worker.rs:258-278`
- Test: `crates/kadr-ingest/tests/probe_test.rs`
- Test: `crates/kadr-ingest/tests/pipeline_test.rs`

**Interfaces:**
- Produces (in `kadr_ingest::probe`):
  - `pub struct ProbedMedia { pub technical: TechnicalInfo, pub embedded_subtitles: Vec<DiscoveredSubtitle> }`
  - `pub async fn probe_embedded_subtitles<P: AsRef<Path>>(path: P) -> Result<Vec<DiscoveredSubtitle>>`
  - `pub fn parse_embedded_subtitles_from_json(json: &serde_json::Value) -> Vec<DiscoveredSubtitle>`
  - `TechnicalProber::probe_with_subtitles<P: AsRef<Path>>(&self, path: P) -> Result<(TechnicalInfo, Vec<DiscoveredSubtitle>)>`

- [ ] **Step 1: Write failing unit & integration tests in `crates/kadr-ingest/tests/probe_test.rs` and `crates/kadr-ingest/tests/pipeline_test.rs`**

Append to `crates/kadr-ingest/tests/probe_test.rs`:

```rust
use kadr_core::subtitles::{SubtitleFormat, SubtitleSource};
use kadr_ingest::probe::{
    ffprobe::parse_embedded_subtitles_from_json, probe_embedded_subtitles,
};
use serde_json::json;

#[test]
fn test_parse_embedded_subtitles_filters_bitmap_and_normalizes_metadata() {
    let sample = json!({
        "streams": [
            { "index": 0, "codec_type": "video", "codec_name": "h264", "width": 1920, "height": 1080 },
            { "index": 1, "codec_type": "audio", "codec_name": "aac", "channels": 2 },
            {
                "index": 2,
                "codec_type": "subtitle",
                "codec_name": "subrip",
                "disposition": { "default": 1, "forced": 0, "hearing_impaired": 0 },
                "tags": { "language": "ar", "title": "Arabic [Official]" }
            },
            {
                "index": 3,
                "codec_type": "subtitle",
                "codec_name": "ass",
                "disposition": { "default": 0, "forced": 1, "hearing_impaired": 1 },
                "tags": { "language": "en" }
            },
            {
                "index": 4,
                "codec_type": "subtitle",
                "codec_name": "hdmv_pgs_subtitle",
                "disposition": { "default": 0, "forced": 0 },
                "tags": { "language": "eng", "title": "PGS BluRay" }
            }
        ]
    });

    let subs = parse_embedded_subtitles_from_json(&sample);
    assert_eq!(subs.len(), 2, "PGS bitmap stream must be skipped");

    assert_eq!(subs[0].source, SubtitleSource::Embedded);
    assert_eq!(subs[0].stream_index, Some(2));
    assert_eq!(subs[0].language, "ara");
    assert_eq!(subs[0].title.as_deref(), Some("Arabic [Official]"));
    assert_eq!(subs[0].format, SubtitleFormat::Srt);
    assert!(subs[0].is_default);
    assert!(!subs[0].is_forced);
    assert!(subs[0].file_path.is_none());

    assert_eq!(subs[1].source, SubtitleSource::Embedded);
    assert_eq!(subs[1].stream_index, Some(3));
    assert_eq!(subs[1].language, "eng");
    assert_eq!(subs[1].title.as_deref(), Some("English [SDH] [Forced]"));
    assert_eq!(subs[1].format, SubtitleFormat::Ass);
    assert!(!subs[1].is_default);
    assert!(subs[1].is_forced);
}

#[tokio::test]
async fn test_probe_embedded_subtitles_on_real_mkv() {
    let dir = tempdir().unwrap();
    let srt_ar = dir.path().join("ar.srt");
    let srt_en = dir.path().join("en.srt");
    std::fs::write(&srt_ar, "1\n00:00:00,500 --> 00:00:01,500\nمرحبا!\n").unwrap();
    std::fs::write(&srt_en, "1\n00:00:00,500 --> 00:00:01,500\nHello!\n").unwrap();

    let mkv_path = dir.path().join("episode.mkv");
    let status = Command::new("ffmpeg")
        .args([
            "-y",
            "-v",
            "error",
            "-f",
            "lavfi",
            "-i",
            "color=c=black:s=320x240:d=2",
            "-f",
            "lavfi",
            "-i",
            "anullsrc=r=44100:cl=stereo:d=2",
            "-i",
            srt_ar.to_str().unwrap(),
            "-i",
            srt_en.to_str().unwrap(),
            "-map",
            "0:v:0",
            "-map",
            "1:a:0",
            "-map",
            "2:s:0",
            "-map",
            "3:s:0",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-c:s",
            "srt",
            "-metadata:s:s:0",
            "language=ara",
            "-metadata:s:s:0",
            "title=Arabic",
            "-disposition:s:0",
            "default",
            "-metadata:s:s:1",
            "language=eng",
            "-disposition:s:1",
            "0",
            mkv_path.to_str().unwrap(),
        ])
        .status();

    let Ok(st) = status else { return };
    if !st.success() {
        return;
    }

    let subs = probe_embedded_subtitles(&mkv_path).await.unwrap();
    assert_eq!(subs.len(), 2);
    assert_eq!(subs[0].language, "ara");
    assert_eq!(subs[0].stream_index, Some(2));
    assert!(subs[0].is_default);
    assert_eq!(subs[1].language, "eng");
    assert_eq!(subs[1].stream_index, Some(3));
}
```

- [ ] **Step 2: Run `cargo test -p kadr-ingest --test probe_test` to verify compilation failure (RED)**

Run: `cargo test -p kadr-ingest --test probe_test` (in `/home/boody/work/personal/kadr`)
Expected: FAIL (`unresolved imports kadr_ingest::probe::ffprobe::parse_embedded_subtitles_from_json, kadr_ingest::probe::probe_embedded_subtitles`).

- [ ] **Step 3: Implement embedded subtitle probing in `ffprobe.rs`, `probe/mod.rs`, `pipeline.rs`, and multi-stream deduplication in `worker.rs`**

1. In `crates/kadr-ingest/src/sidecars/subtitles.rs`, expand `language_display_name` and `map_known_language` with `"rus"`/`"ru"` (`"Russian"`), `"tur"`/`"tr"` (`"Turkish"`), `"por"`/`"pt"` (`"Portuguese"`), `"hin"`/`"hi"` (`"Hindi"`), and expose `pub(crate) fn normalize_language_tag(raw: &str) -> String` and `pub(crate) fn language_display_name(lang: &str) -> &'static str`:
   ```rust
   pub(crate) fn normalize_language_tag(raw: &str) -> String {
       let trimmed = raw.trim().to_ascii_lowercase();
       if trimmed.is_empty() {
           return "und".to_string();
       }
       let primary = trimmed.split(['-', '_']).next().unwrap_or(&trimmed);
       if let Some(canonical) = map_known_language(primary) {
           return canonical.to_string();
       }
       if (primary.len() == 2 || primary.len() == 3)
           && primary.chars().all(|c| c.is_ascii_alphabetic())
       {
           return primary.to_string();
       }
       "und".to_string()
   }
   ```

2. In `crates/kadr-ingest/src/probe/ffprobe.rs`:
   ```rust
   use crate::error::Result;
   use crate::sidecars::subtitles::{language_display_name, normalize_language_tag};
   use crate::sidecars::DiscoveredSubtitle;
   use kadr_core::models::TechnicalInfo;
   use kadr_core::subtitles::{SubtitleFormat, SubtitleSource};
   use serde_json::Value;
   use std::path::Path;
   use std::process::Stdio;
   use tokio::process::Command;

   #[derive(Debug, Clone, Default)]
   pub struct FfprobeOutput {
       pub technical: TechnicalInfo,
       pub embedded_subtitles: Vec<DiscoveredSubtitle>,
   }

   fn disposition_flag(stream: &Value, key: &str) -> bool {
       stream["disposition"][key].as_i64() == Some(1)
           || stream["disposition"][key].as_str() == Some("1")
   }

   fn map_subtitle_codec(codec_name: &str) -> Option<SubtitleFormat> {
       match codec_name.trim().to_ascii_lowercase().as_str() {
           "subrip" | "srt" | "text" | "mov_text" | "tx3g" => Some(SubtitleFormat::Srt),
           "ass" | "ssa" => Some(SubtitleFormat::Ass),
           "webvtt" | "vtt" => Some(SubtitleFormat::Vtt),
           _ => None,
       }
   }

   fn is_generic_handler_title(title: &str) -> bool {
       let lower = title.trim().to_ascii_lowercase();
       lower.is_empty()
           || lower == "subtitlehandler"
           || lower == "gpac streaming text handler"
           || lower == "sbtl"
   }

   pub fn parse_embedded_subtitles_from_json(json: &Value) -> Vec<DiscoveredSubtitle> {
       let mut out = Vec::new();
       let Some(streams) = json["streams"].as_array() else {
           return out;
       };

       for stream in streams {
           if stream["codec_type"].as_str() != Some("subtitle") {
               continue;
           }
           let Some(codec_name) = stream["codec_name"].as_str() else {
               continue;
           };
           let Some(format) = map_subtitle_codec(codec_name) else {
               continue;
           };
           let Some(stream_index) = stream["index"].as_u64().and_then(|i| u32::try_from(i).ok()) else {
               continue;
           };

           let raw_lang = stream["tags"]["language"]
               .as_str()
               .or_else(|| stream["tags"]["LANGUAGE"].as_str())
               .unwrap_or("und");
           let language = normalize_language_tag(raw_lang);

           let is_default = disposition_flag(stream, "default");
           let is_forced = disposition_flag(stream, "forced");
           let is_sdh = disposition_flag(stream, "hearing_impaired");

           let raw_title = stream["tags"]["title"]
               .as_str()
               .or_else(|| stream["tags"]["TITLE"].as_str())
               .map(str::trim)
               .filter(|t| !is_generic_handler_title(t));

           let title = if let Some(explicit) = raw_title {
               explicit.to_string()
           } else {
               let base = match language_display_name(&language) {
                   "" => {
                       if language == "und" {
                           format!("Track {}", stream_index)
                       } else {
                           language.to_ascii_uppercase()
                       }
                   }
                   name => name.to_string(),
               };
               let mut label = base;
               if is_sdh {
                   label.push_str(" [SDH]");
               }
               if is_forced {
                   label.push_str(" [Forced]");
               }
               label
           };

           out.push(DiscoveredSubtitle {
               source: SubtitleSource::Embedded,
               language,
               title: Some(title),
               format,
               file_path: None,
               stream_index: Some(stream_index),
               is_default,
               is_forced,
           });
       }

       out
   }
   ```
   Add `pub async fn run_ffprobe_full<P: AsRef<Path>>(path: P) -> Result<Option<FfprobeOutput>>` (reused by `run_ffprobe` and `probe_embedded_subtitles`).

3. In `crates/kadr-ingest/src/probe/mod.rs`:
   - Re-export `pub use ffprobe::probe_embedded_subtitles;`.
   - Add `pub async fn probe_with_subtitles<P: AsRef<Path>>(&self, path: P) -> Result<(TechnicalInfo, Vec<DiscoveredSubtitle>)>` on `TechnicalProber` so `pipeline.rs` gets both `TechnicalInfo` and `Vec<DiscoveredSubtitle>` from a single `ffprobe` invocation.

4. In `crates/kadr-ingest/src/watcher/pipeline.rs`:
   - Replace `let mut technical = self.prober.probe(path).await?;` with `let (mut technical, mut embedded_subtitles) = self.prober.probe_with_subtitles(path).await?;`.
   - Combine embedded + sidecar subtitles:
     ```rust
     let mut subtitles = embedded_subtitles;
     subtitles.extend(self.sidecar_scanner.find_subtitles(path));
     ```

5. In `crates/kadr-ingest/src/watcher/worker.rs` (`lines 262-270`), fix deduplication so multiple embedded tracks (`file_path == None`, distinct `stream_index`) are all inserted:
   ```rust
   let to_insert: Vec<SubtitleTrack> = tracks
       .into_iter()
       .filter(|t| {
           !existing.iter().any(|e| {
               if t.source == kadr_core::subtitles::SubtitleSource::Embedded {
                   e.source == t.source && e.stream_index == t.stream_index
               } else {
                   e.source == t.source && e.file_path == t.file_path
               }
           })
       })
       .collect();
   ```
   Also add a test in `crates/kadr-ingest/tests/pipeline_test.rs` verifying an ingested `.mkv` with 2 embedded subtitle streams yields both `SubtitleSource::Embedded` tracks in `IngestPipeline` / `IngestWorker`.

- [ ] **Step 4: Run `cargo test -p kadr-ingest` to verify GREEN**

Run: `cargo test -p kadr-ingest` (in `/home/boody/work/personal/kadr`)
Expected: PASS (100% tests green).

---

### Task 2: Lazy On-Demand MKV Subtitle Discovery & Cached `ffmpeg` WebVTT Extraction (`kadr-server`)

**Working Directory:** `/home/boody/work/personal/kadr`

**Files:**
- Modify: `crates/kadr-server/src/subtitles/service.rs:1-174`
- Modify: `crates/kadr-server/src/api/subtitle_routes.rs:18-46,71-138`
- Test: `crates/kadr-server/tests/subtitle_service_test.rs`
- Test: `crates/kadr-server/tests/subtitle_routes_test.rs`

**Interfaces:**
- Consumes: `kadr_ingest::probe::probe_embedded_subtitles` from Task 1
- Produces:
  - `SubtitleDeliveryService::list_or_probe_subtitles(&self, item: &MediaItem) -> Result<Vec<SubtitleTrack>, SubtitleServiceError>`
  - `SubtitleDeliveryService::get_webvtt_path(&self, subtitle_id: i64) -> Result<PathBuf, SubtitleServiceError>` (now extracts `SubtitleSource::Embedded` via `ffmpeg -map 0:<stream_index> -c:s webvtt` and converts `SubtitleFormat::Ass` sidecars via `ffmpeg`)
  - `SubtitleTrackResponse.stream_index: Option<u32>` (`#[serde(skip_serializing_if = "Option::is_none")]`)

- [ ] **Step 1: Write failing integration tests in `crates/kadr-server/tests/subtitle_service_test.rs` and `crates/kadr-server/tests/subtitle_routes_test.rs`**

Add to `crates/kadr-server/tests/subtitle_routes_test.rs`:
1. `test_lazy_embedded_mkv_discovery_and_webvtt_extraction`:
   - Generate a real `.mkv` in `temp_dir` using `ffmpeg` with 1 video stream, 1 audio stream, and 2 embedded subtitle streams (`ara` `"مرحبا بالعالم!"` `[default]` at stream index `2`, and `eng` `"Hello embedded world!"` at stream index `3`), insert `MediaItem` into `media_repo` **without** inserting any `media_subtitles` rows.
   - Call `GET /api/v1/items/{mkv_item_id}/subtitles` with Bearer token.
   - Assert `200 OK` returning 2 tracks with `source == "embedded"`, `stream_index == 2` (`language == "ara"`, `is_default == true`) and `stream_index == 3` (`language == "eng"`).
   - Call `GET /api/v1/subtitles/{ara_track_id}/stream.vtt`.
   - Assert `200 OK`, `content-type: text/vtt; charset=utf-8`, body starts with `"WEBVTT"` and contains `"مرحبا بالعالم!"`, and `<cache_dir>/{ara_track_id}.vtt` exists on disk.

- [ ] **Step 2: Run `cargo test -p kadr-server --test subtitle_routes_test` to verify failure (RED)**

Run: `cargo test -p kadr-server --test subtitle_routes_test` (in `/home/boody/work/personal/kadr`)
Expected: FAIL (`GET /api/v1/items/{id}/subtitles` returns `[]` instead of 2 embedded tracks).

- [ ] **Step 3: Implement lazy probing & `ffmpeg` WebVTT extraction in `service.rs` and `subtitle_routes.rs`**

1. In `crates/kadr-server/src/subtitles/service.rs`:
   - Add `#[error("Subtitle extraction failed: {0}")] ExtractionFailed(String)` to `SubtitleServiceError`.
   - Add fields to `SubtitleDeliveryService`:
     ```rust
     probed_embedded_items: Arc<std::sync::Mutex<std::collections::HashSet<i64>>>,
     in_flight_extractions: Arc<std::sync::Mutex<std::collections::HashMap<i64, Arc<tokio::sync::Mutex<()>>>>>,
     ```
   - Implement `pub async fn list_or_probe_subtitles(&self, item: &kadr_core::models::MediaItem) -> Result<Vec<SubtitleTrack>, SubtitleServiceError>`:
     - Determine `item_id = item.id.ok_or(SubtitleServiceError::NotFound)?`.
     - Fetch `tracks = self.subtitle_repo.find_by_media_item(item_id).await?`.
     - Check if `tracks.iter().any(|t| t.source == SubtitleSource::Embedded)` or `self.probed_embedded_items.lock().unwrap().contains(&item_id)`; if so, return `Ok(tracks)`.
     - Check container extension of `item.file_path` (`mkv`, `mp4`, `m4v`, `webm`, `mov`, `avi`, `ts`) and `tokio::fs::try_exists(&item.file_path).await.unwrap_or(false)`. If not eligible or missing on disk, return `Ok(tracks)`.
     - Call `kadr_ingest::probe::probe_embedded_subtitles(&item.file_path).await`:
       - On `Ok(discovered)`:
         - Build `new_tracks` filtering out any `(Embedded, stream_index)` already in `tracks`.
         - If `!new_tracks.is_empty()`, call `self.subtitle_repo.batch_insert(&new_tracks).await?` and re-fetch `tracks = self.subtitle_repo.find_by_media_item(item_id).await?`.
         - Insert `item_id` into `self.probed_embedded_items`.
       - On `Err(err)`: log warning without poisoning `probed_embedded_items`.
     - Return `Ok(tracks)`.
   - Update `get_webvtt_path(&self, subtitle_id: i64)`:
     - Fast-path cache check `<cache_dir>/<subtitle_id>.vtt`.
     - Acquire per-`subtitle_id` `Arc<tokio::sync::Mutex<()>>` from `in_flight_extractions`, then re-check `<cache_dir>/<subtitle_id>.vtt`.
     - Fetch `track = self.subtitle_repo.find_by_id(subtitle_id).await?.ok_or(SubtitleServiceError::NotFound)?`.
     - If `track.source == SubtitleSource::Embedded`:
       - `let stream_index = track.stream_index.ok_or(SubtitleServiceError::SourceFileNotFound)?;` (preserves `SourceFileNotFound` when `stream_index` is `None`!).
       - `let media_item = self.media_repo.find_by_id(track.media_item_id).await?.ok_or(SubtitleServiceError::SourceFileNotFound)?;`
       - Check `tokio::fs::try_exists(&media_item.file_path).await.unwrap_or(false)` (else `SourceFileNotFound`).
       - Run `tokio::time::timeout(Duration::from_secs(60), tokio::process::Command::new("ffmpeg").args(["-nostdin", "-y", "-v", "error", "-i"]).arg(&media_item.file_path).args(["-map", &format!("0:{}", stream_index), "-c:s", "webvtt", "-f", "webvtt"]).arg(&tmp_path).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::piped()).output()).await`.
       - If exit code 0 and `tmp_path` exists, `tokio::fs::rename(&tmp_path, &cached_path).await?` and return `Ok(cached_path)`. Otherwise delete `tmp_path` and return `Err(SubtitleServiceError::ExtractionFailed(...))`.
     - If `track.format == SubtitleFormat::Ass` (for `Sidecar` / `Downloaded`): convert via `ffmpeg -nostdin -y -v error -i <source_path> -c:s webvtt -f webvtt <tmp_path>` before falling back to `srt_to_webvtt_stream`.

2. In `crates/kadr-server/src/api/subtitle_routes.rs`:
   - Add `#[serde(skip_serializing_if = "Option::is_none")] pub stream_index: Option<u32>` to `SubtitleTrackResponse` and map `stream_index: track.stream_index` in `from_track`.
   - In `list_subtitles`: unwrap `let Some(item) = item_exists else { return Err((StatusCode::NOT_FOUND, ...)); };` and call `subtitle_service.list_or_probe_subtitles(&item).await`.

- [ ] **Step 4: Run `cargo test -p kadr-server` to verify GREEN**

Run: `cargo test -p kadr-server --test subtitle_service_test --test subtitle_routes_test --test e2e_subtitles_test` (in `/home/boody/work/personal/kadr`)
Expected: PASS (100% tests green).

---

### Task 3: Subtitle Preference Persistence, Track Label Formatting, ASS Drawing Cleanup & RTL Overlay (`kadr-tizenos`)

**Working Directory:** `/home/boody/work/personal/kadr-tizenos`

**Files:**
- Modify: `src/types/kadr.ts:93-103`
- Modify: `src/player/subtitles.ts:19-32,99-121`
- Modify: `src/player/subtitleSettings.ts:82-130`
- Modify: `src/components/player/SubtitleOverlay.tsx:58-78`
- Test: `tests/player/subtitles.test.ts`
- Test: `tests/components/player/SubtitleOverlay.test.tsx`

**Interfaces:**
- Produces:
  - `src/types/kadr.ts`: `SubtitleTrack.stream_index?: number`
  - `src/player/subtitles.ts`:
    - `export function normalizeSubtitleLanguageCode(code?: string | null): string`
    - `export function getSubtitleLanguageName(code?: string | null): string`
    - `export function formatSubtitleTrackLabel(track: Pick<SubtitleTrack, 'id' | 'language' | 'title'>, includeLanguageCode?: boolean): string`
  - `src/player/subtitleSettings.ts`:
    - `export type SubtitlePreference = { mode: 'auto' } | { mode: 'off' } | { mode: 'language'; language: string; preferForced?: boolean }`
    - `export const SUBTITLE_PREFERENCE_STORAGE_KEY = 'kadr_subtitle_preference_v1'`
    - `export function loadSubtitlePreference(): SubtitlePreference`
    - `export function saveSubtitlePreference(pref: SubtitlePreference): void`
    - `export function pickInitialSubtitleTrack(tracks: SubtitleTrack[], pref: SubtitlePreference): number | null`

- [ ] **Step 1: Write failing unit tests in `tests/player/subtitles.test.ts` and `tests/components/player/SubtitleOverlay.test.tsx`**

Append to `tests/player/subtitles.test.ts`:

```ts
import {
  formatSubtitleTrackLabel,
  getSubtitleLanguageName,
  normalizeSubtitleLanguageCode,
  parseSubtitles,
} from '../../src/player/subtitles';
import {
  loadSubtitlePreference,
  pickInitialSubtitleTrack,
  saveSubtitlePreference,
} from '../../src/player/subtitleSettings';
import { SubtitleTrack } from '../../src/types/kadr';

describe('MKV embedded subtitle helpers & preference selection', () => {
  it('strips ASS vector drawing blocks and unescapes hard spaces without dropping dialogue', () => {
    const ass = `[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:03.00,Signs,,0,0,0,,{\\p1}m 0 0 l 100 0 100 100 0 100{\\p0}
Dialogue: 0,0:00:01.50,0:00:03.50,Default,,0,0,0,,{\\an8}مرحبا\\hبالعالم!`;

    const cues = parseSubtitles(ass, 'ass');
    expect(cues).toEqual([
      { startMs: 1500, endMs: 3500, text: 'مرحبا بالعالم!' },
    ]);
  });

  it('normalizes ISO language codes and formats untitled vs titled MKV tracks cleanly', () => {
    expect(normalizeSubtitleLanguageCode('ar')).toBe('ara');
    expect(normalizeSubtitleLanguageCode('en-US')).toBe('eng');
    expect(getSubtitleLanguageName('ara')).toBe('Arabic');

    expect(
      formatSubtitleTrackLabel({ id: 4, language: 'ara', title: '' })
    ).toBe('Arabic (ara)');
    expect(
      formatSubtitleTrackLabel({ id: 1, language: 'eng', title: 'English [Original]' })
    ).toBe('English [Original] (eng)');
    expect(
      formatSubtitleTrackLabel({ id: 7, language: 'und', title: '' })
    ).toBe('Track 7');
  });

  it('persists SubtitlePreference and picks matching language, Off, or fallback default track', () => {
    localStorage.clear();
    expect(loadSubtitlePreference()).toEqual({ mode: 'auto' });

    const tracks: SubtitleTrack[] = [
      {
        id: 11,
        media_item_id: 1,
        source: 'embedded',
        language: 'eng',
        title: 'English [Signs & Songs]',
        format: 'ass',
        is_default: true,
        is_forced: true,
        stream_url: '/api/v1/subtitles/11/stream.vtt',
      },
      {
        id: 12,
        media_item_id: 1,
        source: 'embedded',
        language: 'ara',
        title: 'Arabic',
        format: 'srt',
        is_default: false,
        is_forced: false,
        stream_url: '/api/v1/subtitles/12/stream.vtt',
      },
      {
        id: 13,
        media_item_id: 1,
        source: 'embedded',
        language: 'eng',
        title: 'English',
        format: 'srt',
        is_default: false,
        is_forced: false,
        stream_url: '/api/v1/subtitles/13/stream.vtt',
      },
    ];

    // Auto mode selects container default
    expect(pickInitialSubtitleTrack(tracks, { mode: 'auto' })).toBe(11);

    // Off mode keeps subtitles off
    saveSubtitlePreference({ mode: 'off' });
    expect(pickInitialSubtitleTrack(tracks, loadSubtitlePreference())).toBeNull();

    // Language mode matches 'ar' <-> 'ara'
    saveSubtitlePreference({ mode: 'language', language: 'ar', preferForced: false });
    expect(pickInitialSubtitleTrack(tracks, loadSubtitlePreference())).toBe(12);

    // Non-forced English preference prefers full dialogue (13) over forced Signs & Songs (11)
    expect(
      pickInitialSubtitleTrack(tracks, { mode: 'language', language: 'eng', preferForced: false })
    ).toBe(13);
  });
});
```

Add to `tests/components/player/SubtitleOverlay.test.tsx`:

```tsx
  it('sets dir="auto" and unicode-bidi: plaintext for RTL Arabic/Hebrew punctuation ordering', () => {
    render(
      <SubtitleOverlay
        text="مرحبا بالعالم!"
        settings={{ fontSize: 'medium', color: 'white', placement: 'bottom' }}
      />
    );
    const el = screen.getByTestId('subtitle-overlay-text');
    expect(el).toHaveAttribute('dir', 'auto');
    expect(el.style.unicodeBidi).toBe('plaintext');
  });
```

- [ ] **Step 2: Run Vitest on the two test files to verify failure (RED)**

Run: `npx vitest run tests/player/subtitles.test.ts tests/components/player/SubtitleOverlay.test.tsx`
Expected: FAIL (`formatSubtitleTrackLabel` / `pickInitialSubtitleTrack` not exported, `dir="auto"` missing).

- [ ] **Step 3: Implement helpers in `kadr.ts`, `subtitles.ts`, `subtitleSettings.ts`, and RTL attributes in `SubtitleOverlay.tsx`**

1. In `src/types/kadr.ts`: add `stream_index?: number;` to `SubtitleTrack`.
2. In `src/player/subtitles.ts`:
   - In `cleanText`:
     ```ts
     function cleanText(text: string): string {
       return text
         .replace(/\{\\p[1-9]\d*\}[\s\S]*?(?:\{\\p0\}|$)/gi, '') // Strip ASS vector drawing polygons
         .replace(/\{[^}]*\}/g, '') // ASS-style override tags such as {\an8}
         .replace(/\\h/g, ' ') // ASS hard space
         .replace(/<[^>]+>/g, '') // <i>, <b>, <font ...>, WebVTT voice/cue tags
         .replace(/&nbsp;/g, ' ')
         .replace(/&lt;/g, '<')
         .replace(/&gt;/g, '>')
         .replace(/&amp;/g, '&')
         .split('\n')
         .map((l) => l.trim())
         .filter((l) => l.length > 0)
         .join('\n');
     }
     ```
   - Export `normalizeSubtitleLanguageCode`, `getSubtitleLanguageName`, and `formatSubtitleTrackLabel`:
     - When `includeLanguageCode` defaults to `true`: resolve `base = track.title?.trim() || getSubtitleLanguageName(track.language) || \`Track ${track.id}\``; if `lang && lang !== 'und'` and `!base.toLowerCase().endsWith(\`(${lang})\`)`, return `${base} (${track.language.trim()})`, else return `base`.
3. In `src/player/subtitleSettings.ts`:
   - Export `SubtitlePreference`, `SUBTITLE_PREFERENCE_STORAGE_KEY`, `loadSubtitlePreference`, `saveSubtitlePreference`, and `pickInitialSubtitleTrack` (preferring non-forced full tracks when `preferForced` is false/omitted, preferring non-SDH `[sdh]`/`signs` when tied, and falling back to `tracks.find(t => t.is_default)?.id ?? null` if no track matches the saved language).
4. In `src/components/player/SubtitleOverlay.tsx`:
   - Add `unicodeBidi: 'plaintext'` to `textStyle` and `dir="auto"` to `<span data-testid="subtitle-overlay-text" dir="auto" style={textStyle}>`.

- [ ] **Step 4: Run Vitest to verify GREEN**

Run: `npx vitest run tests/player/subtitles.test.ts tests/components/player/SubtitleOverlay.test.tsx`
Expected: PASS (100% green).

---

### Task 4: `PlayerScreen` Language Memory Across Episodes + `SubtitleModal` / `PlayerOSD` Embedded & Forced Badges (`kadr-tizenos`)

**Working Directory:** `/home/boody/work/personal/kadr-tizenos`

**Files:**
- Modify: `src/components/player/SubtitleModal.tsx:597-629`
- Modify: `src/components/osd/PlayerOSD.tsx:85-95,389-420`
- Modify: `src/screens/PlayerScreen.tsx:25-33,618-641,685-690,1723-1750`
- Test: `tests/components/player/SubtitleModal.test.tsx`
- Test: `tests/components/PlayerOSD.test.tsx`
- Test: `tests/screens/PlayerScreen.subtitles.test.tsx`

**Interfaces:**
- Consumes: `formatSubtitleTrackLabel` from `src/player/subtitles.ts`; `loadSubtitlePreference`, `saveSubtitlePreference`, `pickInitialSubtitleTrack` from `src/player/subtitleSettings.ts`.

- [ ] **Step 1: Write failing tests in `tests/components/player/SubtitleModal.test.tsx` and `tests/screens/PlayerScreen.subtitles.test.tsx`**

1. Add to `tests/components/player/SubtitleModal.test.tsx`:
   - Test `renders Embedded, Forced, and Default badges and human-readable fallback titles for untitled MKV streams` verifying an embedded untitled `ara` forced track renders `'Arabic (ara)'`, `'Embedded'`, and `'Forced'` badges with zero `gap-*` classes.
2. Add to `tests/screens/PlayerScreen.subtitles.test.tsx`:
   - Test `remembers selected MKV embedded subtitle language across episode transitions and respects explicit Off selection`:
     - Render `PlayerScreen` on `itemId={101}` where `fetchItemSubtitles(101)` returns `[eng (default), ara (embedded)]`.
     - Open `SubtitleModal`, click `Arabic (ara)` -> assert Arabic cues render and `localStorage` saved `{ mode: 'language', language: 'ara', preferForced: false }`.
     - Rerender `PlayerScreen` with `itemId={102}` where `fetchItemSubtitles(102)` returns `[eng (default, id: 21), ara (embedded, id: 22)]`.
     - Assert `PlayerScreen` automatically selects `id: 22` (Episode 2's embedded Arabic track) instead of Episode 2's English default (`id: 21`)!
     - Then select `Off`, rerender `itemId={103}`, and assert subtitles stay `Off` (`null`).

- [ ] **Step 2: Run Vitest on the subtitle UI & player suites to verify failure (RED)**

Run: `npx vitest run tests/components/player/SubtitleModal.test.tsx tests/screens/PlayerScreen.subtitles.test.tsx`
Expected: FAIL (`Embedded` / `Forced` badges missing; Episode 2 resets to English `is_default` instead of remembered `ara`).

- [ ] **Step 3: Implement `SubtitleModal`, `PlayerOSD`, and `PlayerScreen` updates**

1. In `src/components/player/SubtitleModal.tsx`:
   - Import `formatSubtitleTrackLabel` from `../../player/subtitles`.
   - For each `track` in `subtitles`:
     ```tsx
     const trackLabel = formatSubtitleTrackLabel(track);
     const isEmbedded = track.source === 'embedded';
     ```
     Render badges with explicit `ml-2` margins (zero `gap-*` classes!):
     - `isEmbedded`: `<span className="ml-2 text-xs px-2 py-0.5 rounded bg-white/10 text-[#F5E5E5]/80">Embedded</span>`
     - `track.is_forced`: `<span className="ml-2 text-xs px-2 py-0.5 rounded bg-[#D43F15]/25 text-[#FF6B00]">Forced</span>`
     - `track.is_default`: `<span className="ml-2 text-xs px-2 py-0.5 rounded bg-[#FFB800]/20 text-[#FFB800]">Default</span>`

2. In `src/components/osd/PlayerOSD.tsx`:
   - Import `formatSubtitleTrackLabel` from `../../player/subtitles`.
   - Use `formatSubtitleTrackLabel(track, false)` (or `track.title || getSubtitleLanguageName(track.language)`) and include `isEmbedded` / `isForced` metadata on `options` so quick popup rows display a compact `Embedded` / `Forced` pill alongside `Active` using explicit `ml-2` margins (zero `gap-*` classes).

3. In `src/screens/PlayerScreen.tsx`:
   - Import `loadSubtitlePreference`, `saveSubtitlePreference`, and `pickInitialSubtitleTrack` from `../player/subtitleSettings`.
   - In the subtitle-fetch `useEffect([itemId, apiClient])`:
     - Immediately reset `setSubtitles([])` and `setSelectedSubtitleId(null)` at the start of the effect so previous episode cues never linger while fetching the new episode's tracks!
     - When `fetchItemSubtitles` resolves:
       ```ts
       setSubtitles(tracks);
       const initialId = pickInitialSubtitleTrack(tracks, loadSubtitlePreference());
       setSelectedSubtitleId(initialId);
       ```
   - Create `handleSelectSubtitle = useCallback((id: number | null, explicitTrack?: SubtitleTrack) => { ... }, [subtitles])`:
     - Calls `setSelectedSubtitleId(id)`.
     - If `id === null`, calls `saveSubtitlePreference({ mode: 'off' })`.
     - Else resolves `const chosen = explicitTrack ?? subtitles.find((t) => t.id === id)` and if `chosen?.language`, calls `saveSubtitlePreference({ mode: 'language', language: chosen.language, preferForced: Boolean(chosen.is_forced) })`.
   - Wire `handleSelectSubtitle` to `PlayerOSD.onSelectSubtitle`, `SubtitleModal.onSelectSubtitle`, and `SubtitleModal.onSubtitleDownloaded` (`(track) => { setSubtitles((prev) => [...prev, track]); handleSelectSubtitle(track.id, track); }`).

- [ ] **Step 4: Run full verification across both repositories**

1. In `/home/boody/work/personal/kadr-tizenos`:
   - `(! grep -rn "gap-" src/player/subtitles.ts src/player/subtitleSettings.ts src/components/player/SubtitleOverlay.tsx src/components/player/SubtitleModal.tsx src/components/osd/PlayerOSD.tsx src/screens/PlayerScreen.tsx)`
   - `npm test -- --run`
   - `npm run build`
2. In `/home/boody/work/personal/kadr`:
   - `cargo test -p kadr-ingest -p kadr-server`
Expected: Zero `gap-*` classes, 100% Rust & Vitest suites green, and `chrome69` production build succeeding with exit code 0.
