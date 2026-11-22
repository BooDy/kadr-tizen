import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import type { ReactNode } from 'react';
import { ScreenLayout, ScreenSummary } from '../types/ast';
import { ApiClient } from '../api/client';
import { fetchScreens, fetchScreenLayout } from '../api/screens';
import { fetchLibraries, LibrarySummary } from '../api/libraries';
import { WidgetRenderer } from '../components/widgets/WidgetRenderer';
import { TVButton } from '../components/tv/TVButton';
import { SidebarCard } from '../components/tv/SidebarCard';
import { PlaylistsView } from './PlaylistsView';
import {
  SearchView,
  getFirstSearchFocusableId,
  isSearchContentNodeId,
  isSearchLeftmostNodeId,
} from './SearchView';
import { PlaylistDetailModal, PlaylistQueuePlayItem } from './PlaylistDetailModal';
import { MediaItemDetail } from '../api/items';
import { PlaylistItem } from './PlayerScreen';
import {
  Users,
  Lock,
  Unlock,
  KeyRound,
  AlertTriangle,
  RotateCcw,
  Server,
  Folder,
  ListVideo,
  Search,
} from 'lucide-react';
import { useFocusContext } from '../navigation/FocusContext';
import { isTextInputElement } from '../navigation/useFocusable';
import { TVKeys } from '../navigation/keys';

export interface BrowseScreenProps {
  client: ApiClient;
  serverUrl: string;
  token?: string;
  currentUserId?: string;
  onSelectItem: (itemId: number | string) => void;
  onPlayItem: (
    itemId: number | string,
    resumeMs?: number,
    title?: string,
    technical?: MediaItemDetail['technical'],
    playlist?: PlaylistItem[],
    currentIndex?: number,
    mediaType?: string
  ) => void;
  onSwitchProfile: () => void;
  onSwitchServer?: () => void;
  onRequestExit?: () => void;
  onLockedLibrary?: (libraryId: string) => void;
  onBrowseFolder?: (libraryId: string, folderPath?: string) => void;
  onOpenPlaylist?: (playlistId: string) => void;
  onTabChange?: (tab: string) => void;
  initialTab?: string;
  initialFocusId?: string | null;
  onContentFocusChange?: (id: string | null) => void;
  refreshKey?: number;
  playlistRefreshKey?: number;
  libraries?: LibrarySummary[];
}

const defaultScreens: ScreenSummary[] = [
  { id: 'home', title: 'Home' },
  { id: 'movies', title: 'Movies' },
  { id: 'shows', title: 'Shows' },
];

type ScreenKind = 'home' | 'movie' | 'series' | 'other';

function getScreenKind(screenId: string, mediaType?: string): ScreenKind {
  if (screenId === 'home') return 'home';
  const type = (mediaType || screenId).toLowerCase();
  if (type === 'movie' || type === 'movies') return 'movie';
  if (
    type === 'show' ||
    type === 'shows' ||
    type === 'series' ||
    type === 'episode' ||
    type === 'tv'
  ) {
    return 'series';
  }
  return 'other';
}

function getScreenSubtitle(kind: ScreenKind, isPrivate: boolean, isUnlocked: boolean): string {
  if (isPrivate) return isUnlocked ? 'Private \u2022 Unlocked' : 'Private \u2022 PIN required';
  switch (kind) {
    case 'home':
      return 'Featured & continue watching';
    case 'movie':
      return 'Movie library';
    case 'series':
      return 'Series library';
    default:
      return 'Media library';
  }
}

function getScreenPath(screenId: string, title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `/${slug || screenId}`;
}

function getFirstFocusableId(layout: ScreenLayout): string | null {
  for (const widget of layout.widgets) {
    if (widget.type === 'hero_banner' && widget.data) {
      return `hero-play-${widget.id}`;
    }
    if (widget.type === 'carousel' && widget.items && widget.items.length > 0) {
      return `card-${widget.id}-${widget.items[0].id}`;
    }
    if (widget.type === 'grid' && widget.items && widget.items.length > 0) {
      return `grid-${widget.id}-${widget.items[0].id}`;
    }
  }
  return null;
}

function getFirstPlaylistsFocusableId(): string | null {
  if (typeof document !== 'undefined') {
    const firstCard = document.querySelector<HTMLElement>('[data-playlist-focus-first="true"]');
    if (firstCard?.id) return firstCard.id;
    const createBtn = document.getElementById('playlists-create-btn');
    if (createBtn) return 'playlists-create-btn';
  }
  return 'playlists-create-btn';
}

