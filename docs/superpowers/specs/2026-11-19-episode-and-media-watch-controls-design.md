# Sub-Project 2: Episode & Media Watch Controls — Design Spec

**Date:** 2026-11-19
**Parent Roadmap:** `docs/superpowers/specs/2026-11-19-v1-milestone-roadmap.md` (Phase 2 of 7)
**Target Hardware:** Samsung Tizen TV (`Tizen 5.0+`, verified on `UA55TU7000UXEG` Tizen 5.5 / Chromium 69) & Web Dev Harness
**Repositories:**
- Server: `/home/boody/work/personal/kadr` (`kadr-storage`, `kadr-server`)
- Client: `/home/boody/work/personal/kadr-tizenos`

---

## 1. Purpose & Problem Statement

In `kadr-tizenos` today:
1. **No Episode-Level *"Play from Beginning"*:** Movies on `ItemDetailModal` render a `"Play from Beginning"` (`detail-restart-btn`) button when resumable, whereas TV Shows omit `"Play from Beginning"` on the hero action strip (`hasRestartBtn` explicitly excluded `isShow`) and Episode cards always resume when `[OK]` is pressed (`toResumePercentageSentinel(ep.playback_progress)`), giving viewers no way to restart an in-progress episode from `0:00`.
2. **No Manual *"Mark Watched / Unwatched"*:** Neither `kadr-server` nor `kadr-tizenos` exposes a manual watch-state mutation endpoint or TV UI controls to mark Movies/Videos, individual Episodes, or a Season as Watched or Unwatched (including clearing partial progress to dismiss an item from *Continue Watching*).

All controls must work effortlessly on Samsung's 5-button One Remote (`Up` / `Down` / `Left` / `Right` / `OK` / `Return`), preserve instant `[OK]` playback on Episode cards, keep DOM node count `O(1)` ahead of Sub-Project 6's row virtualization, and contain zero CSS flexbox `gap-*` classes.

---

## 2. Approved UX & Scope Decisions

1. **Episode Card Interaction (5-Button D-Pad):**
   - Pressing **`[OK]` (`Enter`)** on a focused `EpisodeLandscapeCard` (`episode-card-{id}`) continues to **instant-play** immediately (resuming if in-progress, playing from `0:00` if unwatched or watched).
   - Pressing **D-pad `Down`** on a focused `EpisodeLandscapeCard` moves focus to a single shared **Active-Episode Inline Action Strip** rendered directly beneath the episode carousel for that episode (*Play from Beginning* when in-progress + *Mark Watched / Unwatched*). Pressing **D-pad `Up`** from the action strip returns focus to that exact `episode-card-{id}`.
2. **Watch-State Levels Supported:**
   - **Movies / Standalone VOD (`!isShow && !isLiveChannel`):** Hero action strip supports *Mark Watched* / *Mark Unwatched* (including resetting partial progress to *Unwatched*).
   - **TV Show Hero Strip (`isShow`):** Adds *Play from Beginning* (`detail-restart-btn`) beside `detail-resume-btn` whenever the *Next Up* episode is resumable (`0 < playback_progress < 0.9`).
   - **Current Season Bulk Toggle:** Season header bar renders `season-watch-toggle-btn` (*"Mark Season X Watched"* unless every episode in `selectedSeason` is `>= 0.9`, in which case *"Mark Season X Unwatched"*).
   - **Individual Episodes:** Active-episode inline action strip supports *Play from Beginning* (when resumable) and *Mark Watched* / *Mark Unwatched* (when partially watched, exposes both *Mark Watched* and *Mark Unwatched* so a viewer can either finish or clear progress).

---

## 3. Architecture & Component Design

### 3.1 Server Watch-State API (`kadr`: `kadr-storage` + `kadr-server`)

