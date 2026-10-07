import { ApiClient } from './client';
import { MediaItemDetail } from '../types/kadr';

export type { MediaItemDetail };

export async function fetchMediaItem(client: ApiClient, itemId: number | string): Promise<MediaItemDetail> {
  return client.fetch<MediaItemDetail>(`/api/v1/items/${itemId}`);
}
