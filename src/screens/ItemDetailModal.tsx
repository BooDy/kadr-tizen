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
        const activeDomId = typeof document !== 'undefined' ? document.activeElement?.id || '' : '';
        const current = focusedId || activeDomId;
        const isDetailAction =
          current.startsWith('detail-') ||
          activeDomId.startsWith('detail-') ||
          current === 'item-detail-modal';
        const isSeasonTab =
          current.startsWith('season-tab-') ||
          activeDomId.startsWith('season-tab-');
        const isEpisodeCard =
          current.startsWith('episode-card-') ||
          activeDomId.startsWith('episode-card-');

        // Down Navigation
        if (code === TVKeys.DOWN || e.key === 'ArrowDown') {
          if (isDetailAction) {
            e.preventDefault();
            e.stopImmediatePropagation();
            setFocusedId(`season-tab-${selectedSeason}`);
          } else if (isSeasonTab) {
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
          if (isEpisodeCard) {
            e.preventDefault();
            e.stopImmediatePropagation();
            setFocusedId(`season-tab-${selectedSeason}`);
          } else if (isSeasonTab) {
            e.preventDefault();
            e.stopImmediatePropagation();
            setFocusedId(primaryBtnId);
          }
        }
        // Left Navigation on Season Tabs
        else if (code === TVKeys.LEFT || e.key === 'ArrowLeft') {
          const tabId = current.startsWith('season-tab-') ? current : (activeDomId.startsWith('season-tab-') ? activeDomId : '');
          if (tabId) {
            e.preventDefault();
            e.stopImmediatePropagation();
            const seasonNum = parseInt(tabId.replace('season-tab-', ''), 10);
            const currentIdx = seasons.indexOf(seasonNum);
            if (currentIdx > 0) {
              const prevSeason = seasons[currentIdx - 1];
              setFocusedId(`season-tab-${prevSeason}`);
            }
          }
        }
        // Right Navigation on Season Tabs
        else if (code === TVKeys.RIGHT || e.key === 'ArrowRight') {
          const tabId = current.startsWith('season-tab-') ? current : (activeDomId.startsWith('season-tab-') ? activeDomId : '');
          if (tabId) {
            e.preventDefault();
            e.stopImmediatePropagation();
            const seasonNum = parseInt(tabId.replace('season-tab-', ''), 10);
            const currentIdx = seasons.indexOf(seasonNum);
            if (currentIdx >= 0 && currentIdx < seasons.length - 1) {
              const nextSeason = seasons[currentIdx + 1];
              setFocusedId(`season-tab-${nextSeason}`);
            }
          }
        }
        // Enter Navigation on Season Tabs: Commit Season Switch
        else if (code === TVKeys.ENTER || e.key === 'Enter') {
          const tabId = current.startsWith('season-tab-') ? current : (activeDomId.startsWith('season-tab-') ? activeDomId : '');
          if (tabId) {
            e.preventDefault();
            e.stopImmediatePropagation();
            const seasonNum = parseInt(tabId.replace('season-tab-', ''), 10);
            if (!isNaN(seasonNum) && seasonNum !== selectedSeason) {
              setSelectedSeason(seasonNum);
            }
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
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
      className="fixed inset-0 w-screen h-screen bg-[#1F0707] z-[60] flex flex-col p-14 select-none overflow-hidden"
    >
      {backdrop && (
        <img
          src={backdrop}
          alt={resolvedTitle}
          className="absolute inset-0 w-full h-full object-cover opacity-20 pointer-events-none"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-[#1F0707] via-[#1F0707]/90 to-[#1F0707]/75 pointer-events-none" />

      <div className="relative z-10 flex flex-col w-full h-full justify-between overflow-hidden">
        <div className="flex flex-row items-start w-full">
          {poster && (
            <img
              src={poster}
              alt={resolvedTitle}
              className={`${
                isShow && seasons.length > 0 ? 'w-64 h-[360px]' : 'w-80 h-[460px]'
              } object-cover rounded-2xl shadow-2xl border border-[rgba(245,229,229,0.12)] shrink-0 mr-10`}
            />
          )}
          <div
            className={`flex flex-col justify-between flex-1 min-w-0 ${
              isShow && seasons.length > 0 ? 'h-[360px]' : 'h-[460px]'
            }`}
          >
            <div>
              <div className="flex items-center mb-3 text-[#F5E5E5]/70 font-semibold text-2xl">
                {resolvedReleaseYear && <span className="mr-4">{resolvedReleaseYear}</span>}
                {durationMins && <span className="mr-4">• {durationMins}m</span>}
                {resolvedResolution && (
                  <span className="mr-4 px-3 py-1 bg-[#FFB800]/20 border border-[#FFB800]/30 rounded text-base text-[#FFB800] font-bold">
                    {resolvedResolution}
                  </span>
                )}
              </div>
              <h2
                className={`${
                  isShow && seasons.length > 0 ? 'text-5xl font-black mb-3' : 'text-6xl font-black mb-5'
                } text-[#F5E5E5] leading-tight tracking-tight truncate`}
              >
                {resolvedTitle}
              </h2>
              {resolvedOverview && (
                <p
                  className={`text-[#F5E5E5]/80 ${
                    isShow && seasons.length > 0 ? 'text-xl line-clamp-3 mb-4 max-w-4xl' : 'text-2xl line-clamp-4 max-w-5xl'
                  } leading-relaxed font-normal`}
                >
                  {resolvedOverview}
                </p>
              )}
            </div>

            <div className="flex mt-auto flex-row items-center flex-wrap gap-8 mb-4">
              {isShow && nextEpisode ? (
                isEpisodeResume ? (
                  <TVButton
                    id="detail-resume-btn"
                    groupId="item-detail-modal"
                    order={1}
                    variant="primary"
                    onEnter={() => onPlay(nextEpisode.id, nextEpisodeResumeMs)}
                    onClick={() => onPlay(nextEpisode.id, nextEpisodeResumeMs)}
                    className="!py-6 !px-12 !text-4xl font-extrabold rounded-2xl gap-5"
                    autoFocus
                  >
                    <Play className="w-10 h-10 fill-current mr-4" />
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
                    className="!py-6 !px-12 !text-4xl font-extrabold rounded-2xl gap-5"
                    autoFocus
                  >
                    <Play className="w-10 h-10 fill-current mr-4" />
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
                    className="!py-6 !px-12 !text-4xl font-extrabold rounded-2xl gap-5"
                    autoFocus
                  >
                    <Play className="w-10 h-10 fill-current mr-4" />
                    Resume ({resumeMins}m)
                  </TVButton>
                  <TVButton
                    id="detail-restart-btn"
                    groupId="item-detail-modal"
                    order={2}
                    variant="secondary"
                    onEnter={() => onPlay(resolvedId!, 0)}
                    onClick={() => onPlay(resolvedId!, 0)}
                    className="!py-6 !px-12 !text-4xl font-extrabold rounded-2xl gap-5"
                  >
                    <RotateCcw className="w-10 h-10 mr-4" /> Play from Beginning
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
                  className="!py-6 !px-12 !text-4xl font-extrabold rounded-2xl gap-5"
                  autoFocus
                >
                  <Play className="w-10 h-10 fill-current mr-4" /> Play
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
                  className="!py-6 !px-12 !text-4xl font-extrabold rounded-2xl gap-5"
                >
                  <Folder className="w-10 h-10 mr-4" /> Browse Folder
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
                className="!py-4 !px-8 !text-2xl font-bold rounded-2xl gap-4 mr-4 mb-2"
              >
                <X className="w-7 h-7 mr-3" /> Back
              </TVButton>
            </div>
          </div>
        </div>

        {seasons.length > 0 && (
          <div className="flex flex-col mt-6 pt-5 border-t border-[rgba(245,229,229,0.12)]">
            <div className="flex items-center overflow-x-auto pb-3 mb-3 scrollbar-none">
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
                  className="!px-8 !py-3.5 !text-2xl font-bold rounded-xl mr-3 shrink-0"
                >
                  Season {season}
                </TVButton>
              ))}
            </div>

            <div className="flex overflow-x-auto pb-4 pt-1 scrollbar-none">
              {episodes
                .filter((ep) => ep.season === selectedSeason)
                .map((ep, idx) => (
                  <div key={ep.id} className="shrink-0 mr-6">
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
