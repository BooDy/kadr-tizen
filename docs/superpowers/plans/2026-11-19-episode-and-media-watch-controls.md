# Sub-Project 2: Episode & Media Watch Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver manual *Mark Watched / Unwatched* (Movies/Videos, individual Episodes, and Current Season bulk toggle) and episode-level *Play from Beginning* across the Kadr Rust server (`kadr`) and Samsung Tizen TV client (`kadr-tizenos`).

**Architecture:** Add atomic single-item (`PUT /api/v1/playback/states/{item_id}`) and batch (`PUT /api/v1/playback/states`) watch-state endpoints in `kadr-server` backed by `PlaybackRepository::set_watch_states_batch`, normalize `WatchState::Completed` / `WatchState::Unwatched` card progress and resume offsets, and wire optimistic TV controls in `ItemDetailModal.tsx` and `App.tsx` using a single `O(1)` shared `#episode-action-strip` reachable via D-pad `Down` from any focused episode card.

**Tech Stack:** Rust (`axum` 0.8, `rusqlite` / `deadpool-sqlite`, `tokio`), React 19, TypeScript 5.7, Vite 6 (`chrome69`), Tailwind CSS 4, Vitest 3 + React Testing Library.

## Global Constraints

- Target platform: Samsung Tizen 5.5 (`UA55TU7000UXEG`, Chromium 69 WebView) and Web Dev Harness.
- **Zero flex `gap-*` classes** in any new or modified JSX/CSS (`ItemDetailModal.tsx`, `App.tsx`); use explicit physical margins (`mr-*`, `mb-*`, `ml-*`).
- Keep `BrowseScreen` and modal trees unmounted while `view === 'player'` so `AVPlay`'s transparent hardware video plane remains unobstructed.
- Pressing `[OK]` (`Enter`) on an `EpisodeLandscapeCard` (`episode-card-{id}`) **must** continue to instant-play (resuming if in-progress, `0:00` otherwise); pressing D-pad `Down` moves focus to `#episode-action-strip`, and D-pad `Up` returns focus to `episode-card-{activeEpisode.id}`.
- In `#episode-action-strip`, format the episode header string inside a single `<span>` as `` `S${seasonPadded}E${episodePadded} • "${activeEpisode.title}"` `` so exact-text queries (`getByText('Pilot')`) continue matching only the episode card `<h3>`.
- Both `PUT /api/v1/playback/states/{item_id}` and `PUT /api/v1/playback/states` in `kadr-server` **must** enforce `UnlockedLibraries` (`403 LIBRARY_LOCKED` on locked private libraries) and reject live streams (`400` on single live item; skip live items in batch).

---

### Task 1: Kadr Server Watch-State Mutation Endpoints & Card Progress Normalization (`kadr`)

**Working Directory:** `/home/boody/work/personal/kadr`

**Files:**
- Modify: `/home/boody/work/personal/kadr/crates/kadr-storage/src/repos/playback_repo.rs:42-99`
- Modify: `/home/boody/work/personal/kadr/crates/kadr-storage/src/repos/search_repo.rs:334-340`
- Modify: `/home/boody/work/personal/kadr/crates/kadr-server/src/resolver/card.rs:82-94`
- Modify: `/home/boody/work/personal/kadr/crates/kadr-server/src/resolver/resolver.rs:758-763`
- Modify: `/home/boody/work/personal/kadr/crates/kadr-server/src/playback/handler.rs:180-238`
- Modify: `/home/boody/work/personal/kadr/crates/kadr-server/src/api/mod.rs:150-157`
- Modify: `/home/boody/work/personal/kadr/crates/kadr-server/tests/playback_test.rs`

**Interfaces:**
- Produces:
  - `PlaybackRepository::set_watch_states_batch(&self, user_id: &str, entries: &[(i64, i64)], watched: bool, now: i64) -> Result<usize>`
  - `PUT /api/v1/playback/states/{item_id}` (`{ "watched": bool }` -> `200 OK` `PlaybackState` JSON)
  - `PUT /api/v1/playback/states` (`{ "item_ids": Vec<i64>, "watched": bool }` -> `200 OK` `{ "updated": usize, "watched": bool }`)

- [ ] **Step 1: Write failing integration tests in `/home/boody/work/personal/kadr/crates/kadr-server/tests/playback_test.rs`**

Append tests to `crates/kadr-server/tests/playback_test.rs` verifying:
1. `test_manual_set_playback_state_single_and_zero_duration`:
   - Starts with `item1_id` in `InProgress` at `300s` (present in `GET /api/v1/playback/continue-watching` and `GET /api/v1/items/{item1_id}/details` has `resume_position_seconds == Some(300)`).
   - Sends `PUT /api/v1/playback/states/{item1_id}` with `{"watched": true}` -> `200 OK`, `watch_state == "completed"`, `play_count == 1`, `playback_position_seconds == 5000`, removed from `/api/v1/playback/continue-watching`, and `GET /api/v1/items/{item1_id}/details` returns `card.playback_progress == Some(1.0)` and `resume_position_seconds == None`.
   - Also inserts an item with `duration_seconds == 0` and sends `PUT /api/v1/playback/states/{zero_dur_id}` with `{"watched": true}` -> `GET /api/v1/items/{zero_dur_id}/details` returns `card.playback_progress == Some(1.0)`.
   - Sends `PUT /api/v1/playback/states/{item1_id}` with `{"watched": false}` -> `200 OK`, `watch_state == "unwatched"`, `playback_position_seconds == 0`, `play_count == 1` (preserved), and `GET /api/v1/items/{item1_id}/details` returns `card.playback_progress == None` and `resume_position_seconds == None`.
2. `test_manual_set_playback_states_batch_and_private_library_guard`:
   - Sends `PUT /api/v1/playback/states` with `{"item_ids": [item1_id, item2_id], "watched": true}` -> `200 OK` `{"updated": 2, "watched": true}`, both items become `WatchState::Completed`.
   - Creates a private library item and verifies `PUT /api/v1/playback/states/{priv_id}` and `PUT /api/v1/playback/states` without `X-Kadr-Unlock-Tokens` return `403 FORBIDDEN` (`{"error": "LIBRARY_LOCKED"}`), and succeed with `200 OK` when unlocked.
   - Verifies empty `item_ids: []` returns `400 BAD_REQUEST`.