function isLeftmostContentNode(
  id: string | null,
  layout: ScreenLayout | null,
  activeTab?: string
): boolean {
  if (!id) return false;
  if (
    id === 'unlock-library-btn' ||
    id === 'retry-layout-btn' ||
    id === 'library-browse-folders-btn'
  ) {
    return true;
  }
  if (activeTab === 'search') {
    return isSearchLeftmostNodeId(id);
  }
  if (activeTab === 'playlists') {
    if (id === 'playlists-create-btn') return true;
    if (id.startsWith('playlist-card-')) {
      if (typeof document !== 'undefined') {
        const el = document.getElementById(id);
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 || rect.left > 0) {
            return rect.left < 400;
          }
          return el.getAttribute('data-playlist-col') === '0';
        }
      }
      return true;
    }
    return false;
  }
  if (!layout) return false;
  for (const widget of layout.widgets) {
    if (widget.type === 'hero_banner') {
      if (id === `hero-play-${widget.id}`) return true;
    } else if (widget.type === 'carousel') {
      if (
        widget.items &&
        widget.items.length > 0 &&
        id === `card-${widget.id}-${widget.items[0].id}`
      ) {
        return true;
      }
    } else if (widget.type === 'grid') {
      const idx = widget.items?.findIndex((item) => `grid-${widget.id}-${item.id}` === id) ?? -1;
      if (idx !== -1) {
        if (typeof document !== 'undefined') {
          const el = document.getElementById(id);
          if (el) {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 || rect.left > 0) {
              return rect.left < 400;
            }
          }
        }
        const cols = widget.columns || 6;
        return idx % cols === 0;
      }
    }
  }
  return false;
}

function isValidContentNode(
  id: string | null,
  layout: ScreenLayout | null,
  activeTab?: string
): boolean {
  if (!id) return false;
  if (
    id === 'unlock-library-btn' ||
    id === 'retry-layout-btn' ||
    id === 'switch-profile-btn' ||
    id === 'change-server-btn' ||
    id === 'library-browse-folders-btn'
  ) {
    return true;
  }
  if (activeTab === 'search') {
    return Boolean(
      isSearchContentNodeId(id) &&
        (typeof document === 'undefined' || document.getElementById(id))
    );
  }
  if (activeTab === 'playlists') {
    if (id === 'playlists-create-btn' || id.startsWith('playlist-card-')) {
      if (typeof document !== 'undefined') {
        return Boolean(document.getElementById(id));
      }
      return true;
    }
    return false;
  }
  if (!layout) return false;
  for (const widget of layout.widgets) {
    if (widget.type === 'hero_banner' && widget.data) {
      if (id === `hero-play-${widget.id}` || id === `hero-details-${widget.id}`) return true;
    } else if (widget.type === 'carousel') {
      if (widget.items?.some((item) => `card-${widget.id}-${item.id}` === id)) return true;
    } else if (widget.type === 'grid') {
      if (widget.items?.some((item) => `grid-${widget.id}-${item.id}` === id)) return true;
    }
  }
  return false;
}

function isModalActive(activeTrap?: string | null): boolean {
  if (activeTrap) return true;
  if (typeof document !== 'undefined') {
    return Boolean(
      document.querySelector(
        '[aria-modal="true"], [role="dialog"], [role="alertdialog"], [data-modal-overlay="true"], .fixed.z-50'
      )
    );
  }
  return false;
}

function scrollSidebarItemIntoViewIfClipped(el: HTMLElement | null) {
  if (!el || typeof el.scrollIntoView !== 'function') return;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return;

  const container = el.closest('[data-testid="sidebar-items-container"]') as HTMLElement | null;
  if (container) {
    const cRect = container.getBoundingClientRect();
    if (cRect.height > 0) {
      if (rect.top >= cRect.top && rect.bottom <= cRect.bottom) {
        return;
      }
      el.scrollIntoView({ block: 'nearest' });
      return;
    }
  }

  const vh = typeof window !== 'undefined' ? window.innerHeight || 1080 : 1080;
  if (rect.top >= 0 && rect.bottom <= vh) return;
  el.scrollIntoView({ block: 'nearest' });
}

interface SidebarScreenItemView {
  id: string;
  title: string;
  subtitle: string;
  chip: string;
  isPrivate: boolean;
  isUnlocked: boolean;
  isLocked: boolean;
}

interface BrowseSidebarProps {
  isSidebarFocused: boolean;
  sidebarFocusedId: string | null;
  activeTab: string;
  serverHost: string;
  libraryCount: number;
  screenItems: SidebarScreenItemView[];
  onSelectScreen: (screenId: string) => void;
  onSwitchProfile: () => void;
}

