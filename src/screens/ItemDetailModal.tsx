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
  onPlay: (itemId: number | string, resumeMs?: number, title?: string) => void;
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
  const resolvedId = item?.id ?? item?.card?.id;
  const resolvedTitle = item?.title ?? item?.card?.title ?? '';
  const resolvedOverview = item?.overview ?? item?.card?.subtitle;
  const resolvedReleaseYear = item?.release_year ?? item?.card?.release_year;
  const resolvedResolution = item?.resolution ?? item?.technical?.resolution;
  const resolvedPosterUrl = item?.poster_url ?? item?.card?.poster_url;
  const resolvedBackdropUrl = item?.backdrop_url ?? item?.card?.backdrop_url;
  const resolvedDurationMs =
    item?.duration_ms ?? (item?.duration_seconds ? item.duration_seconds * 1000 : undefined);
  const resolvedResumeMs =
    item?.resume_position_ms ??
    (item?.resume_position_seconds !== undefined
      ? item.resume_position_seconds * 1000
      : undefined);
  const resolvedLibraryId = item?.library_id;
  const resolvedFolderPath = item?.folder_path;

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
  }, [defaultSeason, resolvedId]);

  const { focusedId, setFocusedId, pushTrap, popTrap } = useFocusContext();

  useEffect(() => {
    if (isOpen) {
      pushTrap('item-detail-modal');
      return () => {
        popTrap();
      };
    }
  }, [isOpen, pushTrap, popTrap]);


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
    : resolvedResumeMs && resolvedResumeMs > 0
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
        const current = focusedId;

        // Down Navigation
        if (code === TVKeys.DOWN || e.key === 'ArrowDown') {
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
        } 
        // Up Navigation
        else if (code === TVKeys.UP || e.key === 'ArrowUp') {
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
        // Left Navigation on Season Tabs
        else if (code === TVKeys.LEFT || e.key === 'ArrowLeft') {
          if (current && current.startsWith('season-tab-')) {
            e.preventDefault();
            e.stopImmediatePropagation();
            const seasonNum = parseInt(current.replace('season-tab-', ''), 10);
            const currentIdx = seasons.indexOf(seasonNum);
            if (currentIdx > 0) {
              const prevSeason = seasons[currentIdx - 1];
              setFocusedId(`season-tab-${prevSeason}`);
            }
          }
        }
        // Right Navigation on Season Tabs
        else if (code === TVKeys.RIGHT || e.key === 'ArrowRight') {
          if (current && current.startsWith('season-tab-')) {
            e.preventDefault();
            e.stopImmediatePropagation();
            const seasonNum = parseInt(current.replace('season-tab-', ''), 10);
            const currentIdx = seasons.indexOf(seasonNum);
            if (currentIdx >= 0 && currentIdx < seasons.length - 1) {
              const nextSeason = seasons[currentIdx + 1];
              setFocusedId(`season-tab-${nextSeason}`);
            }
          }
        }
        // Enter Navigation on Season Tabs: Commit Season Switch
        else if (code === TVKeys.ENTER || e.key === 'Enter') {
          if (current && current.startsWith('season-tab-')) {
            e.preventDefault();
            e.stopImmediatePropagation();
            const seasonNum = parseInt(current.replace('season-tab-', ''), 10);
            if (!isNaN(seasonNum) && seasonNum !== selectedSeason) {
              setSelectedSeason(seasonNum);
            }
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isOpen,
    onClose,
    seasons,
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

  const backdrop = formatImageUrl(resolvedBackdropUrl);
  const poster = formatImageUrl(resolvedPosterUrl);

  const durationMins = resolvedDurationMs ? Math.round(resolvedDurationMs / 60000) : null;
  const resumeMins = resolvedResumeMs ? Math.round(resolvedResumeMs / 60000) : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={resolvedTitle}
      className="fixed inset-0 bg-[#2A0A0A]/90 backdrop-blur-xl flex items-center justify-center z-[60] p-6 select-none"
    >
      {backdrop && (
        <img
          src={backdrop}
          alt={resolvedTitle}
          className="absolute inset-0 w-full h-full object-cover opacity-25"
        />
      )}
      <div
        className={`relative ${
          isShow && seasons.length > 0 ? 'w-[1400px] max-w-[94vw] max-h-[960px] p-8' : 'w-[1240px] max-w-[90vw] max-h-[920px] p-10'
        } flex flex-col bg-[#3B1111] border border-[rgba(245,229,229,0.08)] rounded-3xl shadow-2xl overflow-y-auto scrollbar-none`}
      >
        <div className="flex flex-row items-start w-full">
          {poster && (
            <img
              src={poster}
              alt={resolvedTitle}
              className={`${
                isShow && seasons.length > 0 ? 'w-52 h-[290px]' : 'w-72 h-[420px]'
              } object-cover rounded-2xl shadow-xl border border-[rgba(245,229,229,0.08)] shrink-0 mr-10`}
            />
          )}
          <div
            className={`flex flex-col justify-between flex-1 min-w-0 ${
              isShow && seasons.length > 0 ? 'h-[290px]' : 'h-[420px]'
            }`}
          >
            <div>
              <div className="flex items-center mb-2 text-[#F5E5E5]/70 font-semibold text-lg">
                {resolvedReleaseYear && <span className="mr-3">{resolvedReleaseYear}</span>}
                {durationMins && <span className="mr-3">• {durationMins}m</span>}
                {resolvedResolution && (
                  <span className="mr-3 px-2 py-0.5 bg-[#FFB800]/20 border border-[#FFB800]/30 rounded text-xs text-[#FFB800] font-bold">
                    {resolvedResolution}
                  </span>
                )}
              </div>
              <h2
                className={`${
                  isShow && seasons.length > 0 ? 'text-4xl font-extrabold mb-2' : 'text-5xl font-black mb-4'
                } text-[#F5E5E5] leading-tight truncate`}
              >
                {resolvedTitle}
              </h2>
              {resolvedOverview && (
                <p
                  className={`text-[#F5E5E5]/80 ${
                    isShow && seasons.length > 0 ? 'text-base line-clamp-3 mb-2 max-w-3xl' : 'text-lg line-clamp-4 max-w-2xl'
                  } leading-relaxed`}
                >
                  {resolvedOverview}
                </p>
              )}
            </div>

            <div className="flex mt-auto flex-row items-center flex-wrap gap-3">
              {isShow && nextEpisode ? (
                isEpisodeResume ? (
                  <TVButton
                    id="detail-resume-btn"
                    groupId="item-detail-modal"
                    order={1}
                    variant="primary"
                    onEnter={() => onPlay(nextEpisode.id, nextEpisodeResumeMs)}
                    onClick={() => onPlay(nextEpisode.id, nextEpisodeResumeMs)}
                    className="mr-4 mb-2"
                    autoFocus
                  >
                    <Play className="w-6 h-6 fill-current mr-3" />
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
                    className="mr-4 mb-2"
                    autoFocus
                  >
                    <Play className="w-6 h-6 fill-current mr-3" />
                    Play
                  </TVButton>
                )
              ) : resolvedResumeMs && resolvedResumeMs > 0 ? (
                <>
                  <TVButton
                    id="detail-resume-btn"
                    groupId="item-detail-modal"
                    order={1}
                    variant="primary"
                    onEnter={() => onPlay(resolvedId!, resolvedResumeMs)}
                    onClick={() => onPlay(resolvedId!, resolvedResumeMs)}
                    className="mr-4 mb-2"
                    autoFocus
                  >
                    <Play className="w-6 h-6 fill-current mr-3" />
                    Resume ({resumeMins}m)
                  </TVButton>
                  <TVButton
                    id="detail-restart-btn"
                    groupId="item-detail-modal"
                    order={2}
                    variant="secondary"
                    onEnter={() => onPlay(resolvedId!, 0)}
                    onClick={() => onPlay(resolvedId!, 0)}
                    className="mr-4 mb-2"
                  >
                    <RotateCcw className="w-6 h-6 mr-3" /> Play from Beginning
                  </TVButton>
                </>
              ) : (
                <TVButton
                  id="detail-play-btn"
                  groupId="item-detail-modal"
                  order={1}
                  variant="primary"
                  onEnter={() => onPlay(resolvedId!, 0)}
                  onClick={() => onPlay(resolvedId!, 0)}
                  className="mr-4 mb-2"
                  autoFocus
                >
                  <Play className="w-6 h-6 fill-current mr-3" /> Play
                </TVButton>
              )}

              {resolvedLibraryId && resolvedFolderPath && (
                <TVButton
                  id="detail-browse-folder-btn"
                  groupId="item-detail-modal"
                  order={
                    !isShow && resolvedResumeMs && resolvedResumeMs > 0 ? 3 : 2
                  }
                  variant="secondary"
                  onEnter={() => onBrowseFolder?.(resolvedLibraryId!, resolvedFolderPath!)}
                  onClick={() => onBrowseFolder?.(resolvedLibraryId!, resolvedFolderPath!)}
                  className="mr-4 mb-2"
                >
                  <Folder className="w-6 h-6 mr-3" /> Browse Folder
                </TVButton>
              )}

              <TVButton
                id="detail-close-btn"
                groupId="item-detail-modal"
                order={
                  !isShow && resolvedResumeMs && resolvedResumeMs > 0
                    ? resolvedLibraryId && resolvedFolderPath
                      ? 4
                      : 3
                    : resolvedLibraryId && resolvedFolderPath
                    ? 3
                    : 2
                }
                variant="secondary"
                onEnter={onClose}
                onClick={onClose}
                className="mr-4 mb-2"
              >
                <X className="w-6 h-6 mr-3" /> Back
              </TVButton>
            </div>
          </div>
        </div>

        {seasons.length > 0 && (
          <div className="flex flex-col mt-6 pt-5 border-t border-[rgba(245,229,229,0.08)]">
            <div className="flex items-center overflow-x-auto pb-2 mb-3 scrollbar-none">
              {seasons.map((season, idx) => (
                <TVButton
                  key={season}
                  id={`season-tab-${season}`}
                  groupId="season-tabs"
                  order={idx + 1}
                  variant={selectedSeason === season ? 'primary' : 'secondary'}
                  onClick={() => setSelectedSeason(season)}
                  onEnter={() => setSelectedSeason(season)}
                  onFocus={() => setFocusedId(`season-tab-${season}`)}
                  className="!px-6 !py-2.5 !text-base rounded-full mr-3 shrink-0"
                >
                  Season {season}
                </TVButton>
              ))}
            </div>

            <div className="flex overflow-x-auto pb-4 pt-1 scrollbar-none">
              {episodes
                .filter((ep) => ep.season === selectedSeason)
                .map((ep, idx) => (
                  <div key={ep.id} className="shrink-0 mr-5">
                    <TVCard
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
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