```rust
#[tokio::test]
async fn test_manual_set_playback_state_single_and_zero_duration() {
    let (user_repo, playback_repo, media_repo, lib_repo, jwt, item1_id, _, token, _) =
        setup_test_context().await;

    // Insert a zero-duration item in the same public library
    let item1 = media_repo.get_by_id(item1_id).await.unwrap().unwrap();
    let mut zero_item = item1.clone();
    zero_item.id = None;
    zero_item.file_path = std::path::PathBuf::from("/tmp/zero_duration_ep.mkv");
    zero_item.title = "Zero Duration Ep".to_string();
    zero_item.technical.duration_seconds = 0;
    media_repo.batch_upsert(&[zero_item]).await.unwrap();
    let zero_created = media_repo
        .find_by_path("/tmp/zero_duration_ep.mkv")
        .await
        .unwrap()
        .unwrap();
    let zero_id = zero_created.id.unwrap();

    playback_repo
        .upsert_progress("u1", item1_id, 300, WatchState::InProgress, 1700000100)
        .await
        .unwrap();

    let session_registry = Arc::new(SessionRegistry::new());
    let app = create_router(
        user_repo,
        playback_repo.clone(),
        media_repo,
        lib_repo,
        jwt,
        RateLimiter::new(5, Duration::from_secs(300), Duration::from_secs(300)),
        session_registry,
    );

    // 1. Mark item1 watched
    let req = Request::builder()
        .method("PUT")
        .uri(format!("/api/v1/playback/states/{}", item1_id))
        .header("authorization", format!("Bearer {}", token))
        .header("content-type", "application/json")
        .body(Body::from(r#"{"watched":true}"#))
        .unwrap();
    let res = app.clone().oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::OK);
    let bytes = axum::body::to_bytes(res.into_body(), 4096).await.unwrap();
    let json: Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(json["watch_state"], "completed");
    assert_eq!(json["play_count"], 1);
    assert_eq!(json["playback_position_seconds"], 5000);

    // Continue watching should now be empty
    let cw_req = Request::builder()
        .method("GET")
        .uri("/api/v1/playback/continue-watching")
        .header("authorization", format!("Bearer {}", token))
        .body(Body::empty())
        .unwrap();
    let cw_res = app.clone().oneshot(cw_req).await.unwrap();
    let cw_bytes = axum::body::to_bytes(cw_res.into_body(), 4096).await.unwrap();
    let cw_list: Vec<Value> = serde_json::from_slice(&cw_bytes).unwrap();
    assert!(cw_list.is_empty());

    // Item details should report playback_progress = 1.0 and resume_position_seconds = null
    let det_req = Request::builder()
        .method("GET")
        .uri(format!("/api/v1/items/{}/details", item1_id))
        .header("authorization", format!("Bearer {}", token))
        .body(Body::empty())
        .unwrap();
    let det_res = app.clone().oneshot(det_req).await.unwrap();
    let det_bytes = axum::body::to_bytes(det_res.into_body(), 8192).await.unwrap();
    let det_json: Value = serde_json::from_slice(&det_bytes).unwrap();
    assert_eq!(det_json["card"]["playback_progress"], 1.0);
    assert!(det_json["resume_position_seconds"].is_null());

    // 2. Mark zero-duration item watched -> card.playback_progress == 1.0
    let z_req = Request::builder()
        .method("PUT")
        .uri(format!("/api/v1/playback/states/{}", zero_id))
        .header("authorization", format!("Bearer {}", token))
        .header("content-type", "application/json")
        .body(Body::from(r#"{"watched":true}"#))
        .unwrap();
    let z_res = app.clone().oneshot(z_req).await.unwrap();
    assert_eq!(z_res.status(), StatusCode::OK);

    let z_det_req = Request::builder()
        .method("GET")
        .uri(format!("/api/v1/items/{}/details", zero_id))
        .header("authorization", format!("Bearer {}", token))
        .body(Body::empty())
        .unwrap();
    let z_det_res = app.clone().oneshot(z_det_req).await.unwrap();
    let z_det_bytes = axum::body::to_bytes(z_det_res.into_body(), 8192).await.unwrap();
    let z_det_json: Value = serde_json::from_slice(&z_det_bytes).unwrap();
    assert_eq!(z_det_json["card"]["playback_progress"], 1.0);

    // 3. Mark item1 unwatched -> watch_state = unwatched, play_count preserved at 1, progress = null
    let unw_req = Request::builder()
        .method("PUT")
        .uri(format!("/api/v1/playback/states/{}", item1_id))
        .header("authorization", format!("Bearer {}", token))
        .header("content-type", "application/json")
        .body(Body::from(r#"{"watched":false}"#))
        .unwrap();
    let unw_res = app.clone().oneshot(unw_req).await.unwrap();
    assert_eq!(unw_res.status(), StatusCode::OK);
    let unw_bytes = axum::body::to_bytes(unw_res.into_body(), 4096).await.unwrap();
    let unw_json: Value = serde_json::from_slice(&unw_bytes).unwrap();
    assert_eq!(unw_json["watch_state"], "unwatched");
    assert_eq!(unw_json["playback_position_seconds"], 0);
    assert_eq!(unw_json["play_count"], 1);

    let det2_req = Request::builder()
        .method("GET")
        .uri(format!("/api/v1/items/{}/details", item1_id))
        .header("authorization", format!("Bearer {}", token))
        .body(Body::empty())
        .unwrap();
    let det2_res = app.clone().oneshot(det2_req).await.unwrap();
    let det2_bytes = axum::body::to_bytes(det2_res.into_body(), 8192).await.unwrap();
    let det2_json: Value = serde_json::from_slice(&det2_bytes).unwrap();
    assert!(det2_json["card"]["playback_progress"].is_null());
    assert!(det2_json["resume_position_seconds"].is_null());
}

#[tokio::test]
async fn test_manual_set_playback_states_batch_and_private_library_guard() {
    let (user_repo, playback_repo, media_repo, lib_repo, jwt, item1_id, item2_id, token, _) =
        setup_test_context().await;

    // Create a private library with PIN "1234" and a private media item
    let pin_hash = bcrypt::hash("1234", 4).unwrap();
    let mut priv_lib = kadr_core::models::Library::new_with_paths(
        "Private Vault".to_string(),
        vec![std::path::PathBuf::from("/tmp/private-vault")],
        kadr_core::models::MediaType::Movie,
    );
    priv_lib.id = "lib-priv-watch".to_string();
    priv_lib.is_private = true;
    priv_lib.pin_hash = Some(pin_hash);
    lib_repo.create(&priv_lib).await.unwrap();

    let item1 = media_repo.get_by_id(item1_id).await.unwrap().unwrap();
    let mut priv_item = item1.clone();
    priv_item.id = None;
    priv_item.library_id = "lib-priv-watch".to_string();
    priv_item.file_path = std::path::PathBuf::from("/tmp/private-vault/secret.mkv");
    priv_item.title = "Secret Film".to_string();
    media_repo.batch_upsert(&[priv_item]).await.unwrap();
    let priv_created = media_repo
        .find_by_path("/tmp/private-vault/secret.mkv")
        .await
        .unwrap()
        .unwrap();
    let priv_id = priv_created.id.unwrap();

    let session_registry = Arc::new(SessionRegistry::new());
    let app = create_router(
        user_repo,
        playback_repo.clone(),
        media_repo,
        lib_repo,
        jwt,
        RateLimiter::new(5, Duration::from_secs(300), Duration::from_secs(300)),
        session_registry,
    );

    // 1. Empty batch -> 400 BAD_REQUEST
    let empty_req = Request::builder()
        .method("PUT")
        .uri("/api/v1/playback/states")
        .header("authorization", format!("Bearer {}", token))
        .header("content-type", "application/json")
        .body(Body::from(r#"{"item_ids":[],"watched":true}"#))
        .unwrap();
    let empty_res = app.clone().oneshot(empty_req).await.unwrap();
    assert_eq!(empty_res.status(), StatusCode::BAD_REQUEST);

    // 2. Batch mark item1 + item2 watched -> 200 OK, updated == 2
    let batch_req = Request::builder()
        .method("PUT")
        .uri("/api/v1/playback/states")
        .header("authorization", format!("Bearer {}", token))
        .header("content-type", "application/json")
        .body(Body::from(format!(
            r#"{{"item_ids":[{},{}],"watched":true}}"#,
            item1_id, item2_id
        )))
        .unwrap();
    let batch_res = app.clone().oneshot(batch_req).await.unwrap();
    assert_eq!(batch_res.status(), StatusCode::OK);
    let batch_bytes = axum::body::to_bytes(batch_res.into_body(), 4096).await.unwrap();
    let batch_json: Value = serde_json::from_slice(&batch_bytes).unwrap();
    assert_eq!(batch_json["updated"], 2);
    assert_eq!(batch_json["watched"], true);

    assert_eq!(
        playback_repo.get_state("u1", item1_id).await.unwrap().unwrap().watch_state,
        WatchState::Completed
    );
    assert_eq!(
        playback_repo.get_state("u1", item2_id).await.unwrap().unwrap().watch_state,
        WatchState::Completed
    );

    // 3. Locked private library item -> 403 LIBRARY_LOCKED on both single and batch PUT
    let locked_single = Request::builder()
        .method("PUT")
        .uri(format!("/api/v1/playback/states/{}", priv_id))
        .header("authorization", format!("Bearer {}", token))
        .header("content-type", "application/json")
        .body(Body::from(r#"{"watched":true}"#))
        .unwrap();
    let locked_res = app.clone().oneshot(locked_single).await.unwrap();
    assert_eq!(locked_res.status(), StatusCode::FORBIDDEN);

    let locked_batch = Request::builder()
        .method("PUT")
        .uri("/api/v1/playback/states")
        .header("authorization", format!("Bearer {}", token))
        .header("content-type", "application/json")
        .body(Body::from(format!(r#"{{"item_ids":[{}],"watched":true}}"#, priv_id)))
        .unwrap();
    let locked_batch_res = app.clone().oneshot(locked_batch).await.unwrap();
    assert_eq!(locked_batch_res.status(), StatusCode::FORBIDDEN);

    // 4. Unlock private library and retry -> 200 OK
    let unlock_req = Request::builder()
        .method("POST")
        .uri("/api/v1/libraries/lib-priv-watch/unlock")
        .header("content-type", "application/json")
        .body(Body::from(r#"{"pin":"1234"}"#))
        .unwrap();
    let unlock_res = app.clone().oneshot(unlock_req).await.unwrap();
    assert_eq!(unlock_res.status(), StatusCode::OK);
    let unlock_bytes = axum::body::to_bytes(unlock_res.into_body(), 4096).await.unwrap();
    let unlock_json: Value = serde_json::from_slice(&unlock_bytes).unwrap();
    let unlock_token = unlock_json["unlock_token"].as_str().unwrap();

    let unlocked_single = Request::builder()
        .method("PUT")
        .uri(format!("/api/v1/playback/states/{}", priv_id))
        .header("authorization", format!("Bearer {}", token))
        .header("x-kadr-unlock-tokens", unlock_token)
        .header("content-type", "application/json")
        .body(Body::from(r#"{"watched":true}"#))
        .unwrap();
    let unlocked_res = app.clone().oneshot(unlocked_single).await.unwrap();
    assert_eq!(unlocked_res.status(), StatusCode::OK);
}
```

