import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ApiClient } from '../api/client';
import { MediaItemDetail } from '../api/items';
import { EpisodeCard } from '../types/kadr';
import { useFocusStore, useIsFocused } from '../navigation/FocusContext';
import { isTextInputElement, useFocusable } from '../navigation/useFocusable';
import { TVButton } from '../components/tv/TVButton';
import { TVKeys } from '../navigation/keys';
import {
  Play,
  RotateCcw,
  X,
  Folder,
  ChevronRight,
  CheckCircle2,
  PlayCircle,
  ListPlus,
} from 'lucide-react';
import { PlaylistItem } from './PlayerScreen';
import {
  AddToPlaylistModal,
  AddToPlaylistTarget,
} from '../components/playlists/AddToPlaylistModal';
import { getAuthenticatedImageUrl } from '../utils/imageUrl';
import { toResumePercentageSentinel } from '../utils/playbackProgress';

export interface ItemDetailModalProps {
  isOpen?: boolean;
  item: MediaItemDetail | null;
  serverUrl: string;
  client?: ApiClient;
  token?: string;
  initialSelectedSeason?: number;
  initialFocusedId?: string | null;
  onViewStateChange?: (state: { selectedSeason: number; lastFocusedId: string | null }) => void;
  onPlay: (
    itemId: number | string,
    resumeMs?: number,
    title?: string,
    technical?: MediaItemDetail['technical'],
    playlist?: PlaylistItem[],
    currentIndex?: number
  ) => void;
  onClose: () => void;
  onBrowseFolder?: (libraryId: string, folderPath: string) => void;
  onAddToPlaylist?: (target: AddToPlaylistTarget) => void;
  onPlaylistChanged?: () => void;
}

interface PrimaryDetailActionButtonProps {
  id: string;
  order: number;
  eyebrow: string;
  eyebrowAriaHidden?: boolean;
  label: string;
  onActivate: () => void;
  autoFocus?: boolean;
}

const PrimaryDetailActionButton = memo(function PrimaryDetailActionButton({
  id,
  order,
  eyebrow,
  eyebrowAriaHidden = false,
  label,
  onActivate,
  autoFocus,
}: PrimaryDetailActionButtonProps) {
  const isFocused = useIsFocused(id);

  return (
    <TVButton
      id={id}
      data-focus-id={id}
      groupId="item-detail-modal"
      order={order}
      variant="primary"
      onEnter={onActivate}
      onClick={onActivate}
      className={`group relative !px-6 !py-4 !rounded-xl mr-4 bg-gradient-to-r from-[#ff5e1e] to-[#ff7a18] !text-[#532200] !text-base font-bold tracking-wide transition-transform duration-75 ${
        isFocused ? 'scale-[1.04]' : 'opacity-95'
      }`}
      style={{
        padding: '16px 24px',
        marginRight: '16px',
        borderRadius: '12px',
        backgroundImage: 'linear-gradient(to right, #ff5e1e, #ff7a18)',
        boxShadow: isFocused
          ? '0 0 0 3px #ffb871, 0 6px 16px rgba(0, 0, 0, 0.55)'
          : '0 6px 16px rgba(0, 0, 0, 0.45)',
        transform: isFocused ? 'scale(1.04)' : 'scale(1)',
      }}
      autoFocus={autoFocus}
    >
      <Play
        className="w-7 h-7 fill-current text-[#532200] mr-3 shrink-0"
        style={{ marginRight: '12px' }}
      />
      <div className="flex flex-col items-start leading-tight text-left">
        <span
          aria-hidden={eyebrowAriaHidden ? 'true' : undefined}
          className="uppercase tracking-wider text-[11px] text-[#532200] font-mono font-bold"
        >
          {eyebrow}
        </span>
        <span className="text-[17px] text-white font-bold">{label}</span>
      </div>
      <div
        className="ml-3 w-2 h-2 rounded-full bg-white shrink-0"
        style={{ marginLeft: '12px' }}
      />
    </TVButton>
  );
});

interface SecondaryDetailActionButtonProps {
  id: string;
  order?: number;
  icon: ReactNode;
  label: string;
  onActivate: () => void;
}

const SecondaryDetailActionButton = memo(function SecondaryDetailActionButton({
  id,
  order,
  icon,
  label,
  onActivate,
}: SecondaryDetailActionButtonProps) {
  const isFocused = useIsFocused(id);

  return (
    <TVButton
      id={id}
      data-focus-id={id}
      groupId="item-detail-modal"
      order={order}
      variant="secondary"
      onEnter={onActivate}
      onClick={onActivate}
      className={`!px-5 !py-4 !rounded-xl !text-base font-semibold tracking-wide mr-4 transition-transform duration-75 ${
        isFocused
          ? '!bg-[#38393f] !text-white !border-[#ff7a18] scale-[1.04]'
          : '!bg-[#292a2f] !text-[#e3e1e9] border border-[rgba(255,122,24,0.18)]'
      }`}
      style={{
        padding: '16px 22px',
        marginRight: '16px',
        borderRadius: '12px',
        backgroundColor: isFocused ? '#38393f' : '#292a2f',
        color: isFocused ? '#ffffff' : '#e3e1e9',
        border: isFocused ? '2px solid #ff7a18' : '1px solid rgba(255, 122, 24, 0.18)',
        boxShadow: isFocused ? '0 0 0 2px #FFB800' : 'none',
        transform: isFocused ? 'scale(1.04)' : 'scale(1)',
      }}
    >
      {icon}
      <span>{label}</span>
    </TVButton>
  );
});

