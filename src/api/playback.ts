import { ApiClient } from './client';
import { PlaybackSession } from '../types/kadr';

export async function reportPlaybackProgress(
  serverUrl: string,
  token: string,
  itemId: number | string,
  positionMs: number,
  isPaused: boolean
): Promise<void> {
  const cleanUrl = serverUrl.replace(/\/+$/, '');
  await fetch(`${cleanUrl}/api/v1/playback/progress`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      item_id: itemId,
      position_ms: positionMs,
      is_paused: isPaused,
    }),
  }).catch(() => {});
}

export async function startPlaybackSession(
  client: ApiClient,
  mediaItemId: number
): Promise<PlaybackSession> {
  return client.fetch<PlaybackSession>('/api/v1/playback/sessions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ media_item_id: mediaItemId }),
  });
}

export async function reportSessionProgress(
  client: ApiClient,
  sessionId: string,
  positionSeconds: number
): Promise<void> {
  await client.fetch<void>(`/api/v1/playback/${encodeURIComponent(sessionId)}/progress`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ position_seconds: positionSeconds }),
  });
}

export async function endPlaybackSession(
  client: ApiClient,
  sessionId: string
): Promise<void> {
  await client.fetch<void>(`/api/v1/playback/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
  });
}

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
