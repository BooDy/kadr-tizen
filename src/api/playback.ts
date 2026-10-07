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
  await client.fetch<void>(`/api/v1/playback/${sessionId}/progress`, {
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
  await client.fetch<void>(`/api/v1/playback/sessions/${sessionId}`, {
    method: 'DELETE',
  });
}