const BrowseSidebar = memo(function BrowseSidebar({
  isSidebarFocused,
  sidebarFocusedId,
  activeTab,
  serverHost,
  libraryCount,
  screenItems,
  onSelectScreen,
  onSwitchProfile,
}: BrowseSidebarProps) {
  return (
    <nav
      data-testid="tv-sidebar"
      className={`${
        isSidebarFocused ? 'w-96' : 'w-28'
      } hover:w-96 focus-within:w-96 bg-[#0d0e15] border-r border-[rgba(255,255,255,0.05)] flex flex-col justify-between z-40 group relative overflow-hidden shrink-0`}
      style={{
        padding: isSidebarFocused ? '32px' : '16px',
        background: '#0d0e15',
      }}
    >
      {/* Top: brand header */}
      <div
        className="relative z-10 shrink-0"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: isSidebarFocused ? 'space-between' : 'center',
          paddingBottom: '20px',
          marginBottom: '20px',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
          <img
            src="./kadr-logo.png"
            alt="Kadr"
            decoding="async"
            className="h-14 w-auto object-contain"
            style={{ height: '56px', width: 'auto', maxHeight: '56px' }}
            height="56"
          />
          <div
            data-testid="sidebar-brand-text"
            style={{
              display: isSidebarFocused ? 'block' : 'none',
              marginLeft: '14px',
              minWidth: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline' }}>
              <span
                className="font-extrabold tracking-wider"
                style={{
                  fontSize: '30px',
                  lineHeight: '34px',
                  background: 'linear-gradient(to right, #fb923c, #ff7a18, #fcd34d)',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  color: 'transparent',
                }}
              >
                KADR
              </span>
              <span
                className="uppercase font-semibold"
                style={{
                  marginLeft: '8px',
                  fontSize: '12px',
                  color: '#71717a',
                  letterSpacing: '0.1em',
                }}
              >
                كادر
              </span>
            </div>
            <div
              className="font-mono"
              style={{
                display: 'flex',
                alignItems: 'center',
                marginTop: '4px',
                fontSize: '12px',
                color: '#a1a1aa',
                maxWidth: '170px',
              }}
            >
              <span
                style={{
                  flexShrink: 0,
                  width: '8px',
                  height: '8px',
                  marginRight: '6px',
                  borderRadius: '9999px',
                  background: '#10b981',
                }}
              />
              <span className="truncate" data-testid="sidebar-server-host">
                {serverHost}
              </span>
            </div>
          </div>
        </div>
        <span
          data-testid="sidebar-library-count"
          className="font-mono uppercase shrink-0"
          style={{
            display: isSidebarFocused ? 'inline-block' : 'none',
            fontSize: '11px',
            letterSpacing: '0.05em',
            padding: '4px 10px',
            borderRadius: '4px',
            background: 'rgba(255,255,255,0.05)',
            color: '#a1a1aa',
            border: '1px solid rgba(255,255,255,0.10)',
          }}
        >
          {libraryCount} {libraryCount === 1 ? 'Library' : 'Libraries'}
        </span>
      </div>

      {/* Section header */}
      <div
        className="relative z-10 shrink-0 font-mono"
        style={{
          display: isSidebarFocused ? 'flex' : 'none',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '14px',
        }}
      >
        <span
          className="uppercase font-bold"
          style={{ fontSize: '11px', letterSpacing: '0.1em', color: '#71717a' }}
        >
          Libraries &amp; Catalogs
        </span>
        <span style={{ fontSize: '10px', color: '#52525b' }}>[D-PAD ▲/▼]</span>
      </div>

      <div
        data-testid="sidebar-items-container"
        className="relative z-10 flex-1 min-h-0 overflow-y-auto scrollbar-none flex flex-col"
        style={{ padding: isSidebarFocused ? '4px 12px' : '4px' }}
      >
        {screenItems.map((screenItem, index) => {
          let tile: ReactNode = screenItem.title.charAt(0).toUpperCase();
          if (screenItem.isPrivate) {
            tile = screenItem.isUnlocked ? (
              <Unlock className="w-6 h-6" style={{ color: '#ff9f2e' }} />
            ) : (
              <Lock className="w-6 h-6" style={{ color: '#fbbf24' }} />
            );
          }
          return (
            <SidebarCard
              key={screenItem.id}
              id={`nav-screen-${screenItem.id}`}
              order={index + 1}
              selected={activeTab === screenItem.id}
              focused={sidebarFocusedId === `nav-screen-${screenItem.id}`}
              expanded={isSidebarFocused}
              title={screenItem.title}
              subtitle={screenItem.subtitle}
              chip={screenItem.chip}
              tile={tile}
              badge={screenItem.isLocked ? 'PIN LOCKED' : undefined}
              dashed={screenItem.isPrivate}
              onSelect={() => onSelectScreen(screenItem.id)}
            />
          );
        })}
        <SidebarCard
          id="nav-screen-search"
          order={screenItems.length + 1}
          selected={activeTab === 'search'}
          focused={sidebarFocusedId === 'nav-screen-search'}
          expanded={isSidebarFocused}
          title="Search"
          subtitle="Movies, shows & episodes"
          chip="/search"
          tile={<Search className="w-6 h-6" />}
          onSelect={() => onSelectScreen('search')}
        />
        <SidebarCard
          id="nav-screen-playlists"
          order={screenItems.length + 2}
          selected={activeTab === 'playlists'}
          focused={sidebarFocusedId === 'nav-screen-playlists'}
          expanded={isSidebarFocused}
          title="Playlists"
          subtitle="Saved queues & shared lists"
          chip="/playlists"
          tile={<ListVideo className="w-6 h-6" />}
          onSelect={() => onSelectScreen('playlists')}
        />
      </div>

      {/* Bottom: profile switcher & remote hints */}
      <div
        className="relative z-10 shrink-0"
        style={{ paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.05)' }}
      >
        <SidebarCard
          id="nav-switch-profile"
          order={screenItems.length + 3}
          selected={false}
          focused={sidebarFocusedId === 'nav-switch-profile'}
          expanded={isSidebarFocused}
          title="Profiles"
          subtitle="Switch who's watching"
          chip="/profiles"
          tile={<Users className="w-6 h-6" />}
          onSelect={onSwitchProfile}
        />
        <div
          data-testid="sidebar-remote-hints"
          className="font-mono"
          style={{
            display: isSidebarFocused ? 'flex' : 'none',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: '4px',
            padding: '0 4px',
            fontSize: '11px',
            color: '#a1a1aa',
          }}
        >
          {[
            ['[▲▼]', 'Browse'],
            ['[▶]', 'Content'],
            ['[OK]', 'Select'],
          ].map(([key, label]) => (
            <span key={key} style={{ display: 'flex', alignItems: 'center' }}>
              <strong
                style={{
                  color: '#e4e4e7',
                  background: 'rgba(255,255,255,0.10)',
                  padding: '0 4px',
                  borderRadius: '4px',
                  marginRight: '6px',
                }}
              >
                {key}
              </strong>
              {label}
            </span>
          ))}
        </div>
      </div>
    </nav>
  );
});

interface BrowseMainContentProps {
  activeTab: string;
  loading: boolean;
  isCurrentScreenLocked: boolean;
  lockedLibraryId: string;
  layout: ScreenLayout | null;
  layoutError: string | null;
  targetLibId: string | null;
  libraryHeading: string;
  isPluginLibrary: boolean;
  client: ApiClient;
  serverUrl: string;
  token?: string;
  currentUserId?: string;
  playlistsRefreshToken: number;
  searchRefreshKey?: number;
  searchInitialFocusId?: string | null;
  hasSwitchServer: boolean;
  onOpenPlaylist: (playlistId: string) => void;
  onNavigateToSearchSidebar: () => void;
  onSearchInitialFocusConsumed?: () => void;
  onLockedLibrary?: (libraryId: string) => void;
  onBrowseFolder?: (libraryId: string, folderPath?: string) => void;
  onSelectItem: (itemId: number | string) => void;
  onPlayItem: BrowseScreenProps['onPlayItem'];
  onRetryLayout: () => void;
  onSwitchProfile: () => void;
  onSwitchServer?: () => void;
}

const BrowseMainContent = memo(function BrowseMainContent({
  activeTab,
  loading,
  isCurrentScreenLocked,
  lockedLibraryId,
  layout,
  layoutError,
  targetLibId,
  libraryHeading,
  isPluginLibrary,
  client,
  serverUrl,
  token,
  currentUserId,
  playlistsRefreshToken,
  searchRefreshKey,
  searchInitialFocusId,
  hasSwitchServer,
  onOpenPlaylist,
  onNavigateToSearchSidebar,
  onSearchInitialFocusConsumed,
  onLockedLibrary,
  onBrowseFolder,
  onSelectItem,
  onPlayItem,
  onRetryLayout,
  onSwitchProfile,
  onSwitchServer,
}: BrowseMainContentProps) {
  return (
    <main className="flex-1 h-full overflow-y-auto p-12 scrollbar-none">
      {activeTab === 'search' ? (
        <SearchView
          client={client}
          serverUrl={serverUrl}
          token={token}
          refreshKey={searchRefreshKey}
          initialFocusId={searchInitialFocusId}
          onInitialFocusConsumed={onSearchInitialFocusConsumed}
          onSelectItem={onSelectItem}
          onPlayItem={onPlayItem}
          onNavigateToSidebar={onNavigateToSearchSidebar}
        />
      ) : activeTab === 'playlists' ? (
        <PlaylistsView
          client={client}
          serverUrl={serverUrl}
          token={token}
          currentUserId={currentUserId}
          refreshKey={playlistsRefreshToken}
          onOpenPlaylist={onOpenPlaylist}
        />
      ) : loading ? (
        <div className="w-full h-full flex items-center justify-center text-[#5C3C3C] text-2xl">
          Loading {activeTab}...
        </div>
      ) : isCurrentScreenLocked ? (
        <div className="w-full h-full flex flex-col items-center justify-center select-none">
          <div
            className="w-24 h-24 rounded-full bg-[#3B1111] border border-[rgba(245,229,229,0.08)] flex items-center justify-center"
            style={{ marginBottom: '24px' }}
          >
            <Lock className="w-12 h-12 text-[#FFB800]" />
          </div>
          <div className="flex flex-col items-center" style={{ marginBottom: '24px' }}>
            <h2
              className="text-3xl font-bold text-[#F5E5E5]"
              style={{ marginBottom: '8px' }}
            >
              Private Library Locked
            </h2>
            <p className="text-lg text-[#5C3C3C] max-w-md text-center">
              This library is protected with a 4-digit PIN. Unlock it to access its media contents.
            </p>
          </div>
          <TVButton
            id="unlock-library-btn"
            groupId="locked-library"
            variant="primary"
            onClick={() => onLockedLibrary?.(lockedLibraryId)}
            onEnter={() => onLockedLibrary?.(lockedLibraryId)}
            className="mt-2"
          >
            <KeyRound className="w-6 h-6 mr-2" /> Unlock with PIN
          </TVButton>
        </div>
      ) : layout ? (
        <>
          {targetLibId && (
            <div className="flex items-center justify-between mb-8 pb-4 border-b border-[rgba(245,229,229,0.08)]">
              <div>
                <h1 className="text-4xl font-black tracking-tight text-[#F5E5E5]">
                  {libraryHeading}
                </h1>
              </div>
              {!isPluginLibrary && (
                <TVButton
                  id="library-browse-folders-btn"
                  groupId="browse-library-header"
                  variant="secondary"
                  onClick={() => onBrowseFolder?.(targetLibId)}
                  onEnter={() => onBrowseFolder?.(targetLibId)}
                  className="!py-3.5 !px-7 !text-2xl font-bold rounded-2xl"
                >
                  <Folder className="w-7 h-7 mr-2" /> Browse Folders
                </TVButton>
              )}
            </div>
          )}
          <WidgetRenderer
            layout={layout}
            serverUrl={serverUrl}
            onSelectItem={onSelectItem}
            onPlayItem={onPlayItem}
          />
        </>
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center">
          <div
            className="w-20 h-20 rounded-full bg-[#D43F15]/10 border border-[#D43F15]/30 flex items-center justify-center"
            style={{ marginBottom: '24px' }}
          >
            <AlertTriangle className="w-10 h-10 text-[#D43F15]" />
          </div>
          <div className="max-w-xl" style={{ marginBottom: '24px' }}>
            <h2
              className="text-3xl font-bold text-[#F5E5E5]"
              style={{ marginBottom: '8px' }}
            >
              Failed to load screen layout.
            </h2>
            <p className="text-lg text-[#D43F15]" style={{ marginBottom: '8px' }}>
              Error: {layoutError || 'Unable to connect to server'}
            </p>
            <p className="text-sm text-[#5C3C3C] break-all">
              Server URL: {serverUrl}
            </p>
          </div>
          <div className="flex items-center mt-4">
            <TVButton
              id="retry-layout-btn"
              groupId="content"
              variant="primary"
              onClick={onRetryLayout}
              onEnter={onRetryLayout}
              style={{ marginRight: '16px' }}
            >
              <RotateCcw className="w-5 h-5 mr-2" /> Retry
            </TVButton>
            <TVButton
              id="switch-profile-btn"
              groupId="content"
              variant="secondary"
              onClick={onSwitchProfile}
              onEnter={onSwitchProfile}
              style={{ marginRight: hasSwitchServer ? '16px' : '0px' }}
            >
              <Users className="w-5 h-5 mr-2" /> Switch Profile
            </TVButton>
            {hasSwitchServer && (
              <TVButton
                id="change-server-btn"
                groupId="content"
                variant="secondary"
                onClick={() => onSwitchServer?.()}
                onEnter={() => onSwitchServer?.()}
              >
                <Server className="w-5 h-5 mr-2" /> Change Server
              </TVButton>
            )}
          </div>
        </div>
      )}
    </main>
  );
});

export function BrowseScreen({
  client,
  serverUrl,
  token,
  currentUserId,
  onSelectItem,
  onPlayItem,
  onSwitchProfile,
  onSwitchServer,
  onRequestExit,
  onLockedLibrary,
  onBrowseFolder,
  onOpenPlaylist,
  onTabChange,
  initialTab,
  initialFocusId,
  onContentFocusChange,
  refreshKey,
  playlistRefreshKey,
  libraries: propLibraries,
}: BrowseScreenProps) {
  const [screens, setScreens] = useState<ScreenSummary[]>([]);
  const [internalLibraries, setInternalLibraries] = useState<LibrarySummary[]>([]);
  const librariesList = propLibraries || internalLibraries;
  const [activeTab, setActiveTab] = useState<string>(initialTab || 'home');
  const [layout, setLayout] = useState<ScreenLayout | null>(null);
  const [loading, setLoading] = useState(
    initialTab !== 'playlists' && initialTab !== 'search'
  );
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState<number>(0);
  const [internalPlaylistId, setInternalPlaylistId] = useState<string | null>(null);
  const [internalPlaylistRefresh, setInternalPlaylistRefresh] = useState<number>(0);
  const [searchInitialFocusId, setSearchInitialFocusId] = useState<string | null>(() =>
    (initialTab || 'home') === 'search' ? initialFocusId ?? null : null
  );
  const searchInitialFocusIdRef = useRef(searchInitialFocusId);
  searchInitialFocusIdRef.current = searchInitialFocusId;

  const onTabChangeRef = useRef(onTabChange);
  onTabChangeRef.current = onTabChange;

  const onContentFocusChangeRef = useRef(onContentFocusChange);
  onContentFocusChangeRef.current = onContentFocusChange;

  const { focusedId, setFocusedId, activeTrap } = useFocusContext();

  const getLibraryInfo = useCallback(
    (screenId: string) => {
      const lib = librariesList.find(
        (l) => l.id === screenId || l.name.toLowerCase() === screenId.toLowerCase()
      );
      if (!lib) return null;
      const isPrivate = Boolean(lib.is_private);
      const isUnlocked = isPrivate ? client.isLibraryUnlocked(lib.id) : true;
      return { lib, isPrivate, isUnlocked };
    },
    [librariesList, client]
  );

  const getLibraryInfoRef = useRef(getLibraryInfo);
  getLibraryInfoRef.current = getLibraryInfo;

  const onSwitchProfileRef = useRef(onSwitchProfile);
  onSwitchProfileRef.current = onSwitchProfile;

  const onRequestExitRef = useRef(onRequestExit);
  onRequestExitRef.current = onRequestExit;

  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  const layoutErrorRef = useRef(layoutError);
  layoutErrorRef.current = layoutError;

  const handleSwitchProfileStable = useCallback(() => {
    onSwitchProfileRef.current?.();
  }, []);

  const isSidebarFocused = Boolean(
    focusedId &&
      (focusedId.startsWith('nav-screen-') ||
        focusedId === 'nav-switch-profile' ||
        focusedId.startsWith('nav-'))
  );
  const sidebarFocusedId = isSidebarFocused ? focusedId : null;

  const focusedIdRef = useRef(focusedId);
  focusedIdRef.current = focusedId;

  const activeTrapRef = useRef(activeTrap);
  activeTrapRef.current = activeTrap;

  const isSidebarFocusedRef = useRef(isSidebarFocused);
  isSidebarFocusedRef.current = isSidebarFocused;

  const lastContentFocusedIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!sidebarFocusedId || isModalActive(activeTrapRef.current)) return;
    if (sidebarFocusedId.startsWith('nav-screen-') || sidebarFocusedId === 'nav-switch-profile') {
      scrollSidebarItemIntoViewIfClipped(document.getElementById(sidebarFocusedId));
    }
  }, [sidebarFocusedId]);

  useEffect(() => {
    let cancelled = false;
    fetchScreens(client)
      .then((data) => {
        if (!cancelled && data && data.length > 0) {
          setScreens(data);
          setActiveTab((prev) => {
            if (
              prev === 'playlists' ||
              prev === 'search' ||
              (prev && data.some((s) => s.id === prev))
            ) {
              return prev;
            }
            return initialTab || data[0].id;
          });
        }
      })
      .catch((err) => {
        if (err?.message?.includes('401')) {
          onSwitchProfileRef.current?.();
        }
      });

    if (!propLibraries) {
      fetchLibraries(client)
        .then((libs) => {
          if (!cancelled && libs) {
            setInternalLibraries(libs);
          }
        })
        .catch(() => {});
    }

    return () => {
      cancelled = true;
    };
  }, [client, initialTab, refreshKey, propLibraries]);

  useEffect(() => {
    lastContentFocusedIdRef.current = null;
    if (activeTab !== 'search') {
      setSearchInitialFocusId(null);
    }
    onTabChangeRef.current?.(activeTab);
  }, [activeTab]);

  // Only record content focus IDs belonging to BrowseScreen (never modal focus IDs)
  useEffect(() => {
    if (
      focusedId &&
      !isModalActive(activeTrap) &&
      isValidContentNode(focusedId, layout, activeTab)
    ) {
      lastContentFocusedIdRef.current = focusedId;
      onContentFocusChangeRef.current?.(focusedId);
    }
  }, [focusedId, activeTrap, layout, activeTab]);

  useEffect(() => {
    if (activeTab === 'playlists') {
      setLayout(null);
      setLayoutError(null);
      setLoading(false);
      if (focusedIdRef.current === null && !isModalActive(activeTrapRef.current)) {
        const targetId =
          initialFocusId && isValidContentNode(initialFocusId, null, 'playlists')
            ? initialFocusId
            : getFirstPlaylistsFocusableId();
        if (targetId) {
          setFocusedId(targetId);
        }
      }
      return;
    }
    if (activeTab === 'search') {
      setLayout(null);
      setLayoutError(null);
      setLoading(false);
      if (focusedIdRef.current === null && !isModalActive(activeTrapRef.current)) {
        const pendingSearchFocus = searchInitialFocusIdRef.current;
        if (
          pendingSearchFocus &&
          isValidContentNode(pendingSearchFocus, null, 'search')
        ) {
          setFocusedId(pendingSearchFocus);
        } else if (!pendingSearchFocus) {
          setFocusedId(getFirstSearchFocusableId());
        }
      }
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchScreenLayout(client, activeTab)
      .then((data) => {
        if (!cancelled) {
          setLayout(data);
          setLayoutError(null);
          setLoading(false);
          // Never steal focus if ANY modal or focus trap is active or focus is already placed
          if (focusedIdRef.current === null && !isModalActive(activeTrapRef.current)) {
            const currentInfo = getLibraryInfoRef.current(activeTab);
            if (currentInfo?.isPrivate && !currentInfo.isUnlocked) {
              setFocusedId('unlock-library-btn');
            } else {
              const targetId =
                initialFocusId && isValidContentNode(initialFocusId, data, activeTab)
                  ? initialFocusId
                  : getFirstFocusableId(data);
              if (targetId) {
                setFocusedId(targetId);
              }
            }
          }
        }
      })
      .catch((err) => {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes('401')) {
            onSwitchProfileRef.current?.();
            return;
          }
          setLayout(null);
          setLayoutError(msg || 'Network error');
          setLoading(false);
          if (focusedIdRef.current === null && !isModalActive(activeTrapRef.current)) {
            setFocusedId('retry-layout-btn');
          }
        }
      });
    return () => {
      cancelled = true;
    };
  }, [client, activeTab, setFocusedId, refreshKey, retryCount]);

  const handleSelectScreen = useCallback(
    (screenId: string) => {
      if (screenId !== 'playlists' && screenId !== 'search') {
        const info = getLibraryInfoRef.current(screenId);
        if (info && info.isPrivate && !info.isUnlocked) {
          setActiveTab(screenId);
          onLockedLibrary?.(info.lib.id);
          return;
        }
      }
      setActiveTab(screenId);
    },
    [onLockedLibrary]
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const targetEl = e.target as HTMLElement | null;
      const activeEl = typeof document !== 'undefined' ? document.activeElement : null;

      // Guard 1: Never intercept Back/Backspace in input or textarea fields
      if (
        isTextInputElement(targetEl) ||
        isTextInputElement(activeEl) ||
        targetEl?.isContentEditable ||
        (activeEl as HTMLElement | null)?.isContentEditable
      ) {
        return;
      }

      // Guard 2: Never intercept if a modal or focus trap is active or target is inside a modal
      const isTargetInModal = Boolean(
        targetEl?.closest?.(
          '[aria-modal="true"], [role="dialog"], [role="alertdialog"], [data-modal-overlay="true"]'
        )
      );
      if (isTargetInModal || isModalActive(activeTrapRef.current)) {
        return;
      }

      const code = e.keyCode || e.which;
      const currentFocused = focusedIdRef.current;
      const onSidebar = isSidebarFocusedRef.current;
      const currentLayout = layoutRef.current;
      const currentTab = activeTabRef.current;
      const currentLayoutError = layoutErrorRef.current;

      // Back navigation (Escape / TV Back 10009 / Backspace) from content area returns focus to sidebar;
      // pressing Back from the root sidebar requests exit confirmation.
      if (
        code === TVKeys.BACK_TIZEN ||
        code === TVKeys.BACK_WEB ||
        code === TVKeys.BACKSPACE ||
        e.key === 'Escape' ||
        e.key === 'Backspace'
      ) {
        if (
          !onSidebar &&
          (isValidContentNode(currentFocused, currentLayout, currentTab) ||
            (currentTab === 'search' &&
              (currentFocused === null || isSearchContentNodeId(currentFocused))))
        ) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          setFocusedId(`nav-screen-${currentTab}`);
          return;
        } else {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          onRequestExitRef.current?.();
          return;
        }
      }

      // ArrowLeft from leftmost content element transitions to sidebar
      if (code === TVKeys.LEFT || e.key === 'ArrowLeft') {
        if (
          !onSidebar &&
          isValidContentNode(currentFocused, currentLayout, currentTab) &&
          isLeftmostContentNode(currentFocused, currentLayout, currentTab)
        ) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          setFocusedId(`nav-screen-${currentTab}`);
          return;
        }
      }

      // ArrowRight from sidebar transitions into content area
      if (code === TVKeys.RIGHT || e.key === 'ArrowRight') {
        if (
          onSidebar &&
          (currentLayout ||
            currentTab === 'playlists' ||
            currentTab === 'search' ||
            currentLayoutError)
        ) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          const lastId = lastContentFocusedIdRef.current;
          const targetId = isValidContentNode(lastId, currentLayout, currentTab)
            ? lastId
            : currentTab === 'playlists'
            ? getFirstPlaylistsFocusableId()
            : currentTab === 'search'
            ? getFirstSearchFocusableId()
            : currentLayoutError
            ? 'retry-layout-btn'
            : currentLayout
            ? getFirstFocusableId(currentLayout)
            : null;
          if (targetId && !isModalActive(activeTrapRef.current)) {
            setFocusedId(targetId);
          }
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [activeTab, layout, layoutError, setFocusedId, activeTrap]);

  const displayScreens = useMemo(() => {
    if (librariesList.length > 0) {
      const result: ScreenSummary[] = [{ id: 'home', title: 'Home' }];
      const seenIds = new Set<string>(['home']);

      for (const lib of librariesList) {
        const matchedScreen =
          screens.find((s) => s.id === lib.id) ||
          screens.find(
            (s) =>
              s.id !== 'home' &&
              (s.id.toLowerCase() === lib.name.toLowerCase() ||
                s.title.toLowerCase() === lib.name.toLowerCase())
          );
        const tabId = matchedScreen ? matchedScreen.id : lib.id;
        if (!seenIds.has(tabId)) {
          seenIds.add(tabId);
          result.push({ id: tabId, title: lib.name });
        }
      }

      return result;
    }

    return (screens.length > 0 ? screens : defaultScreens).filter(
      (s) => s.id !== 'playlists' && s.id !== 'search'
    );
  }, [librariesList, screens]);

  // Unlock token signature so sidebar lock badges update when client unlocks a library
  const unlockSignature = client.getUnlockTokens ? client.getUnlockTokens().join(',') : '';

  const screenItems: SidebarScreenItemView[] = useMemo(() => {
    return displayScreens.map((screenItem) => {
      const info = getLibraryInfo(screenItem.id);
      const isPrivate = Boolean(info?.isPrivate);
      const isUnlocked = Boolean(info?.isUnlocked);
      const isLocked = Boolean(info?.isPrivate && !info.isUnlocked);
      const kind = getScreenKind(screenItem.id, info?.lib.media_type);
      return {
        id: screenItem.id,
        title: screenItem.title,
        subtitle: getScreenSubtitle(kind, isPrivate, isUnlocked),
        chip: getScreenPath(screenItem.id, screenItem.title),
        isPrivate,
        isUnlocked,
        isLocked,
      };
    });
  }, [displayScreens, getLibraryInfo, unlockSignature]);

  const libraryCount = displayScreens.filter((s) => s.id !== 'home').length;
  const serverHost = serverUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const currentLibInfo = getLibraryInfo(activeTab);
  const isCurrentScreenLocked = Boolean(currentLibInfo?.isPrivate && !currentLibInfo.isUnlocked);
  const isPluginLibrary = Boolean(
    (currentLibInfo?.lib as { path?: string } | undefined)?.path?.startsWith('plugin://')
  );
  const targetLibId =
    activeTab !== 'home' && activeTab !== 'playlists' && activeTab !== 'search'
      ? currentLibInfo?.lib.id || activeTab
      : null;
  const libraryHeading =
    currentLibInfo?.lib.name || screens.find((s) => s.id === activeTab)?.title || activeTab;

  const handleOpenPlaylist = useCallback(
    (playlistId: string) => {
      if (onOpenPlaylist) {
        onOpenPlaylist(playlistId);
      } else {
        setInternalPlaylistId(playlistId);
      }
    },
    [onOpenPlaylist]
  );

  const handleRetryLayout = useCallback(() => {
    setRetryCount((c) => c + 1);
  }, []);

  const handleNavigateToSearchSidebar = useCallback(() => {
    setFocusedId('nav-screen-search');
  }, [setFocusedId]);

  const handleConsumeSearchInitialFocus = useCallback(() => {
    setSearchInitialFocusId(null);
  }, []);

  const handleInternalPlayQueue = useCallback(
    (queue: PlaylistQueuePlayItem[], startIndex: number) => {
      const first = queue[startIndex];
      if (!first) return;
      setInternalPlaylistId(null);
      onPlayItem(
        first.id,
        first.resumeMs ?? 0,
        first.title,
        first.technical,
        queue,
        startIndex,
        first.mediaType
      );
    },
    [onPlayItem]
  );

  return (
    <div className="w-full h-full flex bg-[#2A0A0A] overflow-hidden">
      <BrowseSidebar
        isSidebarFocused={isSidebarFocused}
        sidebarFocusedId={sidebarFocusedId}
        activeTab={activeTab}
        serverHost={serverHost}
        libraryCount={libraryCount}
        screenItems={screenItems}
        onSelectScreen={handleSelectScreen}
        onSwitchProfile={handleSwitchProfileStable}
      />

      <BrowseMainContent
        activeTab={activeTab}
        loading={loading}
        isCurrentScreenLocked={isCurrentScreenLocked}
        lockedLibraryId={currentLibInfo?.lib.id || activeTab}
        layout={layout}
        layoutError={layoutError}
        targetLibId={targetLibId}
        libraryHeading={libraryHeading}
        isPluginLibrary={isPluginLibrary}
        client={client}
        serverUrl={serverUrl}
        token={token}
        currentUserId={currentUserId}
        playlistsRefreshToken={(playlistRefreshKey ?? 0) + internalPlaylistRefresh}
        searchRefreshKey={refreshKey}
        searchInitialFocusId={activeTab === 'search' ? searchInitialFocusId : null}
        hasSwitchServer={Boolean(onSwitchServer)}
        onOpenPlaylist={handleOpenPlaylist}
        onNavigateToSearchSidebar={handleNavigateToSearchSidebar}
        onSearchInitialFocusConsumed={handleConsumeSearchInitialFocus}
        onLockedLibrary={onLockedLibrary}
        onBrowseFolder={onBrowseFolder}
        onSelectItem={onSelectItem}
        onPlayItem={onPlayItem}
        onRetryLayout={handleRetryLayout}
        onSwitchProfile={handleSwitchProfileStable}
        onSwitchServer={onSwitchServer}
      />

      {!onOpenPlaylist && internalPlaylistId && (
        <PlaylistDetailModal
          isOpen={Boolean(internalPlaylistId)}
          playlistId={internalPlaylistId}
          client={client}
          serverUrl={serverUrl}
          token={token}
          refreshKey={(playlistRefreshKey ?? 0) + internalPlaylistRefresh}
          onClose={() => setInternalPlaylistId(null)}
          onPlayQueue={handleInternalPlayQueue}
          onSelectItem={onSelectItem}
          onPlaylistChanged={() => setInternalPlaylistRefresh((k) => k + 1)}
          onPlaylistDeleted={() => {
            setInternalPlaylistId(null);
            setInternalPlaylistRefresh((k) => k + 1);
          }}
          onLockedLibrary={(libId) => {
            if (libId) onLockedLibrary?.(libId);
          }}
        />
      )}
    </div>
  );
}
