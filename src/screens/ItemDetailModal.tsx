import { useEffect, useState, useMemo } from 'react';
import { MediaItemDetail } from '../api/items';
import { useFocusContext } from '../navigation/FocusContext';
import { TVButton } from '../components/tv/TVButton';
import { TVCard } from '../components/tv/TVCard';
import { TVKeys } from '../navigation/keys';
import { Play, RotateCcw, X, Folder } from 'lucide-react';

export interface ItemDetailModalProps {
  isOpen?: boolean;
  item: MediaItemDetail | null;
  serverUrl: string;
  onPlay: (itemId: number | string, resumeMs?: number) => void;
  onClose: () => void;
  onBrowseFolder?: (libraryId: string, folderPath: string) => void;
}

export function ItemDetailModal({
  isOpen = true,
  item,
  serverUrl,
  onPlay,
  onClose,
  onBrowseFolder,
}: ItemDetailModalProps) {
  const isShow = Boolean(
    item?.card?.media_type === 'show' ||
      item?.media_type === 'show' ||
      (item?.episodes && item.episodes.length > 0)
  );

  const episodes = useMemo(() => item?.episodes || [], [item?.episodes]);

  const seasons = useMemo(() => {
    return Array.from(new Set(episodes.map((e) => e.season))).sort((a, b) => a - b);
  }, [episodes]);

  const defaultSeason = useMemo(() => {
    const firstUnfinished = episodes.find((e) => (e.playback_progress || 0) < 0.9);
    return firstUnfinished?.season ?? seasons[0] ?? 1;
  }, [episodes, seasons]);

  const [selectedSeason, setSelectedSeason] = useState<number>(defaultSeason);

  useEffect(() => {
    setSelectedSeason(defaultSeason);
  }, [defaultSeason, item?.id]);

  const { focusedId, setFocusedId, pushTrap, popTrap } = useFocusContext();

  useEffect(() => {
    if (isOpen) {
      pushTrap('item-detail-modal');
      return () => {
        popTrap();
      };
    }
  }, [isOpen, pushTrap, popTrap]);

  // When focused on a season tab, update the active season
  useEffect(() => {
    if (focusedId && focusedId.startsWith('season-tab-')) {
      const seasonNum = parseInt(focusedId.replace('season-tab-', ''), 10);
      if (!isNaN(seasonNum) && seasonNum !== selectedSeason) {
        setSelectedSeason(seasonNum);
      }
    }
  }, [focusedId, selectedSeason]);

  const nextEpisode = useMemo(() => {
    if (!isShow || episodes.length === 0) return null;
    return episodes.find((e) => (e.playback_progress || 0) < 0.9) || episodes[0];
  }, [isShow, episodes]);

  const isEpisodeResume = Boolean(
    nextEpisode &&
      (nextEpisode.playback_progress || 0) > 0 &&
      (nextEpisode.playback_progress || 0) < 0.9
  );

  const nextEpisodeResumeMs =
    isEpisodeResume && nextEpisode?.playback_progress
      ? Math.round(nextEpisode.playback_progress * 100)
      : 0;

  const primaryBtnId = isShow
    ? isEpisodeResume
      ? 'detail-resume-btn'
      : 'detail-play-btn'
    : item?.resume_position_ms && item.resume_position_ms > 0
    ? 'detail-resume-btn'
    : 'detail-play-btn';

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const code = e.keyCode || e.which;
      if (
        code === TVKeys.BACK_TIZEN ||
        code === TVKeys.BACK_WEB ||
        code === TVKeys.BACKSPACE ||
        e.key === 'Escape'
      ) {
        e.preventDefault();
        onClose();
        return;
      }

      if (seasons.length > 0) {
        if (code === TVKeys.DOWN || e.key === 'ArrowDown') {
          const current = focusedId;
          if (current && (current.startsWith('detail-') || current === 'item-detail-modal')) {
            e.preventDefault();
            e.stopImmediatePropagation();
            setFocusedId(`season-tab-${selectedSeason}`);
          } else if (current && current.startsWith('season-tab-')) {
            const seasonEps = episodes.filter((ep) => ep.season === selectedSeason);
            if (seasonEps.length > 0) {
              e.preventDefault();
              e.stopImmediatePropagation();
              setFocusedId(`episode-card-${seasonEps[0].id}`);
            }
          }
        } else if (code === TVKeys.UP || e.key === 'ArrowUp') {
          const current = focusedId;
          if (current && current.startsWith('episode-card-')) {
            e.preventDefault();
            e.stopImmediatePropagation();
            setFocusedId(`season-tab-${selectedSeason}`);
          } else if (current && current.startsWith('season-tab-')) {
            e.preventDefault();
            e.stopImmediatePropagation();
            setFocusedId(primaryBtnId);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isOpen,
    onClose,
    seasons.length,
    selectedSeason,
    episodes,
    focusedId,
    setFocusedId,
    primaryBtnId,
  ]);

  if (!isOpen || !item) return null;

  const formatImageUrl = (path?: string) => {
    if (!path) return undefined;
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    const cleanServer = serverUrl.replace(/\/+$/, '');
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${cleanServer}${cleanPath}`;
  };

  const backdrop = formatImageUrl(item.backdrop_url);
  const poster = formatImageUrl(item.poster_url);

  const durationMins = item.duration_ms ? Math.round(item.duration_ms / 60000) : null;
  const resumeMins = item.resume_position_ms ? Math.round(item.resume_position_ms / 60000) : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={item.title}
      className="fixed inset-0 bg-black/90 backdrop-blur-xl flex items-center justify-center z-50 p-16"
    >
      {backdrop && (
        <img
          src={backdrop}
          alt={item.title}
          className="absolute inset-0 w-full h-full object-cover opacity-25"
        />
      )}
      <div className="relative w-full max-w-6xl max-h-[90vh] flex flex-col gap-6 bg-zinc-900/90 border border-zinc-800 rounded-3xl p-10 shadow-2xl overflow-y-auto">
        <div className="flex gap-10">
          {poster && (
            <img
              src={poster}
              alt={item.title}
              className="w-72 h-[420px] object-cover rounded-2xl shadow-xl border border-zinc-700/50 shrink-0"
            />
          )}
          <div className="flex flex-col justify-between flex-1">
            <div>
              <div className="flex items-center gap-3 mb-2 text-zinc-400 font-semibold text-lg">
                {item.release_year && <span>{item.release_year}</span>}
                {durationMins && <span>• {durationMins}m</span>}
                {item.resolution && (
                  <span className="px-2 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-sky-400">
                    {item.resolution}
                  </span>
                )}
              </div>
              <h2 className="text-5xl font-black text-white mb-4 leading-tight">{item.title}</h2>
              {item.overview && (
                <p className="text-zinc-300 text-lg leading-relaxed max-w-2xl line-clamp-4">
                  {item.overview}
                </p>
              )}
            </div>

            <div className="flex gap-4 mt-6">
              {isShow && nextEpisode ? (
                isEpisodeResume ? (
                  <TVButton
                    id="detail-resume-btn"
                    groupId="item-detail-modal"
                    order={1}
                    variant="primary"
                    onEnter={() => onPlay(nextEpisode.id, nextEpisodeResumeMs)}
                    onClick={() => onPlay(nextEpisode.id, nextEpisodeResumeMs)}
                    autoFocus
                  >
                    <Play className="w-6 h-6 fill-current" />
                    Resume Next
                  </TVButton>
                ) : (
                  <TVButton
                    id="detail-play-btn"
                    groupId="item-detail-modal"
                    order={1}
                    variant="primary"
                    onEnter={() => onPlay(nextEpisode.id, 0)}
                    onClick={() => onPlay(nextEpisode.id, 0)}
                    autoFocus
                  >
                    <Play className="w-6 h-6 fill-current" />
                    Play
                  </TVButton>
                )
              ) : item.resume_position_ms && item.resume_position_ms > 0 ? (
                <>
                  <TVButton
                    id="detail-resume-btn"
                    groupId="item-detail-modal"
                    order={1}
                    variant="primary"
                    onEnter={() => onPlay(item.id, item.resume_position_ms)}
                    onClick={() => onPlay(item.id, item.resume_position_ms)}
                    autoFocus
                  >
                    <Play className="w-6 h-6 fill-current" />
                    Resume ({resumeMins}m)
                  </TVButton>
                  <TVButton
                    id="detail-restart-btn"
                    groupId="item-detail-modal"
                    order={2}
                    variant="secondary"
                    onEnter={() => onPlay(item.id, 0)}
                    onClick={() => onPlay(item.id, 0)}
                  >
                    <RotateCcw className="w-6 h-6" /> Play from Beginning
                  </TVButton>
                </>
              ) : (
                <TVButton
                  id="detail-play-btn"
                  groupId="item-detail-modal"
                  order={1}
                  variant="primary"
                  onEnter={() => onPlay(item.id, 0)}
                  onClick={() => onPlay(item.id, 0)}
                  autoFocus
                >
                  <Play className="w-6 h-6 fill-current" /> Play
                </TVButton>
              )}

              {item.library_id && item.folder_path && (
                <TVButton
                  id="detail-browse-folder-btn"
                  groupId="item-detail-modal"
                  order={
                    !isShow && item.resume_position_ms && item.resume_position_ms > 0 ? 3 : 2
                  }
                  variant="secondary"
                  onEnter={() => onBrowseFolder?.(item.library_id!, item.folder_path!)}
                  onClick={() => onBrowseFolder?.(item.library_id!, item.folder_path!)}
                >
                  <Folder className="w-6 h-6" /> Browse Folder
                </TVButton>
              )}

              <TVButton
                id="detail-close-btn"
                groupId="item-detail-modal"
                order={
                  !isShow && item.resume_position_ms && item.resume_position_ms > 0
                    ? item.library_id && item.folder_path
                      ? 4
                      : 3
                    : item.library_id && item.folder_path
                    ? 3
                    : 2
                }
                variant="secondary"
                onEnter={onClose}
                onClick={onClose}
              >
                <X className="w-6 h-6" /> Back
              </TVButton>
            </div>
          </div>
        </div>

        {seasons.length > 0 && (
          <div className="flex flex-col gap-4 mt-4">
            <div className="flex items-center gap-3 overflow-x-auto pb-1">
              {seasons.map((season, idx) => (
                <TVButton
                  key={season}
                  id={`season-tab-${season}`}
                  groupId="season-tabs"
                  order={idx + 1}
                  variant={selectedSeason === season ? 'primary' : 'secondary'}
                  onClick={() => setSelectedSeason(season)}
                  onEnter={() => setSelectedSeason(season)}
                  className="!px-6 !py-2.5 !text-base rounded-full"
                >
                  Season {season}
                </TVButton>
              ))}
            </div>

            <div className="flex gap-5 overflow-x-auto pb-4 pt-1">
              {episodes
                .filter((ep) => ep.season === selectedSeason)
                .map((ep, idx) => (
                  <TVCard
                    key={ep.id}
                    id={`episode-card-${ep.id}`}
                    groupId={`season-episodes-${selectedSeason}`}
                    order={idx + 1}
                    title={ep.title}
                    subtitle={
                      ep.subtitle ||
                      `S${String(ep.season).padStart(2, '0')}E${String(ep.episode).padStart(2, '0')}`
                    }
                    imageUrl={formatImageUrl(ep.poster_url)}
                    progressPercent={
                      ep.playback_progress
                        ? Math.round(ep.playback_progress * 100)
                        : undefined
                    }
                    badge={ep.badge}
                    onSelect={() =>
                      onPlay(
                        ep.id,
                        (ep.playback_progress || 0) > 0
                          ? Math.round(ep.playback_progress! * 100)
                          : 0
                      )
                    }
                  />
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
