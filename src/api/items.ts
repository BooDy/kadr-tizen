import { ApiClient } from './client';

export interface MediaItemDetail {
  id: number | string;
  title: string;
  overview?: string;
  release_year?: number;
  duration_ms?: number;
  resume_position_ms?: number;
  media_type: string;
  resolution?: string;
  poster_url?: string;
  backdrop_url?: string;
}

export async function fetchMediaItem(client: ApiClient, itemId: number | string): Promise<MediaItemDetail> {
  return client.fetch<MediaItemDetail>(`/api/v1/items/${itemId}`);
}
