import { ApiClient } from './client';
import { SubtitleTrack } from '../types/kadr';

export async function fetchItemSubtitles(
  client: ApiClient,
  itemId: number
): Promise<SubtitleTrack[]> {
  return client.fetch<SubtitleTrack[]>(`/api/v1/items/${itemId}/subtitles`);
}