- [ ] **Step 2: Run `cargo test` on `playback_test` to verify failure (RED)**

Run in `/home/boody/work/personal/kadr`:
`cargo test -p kadr-server --test playback_test`
Expected: FAIL (`405 Method Not Allowed` / `404 Not Found` on `PUT /api/v1/playback/states/{item_id}`).

- [ ] **Step 3: Implement `set_watch_states_batch`, progress/resume normalization, and `PUT` routes**

1. In `crates/kadr-storage/src/repos/playback_repo.rs`, add `set_watch_states_batch`:
   ```rust
   pub async fn set_watch_states_batch(
       &self,
       user_id: &str,
       entries: &[(i64, i64)],
       watched: bool,
       now: i64,
   ) -> Result<usize> {
       if entries.is_empty() {
           return Ok(0);
       }
       let user_id = user_id.to_string();
       let entries = entries.to_vec();
       let conn = self.pool.get().await?;
       conn.interact(move |c| {
           let tx = c.unchecked_transaction()?;
           let state_str = if watched { "completed" } else { "unwatched" };
           let mut count = 0usize;
           {
               let mut stmt = tx.prepare(
                   "INSERT INTO user_playback_states (
                       user_id, media_item_id, playback_position_seconds, watch_state, last_watched_at, play_count
                    ) VALUES (?1, ?2, ?3, ?4, ?5, CASE WHEN ?4 = 'completed' THEN 1 ELSE 0 END)
                    ON CONFLICT(user_id, media_item_id) DO UPDATE SET
                       playback_position_seconds = excluded.playback_position_seconds,
                       watch_state = excluded.watch_state,
                       last_watched_at = excluded.last_watched_at,
                       play_count = CASE
                           WHEN excluded.watch_state = 'completed' AND user_playback_states.watch_state != 'completed'
                           THEN user_playback_states.play_count + 1
                           ELSE user_playback_states.play_count
                       END",
               )?;
               for (media_item_id, duration_seconds) in entries {
                   let pos = if watched {
                       duration_seconds.max(1)
                   } else {
                       0
                   };
                   stmt.execute(params![user_id, media_item_id, pos, state_str, now])?;
                   count += 1;
               }
           }
           tx.commit()?;
           Ok(count)
       })
       .await?
   }
   ```