1. **Storage Layer (`crates/kadr-storage/src/repos/playback_repo.rs`):**
   - Add `PlaybackRepository::set_watch_states_batch(&self, user_id: &str, entries: &[(i64, i64)], watched: bool, now: i64) -> Result<usize>`:
     - `entries` is `&[(media_item_id, duration_seconds)]`.
     - Executes inside a single SQLite transaction (`conn.interact` with `unchecked_transaction()`):
       - When `watched == true`: upserts `watch_state = 'completed'`, `playback_position_seconds = duration_seconds.max(1)`, `last_watched_at = now`, and increments `play_count` by `1` when inserting or transitioning from a non-`'completed'` state.
       - When `watched == false`: upserts `watch_state = 'unwatched'`, `playback_position_seconds = 0`, `last_watched_at = now`, preserving existing `play_count` (`0` on fresh insert).
2. **Card & Item Detail Normalization (`crates/kadr-server/src/resolver/card.rs` & `resolver.rs`):**
   - In `to_card_view_model(item, playback)`:
     - `WatchState::Completed` -> `playback_progress = Some(1.0)` (even if `item.technical.duration_seconds <= 0`).
     - `WatchState::Unwatched` -> `playback_progress = None` (so unwatched / cleared items never render a stale progress bar).
     - `WatchState::InProgress` -> `Some((pos / duration).clamp(0.0, 1.0))` when `duration > 0`, else `None`.
   - In `resolve_item_details_with_unlocked`:
     - `resume_position_seconds` is `Some(p.playback_position_seconds.max(0) as u64)` only when `p.watch_state == WatchState::InProgress && p.playback_position_seconds > 0`, and `None` otherwise so completed or unwatched items never advertise a stale resume offset.
   - In `crates/kadr-storage/src/repos/search_repo.rs`:
     - Align `playback_progress` with `to_card_view_model` (`Some("completed") => Some(1.0)`, `Some("unwatched") => None`, `Some("in_progress")` with `duration_seconds > 0 => Some((pos / duration).clamp(0.0, 1.0))`).
3. **HTTP Endpoints (`crates/kadr-server/src/playback/handler.rs` & `crates/kadr-server/src/api/mod.rs`):**
   - **`PUT /api/v1/playback/states/{item_id}`**
     - Request JSON: `{ "watched": bool }`.
     - Auth & Privacy: requires `AuthUser` + `UnlockedLibraries`. Looks up `item` via `MediaItemRepository::get_by_id(item_id)` (`404` if missing), rejects `item.is_live()` (`400 Bad Request`), and checks `LibraryRepository::get_by_id(&item.library_id)` returning `403 Forbidden` (`{"error": "LIBRARY_LOCKED"}`) if `lib.is_private && !unlocked.is_unlocked(&item.library_id)`.
     - Calls `playback_repo.set_watch_states_batch(&auth_user.id, &[(item_id, item.technical.duration_seconds)], payload.watched, now)`.
     - Publishes `SystemEvent::LayoutChanged { screen_id: "home".to_string(), timestamp: now }` on `EventBus` (if present).
     - Returns `200 OK` with the updated `PlaybackState` JSON (`get_state`).
   - **`PUT /api/v1/playback/states`**
     - Request JSON: `{ "item_ids": Vec<i64>, "watched": bool }`.
     - Validation: deduplicates `item_ids`; returns `400 Bad Request` if empty or `> 500` items.
     - Fetches items via `media_repo.get_by_ids(&unique_ids)`; checks library lock status for each distinct `library_id` (`403 LIBRARY_LOCKED` if any referenced item belongs to a locked private library), skips live items (`!item.is_live()`), and executes `playback_repo.set_watch_states_batch`.
     - Publishes `SystemEvent::LayoutChanged { screen_id: "home".to_string(), timestamp: now }`.
     - Returns `200 OK` with `{ "updated": updated_count, "watched": payload.watched }`.

### 3.2 Client API & Optimistic Progress Helpers (`kadr-tizenos`)

