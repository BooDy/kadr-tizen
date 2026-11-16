import { ApiClient } from './client';
import { CardViewModel } from '../types/ast';

export interface PlaylistSummary {
  id: string;
  name: string;
  description?: string;
  owner_user_id: string;
  owner_username: string;
  is_public: boolean;
  is_editable: boolean;
  visible_item_count: number;
  locked_item_count: number;
  total_duration_seconds: number;
  cover_poster_urls: string[];
  created_at: number;
  updated_at: number;
  contains_queried_item?: boolean;
}

export interface PlaylistItemView {
  position: number;
  added_at: number;
  duration_seconds: number;
  resume_position_seconds?: number;
  card: CardViewModel;
}

export interface PlaylistDetail {
  summary: PlaylistSummary;
  items: PlaylistItemView[];
}

export interface ListPlaylistsResponse {
  playlists: PlaylistSummary[];
}

export interface AddPlaylistItemsRequest {
  item_ids?: number[];
  show?: {
    show_id: number;
    season_number?: number;
  };
  folder?: {
    library_id: string;
    path: string;
    recursive?: boolean;
  };
}

export interface CreatePlaylistRequest {
  name: string;
  description?: string;
  is_public?: boolean;
  items?: AddPlaylistItemsRequest;
}

export interface UpdatePlaylistRequest {
  name?: string;
  description?: string;
  is_public?: boolean;
}

export interface AddPlaylistItemsResponse {
  added_count: number;
  skipped_duplicate_count: number;
  summary: PlaylistSummary;
}

/**
 * 1. GET /api/v1/playlists?contains_item_id=<optional i64>
 */
export async function fetchPlaylists(
  client: ApiClient,
  containsItemId?: number | string
): Promise<PlaylistSummary[]> {
  const hasContains =
    containsItemId !== undefined &&
    containsItemId !== null &&
    String(containsItemId).trim() !== '';
  const query = hasContains
    ? `?contains_item_id=${encodeURIComponent(String(containsItemId))}`
    : '';
  const res = await client.fetch<ListPlaylistsResponse | PlaylistSummary[]>(
    `/api/v1/playlists${query}`
  );
  if (Array.isArray(res)) {
    return res;
  }
  return res?.playlists ?? [];
}

/**
 * 2. POST /api/v1/playlists (with optional atomic 1-step `items` seed)
 */
export async function createPlaylist(
  client: ApiClient,
  request: CreatePlaylistRequest
): Promise<PlaylistDetail> {
  const payload: CreatePlaylistRequest = {
    name: request.name.trim(),
  };
  if (request.description !== undefined) {
    const trimmedDesc = request.description.trim();
    if (trimmedDesc.length > 0) {
      payload.description = trimmedDesc;
    }
  }
  if (request.is_public !== undefined) {
    payload.is_public = request.is_public;
  }
  if (request.items !== undefined) {
    payload.items = request.items;
  }

  return client.fetch<PlaylistDetail>('/api/v1/playlists', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

/**
 * 3. GET /api/v1/playlists/{id}
 */
export async function fetchPlaylistDetail(
  client: ApiClient,
  playlistId: string
): Promise<PlaylistDetail> {
  return client.fetch<PlaylistDetail>(
    `/api/v1/playlists/${encodeURIComponent(playlistId)}`
  );
}

/**
 * 4. PATCH /api/v1/playlists/{id}
 */
export async function updatePlaylist(
  client: ApiClient,
  playlistId: string,
  request: UpdatePlaylistRequest
): Promise<PlaylistSummary> {
  const payload: UpdatePlaylistRequest = {};
  if (request.name !== undefined) {
    payload.name = request.name.trim();
  }
  if (request.description !== undefined) {
    payload.description = request.description.trim();
  }
  if (request.is_public !== undefined) {
    payload.is_public = request.is_public;
  }

  return client.fetch<PlaylistSummary>(
    `/api/v1/playlists/${encodeURIComponent(playlistId)}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );
}

/**
 * 5. DELETE /api/v1/playlists/{id}
 */
export async function deletePlaylist(
  client: ApiClient,
  playlistId: string
): Promise<void> {
  await client.fetch<void>(
    `/api/v1/playlists/${encodeURIComponent(playlistId)}`,
    {
      method: 'DELETE',
    }
  );
}

/**
 * 6. POST /api/v1/playlists/{id}/items
 */
export async function addPlaylistItems(
  client: ApiClient,
  playlistId: string,
  request: AddPlaylistItemsRequest
): Promise<AddPlaylistItemsResponse> {
  return client.fetch<AddPlaylistItemsResponse>(
    `/api/v1/playlists/${encodeURIComponent(playlistId)}/items`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    }
  );
}

/**
 * 7. DELETE /api/v1/playlists/{id}/items/{media_item_id}
 */
export async function removePlaylistItem(
  client: ApiClient,
  playlistId: string,
  mediaItemId: number | string
): Promise<PlaylistSummary> {
  return client.fetch<PlaylistSummary>(
    `/api/v1/playlists/${encodeURIComponent(playlistId)}/items/${encodeURIComponent(
      String(mediaItemId)
    )}`,
    {
      method: 'DELETE',
    }
  );
}

/**
 * 8. PUT /api/v1/playlists/{id}/items/order
 */
export async function reorderPlaylistItems(
  client: ApiClient,
  playlistId: string,
  itemIds: number[]
): Promise<PlaylistSummary> {
  return client.fetch<PlaylistSummary>(
    `/api/v1/playlists/${encodeURIComponent(playlistId)}/items/order`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ item_ids: itemIds }),
    }
  );
}

/**
 * Returns a new array shuffled using Fisher-Yates without mutating the input array.
 */
export function shufflePlaylistItems<T>(
  items: readonly T[],
  randomFn: () => number = Math.random
): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(randomFn() * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

/**
 * Computes initial playback resume position in milliseconds for a playlist queue item.
 * Preserves `resume_position_seconds` ONLY when present and > 0, and returns 0 when
 * omitted (e.g. completed items), when `duration_seconds <= 0`, or for `live_channel`.
 */
export function getPlaylistItemResumeMs(
  item: Pick<PlaylistItemView, 'duration_seconds' | 'resume_position_seconds'> & {
    card?: Pick<CardViewModel, 'media_type'>;
  }
): number {
  if (item.card?.media_type === 'live_channel') {
    return 0;
  }
  if (!item.duration_seconds || item.duration_seconds <= 0) {
    return 0;
  }
  if (
    typeof item.resume_position_seconds === 'number' &&
    Number.isFinite(item.resume_position_seconds) &&
    item.resume_position_seconds > 0
  ) {
    return Math.round(item.resume_position_seconds * 1000);
  }
  return 0;
}

/**
 * Formats playlist total or item duration in seconds for 10-foot TV UI display.
 */
export function formatPlaylistDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return '0m';
  }
  const secs = Math.floor(totalSeconds);
  if (secs < 60) {
    return `${secs}s`;
  }
  const hours = Math.floor(secs / 3600);
  const mins = Math.floor((secs % 3600) / 60);
  if (hours > 0) {
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
  return `${mins}m`;
}