2. In `crates/kadr-server/src/resolver/card.rs:82-93`, normalize `playback_progress`:
   ```rust
   let playback_progress = if let Some(p) = playback {
       match p.watch_state {
           WatchState::Completed => Some(1.0),
           WatchState::Unwatched => None,
           WatchState::InProgress => {
               if item.technical.duration_seconds > 0 {
                   Some(
                       (p.playback_position_seconds as f32
                           / item.technical.duration_seconds as f32)
                           .clamp(0.0, 1.0),
                   )
               } else {
                   None
               }
           }
       }
   } else {
       None
   };
   ```
3. In `crates/kadr-storage/src/repos/search_repo.rs:334-339`, align search `playback_progress`:
   ```rust
   let playback_progress = match (playback_position_seconds, watch_state.as_deref()) {
       (_, Some("completed")) => Some(1.0),
       (_, Some("unwatched")) => None,
       (Some(pos), Some("in_progress")) if duration_seconds > 0 => {
           Some((pos as f32 / duration_seconds as f32).clamp(0.0, 1.0))
       }
       _ => None,
   };
   ```
4. In `crates/kadr-server/src/resolver/resolver.rs:759-762`, normalize `resume_position_seconds`:
   ```rust
   let resume_position_seconds = playback.as_ref().and_then(|p| {
       if p.watch_state == WatchState::InProgress && p.playback_position_seconds > 0 {
           Some(p.playback_position_seconds as u64)
       } else {
           None
       }
   });
   ```
5. In `crates/kadr-server/src/playback/handler.rs`, import `crate::api::unlock_token::UnlockedLibraries`, `kadr_storage::repos::LibraryRepository`, and `std::collections::HashSet`, and add:
   ```rust
   #[derive(Deserialize, Debug)]
   pub struct SetWatchStateRequest {
       pub watched: bool,
   }

   #[derive(Deserialize, Debug)]
   pub struct SetBatchWatchStateRequest {
       pub item_ids: Vec<i64>,
       pub watched: bool,
   }

   pub async fn set_playback_state(
       auth_user: AuthUser,
       unlocked: UnlockedLibraries,
       Path(item_id): Path<i64>,
       Extension(media_repo): Extension<MediaItemRepository>,
       Extension(lib_repo): Extension<LibraryRepository>,
       Extension(playback_repo): Extension<PlaybackRepository>,
       event_bus: Option<Extension<Arc<EventBus>>>,
       Json(payload): Json<SetWatchStateRequest>,
   ) -> impl IntoResponse {
       let item = match media_repo.get_by_id(item_id).await {
           Ok(Some(i)) => i,
           Ok(None) => {
               return (
                   StatusCode::NOT_FOUND,
                   Json(serde_json::json!({ "error": "Media item not found" })),
               )
                   .into_response();
           }
           Err(e) => {
               return (
                   StatusCode::INTERNAL_SERVER_ERROR,
                   Json(serde_json::json!({ "error": e.to_string() })),
               )
                   .into_response();
           }
       };

       if item.is_live() {
           return (
               StatusCode::BAD_REQUEST,
               Json(serde_json::json!({ "error": "Live items do not support watch state" })),
           )
               .into_response();
       }

       if let Ok(Some(lib)) = lib_repo.get_by_id(&item.library_id).await {
           if lib.is_private && !unlocked.is_unlocked(&item.library_id) {
               return (
                   StatusCode::FORBIDDEN,
                   Json(serde_json::json!({ "error": "LIBRARY_LOCKED" })),
               )
                   .into_response();
           }
       }

       let now = SystemTime::now()
           .duration_since(UNIX_EPOCH)
           .unwrap_or_default()
           .as_secs() as i64;

       if let Err(e) = playback_repo
           .set_watch_states_batch(
               &auth_user.id,
               &[(item_id, item.technical.duration_seconds)],
               payload.watched,
               now,
           )
           .await
       {
           return (
               StatusCode::INTERNAL_SERVER_ERROR,
               Json(serde_json::json!({ "error": e.to_string() })),
           )
               .into_response();
       }

       if let Some(Extension(bus)) = event_bus {
           bus.publish(SystemEvent::LayoutChanged {
               screen_id: "home".to_string(),
               timestamp: now,
           });
       }

       match playback_repo.get_state(&auth_user.id, item_id).await {
           Ok(Some(s)) => (StatusCode::OK, Json(s)).into_response(),
           Ok(None) => StatusCode::OK.into_response(),
           Err(e) => (
               StatusCode::INTERNAL_SERVER_ERROR,
               Json(serde_json::json!({ "error": e.to_string() })),
           )
               .into_response(),
       }
   }

   pub async fn set_playback_states_batch(
       auth_user: AuthUser,
       unlocked: UnlockedLibraries,
       Extension(media_repo): Extension<MediaItemRepository>,
       Extension(lib_repo): Extension<LibraryRepository>,
       Extension(playback_repo): Extension<PlaybackRepository>,
       event_bus: Option<Extension<Arc<EventBus>>>,
       Json(payload): Json<SetBatchWatchStateRequest>,
   ) -> impl IntoResponse {
       let mut seen = HashSet::new();
       let unique_ids: Vec<i64> = payload
           .item_ids
           .into_iter()
           .filter(|id| seen.insert(*id))
           .collect();

       if unique_ids.is_empty() || unique_ids.len() > 500 {
           return (
               StatusCode::BAD_REQUEST,
               Json(serde_json::json!({ "error": "item_ids must contain 1..=500 items" })),
           )
               .into_response();
       }

       let items_map = match media_repo.get_by_ids(&unique_ids).await {
           Ok(m) => m,
           Err(e) => {
               return (
                   StatusCode::INTERNAL_SERVER_ERROR,
                   Json(serde_json::json!({ "error": e.to_string() })),
               )
                   .into_response();
           }
       };

       let mut checked_libs = HashSet::new();
       for item in items_map.values() {
           if checked_libs.insert(item.library_id.clone()) {
               if let Ok(Some(lib)) = lib_repo.get_by_id(&item.library_id).await {
                   if lib.is_private && !unlocked.is_unlocked(&item.library_id) {
                       return (
                           StatusCode::FORBIDDEN,
                           Json(serde_json::json!({ "error": "LIBRARY_LOCKED" })),
                       )
                           .into_response();
                   }
               }
           }
       }

       let entries: Vec<(i64, i64)> = unique_ids
           .into_iter()
           .filter_map(|id| items_map.get(&id).map(|it| (id, it)))
           .filter(|(_, it)| !it.is_live())
           .map(|(id, it)| (id, it.technical.duration_seconds))
           .collect();

       let now = SystemTime::now()
           .duration_since(UNIX_EPOCH)
           .unwrap_or_default()
           .as_secs() as i64;

       match playback_repo
           .set_watch_states_batch(&auth_user.id, &entries, payload.watched, now)
           .await
       {
           Ok(updated) => {
               if updated > 0 {
                   if let Some(Extension(bus)) = event_bus {
                       bus.publish(SystemEvent::LayoutChanged {
                           screen_id: "home".to_string(),
                           timestamp: now,
                       });
                   }
               }
               (
                   StatusCode::OK,
                   Json(serde_json::json!({
                       "updated": updated,
                       "watched": payload.watched,
                   })),
               )
                   .into_response()
           }
           Err(e) => (
               StatusCode::INTERNAL_SERVER_ERROR,
               Json(serde_json::json!({ "error": e.to_string() })),
           )
               .into_response(),
       }
   }
   ```