1. **`src/api/playback.ts`:**
   - `export async function setItemWatchState(client: ApiClient, itemId: number | string, watched: boolean): Promise<void>` -> `PUT /api/v1/playback/states/${encodeURIComponent(String(itemId))}` with `{ watched }`.
   - `export async function setBatchWatchState(client: ApiClient, itemIds: Array<number | string>, watched: boolean): Promise<{ updated: number; watched: boolean }>` -> `PUT /api/v1/playback/states` with `{ item_ids: itemIds.map(Number), watched }`.
2. **`src/utils/playbackProgress.ts`:**
   - `export function applyWatchStateMutation(item: MediaItemDetail, targetIds: ReadonlySet<string>, watched: boolean): MediaItemDetail`:
     - Pure helper used for immediate optimistic UI updates on `activeItem` (and standalone `ItemDetailModal` state):
       - If `targetIds.has(String(item.id ?? item.card?.id ?? ''))`:
         - `watched === true`: sets `resume_position_ms = 0`, `resume_position_seconds = 0`, and `card.playback_progress = 1`, clearing `card.badge` if `'RESUME'`.
         - `watched === false`: sets `resume_position_ms = 0`, `resume_position_seconds = 0`, and `card.playback_progress = 0`, clearing `card.badge` if `'RESUME'`.
       - If `item.episodes?.length`: updates every matching episode in `targetIds` (`playback_progress: watched ? 1 : 0`, clearing `badge` if `'RESUME'`).

### 3.3 `ItemDetailModal` UI & D-Pad Navigation (`src/screens/ItemDetailModal.tsx`)

1. **Props:**
   - Add optional `onWatchStateChange?: (itemIds: Array<number | string>, watched: boolean) => Promise<void> | void;` to `ItemDetailModalProps`.
   - Maintain local optimistic override state inside `ItemDetailModal` (`localItem` synchronized when `item` prop reference changes) so standalone renders (and optimistic parent updates) reflect mutations immediately without waiting for network round-trips; if `onWatchStateChange` is provided, delegate persistence to `App.tsx`, otherwise call `setItemWatchState` / `setBatchWatchState` via `fallbackClient`.
2. **Hero Action Strip (`#remote-action-strip`):**
   - **TV Shows (`isShow && nextEpisode`):**
     - When `isEpisodeResume === true`: render `detail-resume-btn` (*Resume Next*) **followed by** `detail-restart-btn` (*"Play from Beginning"*, calling `handlePlayShowStart` which passes `resumeMs = 0`).
   - **Movies / Standalone VOD (`!isShow && !isLiveChannel`):**
     - Render `detail-watch-toggle-btn`:
       - When `isItemCompleted` (`playback_progress >= 0.9`): label `"Mark Unwatched"`, calls `handleSetWatchState([resolvedId], false)`.
       - When `!isItemCompleted`: label `"Mark Watched"`, calls `handleSetWatchState([resolvedId], true)`.
     - When `!isShow && !isLiveChannel && Boolean(resolvedResumeMs && resolvedResumeMs > 0)` (in-progress movie): also render `detail-clear-progress-btn` (`"Mark Unwatched"`, calling `handleSetWatchState([resolvedId], false)`) so viewers can clear partial progress directly without first marking watched.
   - Sequential `order` values on `#remote-action-strip` remain contiguous (`1..K`), with explicit `mr-4 mb-2` margins and **zero `gap-*` classes**.
3. **Season Header Bulk Toggle (`season-watch-toggle-btn`):**
   - Rendered on the right side of the Season Selector Tabs bar when `visibleSeasonEpisodes.length > 0`.
   - `allSeasonWatched = visibleSeasonEpisodes.every((ep) => (ep.playback_progress ?? 0) >= 0.9)`.
   - Label: `allSeasonWatched ? "Mark Season ${selectedSeason} Unwatched" : "Mark Season ${selectedSeason} Watched"`.
   - Activation calls `handleSetWatchState(visibleSeasonEpisodes.map((ep) => ep.id), !allSeasonWatched)`.
