import { ApiClient } from './client';
import { MediaItemDetail } from '../types/kadr';

export type { MediaItemDetail };

export async function fetchMediaItem(client: ApiClient, itemId: number | string): Promise<MediaItemDetail> {
  const data = await client.fetch<any>(`/api/v1/items/${itemId}`);
  if (!data) {
    throw new Error(`Media item not found: ${itemId}`);
  }

  const card = data.card || {};
  const technical = data.technical || {};

  const resolvedId = data.id ?? card.id ?? itemId;
  const resolvedTitle = data.title ?? card.title ?? '';
  const resolvedOverview = data.overview ?? card.overview;
  const resolvedPosterUrl = data.poster_url ?? card.poster_url;
  const resolvedBackdropUrl = data.backdrop_url ?? card.backdrop_url;
  const resolvedMediaType = data.media_type ?? card.media_type;
  const resolvedReleaseYear = data.release_year ?? card.release_year;
  const resolvedResolution = data.resolution ?? technical.resolution;

  const durationSec = data.duration_seconds ?? technical.duration_seconds ?? card.duration_seconds;
  const durationMs = data.duration_ms ?? (durationSec ? durationSec * 1000 : undefined);

  let resumeMs = data.resume_position_ms;
  if (resumeMs === undefined) {
    if (data.resume_position_seconds !== undefined && data.resume_position_seconds > 0) {
      resumeMs = data.resume_position_seconds * 1000;
    } else if (card.playback_progress !== undefined && card.playback_progress > 0 && durationMs) {
      resumeMs = Math.round(card.playback_progress * durationMs);
    }
  }

  const result: MediaItemDetail = {
    ...data,
    id: resolvedId,
    title: resolvedTitle,
  };

  if (resolvedOverview !== undefined) result.overview = resolvedOverview;
  if (resolvedPosterUrl !== undefined) result.poster_url = resolvedPosterUrl;
  if (resolvedBackdropUrl !== undefined) result.backdrop_url = resolvedBackdropUrl;
  if (resolvedMediaType !== undefined) result.media_type = resolvedMediaType;
  if (resolvedReleaseYear !== undefined) result.release_year = resolvedReleaseYear;
  if (resolvedResolution !== undefined) result.resolution = resolvedResolution;
  if (durationSec !== undefined) result.duration_seconds = durationSec;
  if (durationMs !== undefined) result.duration_ms = durationMs;
  if (resumeMs !== undefined) result.resume_position_ms = resumeMs;
  if (data.episodes !== undefined || card.episodes !== undefined) {
    result.episodes = data.episodes ?? card.episodes;
  }

  return result;
}
