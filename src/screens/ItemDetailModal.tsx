import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
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
import { applyWatchStateMutation, toResumePercentageSentinel } from '../utils/playbackProgress';
import { setItemWatchState, setBatchWatchState } from '../api/playback';
import {
  buildEpisodeRangeGroups,
  computeVirtualHorizontalWindow,
  DEFAULT_STRIP_VIEWPORT_WIDTH_PX,
  EPISODE_RANGE_SIZE,
  VIRTUAL_EPISODE_THRESHOLD,
  type EpisodeRangeGroup,
} from '../utils/virtualWindow';

const EPISODE_CARD_WIDTH_PX = 320;
const EPISODE_CARD_SPACING_PX = 16;
const EPISODE_CARD_STRIDE_PX = EPISODE_CARD_WIDTH_PX + EPISODE_CARD_SPACING_PX;
const EPISODE_FAST_SKIP_COUNT = 10;

function isEpisodeControlId(id: string | null | undefined): boolean {
  if (!id) return false;
  return (
    id.startsWith('episode-card-') ||
    id.startsWith('episode-range-pill-') ||
    id.startsWith('episode-action-')
  );
}

function resolveDefaultActiveEpisodeId(
  seasonEps: EpisodeCard[],
  initialFocusedId: string | null | undefined,
  nextEp: EpisodeCard | null | undefined,
  seasonNum: number
): number | string | null {
  if (initialFocusedId?.startsWith('episode-card-')) {
    const targetId = initialFocusedId.slice('episode-card-'.length);
    const matched = seasonEps.find((ep) => String(ep.id) === targetId);
    if (matched) {
      return matched.id;
    }
  }
  if (
    seasonEps.length > VIRTUAL_EPISODE_THRESHOLD &&
    nextEp &&
    nextEp.season === seasonNum
  ) {
    const matchedNext = seasonEps.find((ep) => String(ep.id) === String(nextEp.id));
    if (matchedNext) {
      return matchedNext.id;
    }
  }
  return seasonEps[0]?.id ?? null;
}

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
  onWatchStateChange?: (itemIds: Array<number | string>, watched: boolean) => Promise<void> | void;
  onLockedLibrary?: (libraryId: string) => void;
}

interface PrimaryDetailActionButtonProps {
  id: string;
  order: number;
  eyebrow: string;
  eyebrowAriaHidden?: boolean;
  label: string;
  onActivate: () => void;
  onFocusAction?: (id: string) => void;
  autoFocus?: boolean;
}