6. In `crates/kadr-server/src/api/mod.rs:150-154`, register:
   ```rust
   .route(
       "/api/v1/playback/states",
       axum::routing::put(playback::set_playback_states_batch),
   )
   .route(
       "/api/v1/playback/states/{item_id}",
       get(playback::get_playback_state).put(playback::set_playback_state),
   )
   ```

- [ ] **Step 4: Run `cargo test` across `kadr-storage` & `kadr-server` and build release binary (GREEN)**

Run in `/home/boody/work/personal/kadr`:
`cargo test -p kadr-storage -p kadr-server && cargo build --release --bin kadr`
Expected: PASS (100% green) and `/home/boody/work/personal/kadr/target/release/kadr` compiled cleanly.

- [ ] **Step 5: Commit Task 1 in `/home/boody/work/personal/kadr`**

```bash
git -C /home/boody/work/personal/kadr add crates/kadr-storage/src/repos/playback_repo.rs crates/kadr-storage/src/repos/search_repo.rs crates/kadr-server/src/resolver/card.rs crates/kadr-server/src/resolver/resolver.rs crates/kadr-server/src/playback/handler.rs crates/kadr-server/src/api/mod.rs crates/kadr-server/tests/playback_test.rs
git -C /home/boody/work/personal/kadr commit -m "feat(playback): add manual single and batch watch-state PUT endpoints"
```

---

### Task 2: Client Watch-State API & Optimistic `applyWatchStateMutation` Helper (`kadr-tizenos`)

**Working Directory:** `/home/boody/work/personal/kadr-tizenos`

**Files:**
- Modify: `src/api/playback.ts:53-60`
- Modify: `src/utils/playbackProgress.ts:22-76`
- Create: `tests/api/playbackWatchState.test.ts`

**Interfaces:**
- Produces:
  - `src/api/playback.ts`:
    - `export async function setItemWatchState(client: ApiClient, itemId: number | string, watched: boolean): Promise<void>`
    - `export async function setBatchWatchState(client: ApiClient, itemIds: Array<number | string>, watched: boolean): Promise<{ updated: number; watched: boolean }>`
  - `src/utils/playbackProgress.ts`:
    - `export function applyWatchStateMutation(item: MediaItemDetail, targetIds: ReadonlySet<string>, watched: boolean): MediaItemDetail`

- [ ] **Step 1: Write failing unit tests in `tests/api/playbackWatchState.test.ts`**

Create `tests/api/playbackWatchState.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiClient } from '../../src/api/client';
import { setBatchWatchState, setItemWatchState } from '../../src/api/playback';
import { applyWatchStateMutation } from '../../src/utils/playbackProgress';
import { MediaItemDetail } from '../../src/api/items';

describe('playback watch-state API & optimistic mutation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('calls PUT /api/v1/playback/states/{id} for single item watch state', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ watch_state: 'completed' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new ApiClient('http://192.168.1.50:8492');
    client.setToken('jwt-1');

    await setItemWatchState(client, 42, true);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://192.168.1.50:8492/api/v1/playback/states/42',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ watched: true }),
      })
    );
  });

  it('calls PUT /api/v1/playback/states for batch season watch state', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ updated: 3, watched: false }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new ApiClient('http://192.168.1.50:8492');
    client.setToken('jwt-1');

    const res = await setBatchWatchState(client, ['101', 102, 103], false);

    expect(res).toEqual({ updated: 3, watched: false });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://192.168.1.50:8492/api/v1/playback/states',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ item_ids: [101, 102, 103], watched: false }),
      })
    );
  });

  it('optimistically mutates movie and episode watch states cleanly via applyWatchStateMutation', () => {
    const movie: MediaItemDetail = {
      id: 99,
      title: 'Dune',
      resume_position_ms: 1800000,
      resume_position_seconds: 1800,
      card: {
        id: 99,
        title: 'Dune',
        media_type: 'movie',
        playback_progress: 0.35,
        badge: 'RESUME',
      },
    };

    const watchedMovie = applyWatchStateMutation(movie, new Set(['99']), true);
    expect(watchedMovie.resume_position_ms).toBe(0);
    expect(watchedMovie.resume_position_seconds).toBe(0);
    expect(watchedMovie.card?.playback_progress).toBe(1);
    expect(watchedMovie.card?.badge).toBeUndefined();

    const unwatchedMovie = applyWatchStateMutation(watchedMovie, new Set(['99']), false);
    expect(unwatchedMovie.resume_position_ms).toBe(0);
    expect(unwatchedMovie.card?.playback_progress).toBe(0);

    const show: MediaItemDetail = {
      id: 200,
      title: 'Severance',
      episodes: [
        { id: 201, title: 'Ep 1', season: 1, episode: 1, playback_progress: 0.4, badge: 'RESUME' },
        { id: 202, title: 'Ep 2', season: 1, episode: 2, playback_progress: 0, badge: '4K' },
      ],
    };

    const updatedShow = applyWatchStateMutation(show, new Set(['201', '202']), true);
    expect(updatedShow.episodes?.[0].playback_progress).toBe(1);
    expect(updatedShow.episodes?.[0].badge).toBeUndefined();
    expect(updatedShow.episodes?.[1].playback_progress).toBe(1);
    expect(updatedShow.episodes?.[1].badge).toBe('4K');
  });
});
```

