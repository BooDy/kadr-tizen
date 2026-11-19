import { MediaItemDetail } from '../types/kadr';

export interface PlaybackProgressSnapshot {
  itemId: number | string;
  positionMs: number;
  durationMs: number;
  flushPromise?: Promise<void>;
}

/**
 * Converts a 0..1 playback_progress fraction into PlayerScreen's 1..99 percentage sentinel
 * so even very early resumable positions (e.g. 0.003 = 0.3%) never round down to 0
 * (which PlayerScreen treats as "start from 0:00 without session auto-resume").
 */
export function toResumePercentageSentinel(progress?: number): number {
  if (!progress || !Number.isFinite(progress) || progress <= 0 || progress >= 0.9) {
    return 0;
  }
  return Math.min(89, Math.max(1, Math.round(progress * 100)));
}

export function applyOptimisticProgress(
  item: MediaItemDetail,
  snapshots: ReadonlyMap<string, PlaybackProgressSnapshot>
): MediaItemDetail {
  if (snapshots.size === 0) return item;

  let nextItem = item;
  const selfSnap = snapshots.get(String(item.id ?? item.card?.id ?? ''));
  if (selfSnap && selfSnap.durationMs > 0) {
    const ratio = Math.min(1, Math.max(0, selfSnap.positionMs / selfSnap.durationMs));
    const isCompleted = ratio >= 0.9;
    nextItem = {
      ...nextItem,
      duration_ms: nextItem.duration_ms || selfSnap.durationMs,
      resume_position_ms: isCompleted ? 0 : selfSnap.positionMs,
      resume_position_seconds: isCompleted ? 0 : Math.floor(selfSnap.positionMs / 1000),
      card: nextItem.card
        ? {
            ...nextItem.card,
            playback_progress: isCompleted ? 1 : ratio,
          }
        : nextItem.card,
    };
  }

  if (nextItem.episodes && nextItem.episodes.length > 0) {
    let episodesChanged = false;
    const updatedEpisodes = nextItem.episodes.map((ep) => {
      const snap = snapshots.get(String(ep.id));
      if (!snap || snap.durationMs <= 0) return ep;
      const ratio = Math.min(1, Math.max(0, snap.positionMs / snap.durationMs));
      const isCompleted = ratio >= 0.9;
      const nextProgress = isCompleted ? 1 : ratio;
      const nextBadge = isCompleted ? undefined : ep.badge;
      if (ep.playback_progress === nextProgress && ep.badge === nextBadge) {
        return ep;
      }
      episodesChanged = true;
      return {
        ...ep,
        playback_progress: nextProgress,
        badge: nextBadge,
      };
    });

    if (episodesChanged) {
      nextItem = {
        ...nextItem,
        episodes: updatedEpisodes,
      };
    }
  }

  return nextItem;
}

/**
 * Optimistically applies a watched/unwatched state mutation to a MediaItemDetail
 * and any matching episodes while preserving object references on no-ops.
 */
export function applyWatchStateMutation(
  item: MediaItemDetail,
  targetIds: ReadonlySet<string>,
  watched: boolean
): MediaItemDetail {
  if (targetIds.size === 0) return item;

  let nextItem = item;
  const nextProgress = watched ? 1 : 0;
  const selfId = String(item.id ?? item.card?.id ?? '');

  if (selfId && targetIds.has(selfId)) {
    const nextBadge = nextItem.card?.badge === 'RESUME' ? undefined : nextItem.card?.badge;
    const isSelfUnchanged =
      nextItem.resume_position_ms === 0 &&
      nextItem.resume_position_seconds === 0 &&
      nextItem.card !== undefined &&
      nextItem.card.playback_progress === nextProgress &&
      nextItem.card.badge === nextBadge;

    if (!isSelfUnchanged) {
      const numericId = typeof item.id === 'number' ? item.id : Number(item.id);
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
              id: Number.isFinite(numericId) ? numericId : 0,
              title: item.title ?? '',
              media_type: item.media_type ?? 'movie',
              playback_progress: nextProgress,
            },
      };
    }
  }

  if (nextItem.episodes && nextItem.episodes.length > 0) {
    let changed = false;
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