const PrimaryDetailActionButton = memo(function PrimaryDetailActionButton({
  id,
  order,
  eyebrow,
  eyebrowAriaHidden = false,
  label,
  onActivate,
  onFocusAction,
  autoFocus,
}: PrimaryDetailActionButtonProps) {
  const isFocused = useIsFocused(id);
  const handleFocus = useCallback(() => {
    onFocusAction?.(id);
  }, [onFocusAction, id]);

  return (
    <TVButton
      id={id}
      data-focus-id={id}
      groupId="item-detail-modal"
      order={order}
      variant="primary"
      onEnter={onActivate}
      onClick={onActivate}
      onFocus={handleFocus}
      className={`group relative !px-6 !py-4 !rounded-xl mr-4 mb-2 bg-gradient-to-r from-[#ff5e1e] to-[#ff7a18] !text-[#532200] !text-base font-bold tracking-wide transition-transform duration-75 ${
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
  onFocusAction?: (id: string) => void;
}

const SecondaryDetailActionButton = memo(function SecondaryDetailActionButton({
  id,
  order,
  icon,
  label,
  onActivate,
  onFocusAction,
}: SecondaryDetailActionButtonProps) {
  const isFocused = useIsFocused(id);
  const handleFocus = useCallback(() => {
    onFocusAction?.(id);
  }, [onFocusAction, id]);

  return (
    <TVButton
      id={id}
      data-focus-id={id}
      groupId="item-detail-modal"
      order={order}
      variant="secondary"
      onEnter={onActivate}
      onClick={onActivate}
      onFocus={handleFocus}
      className={`!px-5 !py-4 !rounded-xl !text-base font-semibold tracking-wide mr-4 mb-2 transition-transform duration-75 ${
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

interface SeasonWatchToggleButtonProps {
  order: number;
  selectedSeason: number;
  allSeasonWatched: boolean;
  onActivate: () => void;
  onFocusButton: (id: string) => void;
}

const SeasonWatchToggleButton = memo(function SeasonWatchToggleButton({
  order,
  selectedSeason,
  allSeasonWatched,
  onActivate,
  onFocusButton,
}: SeasonWatchToggleButtonProps) {
  const id = 'season-watch-toggle-btn';
  const isFocused = useIsFocused(id);
  const handleFocus = useCallback(() => {
    onFocusButton(id);
  }, [onFocusButton]);

  const accessibleLabel = `Mark S${String(selectedSeason).padStart(2, '0')} ${
    allSeasonWatched ? 'Unwatched' : 'Watched'
  }`;

  return (
    <TVButton
      id={id}
      data-focus-id={id}
      aria-label={accessibleLabel}
      groupId="season-tabs"
      order={order}
      variant="secondary"
      onClick={onActivate}
      onEnter={onActivate}
      onFocus={handleFocus}
      className={`!px-4 !py-2 !text-sm font-bold !rounded-xl shrink-0 transition-transform duration-75 ${
        isFocused
          ? '!bg-[#38393f] !text-white !border-[#ff7a18] scale-[1.03]'
          : '!bg-[#292a2f] !text-[#e3e1e9] border border-[rgba(255,122,24,0.18)]'
      }`}
      style={{
        padding: '10px 16px',
        borderRadius: '12px',
        backgroundColor: isFocused ? '#38393f' : '#292a2f',
        color: isFocused ? '#ffffff' : '#e3e1e9',
        border: isFocused ? '2px solid #ff7a18' : '1px solid rgba(255, 122, 24, 0.18)',
        boxShadow: isFocused ? '0 0 0 2px #FFB800' : 'none',
        transform: isFocused ? 'scale(1.03)' : 'scale(1)',
      }}
    >
      {allSeasonWatched ? (
        <RotateCcw className="w-4 h-4 mr-2 text-[#ffb871] shrink-0" />
      ) : (
        <CheckCircle2 className="w-4 h-4 mr-2 text-[#ffb871] shrink-0" />
      )}
      <span>
        {allSeasonWatched
          ? `Mark Season ${selectedSeason} Unwatched`
          : `Mark Season ${selectedSeason} Watched`}
      </span>
    </TVButton>
  );
});

interface EpisodeActionPillProps {
  id: string;
  order: number;
  icon: ReactNode;
  label: string;
  onActivate: () => void;
  onFocusPill: (id: string) => void;
}

const EpisodeActionPill = memo(function EpisodeActionPill({
  id,
  order,
  icon,
  label,
  onActivate,
  onFocusPill,
}: EpisodeActionPillProps) {
  const isFocused = useIsFocused(id);
  const handleFocus = useCallback(() => {
    onFocusPill(id);
  }, [onFocusPill, id]);

  return (
    <TVButton
      id={id}
      data-focus-id={id}
      groupId="item-detail-episode-actions"
      order={order}
      variant="secondary"
      onClick={onActivate}
      onEnter={onActivate}
      onFocus={handleFocus}
      className={`!px-4 !py-2 !rounded-xl !text-sm font-semibold mr-3 last:mr-0 shrink-0 transition-transform duration-75 ${
        isFocused
          ? '!bg-[#38393f] !text-white !border-[#ff7a18] scale-[1.03]'
          : '!bg-[#292a2f] !text-[#e3e1e9] border border-[rgba(255,122,24,0.18)]'
      }`}
      style={{
        padding: '8px 16px',
        borderRadius: '10px',
        backgroundColor: isFocused ? '#38393f' : '#292a2f',
        color: isFocused ? '#ffffff' : '#e3e1e9',
        border: isFocused ? '2px solid #ff7a18' : '1px solid rgba(255, 122, 24, 0.18)',
        boxShadow: isFocused ? '0 0 0 2px #FFB800' : 'none',
        transform: isFocused ? 'scale(1.03)' : 'scale(1)',
      }}
    >
      {icon}
      <span>{label}</span>
    </TVButton>
  );
});

interface EpisodeRangePillProps {
  group: EpisodeRangeGroup;
  order: number;
  isActiveRange: boolean;
  onActivate: (startIndex: number) => void;
  onFocusPill: (id: string) => void;
}

const EpisodeRangePill = memo(function EpisodeRangePill({
  group,
  order,
  isActiveRange,
  onActivate,
  onFocusPill,
}: EpisodeRangePillProps) {
  const id = `episode-range-pill-${group.startIndex}`;
  const isFocused = useIsFocused(id);

  const handleActivate = useCallback(() => {
    onActivate(group.startIndex);
  }, [onActivate, group.startIndex]);

  const handleFocus = useCallback(() => {
    onFocusPill(id);
  }, [onFocusPill, id]);

  return (
    <TVButton
      id={id}
      data-focus-id={id}
      data-active={isActiveRange ? 'true' : 'false'}
      data-focused={isFocused ? 'true' : 'false'}
      groupId="item-detail-episode-ranges"
      order={order}
      variant={isActiveRange ? 'primary' : 'secondary'}
      onClick={handleActivate}
      onEnter={handleActivate}
      onFocus={handleFocus}
      className={`!px-3.5 !py-1.5 !text-sm font-mono font-bold !rounded-lg mr-2 last:mr-0 shrink-0 transition-transform duration-75 ${
        isFocused
          ? '!bg-[#38393f] !text-white !border-[#ff7a18] scale-[1.03]'
          : isActiveRange
          ? '!bg-[#281216] !text-[#ffb871] border border-[#ff7a18]/50'
          : '!bg-[#1a1b21] !text-[#a8a29e] border border-[rgba(255,122,24,0.12)]'
      }`}
      style={{
        padding: '6px 14px',
        borderRadius: '8px',
        backgroundColor: isFocused ? '#38393f' : isActiveRange ? '#281216' : '#1a1b21',
        color: isFocused ? '#ffffff' : isActiveRange ? '#ffb871' : '#a8a29e',
        border: isFocused
          ? '2px solid #ff7a18'
          : isActiveRange
          ? '1px solid rgba(255, 122, 24, 0.5)'
          : '1px solid rgba(255, 122, 24, 0.12)',
        boxShadow: isFocused ? '0 0 0 2px #FFB800' : 'none',
        transform: isFocused ? 'scale(1.03)' : 'scale(1)',
      }}
    >
      <span>{group.label}</span>
    </TVButton>
  );
});

interface EpisodeLandscapeCardProps {
  episode: EpisodeCard;
  index: number;
  selectedSeason: number;
  imageUrl?: string;
  isNextUp: boolean;
  isVirtualized?: boolean;
  isLastEpisode?: boolean;
  onSelectEpisode: (episode: EpisodeCard) => void;
  onFocusEpisode: (episodeId: number | string, cardFocusId?: string) => void;
}

const EpisodeLandscapeCard = memo(function EpisodeLandscapeCard({
  episode,
  index,
  selectedSeason,
  imageUrl,
  isNextUp,
  isVirtualized = false,
  isLastEpisode = false,
  onSelectEpisode,
  onFocusEpisode,
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

  const handleDomFocus = useCallback(() => {
    onFocusEpisode(episode.id, id);
  }, [onFocusEpisode, episode.id, id]);

  useEffect(() => {
    if (isFocused) {
      onFocusEpisode(episode.id);
    }
  }, [isFocused, episode.id, onFocusEpisode]);

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
  const spacingClass = isVirtualized ? (isLastEpisode ? 'mr-0' : 'mr-4') : 'mr-6';

  return (
    <div
      ref={ref}
      id={id}
      data-focus-id={id}
      data-testid={`card-${id}`}
      data-focused={isFocused ? 'true' : 'false'}
      tabIndex={-1}
      role="button"
      onClick={handleSelect}
      onFocus={handleDomFocus}
      className={`group relative flex flex-col w-80 shrink-0 ${spacingClass} rounded-2xl overflow-hidden transition-transform duration-75 cursor-pointer outline-none ${
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
  onWatchStateChange,
  onLockedLibrary,
}: ItemDetailModalProps) {
  const onViewStateChangeRef = useRef(onViewStateChange);
  useEffect(() => {
    onViewStateChangeRef.current = onViewStateChange;
  }, [onViewStateChange]);

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const [prevPropItem, setPrevPropItem] = useState(item);
  const [localItem, setLocalItem] = useState(item);
  if (prevPropItem !== item) {
    setPrevPropItem(item);
    setLocalItem(item);
  }
  const effectiveItem = localItem ?? item;

  const effectiveOpen = Boolean(isOpen && effectiveItem);

  const resolvedId = effectiveItem?.id ?? effectiveItem?.card?.id;
  const resolvedTitle = effectiveItem?.title ?? effectiveItem?.card?.title ?? '';
  const resolvedOverview = effectiveItem?.overview ?? effectiveItem?.card?.subtitle;
  const resolvedReleaseYear = effectiveItem?.release_year ?? effectiveItem?.card?.release_year;
  const resolvedResolution = effectiveItem?.resolution ?? effectiveItem?.technical?.resolution;
  const resolvedPosterUrl = effectiveItem?.poster_url ?? effectiveItem?.card?.poster_url;
  const resolvedBackdropUrl = effectiveItem?.backdrop_url ?? effectiveItem?.card?.backdrop_url;
  const resolvedDurationMs =
    effectiveItem?.duration_ms ??
    (effectiveItem?.duration_seconds && effectiveItem.duration_seconds > 0
      ? effectiveItem.duration_seconds * 1000
      : undefined);
  const isLiveChannel = Boolean(
    effectiveItem?.media_type === 'live_channel' ||
      effectiveItem?.card?.media_type === 'live_channel' ||
      (effectiveItem?.duration_seconds !== undefined && effectiveItem.duration_seconds <= 0) ||
      (effectiveItem?.technical?.duration_seconds !== undefined &&
        effectiveItem.technical.duration_seconds <= 0)
  );
  const isItemCompleted = (effectiveItem?.card?.playback_progress ?? 0) >= 0.9;
  const rawResumeMs =
    effectiveItem?.resume_position_ms ??
    (effectiveItem?.resume_position_seconds !== undefined &&
    effectiveItem.resume_position_seconds > 0
      ? effectiveItem.resume_position_seconds * 1000
      : undefined);
  const resolvedResumeMs =
    !isLiveChannel &&
    !isItemCompleted &&
    rawResumeMs !== undefined &&
    rawResumeMs > 0 &&
    (!resolvedDurationMs || rawResumeMs < resolvedDurationMs * 0.95)
      ? rawResumeMs
      : undefined;
  const resolvedLibraryId = effectiveItem?.library_id;
  const resolvedFolderPath = effectiveItem?.folder_path;

  const [internalAddTarget, setInternalAddTarget] = useState<AddToPlaylistTarget | null>(null);
  const fallbackClient = useMemo(
    () => client ?? new ApiClient(serverUrl || 'http://localhost:8492'),
    [client, serverUrl]
  );

  const isShow = Boolean(
    effectiveItem?.card?.media_type === 'show' ||
      effectiveItem?.media_type === 'show' ||
      (effectiveItem?.episodes && effectiveItem.episodes.length > 0)
  );

  const episodes = useMemo(() => effectiveItem?.episodes || [], [effectiveItem?.episodes]);

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

  const initialFocusedSeason = useMemo(() => {
    if (!initialFocusedId?.startsWith('episode-card-')) return undefined;
    const targetId = initialFocusedId.slice('episode-card-'.length);
    return episodes.find((ep) => String(ep.id) === targetId)?.season;
  }, [episodes, initialFocusedId]);

  const preferredSeason =
    initialSelectedSeason !== undefined && seasons.includes(initialSelectedSeason)
      ? initialSelectedSeason
      : initialFocusedSeason !== undefined && seasons.includes(initialFocusedSeason)
      ? initialFocusedSeason
      : defaultSeason;

  const [selectedSeason, setSelectedSeason] = useState<number>(() => preferredSeason);

  const [prevResolvedId, setPrevResolvedId] = useState(resolvedId);
  if (prevResolvedId !== resolvedId) {
    setPrevResolvedId(resolvedId);
    if (selectedSeason !== preferredSeason) {
      setSelectedSeason(preferredSeason);
    }
  }

  useEffect(() => {
    if (seasons.length > 0 && !seasons.includes(selectedSeason)) {
      setSelectedSeason(preferredSeason);
    }
  }, [preferredSeason, seasons, selectedSeason]);

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
        setIsFocusInEpisodeControls(isEpisodeControlId(initialFocusedId));
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
        setIsFocusInEpisodeControls(isEpisodeControlId(fallbackEl.id));
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

  const seasonScopeKey = `${effectiveOpen ? 1 : 0}:${resolvedId ?? ''}:${selectedSeason}`;
  const [prevSeasonScopeKey, setPrevSeasonScopeKey] = useState(seasonScopeKey);
  const [activeEpisodeId, setActiveEpisodeId] = useState<number | string | null>(() =>
    resolveDefaultActiveEpisodeId(
      visibleSeasonEpisodes,
      initialFocusedId,
      nextEpisode,
      selectedSeason
    )
  );
  const [stripScrollLeft, setStripScrollLeft] = useState(0);
  const [stripViewportWidth, setStripViewportWidth] = useState(0);
  const [isStripUserScrolling, setIsStripUserScrolling] = useState(false);
  const [isFocusInEpisodeControls, setIsFocusInEpisodeControls] = useState(false);
  const [pendingEpisodeCommitTick, setPendingEpisodeCommitTick] = useState(0);

  if (prevSeasonScopeKey !== seasonScopeKey) {
    setPrevSeasonScopeKey(seasonScopeKey);
    setActiveEpisodeId(
      resolveDefaultActiveEpisodeId(
        visibleSeasonEpisodes,
        initialFocusedId,
        nextEpisode,
        selectedSeason
      )
    );
    setStripScrollLeft(0);
    setIsStripUserScrolling(false);
    setIsFocusInEpisodeControls(false);
  }

  const episodeStripRef = useRef<HTMLDivElement | null>(null);
  const pendingEpisodeFocusRef = useRef<{ scopeKey: string; cardId: string } | null>(null);
  const hasScrolledInitialEpisodeRef = useRef<string | null>(null);
  const isStripUserScrollingRef = useRef(isStripUserScrolling);
  isStripUserScrollingRef.current = isStripUserScrolling;
  const stripScrollLeftRef = useRef(stripScrollLeft);
  stripScrollLeftRef.current = stripScrollLeft;
  const programmaticStripScrollRef = useRef(false);
  const lastProgrammaticStripScrollLeftRef = useRef<number | null>(null);

  const activeEpisode = useMemo(() => {
    if (visibleSeasonEpisodes.length === 0) return null;
    if (activeEpisodeId !== null && activeEpisodeId !== undefined) {
      const matched = visibleSeasonEpisodes.find(
        (ep) => String(ep.id) === String(activeEpisodeId)
      );
      if (matched) return matched;
    }
    return visibleSeasonEpisodes[0] ?? null;
  }, [visibleSeasonEpisodes, activeEpisodeId]);

  const activeEpisodeIndex = useMemo(() => {
    if (visibleSeasonEpisodes.length === 0 || !activeEpisode) return 0;
    const idx = visibleSeasonEpisodes.findIndex(
      (ep) => String(ep.id) === String(activeEpisode.id)
    );
    return idx >= 0 ? idx : 0;
  }, [visibleSeasonEpisodes, activeEpisode]);

  const episodeRangeGroups = useMemo(
    () =>
      buildEpisodeRangeGroups(
        visibleSeasonEpisodes.length,
        EPISODE_RANGE_SIZE,
        VIRTUAL_EPISODE_THRESHOLD
      ),
    [visibleSeasonEpisodes.length]
  );

  const hasPendingEpisodeJump =
    pendingEpisodeFocusRef.current?.scopeKey === seasonScopeKey;
  const liveFocusedId = getFocusedId();
  const focusInEpisodeArea =
    isFocusInEpisodeControls || isEpisodeControlId(liveFocusedId);
  const effectiveAnchorIndex =
    isStripUserScrolling || (!focusInEpisodeArea && stripScrollLeft > 0 && !hasPendingEpisodeJump)
      ? null
      : activeEpisodeIndex;

  const epWindow = useMemo(
    () =>
      computeVirtualHorizontalWindow({
        totalItems: visibleSeasonEpisodes.length,
        itemWidthPx: EPISODE_CARD_WIDTH_PX,
        itemSpacingPx: EPISODE_CARD_SPACING_PX,
        viewportWidthPx: stripViewportWidth,
        scrollLeftPx: stripScrollLeft,
        anchorIndex: effectiveAnchorIndex,
        overscanItems: 8,
        thresholdItems: VIRTUAL_EPISODE_THRESHOLD,
      }),
    [visibleSeasonEpisodes.length, stripViewportWidth, stripScrollLeft, effectiveAnchorIndex]
  );

  const isStripVirtualizedRef = useRef(epWindow.isVirtualized);
  isStripVirtualizedRef.current = epWindow.isVirtualized;

  const activeEpProgress = activeEpisode?.playback_progress ?? 0;
  const activeEpWatched = activeEpProgress >= 0.9;
  const activeEpResumable = activeEpProgress > 0 && activeEpProgress < 0.9;

  const episodeActionIds = useMemo(() => {
    if (!activeEpisode) return [] as string[];
    const ids: string[] = [];
    if (activeEpResumable) ids.push('episode-action-restart');
    ids.push('episode-action-watch-toggle');
    if (activeEpResumable) ids.push('episode-action-clear-progress');
    return ids;
  }, [activeEpisode, activeEpResumable]);

  const allSeasonWatched = useMemo(
    () =>
      visibleSeasonEpisodes.length > 0 &&
      visibleSeasonEpisodes.every((ep) => (ep.playback_progress ?? 0) >= 0.9),
    [visibleSeasonEpisodes]
  );

  const handleModalFocusChange = useCallback(
    (targetId: string) => {
      setFocusedId(targetId);
      const inEpisodeArea = isEpisodeControlId(targetId);
      setIsFocusInEpisodeControls((prev) => (prev === inEpisodeArea ? prev : inEpisodeArea));
    },
    [setFocusedId]
  );

  const focusTargetById = useCallback(
    (targetId: string) => {
      handleModalFocusChange(targetId);
      if (typeof document !== 'undefined') {
        const el =
          document.querySelector<HTMLElement>(`[data-focus-id="${targetId}"]`) ||
          document.getElementById(targetId);
        if (el && document.activeElement !== el) {
          try {
            el.focus({ preventScroll: true });
          } catch {
            el.focus();
          }
        }
      }
    },
    [handleModalFocusChange]
  );

  const applyProgrammaticStripScrollLeft = useCallback(
    (strip: HTMLElement, nextScrollLeft: number) => {
      programmaticStripScrollRef.current = true;
      lastProgrammaticStripScrollLeftRef.current = nextScrollLeft;
      strip.scrollLeft = nextScrollLeft;
      lastProgrammaticStripScrollLeftRef.current = strip.scrollLeft;
      programmaticStripScrollRef.current = false;
    },
    []
  );

  const scrollEpisodeIndexIntoView = useCallback(
    (idx: number) => {
      const strip = episodeStripRef.current;
      if (!strip) return;
      const viewportW = strip.clientWidth || DEFAULT_STRIP_VIEWPORT_WIDTH_PX;
      const targetLeft = idx * EPISODE_CARD_STRIDE_PX;
      const nextScrollLeft = Math.max(
        0,
        targetLeft - Math.max(0, Math.floor((viewportW - EPISODE_CARD_WIDTH_PX) / 2))
      );
      applyProgrammaticStripScrollLeft(strip, nextScrollLeft);
      if (isStripVirtualizedRef.current) {
        setStripScrollLeft((prev) => (prev === nextScrollLeft ? prev : nextScrollLeft));
      }
    },
    [applyProgrammaticStripScrollLeft]
  );

  const jumpToEpisodeIndex = useCallback(
    (targetIdx: number) => {
      if (visibleSeasonEpisodes.length === 0) return;
      const clampedIdx = Math.max(0, Math.min(visibleSeasonEpisodes.length - 1, targetIdx));
      const targetEp = visibleSeasonEpisodes[clampedIdx];
      if (!targetEp) return;
      const cardId = `episode-card-${targetEp.id}`;

      setIsStripUserScrolling(false);
      setIsFocusInEpisodeControls(true);
      setActiveEpisodeId(targetEp.id);
      scrollEpisodeIndexIntoView(clampedIdx);

      const mountedEl =
        typeof document !== 'undefined'
          ? document.querySelector<HTMLElement>(`[data-focus-id="${cardId}"]`) ||
            document.getElementById(cardId)
          : null;

      if (mountedEl) {
        pendingEpisodeFocusRef.current = null;
        focusTargetById(cardId);
      } else {
        pendingEpisodeFocusRef.current = { scopeKey: seasonScopeKey, cardId };
        setPendingEpisodeCommitTick((tick) => tick + 1);
      }
    },
    [visibleSeasonEpisodes, scrollEpisodeIndexIntoView, focusTargetById, seasonScopeKey]
  );

  useLayoutEffect(() => {
    if (!effectiveOpen) {
      pendingEpisodeFocusRef.current = null;
      hasScrolledInitialEpisodeRef.current = null;
      lastProgrammaticStripScrollLeftRef.current = null;
      return;
    }
    if (pendingEpisodeFocusRef.current && pendingEpisodeFocusRef.current.scopeKey !== seasonScopeKey) {
      pendingEpisodeFocusRef.current = null;
    }
    const strip = episodeStripRef.current;
    if (!strip) return;
    const measureViewport = () => {
      const nextWidth = strip.clientWidth || 0;
      setStripViewportWidth((prev) => (prev === nextWidth ? prev : nextWidth));
    };
    measureViewport();
    window.addEventListener('resize', measureViewport);
    return () => window.removeEventListener('resize', measureViewport);
  }, [effectiveOpen, seasonScopeKey, seasons.length]);

  useLayoutEffect(() => {
    if (!effectiveOpen) return;
    const strip = episodeStripRef.current;
    if (!strip) return;
    const scrollKey = `${seasonScopeKey}:${initialFocusedId ?? ''}`;
    if (hasScrolledInitialEpisodeRef.current === scrollKey) return;
    hasScrolledInitialEpisodeRef.current = scrollKey;
    if (epWindow.isVirtualized && activeEpisodeIndex > 0) {
      scrollEpisodeIndexIntoView(activeEpisodeIndex);
    } else {
      applyProgrammaticStripScrollLeft(strip, 0);
    }
  }, [
    effectiveOpen,
    seasonScopeKey,
    initialFocusedId,
    epWindow.isVirtualized,
    activeEpisodeIndex,
    scrollEpisodeIndexIntoView,
    applyProgrammaticStripScrollLeft,
  ]);

  useLayoutEffect(() => {
    const pending = pendingEpisodeFocusRef.current;
    if (!pending || !effectiveOpen) return;
    if (pending.scopeKey !== seasonScopeKey) {
      pendingEpisodeFocusRef.current = null;
      return;
    }
    const el =
      typeof document !== 'undefined'
        ? document.querySelector<HTMLElement>(`[data-focus-id="${pending.cardId}"]`) ||
          document.getElementById(pending.cardId)
        : null;
    if (!el) return;
    pendingEpisodeFocusRef.current = null;
    focusTargetById(pending.cardId);
  }, [
    effectiveOpen,
    seasonScopeKey,
    activeEpisodeId,
    stripScrollLeft,
    pendingEpisodeCommitTick,
    focusTargetById,
  ]);

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
        const extractPrefixedId = (prefix: string) =>
          current.startsWith(prefix)
            ? current
            : activeDomId.startsWith(prefix)
            ? activeDomId
            : '';

        const isDetailAction =
          current.startsWith('detail-') ||
          activeDomId.startsWith('detail-') ||
          current === 'item-detail-modal';
        const isSeasonTab =
          current.startsWith('season-tab-') || activeDomId.startsWith('season-tab-');
        const isSeasonWatchToggle =
          current === 'season-watch-toggle-btn' ||
          activeDomId === 'season-watch-toggle-btn';
        const isSeasonRow = isSeasonTab || isSeasonWatchToggle;
        const isEpisodeRangePill =
          current.startsWith('episode-range-pill-') ||
          activeDomId.startsWith('episode-range-pill-');
        const isEpisodeCard =
          current.startsWith('episode-card-') || activeDomId.startsWith('episode-card-');
        const isEpisodeAction =
          current.startsWith('episode-action-') || activeDomId.startsWith('episode-action-');

        const pendingCardId =
          pendingEpisodeFocusRef.current?.scopeKey === seasonScopeKey
            ? pendingEpisodeFocusRef.current.cardId
            : null;

        const resolveCurrentEpisodeIndex = () => {
          const cardId = pendingCardId || extractPrefixedId('episode-card-');
          if (cardId) {
            const epIdStr = cardId.slice('episode-card-'.length);
            const idx = visibleSeasonEpisodes.findIndex((ep) => String(ep.id) === epIdStr);
            if (idx >= 0) return idx;
          }
          return activeEpisodeIndex;
        };

        const activeRangeGroup =
          episodeRangeGroups.find(
            (g) => activeEpisodeIndex >= g.startIndex && activeEpisodeIndex <= g.endIndex
          ) ?? episodeRangeGroups[0];

        const isFastForward = code === TVKeys.FAST_FORWARD || e.key === 'MediaFastForward';
        const isRewind = code === TVKeys.REWIND || e.key === 'MediaRewind';

        if (
          !current &&
          isStripUserScrollingRef.current &&
          visibleSeasonEpisodes.length > 0 &&
          (isFastForward ||
            isRewind ||
            code === TVKeys.LEFT ||
            e.key === 'ArrowLeft' ||
            code === TVKeys.RIGHT ||
            e.key === 'ArrowRight')
        ) {
          e.preventDefault();
          e.stopImmediatePropagation();
          const currentLeft = episodeStripRef.current?.scrollLeft ?? stripScrollLeftRef.current;
          const firstVisibleIdx = Math.max(
            0,
            Math.min(
              visibleSeasonEpisodes.length - 1,
              Math.floor(currentLeft / EPISODE_CARD_STRIDE_PX)
            )
          );
          jumpToEpisodeIndex(firstVisibleIdx);
          return;
        }

        if (
          (isFastForward || isRewind) &&
          (isEpisodeCard || isEpisodeRangePill || Boolean(pendingCardId))
        ) {
          if (visibleSeasonEpisodes.length > 0) {
            e.preventDefault();
            e.stopImmediatePropagation();
            const baseIdx =
              isEpisodeRangePill && !pendingCardId
                ? activeEpisodeIndex
                : resolveCurrentEpisodeIndex();
            const delta = isFastForward ? EPISODE_FAST_SKIP_COUNT : -EPISODE_FAST_SKIP_COUNT;
            jumpToEpisodeIndex(baseIdx + delta);
          }
          return;
        }

        // Down Navigation
        if (code === TVKeys.DOWN || e.key === 'ArrowDown') {
          if (isDetailAction) {
            e.preventDefault();
            e.stopImmediatePropagation();
            focusTargetById(`season-tab-${selectedSeason}`);
          } else if (isSeasonRow) {
            if (episodeRangeGroups.length > 0 && activeRangeGroup) {
              e.preventDefault();
              e.stopImmediatePropagation();
              focusTargetById(`episode-range-pill-${activeRangeGroup.startIndex}`);
            } else if (visibleSeasonEpisodes.length > 0) {
              e.preventDefault();
              e.stopImmediatePropagation();
              focusTargetById(`episode-card-${visibleSeasonEpisodes[0].id}`);
            }
          } else if (isEpisodeRangePill) {
            if (visibleSeasonEpisodes.length > 0) {
              e.preventDefault();
              e.stopImmediatePropagation();
              jumpToEpisodeIndex(activeEpisodeIndex);
            }
          } else if (isEpisodeCard) {
            const epCardId = extractPrefixedId('episode-card-');
            const epIdStr = epCardId.replace('episode-card-', '');
            const targetEp =
              visibleSeasonEpisodes.find((ep) => String(ep.id) === epIdStr) ??
              activeEpisode ??
              visibleSeasonEpisodes[0];
            if (targetEp) {
              e.preventDefault();
              e.stopImmediatePropagation();
              if (String(activeEpisodeId) !== String(targetEp.id)) {
                setActiveEpisodeId(targetEp.id);
              }
              const targetProg = targetEp.playback_progress ?? 0;
              const targetResumable = targetProg > 0 && targetProg < 0.9;
              focusTargetById(
                targetResumable ? 'episode-action-restart' : 'episode-action-watch-toggle'
              );
            }
          } else if (isEpisodeAction) {
            e.preventDefault();
            e.stopImmediatePropagation();
          }
        }
        // Up Navigation
        else if (code === TVKeys.UP || e.key === 'ArrowUp') {
          if (isEpisodeAction) {
            if (visibleSeasonEpisodes.length > 0) {
              e.preventDefault();
              e.stopImmediatePropagation();
              jumpToEpisodeIndex(activeEpisodeIndex);
            }
          } else if (isEpisodeCard) {
            e.preventDefault();
            e.stopImmediatePropagation();
            if (episodeRangeGroups.length > 0) {
              const epIdx = resolveCurrentEpisodeIndex();
              const pillGroup =
                episodeRangeGroups.find(
                  (g) => epIdx >= g.startIndex && epIdx <= g.endIndex
                ) ?? activeRangeGroup;
              if (pillGroup) {
                focusTargetById(`episode-range-pill-${pillGroup.startIndex}`);
              }
            } else {
              focusTargetById(`season-tab-${selectedSeason}`);
            }
          } else if (isEpisodeRangePill) {
            e.preventDefault();
            e.stopImmediatePropagation();
            focusTargetById(`season-tab-${selectedSeason}`);
          } else if (isSeasonRow) {
            e.preventDefault();
            e.stopImmediatePropagation();
            focusTargetById(primaryBtnId);
          }
        }
        // Left Navigation on Season Tabs / Range Pills / Episode Cards / Episode Actions
        else if (code === TVKeys.LEFT || e.key === 'ArrowLeft') {
          if (isSeasonWatchToggle) {
            e.preventDefault();
            e.stopImmediatePropagation();
            if (seasons.length > 0) {
              focusTargetById(`season-tab-${seasons[seasons.length - 1]}`);
            }
          } else if (isSeasonTab) {
            const tabId = extractPrefixedId('season-tab-');
            if (tabId) {
              e.preventDefault();
              e.stopImmediatePropagation();
              const seasonNum = parseInt(tabId.replace('season-tab-', ''), 10);
              const currentIdx = seasons.indexOf(seasonNum);
              if (currentIdx > 0) {
                const prevSeason = seasons[currentIdx - 1];
                focusTargetById(`season-tab-${prevSeason}`);
              }
            }
          } else if (isEpisodeRangePill) {
            e.preventDefault();
            e.stopImmediatePropagation();
            const pillId = extractPrefixedId('episode-range-pill-');
            const pillIdx = episodeRangeGroups.findIndex(
              (g) => `episode-range-pill-${g.startIndex}` === pillId
            );
            if (pillIdx > 0) {
              focusTargetById(`episode-range-pill-${episodeRangeGroups[pillIdx - 1].startIndex}`);
            }
          } else if (isEpisodeCard) {
            e.preventDefault();
            e.stopImmediatePropagation();
            jumpToEpisodeIndex(resolveCurrentEpisodeIndex() - 1);
          } else if (isEpisodeAction) {
            e.preventDefault();
            e.stopImmediatePropagation();
            const actionId = extractPrefixedId('episode-action-');
            const currentIdx = episodeActionIds.indexOf(actionId);
            if (currentIdx > 0) {
              focusTargetById(episodeActionIds[currentIdx - 1]);
            }
          }
        }
        // Right Navigation on Season Tabs / Range Pills / Episode Cards / Episode Actions
        else if (code === TVKeys.RIGHT || e.key === 'ArrowRight') {
          if (isSeasonWatchToggle) {
            e.preventDefault();
            e.stopImmediatePropagation();
          } else if (isSeasonTab) {
            const tabId = extractPrefixedId('season-tab-');
            if (tabId) {
              e.preventDefault();
              e.stopImmediatePropagation();
              const seasonNum = parseInt(tabId.replace('season-tab-', ''), 10);
              const currentIdx = seasons.indexOf(seasonNum);
              if (currentIdx >= 0 && currentIdx < seasons.length - 1) {
                const nextSeason = seasons[currentIdx + 1];
                focusTargetById(`season-tab-${nextSeason}`);
              } else if (currentIdx === seasons.length - 1 && visibleSeasonEpisodes.length > 0) {
                focusTargetById('season-watch-toggle-btn');
              }
            }
          } else if (isEpisodeRangePill) {
            e.preventDefault();
            e.stopImmediatePropagation();
            const pillId = extractPrefixedId('episode-range-pill-');
            const pillIdx = episodeRangeGroups.findIndex(
              (g) => `episode-range-pill-${g.startIndex}` === pillId
            );
            if (pillIdx >= 0 && pillIdx < episodeRangeGroups.length - 1) {
              focusTargetById(`episode-range-pill-${episodeRangeGroups[pillIdx + 1].startIndex}`);
            }
          } else if (isEpisodeCard) {
            e.preventDefault();
            e.stopImmediatePropagation();
            jumpToEpisodeIndex(resolveCurrentEpisodeIndex() + 1);
          } else if (isEpisodeAction) {
            e.preventDefault();
            e.stopImmediatePropagation();
            const actionId = extractPrefixedId('episode-action-');
            const currentIdx = episodeActionIds.indexOf(actionId);
            if (currentIdx >= 0 && currentIdx < episodeActionIds.length - 1) {
              focusTargetById(episodeActionIds[currentIdx + 1]);
            }
          }
        }
        // Enter Navigation on Season Tabs & Range Pills
        else if (code === TVKeys.ENTER || e.key === 'Enter') {
          const tabId = extractPrefixedId('season-tab-');
          if (tabId) {
            e.preventDefault();
            e.stopImmediatePropagation();
            const seasonNum = parseInt(tabId.replace('season-tab-', ''), 10);
            if (!isNaN(seasonNum) && seasonNum !== selectedSeason) {
              setSelectedSeason(seasonNum);
            }
            return;
          }
          const pillId = extractPrefixedId('episode-range-pill-');
          if (pillId) {
            e.preventDefault();
            e.stopImmediatePropagation();
            const targetGroup = episodeRangeGroups.find(
              (g) => `episode-range-pill-${g.startIndex}` === pillId
            );
            if (targetGroup) {
              jumpToEpisodeIndex(targetGroup.startIndex);
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
    seasonScopeKey,
    visibleSeasonEpisodes,
    activeEpisode,
    activeEpisodeId,
    activeEpisodeIndex,
    episodeRangeGroups,
    episodeActionIds,
    getFocusedId,
    getActiveTrap,
    focusTargetById,
    jumpToEpisodeIndex,
    primaryBtnId,
  ]);

  const handleEpisodeStripScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (!isStripVirtualizedRef.current) return;
    const nextLeft = e.currentTarget.scrollLeft;
    const nextWidth = e.currentTarget.clientWidth;
    const expectedLeft = lastProgrammaticStripScrollLeftRef.current;
    const isProgrammatic =
      programmaticStripScrollRef.current ||
      (expectedLeft !== null && Math.abs(nextLeft - expectedLeft) <= 4);

    if (isProgrammatic) {
      if (!programmaticStripScrollRef.current) {
        lastProgrammaticStripScrollLeftRef.current = null;
      }
    } else {
      lastProgrammaticStripScrollLeftRef.current = null;
      setIsStripUserScrolling((prev) => (prev ? prev : true));
    }

    setStripScrollLeft((prev) => (prev === nextLeft ? prev : nextLeft));
    setStripViewportWidth((prev) => (prev === nextWidth ? prev : nextWidth));
  }, []);

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
      setIsStripUserScrolling(false);
      setIsFocusInEpisodeControls(true);
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
      handleModalFocusChange(tabId);
    },
    [handleModalFocusChange]
  );

  const handleFocusEpisodeCard = useCallback(
    (epId: number | string, cardFocusId?: string) => {
      if (isStripUserScrollingRef.current && (!cardFocusId || getFocusedId() === cardFocusId)) {
        if (episodeStripRef.current) {
          lastProgrammaticStripScrollLeftRef.current = episodeStripRef.current.scrollLeft;
        }
        return;
      }
      if (cardFocusId && getFocusedId() !== cardFocusId) {
        setIsStripUserScrolling(false);
      }
      setIsFocusInEpisodeControls(true);
      setActiveEpisodeId((prev) => (String(prev) === String(epId) ? prev : epId));
      if (cardFocusId && getFocusedId() !== cardFocusId) {
        setFocusedId(cardFocusId);
      }
      if (episodeStripRef.current && !isStripUserScrollingRef.current) {
        lastProgrammaticStripScrollLeftRef.current = episodeStripRef.current.scrollLeft;
      }
    },
    [getFocusedId, setFocusedId]
  );

  const handleSetWatchState = useCallback(
    (targetIds: Array<number | string>, watched: boolean) => {
      const base = effectiveItem;
      if (!base || targetIds.length === 0) return;
      const idSet = new Set(targetIds.map(String));
      const snapshot = base;
      const targetItemKey = String(base.id ?? base.card?.id ?? '');

      setLocalItem((prev) => {
        const current = prev ?? base;
        return applyWatchStateMutation(current, idSet, watched);
      });

      const persistPromise = onWatchStateChange
        ? Promise.resolve(onWatchStateChange(targetIds, watched))
        : targetIds.length === 1
        ? setItemWatchState(fallbackClient, targetIds[0], watched)
        : setBatchWatchState(fallbackClient, targetIds, watched).then(() => undefined);

      persistPromise.catch((err) => {
        console.warn('[ItemDetailModal] Failed to update watch state:', err);
        if (!isMountedRef.current) return;
        setLocalItem((prev) => {
          const prevKey = String(prev?.id ?? prev?.card?.id ?? '');
          if (prevKey !== targetItemKey) return prev;
          return snapshot;
        });
        if (!onWatchStateChange) {
          const errMsg = err instanceof Error ? err.message : String(err ?? '');
          const is403 =
            (err as { status?: number })?.status === 403 ||
            errMsg.includes('403') ||
            errMsg.includes('LIBRARY_LOCKED');
          if (is403 && resolvedLibraryId) {
            onLockedLibrary?.(resolvedLibraryId);
          }
        }
      });
    },
    [effectiveItem, onWatchStateChange, fallbackClient, resolvedLibraryId, onLockedLibrary]
  );

  const handleToggleMovieWatchState = useCallback(() => {
    if (resolvedId === undefined || resolvedId === null) return;
    focusTargetById('detail-watch-toggle-btn');
    handleSetWatchState([resolvedId], !isItemCompleted);
  }, [resolvedId, isItemCompleted, focusTargetById, handleSetWatchState]);

  const handleClearMovieProgress = useCallback(() => {
    if (resolvedId === undefined || resolvedId === null) return;
    focusTargetById('detail-watch-toggle-btn');
    handleSetWatchState([resolvedId], false);
  }, [resolvedId, focusTargetById, handleSetWatchState]);

  const handleToggleSeasonWatchState = useCallback(() => {
    if (visibleSeasonEpisodes.length === 0) return;
    const targetIds = visibleSeasonEpisodes.map((ep) => ep.id);
    focusTargetById('season-watch-toggle-btn');
    handleSetWatchState(targetIds, !allSeasonWatched);
  }, [visibleSeasonEpisodes, allSeasonWatched, focusTargetById, handleSetWatchState]);

  const handlePlayEpisodeFromStart = useCallback(
    (ep: EpisodeCard) => {
      notifyViewState(`episode-card-${ep.id}`);
      const playlistIdx = episodePlaylist.findIndex((p) => String(p.id) === String(ep.id));
      onPlay(
        ep.id,
        0,
        ep.title,
        undefined,
        episodePlaylist.length > 0 ? episodePlaylist : undefined,
        playlistIdx >= 0 ? playlistIdx : undefined
      );
    },
    [episodePlaylist, notifyViewState, onPlay]
  );

  if (!effectiveOpen || !effectiveItem) return null;

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

  const hasShowRestartBtn = Boolean(isShow && nextEpisode && isEpisodeResume);
  const hasMovieRestartBtn = Boolean(!isShow && resolvedResumeMs && resolvedResumeMs > 0);
  const hasRestartBtn = hasShowRestartBtn || hasMovieRestartBtn;
  const hasWatchToggleBtn = Boolean(!isShow && !isLiveChannel && canAddToPlaylist);
  const hasClearProgressBtn = Boolean(
    hasWatchToggleBtn && resolvedResumeMs && resolvedResumeMs > 0
  );
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
  const watchToggleOrder = hasWatchToggleBtn ? nextActionOrder++ : undefined;
  const clearProgressOrder = hasClearProgressBtn ? nextActionOrder++ : undefined;
  const browseFolderOrder = hasBrowseFolderBtn ? nextActionOrder++ : undefined;
  const addPlaylistOrder = canAddToPlaylist ? nextActionOrder++ : undefined;
  const closeActionOrder = nextActionOrder++;

  const backdrop = formatImageUrl(resolvedBackdropUrl);
  const poster = formatImageUrl(resolvedPosterUrl);

  const durationMins = resolvedDurationMs ? Math.round(resolvedDurationMs / 60000) : null;
  const resumeMins = resolvedResumeMs ? Math.round(resolvedResumeMs / 60000) : null;

  const videoCodecChip = effectiveItem.technical?.video_codec
    ? effectiveItem.technical.video_codec.toUpperCase()
    : null;
  const audioCodecChip = effectiveItem.technical?.audio_codec
    ? `${
        effectiveItem.technical.audio_channels === 6
          ? '5.1 '
          : effectiveItem.technical.audio_channels === 8
          ? '7.1 '
          : effectiveItem.technical.audio_channels
          ? `${effectiveItem.technical.audio_channels}ch `
          : ''
      }${effectiveItem.technical.audio_codec.toUpperCase()}`
    : null;
  const containerChip = effectiveItem.technical?.container
    ? effectiveItem.technical.container.toUpperCase()
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
                  {effectiveItem.genres && effectiveItem.genres.length > 0 && (
                    <span className="text-[#ffb871] font-medium">
                      {resolvedReleaseYear || (!isLiveChannel && durationMins) || isShow ? '• ' : ''}
                      <span>{effectiveItem.genres.join(', ')}</span>
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
                    <>
                      <PrimaryDetailActionButton
                        id="detail-resume-btn"
                        order={primaryActionOrder}
                        eyebrow="Resume Next"
                        label={`S${String(nextEpisode.season ?? 1).padStart(2, '0')}E${String(
                          nextEpisode.episode ?? 1
                        ).padStart(2, '0')} • "${nextEpisode.title}"`}
                        onActivate={handlePlayShowResume}
                        onFocusAction={handleModalFocusChange}
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
                        onActivate={handlePlayShowStart}
                        onFocusAction={handleModalFocusChange}
                      />
                    </>
                  ) : (
                    <PrimaryDetailActionButton
                      id="detail-play-btn"
                      order={primaryActionOrder}
                      eyebrow={`Direct Stream • S${String(nextEpisode.season ?? 1).padStart(
                        2,
                        '0'
                      )}E${String(nextEpisode.episode ?? 1).padStart(2, '0')}`}
                      eyebrowAriaHidden
                      label="Play"
                      onActivate={handlePlayShowStart}
                      onFocusAction={handleModalFocusChange}
                      autoFocus
                    />
                  )
                ) : resolvedResumeMs && resolvedResumeMs > 0 ? (
                  <>
                    <PrimaryDetailActionButton
                      id="detail-resume-btn"
                      order={primaryActionOrder}
                      eyebrow="Continue Watching"
                      eyebrowAriaHidden
                      label={`Resume (${resumeMins}m)`}
                      onActivate={handlePlayMovieResume}
                      onFocusAction={handleModalFocusChange}
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
                      onFocusAction={handleModalFocusChange}
                    />
                  </>
                ) : (
                  <PrimaryDetailActionButton
                    id="detail-play-btn"
                    order={primaryActionOrder}
                    eyebrow="Direct Stream"
                    eyebrowAriaHidden
                    label="Play"
                    onActivate={handlePlayMovieStart}
                    onFocusAction={handleModalFocusChange}
                    autoFocus
                  />
                )}

                {hasWatchToggleBtn && (
                  <SecondaryDetailActionButton
                    id="detail-watch-toggle-btn"
                    order={watchToggleOrder}
                    icon={
                      isItemCompleted ? (
                        <RotateCcw
                          className="w-5 h-5 mr-2.5 text-[#ffb871] shrink-0"
                          style={{ marginRight: '10px' }}
                        />
                      ) : (
                        <CheckCircle2
                          className="w-5 h-5 mr-2.5 text-[#ffb871] shrink-0"
                          style={{ marginRight: '10px' }}
                        />
                      )
                    }
                    label={isItemCompleted ? 'Mark Unwatched' : 'Mark Watched'}
                    onActivate={handleToggleMovieWatchState}
                    onFocusAction={handleModalFocusChange}
                  />
                )}

                {hasClearProgressBtn && (
                  <SecondaryDetailActionButton
                    id="detail-clear-progress-btn"
                    order={clearProgressOrder}
                    icon={
                      <X
                        className="w-5 h-5 mr-2.5 text-[#ffb871] shrink-0"
                        style={{ marginRight: '10px' }}
                      />
                    }
                    label="Mark Unwatched"
                    onActivate={handleClearMovieProgress}
                    onFocusAction={handleModalFocusChange}
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
                    onFocusAction={handleModalFocusChange}
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
                    onFocusAction={handleModalFocusChange}
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
                  onFocusAction={handleModalFocusChange}
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
            <div className="flex items-center flex-1 min-w-0 mr-4">
              <h2 className="text-3xl font-bold text-[#e3e1e9] tracking-tight mr-6 shrink-0">
                Episodes
              </h2>
              <div className="flex items-center min-w-0 overflow-x-auto scrollbar-none">
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
            {visibleSeasonEpisodes.length > 0 ? (
              <SeasonWatchToggleButton
                order={seasons.length + 1}
                selectedSeason={selectedSeason}
                allSeasonWatched={allSeasonWatched}
                onActivate={handleToggleSeasonWatchState}
                onFocusButton={handleModalFocusChange}
              />
            ) : (
              <div className="flex items-center text-[#a8a29e] font-mono text-xs tracking-wider uppercase">
                <span>ALL EPISODES DIRECT STREAM READY</span>
              </div>
            )}
          </div>

          {/* Episode Range Jump Pills (for large seasons > 30 episodes) */}
          {episodeRangeGroups.length > 0 && (
            <div
              data-testid="episode-range-pills"
              className="flex items-center overflow-x-auto pb-2 mb-1 scrollbar-none"
            >
              {episodeRangeGroups.map((group, idx) => (
                <EpisodeRangePill
                  key={group.startIndex}
                  group={group}
                  order={idx + 1}
                  isActiveRange={
                    activeEpisodeIndex >= group.startIndex &&
                    activeEpisodeIndex <= group.endIndex
                  }
                  onActivate={jumpToEpisodeIndex}
                  onFocusPill={handleModalFocusChange}
                />
              ))}
            </div>
          )}

          {/* Horizontal Episode Carousel Cards (16:9 Landscape Aspect) */}
          <div
            ref={episodeStripRef}
            onScroll={handleEpisodeStripScroll}
            onWheel={() => {
              lastProgrammaticStripScrollLeftRef.current = null;
            }}
            onClickCapture={(e) => {
              const cardEl = (e.target as HTMLElement | null)?.closest?.('[id^="episode-card-"]');
              if (cardEl) {
                setIsStripUserScrolling(false);
                setIsFocusInEpisodeControls(true);
              }
            }}
            className="flex overflow-x-auto pb-3 pt-2 scrollbar-none"
          >
            {epWindow.isVirtualized && epWindow.leftSpacerPx > 0 && (
              <div
                data-testid="episode-strip-left-spacer"
                aria-hidden="true"
                style={{ width: `${epWindow.leftSpacerPx}px`, flexShrink: 0 }}
              />
            )}
            {visibleSeasonEpisodes
              .slice(epWindow.startIndex, epWindow.endIndex)
              .map((ep, offset) => {
                const epIndex = epWindow.startIndex + offset;
                return (
                  <EpisodeLandscapeCard
                    key={ep.id}
                    episode={ep}
                    index={epIndex}
                    selectedSeason={selectedSeason}
                    imageUrl={formatImageUrl(ep.poster_url) || backdrop || poster}
                    isNextUp={Boolean(nextEpisode && String(nextEpisode.id) === String(ep.id))}
                    isVirtualized={epWindow.isVirtualized}
                    isLastEpisode={epIndex === visibleSeasonEpisodes.length - 1}
                    onSelectEpisode={handleSelectEpisode}
                    onFocusEpisode={handleFocusEpisodeCard}
                  />
                );
              })}
            {epWindow.isVirtualized && epWindow.rightSpacerPx > 0 && (
              <div
                data-testid="episode-strip-right-spacer"
                aria-hidden="true"
                style={{ width: `${epWindow.rightSpacerPx}px`, flexShrink: 0 }}
              />
            )}
          </div>

          {/* Active-Episode Inline Action Strip */}
          {activeEpisode && (
            <div
              id="episode-action-strip"
              data-testid="episode-action-strip"
              className="flex items-center justify-between pt-2 pb-1 px-1"
            >
              <span className="text-sm font-mono text-[#ffb871] font-semibold mr-4 truncate">
                {`S${String(activeEpisode.season ?? 1).padStart(2, '0')}E${String(
                  activeEpisode.episode ?? 1
                ).padStart(2, '0')} • "${activeEpisode.title}"`}
              </span>
              <div className="flex items-center shrink-0">
                {activeEpResumable && (
                  <EpisodeActionPill
                    id="episode-action-restart"
                    order={101}
                    icon={<RotateCcw className="w-4 h-4 mr-2 text-[#ffb871] shrink-0" />}
                    label="Play from Beginning"
                    onActivate={() => handlePlayEpisodeFromStart(activeEpisode)}
                    onFocusPill={handleModalFocusChange}
                  />
                )}
                <EpisodeActionPill
                  id="episode-action-watch-toggle"
                  order={102}
                  icon={
                    activeEpWatched ? (
                      <RotateCcw className="w-4 h-4 mr-2 text-[#ffb871] shrink-0" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 mr-2 text-[#ffb871] shrink-0" />
                    )
                  }
                  label={activeEpWatched ? 'Mark Unwatched' : 'Mark Watched'}
                  onActivate={() => {
                    focusTargetById('episode-action-watch-toggle');
                    handleSetWatchState([activeEpisode.id], !activeEpWatched);
                  }}
                  onFocusPill={handleModalFocusChange}
                />
                {activeEpResumable && (
                  <EpisodeActionPill
                    id="episode-action-clear-progress"
                    order={103}
                    icon={<X className="w-4 h-4 mr-2 text-[#ffb871] shrink-0" />}
                    label="Mark Unwatched"
                    onActivate={() => {
                      focusTargetById('episode-action-watch-toggle');
                      handleSetWatchState([activeEpisode.id], false);
                    }}
                    onFocusPill={handleModalFocusChange}
                  />
                )}
              </div>
            </div>
          )}
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
            {seasons.length > 0 && (
              <span className="mr-8">
                <strong className="text-white bg-[#292a2f] border border-[rgba(255,122,24,0.18)] px-2 py-0.5 rounded font-mono font-bold mr-1.5">
                  [▼]
                </strong>
                Episode Options
              </span>
            )}
            {seasons.length > 1 && (
              <span className="mr-8">
                <strong className="text-white bg-[#292a2f] border border-[rgba(255,122,24,0.18)] px-2 py-0.5 rounded font-mono font-bold mr-1.5">
                  [CH ▲/▼]
                </strong>
                Switch Seasons
              </span>
            )}
            {episodeRangeGroups.length > 0 && (
              <span className="mr-8">
                <strong className="text-white bg-[#292a2f] border border-[rgba(255,122,24,0.18)] px-2 py-0.5 rounded font-mono font-bold mr-1.5">
                  [FF/REW]
                </strong>
                ±10 Eps
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