- [ ] **Step 2: Run Vitest on `playbackWatchState.test.ts` to verify failure (RED)**

Run: `npx vitest run tests/api/playbackWatchState.test.ts`
Expected: FAIL (`setItemWatchState is not a function` / `applyWatchStateMutation is not a function`).

- [ ] **Step 3: Implement `setItemWatchState`, `setBatchWatchState`, and `applyWatchStateMutation`**

1. In `src/api/playback.ts`, append:
   ```ts
   export async function setItemWatchState(
     client: ApiClient,
     itemId: number | string,
     watched: boolean
   ): Promise<void> {
     await client.fetch<unknown>(`/api/v1/playback/states/${encodeURIComponent(String(itemId))}`, {
       method: 'PUT',
       headers: {
         'Content-Type': 'application/json',
       },
       body: JSON.stringify({ watched }),
     });
   }

   export async function setBatchWatchState(
     client: ApiClient,
     itemIds: Array<number | string>,
     watched: boolean
   ): Promise<{ updated: number; watched: boolean }> {
     const numericIds = itemIds
       .map((id) => (typeof id === 'number' ? id : parseInt(String(id), 10)))
       .filter((id) => Number.isFinite(id));
     return client.fetch<{ updated: number; watched: boolean }>('/api/v1/playback/states', {
       method: 'PUT',
       headers: {
         'Content-Type': 'application/json',
       },
       body: JSON.stringify({ item_ids: numericIds, watched }),
     });
   }
   ```
2. In `src/utils/playbackProgress.ts`, append:
   ```ts
   export function applyWatchStateMutation(
     item: MediaItemDetail,
     targetIds: ReadonlySet<string>,
     watched: boolean
   ): MediaItemDetail {
     if (targetIds.size === 0) return item;

     let nextItem = item;
     const selfId = String(item.id ?? item.card?.id ?? '');
     if (selfId && targetIds.has(selfId)) {
       const nextProgress = watched ? 1 : 0;
       const nextBadge = item.card?.badge === 'RESUME' ? undefined : item.card?.badge;
       nextItem = {
         ...nextItem,
         resume_position_ms: 0,
         resume_position_seconds: 0,
         card: nextItem.card
           ? {
               ...nextItem.card,
               playback_progress: nextProgress,
               badge: nextBadge,
             }
           : {
               id: item.id ?? 0,
               title: item.title ?? '',
               playback_progress: nextProgress,
             },
       };
     }

     if (nextItem.episodes && nextItem.episodes.length > 0) {
       let changed = false;
       const nextProgress = watched ? 1 : 0;
       const updatedEpisodes = nextItem.episodes.map((ep) => {
         if (!targetIds.has(String(ep.id))) return ep;
         const nextBadge = ep.badge === 'RESUME' ? undefined : ep.badge;
         if (ep.playback_progress === nextProgress && ep.badge === nextBadge) {
           return ep;
         }
         changed = true;
         return {
           ...ep,
           playback_progress: nextProgress,
           badge: nextBadge,
         };
       });

       if (changed) {
         nextItem = {
           ...nextItem,
           episodes: updatedEpisodes,
         };
       }
     }

     return nextItem;
   }
   ```

- [ ] **Step 4: Run Vitest & `tsc -b` to verify GREEN**

Run: `npx vitest run tests/api/playbackWatchState.test.ts && npx tsc -b`
Expected: PASS (3/3 tests green, `tsc -b` exit 0).

- [ ] **Step 5: Commit Task 2**

```bash
git add src/api/playback.ts src/utils/playbackProgress.ts tests/api/playbackWatchState.test.ts
git commit -m "feat(playback): add watch-state API client helpers and optimistic state reducer"
```

---

### Task 3: `ItemDetailModal` Watch Controls, Episode Inline Action Strip, D-Pad Matrix & `App.tsx` Sync (`kadr-tizenos`)

**Working Directory:** `/home/boody/work/personal/kadr-tizenos`

**Files:**
- Modify: `src/screens/ItemDetailModal.tsx`
- Modify: `src/App.tsx:250-420,600-675`
- Modify: `tests/screens/ItemDetailModal.test.tsx:340-368`
- Modify: `tests/screens/ItemDetailModal.seasons.test.tsx`
- Modify: `tests/App.test.tsx`

**Interfaces:**
- Consumes: `setItemWatchState`, `setBatchWatchState` from `src/api/playback.ts`; `applyWatchStateMutation` from `src/utils/playbackProgress.ts`
- Produces:
  - `ItemDetailModalProps.onWatchStateChange?: (itemIds: Array<number | string>, watched: boolean) => Promise<void> | void`
  - Hero buttons: `detail-restart-btn` (also on resumable TV Shows!), `detail-watch-toggle-btn` (`"Mark Watched"` / `"Mark Unwatched"` on Movies/Videos), `detail-clear-progress-btn` (`"Mark Unwatched"` on in-progress Movies/Videos)
  - Season header button: `season-watch-toggle-btn` (`"Mark Season X Watched"` / `"Mark Season X Unwatched"`)
  - Episode inline action strip (`data-testid="episode-action-strip"`): `episode-action-restart` (`"Play from Beginning"`), `episode-action-watch-toggle` (`"Mark Watched"` / `"Mark Unwatched"`), `episode-action-clear-progress` (`"Mark Unwatched"` when episode is partially watched)

- [ ] **Step 1: Write failing UI & integration tests in `tests/screens/ItemDetailModal.test.tsx`, `tests/screens/ItemDetailModal.seasons.test.tsx`, and `tests/App.test.tsx`**