4. **Active-Episode Inline Action Strip (`#episode-action-strip`):**
   - Track `activeEpisodeId` state (defaults to `visibleSeasonEpisodes[0]?.id`; updated via `onFocus` on `EpisodeLandscapeCard` and reset to `visibleSeasonEpisodes[0]?.id` when `selectedSeason` or `resolvedId` changes).
   - `activeEpisode = visibleSeasonEpisodes.find((e) => String(e.id) === String(activeEpisodeId)) ?? visibleSeasonEpisodes[0]`.
   - Rendered directly beneath the episode carousel row when `activeEpisode` exists:
     - Left metadata label: `SxxExx • "${activeEpisode.title}"` (`truncate`).
     - Right/inline action pills (`groupId="episode-actions"`, explicit `mr-3`, zero `gap-*`):
       1. `episode-action-restart` (*"Play from Beginning"*) — rendered when `(activeEpisode.playback_progress ?? 0) > 0 && (activeEpisode.playback_progress ?? 0) < 0.9`; calls `handlePlayEpisodeFromStart(activeEpisode)` (`onPlay(activeEpisode.id, 0, activeEpisode.title, undefined, episodePlaylist, playlistIdx)`).
       2. `episode-action-watch-toggle` — `"Mark Unwatched"` when `(activeEpisode.playback_progress ?? 0) >= 0.9`, else `"Mark Watched"`; toggles `activeEpisode.id` watched/unwatched.
       3. `episode-action-clear-progress` (*"Mark Unwatched"*) — rendered when `(activeEpisode.playback_progress ?? 0) > 0 && (activeEpisode.playback_progress ?? 0) < 0.9`; resets `activeEpisode.id` to unwatched (`watched = false`).
5. **Deterministic 5-Button D-Pad Matrix in `ItemDetailModal`:**
   - **On Hero Action Strip (`detail-*`):** `ArrowDown` moves to `season-tab-${selectedSeason}` (when `seasons.length > 0`).
   - **On Season Tabs (`season-tab-*`) & `season-watch-toggle-btn`:**
     - `ArrowRight` on the last `season-tab-*` moves focus to `season-watch-toggle-btn`; `ArrowLeft` on `season-watch-toggle-btn` returns focus to the last `season-tab-*`.
     - `ArrowUp` on either moves to `primaryBtnId`; `ArrowDown` moves to `episode-card-${activeEpisode.id}` (or `visibleSeasonEpisodes[0].id`).
   - **On Episode Cards (`episode-card-*`):**
     - `[OK]` (`Enter`): instant-plays episode (resuming if in-progress, `0:00` otherwise).
     - `ArrowUp`: moves to `season-tab-${selectedSeason}`.
     - `ArrowDown`: moves to the first rendered button in `#episode-action-strip` (`episode-action-restart` if resumable, else `episode-action-watch-toggle`).
   - **On Episode Action Strip (`episode-action-*`):**
     - `ArrowLeft` / `ArrowRight`: moves strictly among the currently rendered `episode-action-*` buttons (clamping at left/right ends so focus never escapes sideways).
     - `ArrowUp`: returns focus directly to `episode-card-${activeEpisode.id}`!
     - **Post-toggle focus anchor:** If the user activates `episode-action-clear-progress` (which unmounts once progress becomes `0`), focus shifts synchronously to `episode-action-watch-toggle` so focus is never stranded on an unmounted node.
   - **Remote Footer Hint:** Adds `[▼] Episode Options` when `seasons.length > 0`.

### 3.4 `App.tsx` Integration & Rollback Safety