interface SeasonTabButtonProps {
  season: number;
  order: number;
  isActiveSeason: boolean;
  seasonEpCount: number;
  onSelectSeason: (season: number) => void;
  onFocusSeasonTab: (id: string) => void;
}

const SeasonTabButton = memo(function SeasonTabButton({
  season,
  order,
  isActiveSeason,
  seasonEpCount,
  onSelectSeason,
  onFocusSeasonTab,
}: SeasonTabButtonProps) {
  const id = `season-tab-${season}`;
  const isTabFocused = useIsFocused(id);

  const handleActivate = useCallback(() => {
    onSelectSeason(season);
  }, [onSelectSeason, season]);

  const handleFocus = useCallback(() => {
    onFocusSeasonTab(id);
  }, [onFocusSeasonTab, id]);

  return (
    <TVButton
      id={id}
      data-focus-id={id}
      groupId="season-tabs"
      order={order}
      variant={isActiveSeason ? 'primary' : 'secondary'}
      onClick={handleActivate}
      onEnter={handleActivate}
      onFocus={handleFocus}
      className={`!px-4 !py-2 !text-base font-bold !rounded-xl mr-3 shrink-0 ${
        isActiveSeason
          ? '!bg-[#281216] !text-white border border-[#ff7a18]/50'
          : '!bg-[#1a1b21] !text-[#a8a29e] border border-transparent'
      }`}
      style={{
        padding: '10px 18px',
        marginRight: '12px',
        borderRadius: '12px',
        backgroundColor: isActiveSeason ? '#281216' : isTabFocused ? '#292a2f' : '#1a1b21',
        color: isActiveSeason || isTabFocused ? '#ffffff' : '#a8a29e',
        border: isTabFocused
          ? '2px solid #ff7a18'
          : isActiveSeason
          ? '1px solid rgba(255, 122, 24, 0.5)'
          : '1px solid transparent',
      }}
    >
      {isActiveSeason && (
        <span
          className="w-2 h-2 rounded-full bg-[#ff7a18] mr-2 inline-block shrink-0"
          style={{ marginRight: '8px' }}
        />
      )}
      <span>Season {season}</span>
      <span
        className="ml-2 text-sm text-[#ffb871] font-mono"
        style={{ marginLeft: '8px' }}
      >
        ({seasonEpCount})
      </span>
    </TVButton>
  );
});

interface EpisodeLandscapeCardProps {
  episode: EpisodeCard;
  index: number;
  selectedSeason: number;
  imageUrl?: string;
  isNextUp: boolean;
  onSelectEpisode: (episode: EpisodeCard) => void;
}

const EpisodeLandscapeCard = memo(function EpisodeLandscapeCard({
  episode,
  index,
  selectedSeason,
  imageUrl,
  isNextUp,
  onSelectEpisode,
}: EpisodeLandscapeCardProps) {
  const id = `episode-card-${episode.id}`;
  const handleSelect = useCallback(() => {
    onSelectEpisode(episode);
  }, [onSelectEpisode, episode]);

  const { ref, isFocused } = useFocusable<HTMLDivElement>({
    id,
    groupId: `season-episodes-${selectedSeason}`,
    order: index + 1,
    onEnter: handleSelect,
  });

  const progress = episode.playback_progress || 0;
  const isWatched = progress >= 0.9;
  const isResumable = progress > 0 && progress < 0.9;
  const progressPercent = isWatched
    ? 100
    : isResumable
    ? Math.min(100, Math.max(0, Math.round(progress * 100)))
    : 0;

  const epCode = `S${String(episode.season).padStart(2, '0')}E${String(episode.episode).padStart(2, '0')}`;
  const epShortTag = `EP ${String(episode.episode).padStart(2, '0')}`;
  const subtitleText = episode.subtitle || epCode;
  const statusBadge =
    episode.badge || (isResumable ? 'RESUME' : isNextUp && !isWatched ? 'NEXT UP' : undefined);

  return (
    <div
      ref={ref}
      id={id}
      data-focus-id={id}
      data-testid={`card-${id}`}
      tabIndex={-1}
      role="button"
      onClick={handleSelect}
      className={`group relative flex flex-col w-80 shrink-0 mr-6 rounded-2xl overflow-hidden transition-transform duration-75 cursor-pointer outline-none ${
        isFocused
          ? 'bg-[#292a2f] scale-[1.03] border-2 border-[#ff7a18] z-20 tv-focus-ring'
          : 'bg-[#1a1b21] border border-[rgba(255,122,24,0.12)] opacity-95'
      }`}
    >
      {/* 16:9 Landscape Thumbnail */}
      <div className="relative w-full aspect-video overflow-hidden bg-[#292a2f]">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={episode.title}
            className="w-full h-full object-cover"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#281216] via-[#1a1b21] to-[#0e0f14] text-4xl font-extrabold text-[#ff9f2e]/40 font-mono">
            {epShortTag}
          </div>
        )}

        {/* Watched or Next Up / Resume Status Badge */}
        {isWatched ? (
          <div className="absolute top-3 right-3 px-2.5 py-1 rounded bg-[#0e0f14]/95 flex items-center text-emerald-400 font-mono text-xs font-bold z-10">
            <CheckCircle2 className="w-3.5 h-3.5 mr-1.5 shrink-0" />
            <span>WATCHED</span>
          </div>
        ) : statusBadge ? (
          <div className="absolute top-3 left-3 px-2.5 py-1 rounded bg-[#ff7a18] text-[#331200] font-mono text-xs font-bold flex items-center z-10">
            <PlayCircle className="w-3.5 h-3.5 mr-1.5 shrink-0" />
            <span>{statusBadge}</span>
          </div>
        ) : null}

        {/* Episode Number Tag */}
        <div className="absolute bottom-3 left-3 px-2.5 py-0.5 rounded bg-[#0e0f14]/95 text-white font-mono text-xs font-semibold z-10">
          {epShortTag}
        </div>

        {/* Scrobble Progress Bar Track */}
        {progressPercent > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-[#1f1214] z-10">
            <div
              className="h-full bg-[#ff7a18]"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        )}
      </div>

      {/* Info Area */}
      <div
        className={`p-4 flex flex-col flex-1 ${
          isFocused ? 'bg-[#292a2f]' : 'bg-[#1a1b21]'
        }`}
      >
        <div className="flex items-center justify-between" style={{ marginBottom: '6px' }}>
          <div className="flex items-center min-w-0" style={{ marginRight: '8px' }}>
            <span className="font-mono text-sm font-bold text-[#ff9f2e] mr-1.5 shrink-0">
              {episode.episode}.
            </span>
            <h3
              className={`text-lg font-bold truncate ${
                isFocused ? 'text-white' : 'text-[#e3e1e9]'
              }`}
            >
              {episode.title}
            </h3>
          </div>
          {episode.subtitle && episode.subtitle !== epCode && (
            <span className="font-mono text-xs text-[#ff7a18] font-bold shrink-0">{epCode}</span>
          )}
        </div>
        <p className="text-sm text-[#a8a29e] line-clamp-2 leading-normal">{subtitleText}</p>
      </div>
    </div>
  );
});