1. In `tests/screens/ItemDetailModal.test.tsx`:
   - Update the existing `ArrowRight` order assertion at `lines 348-362` on `mockMovieWithResume` to step through `detail-resume-btn` -> `detail-restart-btn` -> `detail-watch-toggle-btn` -> `detail-clear-progress-btn` -> `detail-add-playlist-btn` -> `detail-close-btn`.
   - Add tests verifying:
     - Movie watch-state buttons: clicking `"Mark Watched"` (`detail-watch-toggle-btn`) optimistically flips the button to `"Mark Unwatched"` and clears `"Resume (60m)"` to `"Play"`; clicking `"Mark Unwatched"` (`detail-clear-progress-btn`) on an in-progress movie resets it to unwatched (`"Play"` + `"Mark Watched"`). Live channel (`isLiveChannel`) hides watch-state toggles.
     - Show hero `"Play from Beginning"` (`detail-restart-btn`): rendered alongside `"Resume Next"` when `nextEpisode` is resumable (`0.3`), calling `onPlay(207, 0, 'Half Loop', undefined, expect.any(Array), 1)`.
     - Episode inline action strip (`#episode-action-strip`):
       - Pressing `[OK]` (`Enter`) on `episode-card-207` still instant-plays at resume sentinel `30`.
       - Focusing `episode-card-207` updates `#episode-action-strip` header to `S01E02 • "Half Loop"`, and pressing `ArrowDown` moves focus to `episode-action-restart` (`"Play from Beginning"`), which calls `onPlay(207, 0, 'Half Loop', ...)` on `Enter`.
       - Pressing `ArrowRight` moves across `episode-action-watch-toggle` (`"Mark Watched"`) and `episode-action-clear-progress` (`"Mark Unwatched"`), clamping at the right edge; activating `episode-action-clear-progress` resets episode `207` to unwatched (`0%`) and anchors focus on `episode-action-watch-toggle`; pressing `ArrowUp` returns focus to `episode-card-207`.
2. In `tests/screens/ItemDetailModal.seasons.test.tsx`:
   - Add test verifying `ArrowRight` from the last season tab (`season-tab-3`) focuses `season-watch-toggle-btn` (`"Mark Season 1 Watched"`), `ArrowLeft` returns to `season-tab-3`, and activating `season-watch-toggle-btn` marks all episodes in `selectedSeason` watched and flips the label to `"Mark Season 1 Unwatched"`.
3. In `tests/App.test.tsx`:
   - Add integration test verifying clicking `"Mark Watched"` / `"Mark Season 1 Watched"` inside `ItemDetailModal` invokes `PUT /api/v1/playback/states...`, updates `ItemDetailModal` badges/buttons optimistically, clears stale `sessionProgressRef` entries, and triggers a background `BrowseScreen` layout refresh.

- [ ] **Step 2: Run Vitest on the targeted test files to verify failure (RED)**

Run: `npx vitest run tests/screens/ItemDetailModal.test.tsx tests/screens/ItemDetailModal.seasons.test.tsx tests/App.test.tsx -t "watch|Beginning|Season"`
Expected: FAIL (missing `detail-watch-toggle-btn`, `season-watch-toggle-btn`, and `episode-action-strip`).

- [ ] **Step 3: Implement watch controls & D-pad matrix in `src/screens/ItemDetailModal.tsx` and wire `onWatchStateChange` in `src/App.tsx`**