- Pass `onWatchStateChange={handleWatchStateChange}` to `<ItemDetailModal>` in `src/App.tsx`:
  1. Snapshot previous `activeItem`.
  2. Delete mutated IDs from `sessionProgressRef.current` so stale in-memory player snapshots cannot overwrite the manual watch-state toggle.
  3. Apply `applyWatchStateMutation(prev, idSet, watched)` optimistically to `activeItem` (and `suspendedItemDetail` if matching).
  4. Call `setItemWatchState(client, ids[0], watched)` (for 1 item) or `setBatchWatchState(client, ids, watched)` (for `> 1` items).
  5. Bump `screenRefreshKey`, `folderRefreshKey` (when `folderBrowserState` active), and `playlistRefreshKey` (when `activePlaylistId` active) so *Continue Watching* and library badges refresh immediately.
  6. On API error (other than `401`, which `ApiClient` routes to `ProfileSelectScreen`), restore previous `activeItem` snapshot or re-fetch `fetchMediaItem(client, activeItemId)`.

---

## 4. Error Handling & Platform Invariants

- **Chromium 69 / Tizen 5.5 CSS Safety:** Zero flex `gap-*` classes in any new or modified JSX/CSS (`ItemDetailModal.tsx`, `App.tsx`); use explicit `mr-*`, `mb-*`, `ml-*` physical margins.
- **Private Library Enforcement:** Both `PUT /api/v1/playback/states/{item_id}` and `PUT /api/v1/playback/states` enforce `UnlockedLibraries` and return `403 LIBRARY_LOCKED` if a private library is locked.
- **Live Channel Guard:** Watch-state endpoints return `400` on `live_channel` items, and `ItemDetailModal` hides watch-state toggles when `isLiveChannel === true`.
- **Layered Back Navigation:** `episode-action-*` is an inline row inside `ItemDetailModal` (not a nested modal trap), so pressing `[Return]` (`10009` / `Escape`) closes `ItemDetailModal` in one clean step as expected, while `ArrowUp` returns to the episode card.

---

## 5. Testing & Verification Strategy

1. **`kadr` Rust Tests (`cargo test` + release binary build):**
   - `kadr-storage`: unit test `set_watch_states_batch` verifying `completed` (`play_count` increment, `position = duration.max(1)`), `unwatched` (`position = 0`, `play_count` preserved), and multi-item batch atomicity.
   - `kadr-server`: integration tests in `tests/playback_test.rs` covering `PUT /api/v1/playback/states/{item_id}` (watched -> `playback_progress == 1.0` & `resume_position_seconds == None` on item details; unwatched -> `playback_progress == None` & removed from `/api/v1/playback/continue-watching`), `PUT /api/v1/playback/states` season batch toggle, `403 LIBRARY_LOCKED` on locked private library items, and `0`-duration item completion (`playback_progress == 1.0`).
   - Rebuild `/home/boody/work/personal/kadr/target/release/kadr`.
2. **`kadr-tizenos` Vitest + Build + `.wgt` Verification:**
   - Unit tests for `setItemWatchState`, `setBatchWatchState`, and `applyWatchStateMutation`.
   - `ItemDetailModal` tests:
     - Movie: *Mark Watched* / *Mark Unwatched* + clearing in-progress movie via *Mark Unwatched*.
     - Show Hero: *Play from Beginning* (`detail-restart-btn`) passes `resumeMs = 0` when Next Up is resumable.
     - Season bulk toggle: `ArrowRight` from last season tab -> `season-watch-toggle-btn` -> toggles entire season watched/unwatched.
     - Episode inline action strip: `[OK]` on episode card still instant-plays; `ArrowDown` focuses `#episode-action-strip`; *Play from Beginning* passes `0`; *Mark Watched* / *Mark Unwatched* updates badges/progress optimistically and keeps focus anchored; `ArrowUp` returns focus to `episode-card-{id}`.
   - `App.test.tsx` integration test verifying end-to-end watch-state mutation updates `ItemDetailModal` and triggers background screen refresh.
   - Zero `gap-*` grep check, full Vitest suite, `chrome69` build, and `kadr.wgt` packaging.
