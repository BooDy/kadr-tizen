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