1. **`src/screens/ItemDetailModal.tsx`:**
   - Add `onWatchStateChange?: (itemIds: Array<number | string>, watched: boolean) => Promise<void> | void;` to `ItemDetailModalProps`.
   - Track local optimistic `optimisticItem` (`const [prevPropItem, setPrevPropItem] = useState(item); const [localItem, setLocalItem] = useState(item); if (prevPropItem !== item) { setPrevPropItem(item); setLocalItem(item); }`) and derive all item/episode fields from `effectiveItem = localItem ?? item` so both standalone `ItemDetailModal` tests and `App.tsx`-managed renders update instantaneously!
   - Implement `handleSetWatchState(targetIds: Array<number | string>, watched: boolean)`:
     - Immediately update `setLocalItem((prev) => prev ? applyWatchStateMutation(prev, new Set(targetIds.map(String)), watched) : prev)`.
     - If `onWatchStateChange` is provided, call `Promise.resolve(onWatchStateChange(targetIds, watched)).catch(...)` (rolling back `setLocalItem(snapshot)` if it rejects); otherwise call `targetIds.length === 1 ? setItemWatchState(fallbackClient, targetIds[0], watched) : setBatchWatchState(fallbackClient, targetIds, watched)` (rolling back on rejection).
   - **Hero Action Strip (`#remote-action-strip`):**
     - On TV Shows (`isShow && nextEpisode`): when `isEpisodeResume` is `true`, render `detail-resume-btn` followed by `detail-restart-btn` (`"Play from Beginning"`, calling `handlePlayShowStart`).
     - On Movies / Standalone VOD (`!isShow && !isLiveChannel && canAddToPlaylist`):
       - Render `detail-watch-toggle-btn` (`icon`: `CheckCircle2` or `RotateCcw`, label: `isItemCompleted ? 'Mark Unwatched' : 'Mark Watched'`, calling `handleSetWatchState([resolvedId!], !isItemCompleted)`).
       - When `Boolean(resolvedResumeMs && resolvedResumeMs > 0)` (in-progress movie, where `!isItemCompleted`), ALSO render `detail-clear-progress-btn` (`label: 'Mark Unwatched'`, calling `handleSetWatchState([resolvedId!], false)`).
     - Assign sequential `order` numbers (`1, 2, 3, ...`) across all rendered `#remote-action-strip` buttons (`detail-resume-btn`/`detail-play-btn`, `detail-restart-btn`, `detail-watch-toggle-btn`, `detail-clear-progress-btn`, `detail-browse-folder-btn`, `detail-add-playlist-btn`, `detail-close-btn`).
     - Note: if `detail-clear-progress-btn` or `detail-restart-btn` was focused when activated (causing it to unmount as `resolvedResumeMs` becomes `0`), synchronously move focus to `detail-play-btn` (or `detail-watch-toggle-btn`) via `setFocusedId`!
   - **Season Header Bulk Toggle (`season-watch-toggle-btn`):**
     - When `visibleSeasonEpisodes.length > 0`, compute `allSeasonWatched = visibleSeasonEpisodes.every((ep) => (ep.playback_progress ?? 0) >= 0.9)`.
     - Render `TVButton` `id="season-watch-toggle-btn"` (`groupId="season-tabs"`, `order={seasons.length + 1}`) on the right side of the Season Tabs bar with label `allSeasonWatched ? \`Mark Season ${selectedSeason} Unwatched\` : \`Mark Season ${selectedSeason} Watched\`` (zero `gap-*` classes; explicit `mr-2` on icon).
   - **Active-Episode Tracking & Inline Action Strip (`data-testid="episode-action-strip"`):**
     - Pass `onFocusEpisode={(epId) => setActiveEpisodeId(epId)}` to `EpisodeLandscapeCard` (invoked when the card receives DOM focus or `isFocused` becomes true). Reset `activeEpisodeId` synchronously during render when `resolvedId` or `selectedSeason` changes (`visibleSeasonEpisodes[0]?.id ?? null`).
     - Resolve `activeEpisode = visibleSeasonEpisodes.find((e) => String(e.id) === String(activeEpisodeId)) ?? visibleSeasonEpisodes[0] ?? null`.
     - Render `#episode-action-strip` (`data-testid="episode-action-strip"`) directly below the episode carousel when `activeEpisode` is non-null:
       - Left label (`className="text-sm font-mono text-[#ffb871] font-semibold mr-4 truncate"`):
         `<span>{\`S${String(activeEpisode.season ?? 1).padStart(2, '0')}E${String(activeEpisode.episode ?? 1).padStart(2, '0')} • "${activeEpisode.title}"\`}</span>`
       - Action pills (`groupId="episode-actions"`, explicit `mr-3 last:mr-0`, zero `gap-*`):
         1. When `activeEpResumable` (`progress > 0 && progress < 0.9`): `id="episode-action-restart"` (`"Play from Beginning"`), calling `handlePlayEpisodeFromStart(activeEpisode)`.
         2. Always: `id="episode-action-watch-toggle"` (`activeEpWatched ? 'Mark Unwatched' : 'Mark Watched'`), calling `handleSetWatchState([activeEpisode.id], !activeEpWatched)`.
         3. When `activeEpResumable`: `id="episode-action-clear-progress"` (`"Mark Unwatched"`), calling `() => { setFocusedId('episode-action-watch-toggle'); handleSetWatchState([activeEpisode.id], false); }`.
   - **5-Button D-Pad Key Matrix Updates in `handleKeyDown`:**
     - `isSeasonRow = isSeasonTab || current === 'season-watch-toggle-btn' || activeDomId === 'season-watch-toggle-btn'`.
     - `isEpisodeAction = current.startsWith('episode-action-') || activeDomId.startsWith('episode-action-')`.
     - `ArrowDown`:
       - `isDetailAction` -> `setFocusedId(\`season-tab-${selectedSeason}\`)`.
       - `isSeasonRow` -> `setFocusedId(\`episode-card-${(activeEpisode ?? visibleSeasonEpisodes[0]).id}\`)` (wait: keep existing behavior when pressing Down from a `season-tab-*`: `visibleSeasonEpisodes[0]` so `ItemDetailModal.seasons.test.tsx:90-95` stays 100% intact! Specifically: `setFocusedId(\`episode-card-${visibleSeasonEpisodes[0].id}\`)`).
       - `isEpisodeCard` -> focus first rendered `#episode-action-strip` button (`episode-action-restart` if `activeEpResumable`, else `episode-action-watch-toggle`) with `e.preventDefault(); e.stopImmediatePropagation();`.
     - `ArrowUp`:
       - `isEpisodeAction` -> `e.preventDefault(); e.stopImmediatePropagation(); setFocusedId(\`episode-card-${activeEpisode.id}\`)`.
       - `isEpisodeCard` -> `setFocusedId(\`season-tab-${selectedSeason}\`)`.
       - `isSeasonRow` -> `setFocusedId(primaryBtnId)`.
     - `ArrowRight` / `ArrowLeft`:
       - On `season-tab-*`: `ArrowRight` on the last season tab (`currentIdx === seasons.length - 1`) moves to `'season-watch-toggle-btn'` when present; `ArrowLeft` on `'season-watch-toggle-btn'` moves to `season-tab-${seasons[seasons.length - 1]}`.
       - On `episode-action-*`: `ArrowLeft` / `ArrowRight` steps strictly across the ordered array of rendered action IDs (`episodeActionIds`), calling `e.preventDefault(); e.stopImmediatePropagation();` even at the left/right boundaries so spatial nav never jumps out of `#episode-action-strip`.
     - Remote footer hint bar: add `[▼] Episode Options` span (`mr-8`) when `seasons.length > 0`.
2. **`src/App.tsx`:**
   - Implement `handleWatchStateChange = async (itemIds: Array<number | string>, watched: boolean)`:
     - Convert `idSet = new Set(itemIds.map(String))`.
     - Delete each ID in `idSet` from `sessionProgressRef.current`.
     - Capture `previousActiveItem = activeItem` and apply `setActiveItem((prev) => prev ? applyWatchStateMutation(prev, idSet, watched) : prev)` (and update `suspendedItemDetail` if present).
     - Persist via `itemIds.length === 1 ? await setItemWatchState(client, itemIds[0], watched) : await setBatchWatchState(client, itemIds, watched)`.
     - Bump `setScreenRefreshKey((k) => k + 1)`, `if (folderBrowserState) setFolderRefreshKey((k) => k + 1)`, and `if (activePlaylistId) setPlaylistRefreshKey((k) => k + 1)`.
     - On catch: restore `setActiveItem((prev) => ...)` from `previousActiveItem` (if still viewing the same item).
   - Pass `onWatchStateChange={handleWatchStateChange}` to `<ItemDetailModal>`.

- [ ] **Step 4: Run zero-gap check, full Vitest suite, `chrome69` build, and `.wgt` packaging (GREEN)**

Run:
1. `(! grep -rn "gap-" src/api/playback.ts src/utils/playbackProgress.ts src/screens/ItemDetailModal.tsx src/App.tsx)`
2. `npm test -- --run`
3. `npm run build && npm run package:wgt -- --no-build`
Expected: 100% test suites passing, 0 `gap-*` matches, `chrome69` build green, and `kadr.wgt` signed cleanly.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/screens/ItemDetailModal.tsx src/App.tsx tests/screens/ItemDetailModal.test.tsx tests/screens/ItemDetailModal.seasons.test.tsx tests/App.test.tsx
git commit -m "feat(detail): add episode Play from Beginning and Movie/Season/Episode watch toggles"
```