export function ItemDetailModal({
  isOpen = true,
  item,
  serverUrl,
  client,
  token,
  initialSelectedSeason,
  initialFocusedId,
  onViewStateChange,
  onPlay,
  onClose,
  onBrowseFolder,
  onAddToPlaylist,
  onPlaylistChanged,
}: ItemDetailModalProps) {
  const onViewStateChangeRef = useRef(onViewStateChange);
  useEffect(() => {
    onViewStateChangeRef.current = onViewStateChange;
  }, [onViewStateChange]);

  const effectiveOpen = Boolean(isOpen && item);

  const resolvedId = item?.id ?? item?.card?.id;
  const resolvedTitle = item?.title ?? item?.card?.title ?? '';
  const resolvedOverview = item?.overview ?? item?.card?.subtitle;
  const resolvedReleaseYear = item?.release_year ?? item?.card?.release_year;
  const resolvedResolution = item?.resolution ?? item?.technical?.resolution;
  const resolvedPosterUrl = item?.poster_url ?? item?.card?.poster_url;
  const resolvedBackdropUrl = item?.backdrop_url ?? item?.card?.backdrop_url;
  const resolvedDurationMs =
    item?.duration_ms ??
    (item?.duration_seconds && item.duration_seconds > 0
      ? item.duration_seconds * 1000
      : undefined);
  const isLiveChannel = Boolean(
    item?.media_type === 'live_channel' ||
      item?.card?.media_type === 'live_channel' ||
      (item?.duration_seconds !== undefined && item.duration_seconds <= 0) ||
      (item?.technical?.duration_seconds !== undefined &&
        item.technical.duration_seconds <= 0)
  );
  const isItemCompleted = (item?.card?.playback_progress ?? 0) >= 0.9;
  const rawResumeMs =
    item?.resume_position_ms ??
    (item?.resume_position_seconds !== undefined && item.resume_position_seconds > 0
      ? item.resume_position_seconds * 1000
      : undefined);
  const resolvedResumeMs =
    !isLiveChannel &&
    !isItemCompleted &&
    rawResumeMs !== undefined &&
    rawResumeMs > 0 &&
    (!resolvedDurationMs || rawResumeMs < resolvedDurationMs * 0.95)
      ? rawResumeMs
      : undefined;
  const resolvedLibraryId = item?.library_id;
  const resolvedFolderPath = item?.folder_path;

  const [internalAddTarget, setInternalAddTarget] = useState<AddToPlaylistTarget | null>(null);
  const fallbackClient = useMemo(
    () => client ?? new ApiClient(serverUrl || 'http://localhost:8492'),
    [client, serverUrl]
  );

  const isShow = Boolean(
    item?.card?.media_type === 'show' ||
      item?.media_type === 'show' ||
      (item?.episodes && item.episodes.length > 0)
  );

  const episodes = useMemo(() => item?.episodes || [], [item?.episodes]);

  const seasons = useMemo(() => {
    return Array.from(new Set(episodes.map((e) => e.season))).sort((a, b) => a - b);
  }, [episodes]);

  const seasonEpisodeCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const ep of episodes) {
      counts.set(ep.season, (counts.get(ep.season) ?? 0) + 1);
    }
    return counts;
  }, [episodes]);

  const defaultSeason = useMemo(() => {
    const firstUnfinished = episodes.find((e) => (e.playback_progress || 0) < 0.9);
    return firstUnfinished?.season ?? seasons[0] ?? 1;
  }, [episodes, seasons]);

  const [selectedSeason, setSelectedSeason] = useState<number>(() => {
    if (
      initialSelectedSeason !== undefined &&
      seasons.includes(initialSelectedSeason)
    ) {
      return initialSelectedSeason;
    }
    return defaultSeason;
  });

  const [prevResolvedId, setPrevResolvedId] = useState(resolvedId);
  if (prevResolvedId !== resolvedId) {
    setPrevResolvedId(resolvedId);
    const targetSeason =
      initialSelectedSeason !== undefined && seasons.includes(initialSelectedSeason)
        ? initialSelectedSeason
        : defaultSeason;
    if (selectedSeason !== targetSeason) {
      setSelectedSeason(targetSeason);
    }
  }

  useEffect(() => {
    if (seasons.length > 0 && !seasons.includes(selectedSeason)) {
      const targetSeason =
        initialSelectedSeason !== undefined && seasons.includes(initialSelectedSeason)
          ? initialSelectedSeason
          : defaultSeason;
      setSelectedSeason(targetSeason);
    }
  }, [defaultSeason, initialSelectedSeason, seasons, selectedSeason]);

  const { setFocusedId, pushTrap, popTrap, getFocusedId, getActiveTrap } = useFocusStore();

  const notifyViewState = useCallback(
    (targetFocusedId?: string | null) => {
      const lastFocusedId = targetFocusedId !== undefined ? targetFocusedId : getFocusedId();
      onViewStateChangeRef.current?.({
        selectedSeason,
        lastFocusedId,
      });
    },
    [getFocusedId, selectedSeason]
  );

  useEffect(() => {
    if (!effectiveOpen) return;
    notifyViewState();
  }, [effectiveOpen, selectedSeason, notifyViewState]);

  useEffect(() => {
    if (!effectiveOpen) {
      setInternalAddTarget(null);
    }
  }, [effectiveOpen, resolvedId]);

  useEffect(() => {
    if (effectiveOpen) {
      pushTrap('item-detail-modal');
      return () => {
        popTrap('item-detail-modal');
      };
    }
  }, [effectiveOpen, pushTrap, popTrap]);

  const nextEpisode = useMemo(() => {
    if (!isShow || episodes.length === 0) return null;
    return episodes.find((e) => (e.playback_progress || 0) < 0.9) || episodes[0];
  }, [isShow, episodes]);

  const isEpisodeResume = Boolean(
    nextEpisode &&
      (nextEpisode.playback_progress || 0) > 0 &&
      (nextEpisode.playback_progress || 0) < 0.9
  );

  const nextEpisodeResumeMs = isEpisodeResume
    ? toResumePercentageSentinel(nextEpisode?.playback_progress)
    : 0;

  const primaryBtnId = isShow
    ? isEpisodeResume
      ? 'detail-resume-btn'
      : 'detail-play-btn'
    : resolvedResumeMs && resolvedResumeMs > 0
    ? 'detail-resume-btn'
    : 'detail-play-btn';

  const hasRestoredFocusRef = useRef<string | null>(null);
  useEffect(() => {
    if (!effectiveOpen) {
      hasRestoredFocusRef.current = null;
      return;
    }

    const currentKey = `${resolvedId}`;
    if (hasRestoredFocusRef.current === currentKey) {
      return;
    }
    hasRestoredFocusRef.current = currentKey;

    if (initialFocusedId) {
      const el =
        document.querySelector<HTMLElement>(`[data-focus-id="${initialFocusedId}"]`) ||
        document.getElementById(initialFocusedId);
      if (el) {
        setFocusedId(initialFocusedId);
        el.focus();
        notifyViewState(initialFocusedId);
        return;
      }
      const fallbackEl =
        document.querySelector<HTMLElement>(`[data-focus-id="${primaryBtnId}"]`) ||
        document.getElementById(primaryBtnId) ||
        document.querySelector<HTMLElement>('[data-focus-id="detail-close-btn"]') ||
        document.getElementById('detail-close-btn');
      if (fallbackEl) {
        setFocusedId(fallbackEl.id);
        fallbackEl.focus();
        notifyViewState(fallbackEl.id);
      }
    }
  }, [effectiveOpen, resolvedId, initialFocusedId, primaryBtnId, setFocusedId, notifyViewState]);

  const episodePlaylist: PlaylistItem[] = useMemo(() => {
    if (!episodes || episodes.length === 0) return [];
    const sorted = [...episodes].sort((a, b) =>
      a.season !== b.season ? a.season - b.season : a.episode - b.episode
    );
    return sorted.map((ep) => ({
      id: ep.id,
      title: ep.title,
    }));
  }, [episodes]);

  const nextEpisodeIndex = useMemo(() => {
    if (!nextEpisode || episodePlaylist.length === 0) return undefined;
    const idx = episodePlaylist.findIndex((p) => String(p.id) === String(nextEpisode.id));
    return idx >= 0 ? idx : undefined;
  }, [nextEpisode, episodePlaylist]);

  const visibleSeasonEpisodes = useMemo(
    () => episodes.filter((ep) => ep.season === selectedSeason),
    [episodes, selectedSeason]
  );

  useEffect(() => {
    if (!effectiveOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const currentTrap = getActiveTrap();
      if (currentTrap && currentTrap !== 'item-detail-modal') {
        return;
      }

      if (typeof document !== 'undefined' && isTextInputElement(document.activeElement)) {
        return;
      }

      const code = e.keyCode || e.which;
      if (
        code === TVKeys.BACK_TIZEN ||
        code === TVKeys.BACK_WEB ||
        code === TVKeys.BACKSPACE ||
        e.key === 'Escape'
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
        onClose();
        return;
      }

      if (seasons.length > 0) {
        // Channel Up / Down switches seasons directly as shown in the remote hint bar
        if (code === TVKeys.CH_UP || e.key === 'ChannelUp') {
          e.preventDefault();
          const idx = seasons.indexOf(selectedSeason);
          if (idx >= 0 && idx < seasons.length - 1) {
            setSelectedSeason(seasons[idx + 1]);
          }
          return;
        }
        if (code === TVKeys.CH_DOWN || e.key === 'ChannelDown') {
          e.preventDefault();
          const idx = seasons.indexOf(selectedSeason);
          if (idx > 0) {
            setSelectedSeason(seasons[idx - 1]);
          }
          return;
        }

        const activeDomId =
          typeof document !== 'undefined' ? document.activeElement?.id || '' : '';
        const current = getFocusedId() || activeDomId;
        const isDetailAction =
          current.startsWith('detail-') ||
          activeDomId.startsWith('detail-') ||
          current === 'item-detail-modal';
        const isSeasonTab =
          current.startsWith('season-tab-') || activeDomId.startsWith('season-tab-');
        const isEpisodeCard =
          current.startsWith('episode-card-') || activeDomId.startsWith('episode-card-');

        // Down Navigation
        if (code === TVKeys.DOWN || e.key === 'ArrowDown') {
          if (isDetailAction) {
            e.preventDefault();
            e.stopImmediatePropagation();
            setFocusedId(`season-tab-${selectedSeason}`);
          } else if (isSeasonTab) {
            if (visibleSeasonEpisodes.length > 0) {
              e.preventDefault();
              e.stopImmediatePropagation();
              setFocusedId(`episode-card-${visibleSeasonEpisodes[0].id}`);
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
          const tabId = current.startsWith('season-tab-')
            ? current
            : activeDomId.startsWith('season-tab-')
            ? activeDomId
            : '';
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
          const tabId = current.startsWith('season-tab-')
            ? current
            : activeDomId.startsWith('season-tab-')
            ? activeDomId
            : '';
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
          const tabId = current.startsWith('season-tab-')
            ? current
            : activeDomId.startsWith('season-tab-')
            ? activeDomId
            : '';
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
    effectiveOpen,
    onClose,
    seasons,
    selectedSeason,
    visibleSeasonEpisodes,
    getFocusedId,
    getActiveTrap,
    setFocusedId,
    primaryBtnId,
  ]);

  const handlePlayShowResume = useCallback(() => {
    if (!nextEpisode) return;
    notifyViewState(getFocusedId() || primaryBtnId);
    onPlay(
      nextEpisode.id,
      nextEpisodeResumeMs,
      nextEpisode.title,
      undefined,
      episodePlaylist.length > 0 ? episodePlaylist : undefined,
      nextEpisodeIndex
    );
  }, [
    nextEpisode,
    notifyViewState,
    getFocusedId,
    primaryBtnId,
    onPlay,
    nextEpisodeResumeMs,
    episodePlaylist,
    nextEpisodeIndex,
  ]);

  const handlePlayShowStart = useCallback(() => {
    if (!nextEpisode) return;
    notifyViewState(getFocusedId() || primaryBtnId);
    onPlay(
      nextEpisode.id,
      0,
      nextEpisode.title,
      undefined,
      episodePlaylist.length > 0 ? episodePlaylist : undefined,
      nextEpisodeIndex
    );
  }, [
    nextEpisode,
    notifyViewState,
    getFocusedId,
    primaryBtnId,
    onPlay,
    episodePlaylist,
    nextEpisodeIndex,
  ]);

  const handlePlayMovieResume = useCallback(() => {
    if (resolvedId === undefined || resolvedId === null) return;
    notifyViewState(getFocusedId() || primaryBtnId);
    onPlay(resolvedId, resolvedResumeMs);
  }, [resolvedId, notifyViewState, getFocusedId, primaryBtnId, onPlay, resolvedResumeMs]);

  const handlePlayMovieStart = useCallback(() => {
    if (resolvedId === undefined || resolvedId === null) return;
    notifyViewState(getFocusedId() || primaryBtnId);
    onPlay(resolvedId, 0);
  }, [resolvedId, notifyViewState, getFocusedId, primaryBtnId, onPlay]);

  const handleBrowseFolderClick = useCallback(() => {
    if (!resolvedLibraryId || !resolvedFolderPath) return;
    notifyViewState(getFocusedId() || 'detail-browse-folder-btn');
    onBrowseFolder?.(resolvedLibraryId, resolvedFolderPath);
  }, [resolvedLibraryId, resolvedFolderPath, notifyViewState, getFocusedId, onBrowseFolder]);

  const canAddToPlaylist =
    resolvedId !== undefined && resolvedId !== null && String(resolvedId) !== '';

  const handleOpenAddToPlaylist = useCallback(() => {
    if (!canAddToPlaylist) return;
    const numId = Number(resolvedId);
    const safeId = Number.isFinite(numId) ? numId : (resolvedId as unknown as number);
    const target: AddToPlaylistTarget = isShow
      ? {
          kind: 'show',
          showId: safeId,
          title: resolvedTitle || 'Show',
          seasons,
          defaultSeason: selectedSeason,
        }
      : {
          kind: 'item',
          itemId: safeId,
          title: resolvedTitle || 'Media Item',
        };

    if (onAddToPlaylist) {
      onAddToPlaylist(target);
    } else {
      setInternalAddTarget(target);
    }
  }, [canAddToPlaylist, resolvedId, isShow, resolvedTitle, seasons, selectedSeason, onAddToPlaylist]);

  const handleSelectEpisode = useCallback(
    (ep: EpisodeCard) => {
      const episodeFocusId = getFocusedId() || `episode-card-${ep.id}`;
      notifyViewState(episodeFocusId);
      const playlistIdx = episodePlaylist.findIndex((p) => String(p.id) === String(ep.id));
      const epResumeArg = toResumePercentageSentinel(ep.playback_progress);
      onPlay(
        ep.id,
        epResumeArg,
        ep.title,
        undefined,
        episodePlaylist.length > 0 ? episodePlaylist : undefined,
        playlistIdx >= 0 ? playlistIdx : undefined
      );
    },
    [episodePlaylist, getFocusedId, notifyViewState, onPlay]
  );

  const handleFocusSeasonTab = useCallback(
    (tabId: string) => {
      setFocusedId(tabId);
    },
    [setFocusedId]
  );

  if (!effectiveOpen || !item) return null;

  const unlockTokens = client?.getUnlockTokens ? client.getUnlockTokens() : [];
  const formatImageUrl = (path?: string) => {
    if (!path) return undefined;
    if (token || unlockTokens.length > 0) {
      return getAuthenticatedImageUrl(serverUrl, path, token, unlockTokens);
    }
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    const cleanServer = serverUrl.replace(/\/+$/, '');
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${cleanServer}${cleanPath}`;
  };

  const hasRestartBtn = !isShow && Boolean(resolvedResumeMs && resolvedResumeMs > 0);
  const hasBrowseFolderBtn = Boolean(
    resolvedLibraryId &&
      resolvedFolderPath &&
      String(resolvedFolderPath).trim() !== '' &&
      !String(resolvedFolderPath).startsWith('plugin://') &&
      !String(resolvedLibraryId).startsWith('plugin://')
  );

  let nextActionOrder = 1;
  const primaryActionOrder = nextActionOrder++;
  const restartActionOrder = hasRestartBtn ? nextActionOrder++ : undefined;
  const browseFolderOrder = hasBrowseFolderBtn ? nextActionOrder++ : undefined;
  const addPlaylistOrder = canAddToPlaylist ? nextActionOrder++ : undefined;
  const closeActionOrder = nextActionOrder++;

  const backdrop = formatImageUrl(resolvedBackdropUrl);
  const poster = formatImageUrl(resolvedPosterUrl);

  const durationMins = resolvedDurationMs ? Math.round(resolvedDurationMs / 60000) : null;
  const resumeMins = resolvedResumeMs ? Math.round(resolvedResumeMs / 60000) : null;

  const videoCodecChip = item.technical?.video_codec
    ? item.technical.video_codec.toUpperCase()
    : null;
  const audioCodecChip = item.technical?.audio_codec
    ? `${
        item.technical.audio_channels === 6
          ? '5.1 '
          : item.technical.audio_channels === 8
          ? '7.1 '
          : item.technical.audio_channels
          ? `${item.technical.audio_channels}ch `
          : ''
      }${item.technical.audio_codec.toUpperCase()}`
    : null;
  const containerChip = item.technical?.container
    ? item.technical.container.toUpperCase()
    : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={resolvedTitle}
      className="fixed inset-0 w-screen h-screen bg-[#121318] text-[#e3e1e9] z-[60] flex flex-col justify-between select-none overflow-y-auto overflow-x-hidden"
    >
      {/* Hero Backdrop Section (zero GPU blur filters for Samsung Tizen Mali GPU) */}
      <div className="relative w-full overflow-hidden bg-[#0e0f14] shrink-0">
        {backdrop && (
          <img
            src={backdrop}
            alt={resolvedTitle}
            decoding="async"
            className="absolute inset-0 w-full h-full object-cover opacity-45 pointer-events-none"
          />
        )}
        {/* Multi-directional Obsidian Vignettes */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#0e0f14] via-[#0e0f14]/90 to-transparent pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#121318] via-[#121318]/85 to-transparent pointer-events-none" />

        {/* Hero Canvas Inner Container with 10-Foot Safe Margins */}
        <div className="relative z-10 px-14 pt-8 pb-8 flex flex-col">
          {/* Top Breadcrumb Navigation Bar */}
          <div
            data-testid="detail-breadcrumb"
            className="flex items-center text-sm font-medium mb-6"
          >
            <span className="text-[#6e6865]">{isShow ? 'TV Shows' : 'Movies'}</span>
            <ChevronRight className="w-4 h-4 text-[#6e6865] mx-2" />
            <span className="text-[#e3e1e9] font-semibold truncate max-w-xl">
              {resolvedFolderPath || 'Media Details'}
            </span>
            <span className="ml-3 px-2.5 py-0.5 rounded bg-[#292a2f] text-[#ffb871] font-mono text-xs tracking-wider uppercase font-bold">
              {isShow ? `S${String(selectedSeason).padStart(2, '0')}` : 'FEATURE'}
            </span>
          </div>

          {/* Hero Main Content Row */}
          <div className="flex flex-row items-start w-full">
            {poster && (
              <img
                src={poster}
                alt={resolvedTitle}
                decoding="async"
                className={`${
                  isShow && seasons.length > 0 ? 'w-56 h-[320px]' : 'w-72 h-[420px]'
                } object-cover rounded-2xl border border-[rgba(255,122,24,0.18)] shrink-0 mr-10`}
              />
            )}

            <div className="flex flex-col justify-between flex-1 min-w-0">
              <div>
                {/* Technical Format Chips Strip */}
                {(resolvedResolution || videoCodecChip || audioCodecChip || containerChip) && (
                  <div className="flex items-center flex-wrap font-mono text-xs font-bold mb-3">
                    {resolvedResolution && (
                      <span className="px-2.5 py-1 rounded bg-[#281216] text-[#ff9f2e] border border-[#ff7a18]/30 mr-2.5 mb-1">
                        {resolvedResolution}
                      </span>
                    )}
                    {videoCodecChip && (
                      <span className="px-2.5 py-1 rounded bg-[#281216] text-[#ff9f2e] mr-2.5 mb-1">
                        {videoCodecChip}
                      </span>
                    )}
                    {audioCodecChip && (
                      <span className="px-2.5 py-1 rounded bg-[#292a2f] text-[#e3e1e9] mr-2.5 mb-1">
                        {audioCodecChip}
                      </span>
                    )}
                    {containerChip && (
                      <span className="px-2.5 py-1 rounded bg-[#292a2f] text-[#a8a29e] mr-2.5 mb-1">
                        {containerChip}
                      </span>
                    )}
                  </div>
                )}

                {/* Hero Headline Display */}
                <h1
                  className={`${
                    isShow && seasons.length > 0 ? 'text-5xl mb-2' : 'text-6xl mb-3'
                  } font-extrabold text-[#f8fafc] tracking-tight leading-none truncate`}
                >
                  {resolvedTitle}
                </h1>

                {/* Metadata Sub-line */}
                <div className="flex items-center flex-wrap text-xl text-[#a8a29e] mt-1 mb-3">
                  {isLiveChannel && (
                    <span
                      data-testid="detail-live-badge"
                      className="px-2.5 py-0.5 rounded bg-[#D43F15] text-white font-mono text-sm font-bold uppercase mr-3"
                    >
                      LIVE
                    </span>
                  )}
                  {resolvedReleaseYear && (
                    <span className="text-[#e3e1e9] font-semibold mr-3">{resolvedReleaseYear}</span>
                  )}
                  {!isLiveChannel && durationMins && <span className="mr-3">• {durationMins}m</span>}
                  {isShow && seasons.length > 0 && (
                    <span className="mr-3">
                      • {seasons.length} {seasons.length === 1 ? 'Season' : 'Seasons'}
                    </span>
                  )}
                  {isShow && episodes.length > 0 && (
                    <span className="mr-3">
                      • {episodes.length} {episodes.length === 1 ? 'Episode' : 'Episodes'}
                    </span>
                  )}
                  {item.genres && item.genres.length > 0 && (
                    <span className="text-[#ffb871] font-medium">
                      {resolvedReleaseYear || (!isLiveChannel && durationMins) || isShow ? '• ' : ''}
                      <span>{item.genres.join(', ')}</span>
                    </span>
                  )}
                </div>

                {/* Synopsis Text Clamped for 10-Foot Legibility */}
                {resolvedOverview && (
                  <p
                    className={`text-[#e0c0b0] ${
                      isShow && seasons.length > 0
                        ? 'text-lg line-clamp-2 mb-5 max-w-4xl'
                        : 'text-xl line-clamp-3 mb-6 max-w-5xl'
                    } leading-relaxed font-normal`}
                  >
                    {resolvedOverview}
                  </p>
                )}
              </div>

              {/* D-Pad TV Action Buttons Row */}
              <div
                id="remote-action-strip"
                className="flex flex-row items-center flex-wrap mt-3"
              >
                {isShow && nextEpisode ? (
                  isEpisodeResume ? (
                    <PrimaryDetailActionButton
                      id="detail-resume-btn"
                      order={primaryActionOrder}
                      eyebrow="Resume Next"
                      label={`S${String(nextEpisode.season ?? 1).padStart(2, '0')}E${String(
                        nextEpisode.episode ?? 1
                      ).padStart(2, '0')} • "${nextEpisode.title}"`}
                      onActivate={handlePlayShowResume}
                      autoFocus
                    />
                  ) : (
                    <PrimaryDetailActionButton
                      id="detail-play-btn"
                      order={1}
                      eyebrow={`Direct Stream • S${String(nextEpisode.season ?? 1).padStart(
                        2,
                        '0'
                      )}E${String(nextEpisode.episode ?? 1).padStart(2, '0')}`}
                      eyebrowAriaHidden
                      label="Play"
                      onActivate={handlePlayShowStart}
                      autoFocus
                    />
                  )
                ) : resolvedResumeMs && resolvedResumeMs > 0 ? (
                  <>
                    <PrimaryDetailActionButton
                      id="detail-resume-btn"
                      order={1}
                      eyebrow="Continue Watching"
                      eyebrowAriaHidden
                      label={`Resume (${resumeMins}m)`}
                      onActivate={handlePlayMovieResume}
                      autoFocus
                    />
                    <SecondaryDetailActionButton
                      id="detail-restart-btn"
                      order={restartActionOrder}
                      icon={
                        <RotateCcw
                          className="w-5 h-5 mr-2.5 text-[#ffb871] shrink-0"
                          style={{ marginRight: '10px' }}
                        />
                      }
                      label="Play from Beginning"
                      onActivate={handlePlayMovieStart}
                    />
                  </>
                ) : (
                  <PrimaryDetailActionButton
                    id="detail-play-btn"
                    order={1}
                    eyebrow="Direct Stream"
                    eyebrowAriaHidden
                    label="Play"
                    onActivate={handlePlayMovieStart}
                    autoFocus
                  />
                )}

                {hasBrowseFolderBtn && (
                  <SecondaryDetailActionButton
                    id="detail-browse-folder-btn"
                    order={browseFolderOrder}
                    icon={
                      <Folder
                        className="w-5 h-5 mr-2.5 text-[#ffb871] shrink-0"
                        style={{ marginRight: '10px' }}
                      />
                    }
                    label="Browse Folder"
                    onActivate={handleBrowseFolderClick}
                  />
                )}

                {canAddToPlaylist && (
                  <SecondaryDetailActionButton
                    id="detail-add-playlist-btn"
                    order={addPlaylistOrder}
                    icon={
                      <ListPlus
                        className="w-5 h-5 mr-2.5 text-[#ffb871] shrink-0"
                        style={{ marginRight: '10px' }}
                      />
                    }
                    label="Add to Playlist"
                    onActivate={handleOpenAddToPlaylist}
                  />
                )}

                <SecondaryDetailActionButton
                  id="detail-close-btn"
                  order={closeActionOrder}
                  icon={
                    <X
                      className="w-5 h-5 mr-2.5 text-[#ffb871] shrink-0"
                      style={{ marginRight: '10px' }}
                    />
                  }
                  label="Back"
                  onActivate={onClose}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Horizontal Seasons & 16:9 Episodes Shelf Section */}
      {seasons.length > 0 && (
        <section className="relative z-10 flex flex-col w-full px-14 pt-2 pb-4 flex-1 justify-end">
          {/* Season Selector Tabs Bar */}
          <div className="flex items-center justify-between pb-4">
            <div className="flex items-center">
              <h2 className="text-3xl font-bold text-[#e3e1e9] tracking-tight mr-6">
                Episodes
              </h2>
              <div className="flex items-center overflow-x-auto scrollbar-none">
                {seasons.map((season, idx) => (
                  <SeasonTabButton
                    key={season}
                    season={season}
                    order={idx + 1}
                    isActiveSeason={selectedSeason === season}
                    seasonEpCount={seasonEpisodeCounts.get(season) ?? 0}
                    onSelectSeason={setSelectedSeason}
                    onFocusSeasonTab={handleFocusSeasonTab}
                  />
                ))}
              </div>
            </div>
            <div className="flex items-center text-[#a8a29e] font-mono text-xs tracking-wider uppercase">
              <span>ALL EPISODES DIRECT STREAM READY</span>
            </div>
          </div>

          {/* Horizontal Episode Carousel Cards (16:9 Landscape Aspect) */}
          <div className="flex overflow-x-auto pb-3 pt-2 scrollbar-none">
            {visibleSeasonEpisodes.map((ep, idx) => (
              <EpisodeLandscapeCard
                key={ep.id}
                episode={ep}
                index={idx}
                selectedSeason={selectedSeason}
                imageUrl={formatImageUrl(ep.poster_url) || backdrop || poster}
                isNextUp={Boolean(nextEpisode && String(nextEpisode.id) === String(ep.id))}
                onSelectEpisode={handleSelectEpisode}
              />
            ))}
          </div>
        </section>
      )}

      {/* Bottom TV Remote Navigation Footer */}
      <footer
        data-testid="detail-remote-footer"
        className="relative z-20 w-full bg-[#0d0e13]/95 border-t border-[rgba(255,122,24,0.18)] shrink-0"
      >
        <div className="h-14 w-full px-14 flex items-center justify-between text-sm text-[#a78b7d]">
          <div className="flex items-center">
            <span className="mr-8">
              <strong className="text-white bg-[#292a2f] border border-[rgba(255,122,24,0.18)] px-2 py-0.5 rounded font-mono font-bold mr-1.5">
                [OK]
              </strong>
              Select
            </span>
            <span className="mr-8">
              <strong className="text-white bg-[#292a2f] border border-[rgba(255,122,24,0.18)] px-2 py-0.5 rounded font-mono font-bold mr-1.5">
                [RETURN]
              </strong>
              Return
            </span>
            {seasons.length > 1 && (
              <span className="mr-8">
                <strong className="text-white bg-[#292a2f] border border-[rgba(255,122,24,0.18)] px-2 py-0.5 rounded font-mono font-bold mr-1.5">
                  [CH ▲/▼]
                </strong>
                Switch Seasons
              </span>
            )}
          </div>
          <div className="flex items-center font-mono text-xs text-[#ffb871]">
            <span>KADR CINEMA CORE</span>
          </div>
        </div>
      </footer>

      {internalAddTarget && (
        <AddToPlaylistModal
          isOpen={Boolean(internalAddTarget)}
          client={fallbackClient}
          serverUrl={serverUrl}
          token={token}
          target={internalAddTarget}
          onClose={() => setInternalAddTarget(null)}
          onSuccess={() => {
            onPlaylistChanged?.();
          }}
        />
      )}
    </div>
  );
}
