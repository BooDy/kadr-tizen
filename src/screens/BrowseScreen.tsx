import { useState, useEffect, useRef } from 'react';
import { ScreenLayout, ScreenSummary } from '../types/ast';
import { ApiClient } from '../api/client';
import { fetchScreens, fetchScreenLayout } from '../api/screens';
import { fetchLibraries, LibrarySummary } from '../api/libraries';
import { WidgetRenderer } from '../components/widgets/WidgetRenderer';
import { TVButton } from '../components/tv/TVButton';
import { Home, Film, Tv, Layers, Users, Lock, Unlock, KeyRound, AlertTriangle, RotateCcw, Server, Folder } from 'lucide-react';
import { useFocusContext } from '../navigation/FocusContext';
import { TVKeys } from '../navigation/keys';

export interface BrowseScreenProps {
  client: ApiClient;
  serverUrl: string;
  onSelectItem: (itemId: number | string) => void;
  onPlayItem: (itemId: number | string, resumeMs?: number) => void;
  onSwitchProfile: () => void;
  onSwitchServer?: () => void;
  onLockedLibrary?: (libraryId: string) => void;
  onBrowseFolder?: (libraryId: string, folderPath?: string) => void;
  initialTab?: string;
  refreshKey?: number;
  libraries?: LibrarySummary[];
}

const defaultScreens: ScreenSummary[] = [
  { id: 'home', title: 'Home' },
  { id: 'movies', title: 'Movies' },
  { id: 'shows', title: 'Shows' },
];

function getScreenIcon(screenId: string) {
  switch (screenId) {
    case 'home':
      return Home;
    case 'movies':
      return Film;
    case 'shows':
      return Tv;
    default:
      return Layers;
  }
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

function isLeftmostContentNode(id: string | null, layout: ScreenLayout | null): boolean {
  if (!id) return false;
  if (id === 'unlock-library-btn' || id === 'retry-layout-btn' || id === 'library-browse-folders-btn') return true;
  if (!layout) return false;
  for (const widget of layout.widgets) {
    if (widget.type === 'hero_banner') {
      if (id === `hero-play-${widget.id}`) return true;
    } else if (widget.type === 'carousel') {
      if (widget.items && widget.items.length > 0 && id === `card-${widget.id}-${widget.items[0].id}`) return true;
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
        // Fallback for 1080p fixed canvas with widget.columns (or 6)
        const cols = widget.columns || 6;
        return idx % cols === 0;
      }
    }
  }
  return false;
}

function isValidContentNode(id: string | null, layout: ScreenLayout | null): boolean {
  if (!id) return false;
  if (id === 'unlock-library-btn' || id === 'retry-layout-btn' || id === 'library-browse-folders-btn') return true;
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
      document.querySelector('[aria-modal="true"], [role="dialog"], .fixed.z-50')
    );
  }
  return false;
}

export function BrowseScreen({
  client,
  serverUrl,
  onSelectItem,
  onPlayItem,
  onSwitchProfile,
  onSwitchServer,
  onLockedLibrary,
  onBrowseFolder,
  initialTab,
  refreshKey,
  libraries: propLibraries,
}: BrowseScreenProps) {
  const [screens, setScreens] = useState<ScreenSummary[]>([]);
  const [internalLibraries, setInternalLibraries] = useState<LibrarySummary[]>([]);
  const librariesList = propLibraries || internalLibraries;
  const [activeTab, setActiveTab] = useState<string>(initialTab || 'home');
  const [layout, setLayout] = useState<ScreenLayout | null>(null);
  const [loading, setLoading] = useState(true);
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState<number>(0);

  const { focusedId, setFocusedId, activeTrap } = useFocusContext();

  const getLibraryInfo = (screenId: string) => {
    const lib = librariesList.find(
      (l) => l.id === screenId || l.name.toLowerCase() === screenId.toLowerCase()
    );
    if (!lib) return null;
    const isPrivate = Boolean(lib.is_private);
    const isUnlocked = isPrivate ? client.isLibraryUnlocked(lib.id) : true;
    return { lib, isPrivate, isUnlocked };
  };

  const isSidebarFocused = Boolean(
    focusedId &&
      (focusedId.startsWith('nav-screen-') ||
        focusedId === 'nav-switch-profile' ||
        focusedId.startsWith('nav-'))
  );

  const focusedIdRef = useRef(focusedId);
  focusedIdRef.current = focusedId;

  const isSidebarFocusedRef = useRef(isSidebarFocused);
  isSidebarFocusedRef.current = isSidebarFocused;

  const lastContentFocusedIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (focusedId && (focusedId.startsWith('nav-screen-') || focusedId === 'nav-switch-profile')) {
      const el = document.getElementById(focusedId);
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [focusedId]);

  useEffect(() => {
    let cancelled = false;
    fetchScreens(client)
      .then((data) => {
        if (!cancelled && data && data.length > 0) {
          setScreens(data);
          setActiveTab((prev) => {
            if (prev && data.some((s) => s.id === prev)) {
              return prev;
            }
            return initialTab || data[0].id;
          });
        }
      })
      .catch((err) => {
        if (err?.message?.includes('401')) {
          onSwitchProfile?.();
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
  }, [client, initialTab, refreshKey, propLibraries, onSwitchProfile]);

  useEffect(() => {
    lastContentFocusedIdRef.current = null;
  }, [activeTab]);

  useEffect(() => {
    if (
      focusedId &&
      !focusedId.startsWith('nav-screen-') &&
      !focusedId.startsWith('nav-')
    ) {
      lastContentFocusedIdRef.current = focusedId;
    }
  }, [focusedId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchScreenLayout(client, activeTab)
      .then((data) => {
        if (!cancelled) {
          setLayout(data);
          setLayoutError(null);
          setLoading(false);
          // If no focus is currently set, focus the first focusable element
          if (focusedIdRef.current === null) {
            const currentInfo = getLibraryInfo(activeTab);
            if (currentInfo?.isPrivate && !currentInfo.isUnlocked) {
              setFocusedId('unlock-library-btn');
            } else {
              const firstId = getFirstFocusableId(data);
              if (firstId) {
                setFocusedId(firstId);
              }
            }
          }
        }
      })
      .catch((err) => {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes('401')) {
            onSwitchProfile?.();
            return;
          }
          setLayout(null);
          setLayoutError(msg || 'Network error');
          setLoading(false);
          setFocusedId('retry-layout-btn');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [client, activeTab, setFocusedId, refreshKey, retryCount, onSwitchProfile]);

  const handleSelectScreen = (screenId: string) => {
    const info = getLibraryInfo(screenId);
    if (info && info.isPrivate && !info.isUnlocked) {
      setActiveTab(screenId);
      onLockedLibrary?.(info.lib.id);
      return;
    }
    setActiveTab(screenId);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const targetEl = e.target as HTMLElement | null;

      // Guard 1: Never intercept Back/Backspace in input or textarea fields
      if (
        targetEl &&
        (targetEl.tagName === 'INPUT' ||
          targetEl.tagName === 'TEXTAREA' ||
          targetEl.isContentEditable)
      ) {
        return;
      }

      // Guard 2: Never intercept if a modal or focus trap is active or target is inside a modal
      const isTargetInModal = Boolean(
        targetEl?.closest?.('[aria-modal="true"], [role="dialog"]')
      );
      if (isTargetInModal || isModalActive(activeTrap)) {
        return;
      }

      const code = e.keyCode || e.which;
      const currentFocused = focusedIdRef.current;
      const onSidebar = isSidebarFocusedRef.current;

      // Back navigation (Escape / TV Back 10009 / Backspace) from content area returns focus to sidebar
      // Guard 3: Only intercept if current focus is a valid content node in layout
      if (
        code === TVKeys.BACK_TIZEN ||
        code === TVKeys.BACK_WEB ||
        code === TVKeys.BACKSPACE ||
        e.key === 'Escape' ||
        e.key === 'Backspace'
      ) {
        if (!onSidebar && isValidContentNode(currentFocused, layout)) {
          e.preventDefault();
          e.stopPropagation();
          setFocusedId(`nav-screen-${activeTab}`);
          return;
        }
      }

      // ArrowLeft from leftmost content element transitions to sidebar
      if (code === TVKeys.LEFT || e.key === 'ArrowLeft') {
        if (
          !onSidebar &&
          isValidContentNode(currentFocused, layout) &&
          isLeftmostContentNode(currentFocused, layout)
        ) {
          e.preventDefault();
          e.stopPropagation();
          setFocusedId(`nav-screen-${activeTab}`);
          return;
        }
      }

      // ArrowRight from sidebar transitions into content area
      if (code === TVKeys.RIGHT || e.key === 'ArrowRight') {
        if (onSidebar && layout) {
          e.preventDefault();
          e.stopPropagation();
          const lastId = lastContentFocusedIdRef.current;
          const targetId =
            isValidContentNode(lastId, layout) ? lastId : getFirstFocusableId(layout);
          if (targetId) {
            setFocusedId(targetId);
          }
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [activeTab, layout, setFocusedId, activeTrap]);

  const displayScreens = screens.length > 0 ? screens : defaultScreens;
  const currentLibInfo = getLibraryInfo(activeTab);
  const isCurrentScreenLocked = Boolean(currentLibInfo?.isPrivate && !currentLibInfo.isUnlocked);
  const targetLibId =
    activeTab !== 'home'
      ? currentLibInfo?.lib.id || activeTab
      : null;

  return (
    <div className="w-full h-full flex bg-[#2A0A0A] overflow-hidden">
      {/* Collapsible Left TV Sidebar */}
      <nav
        data-testid="tv-sidebar"
        className={`${
          isSidebarFocused ? 'w-96' : 'w-28'
        } hover:w-96 focus-within:w-96 transition-all duration-200 bg-[#3B1111] border-r border-[rgba(245,229,229,0.08)] p-4 flex flex-col justify-between z-40 group`}
      >
        <div className="h-24 flex items-center justify-center mb-8 shrink-0">
          <img
            src="./kadr-logo.png"
            alt="Kadr"
            className="h-14 w-auto object-contain"
            style={{ height: '56px', width: 'auto', maxHeight: '56px' }}
            height="56"
          />
        </div>

        <div
          data-testid="sidebar-items-container"
          className="flex-1 overflow-y-auto scrollbar-none flex flex-col gap-[148px] py-4"
        >
          {displayScreens.map((screenItem, index) => {
            const IconComponent = getScreenIcon(screenItem.id);
            const isActive = activeTab === screenItem.id;
            const info = getLibraryInfo(screenItem.id);

            return (
              <TVButton
                key={screenItem.id}
                id={`nav-screen-${screenItem.id}`}
                groupId="sidebar"
                order={index + 1}
                variant={isActive ? 'nav-active' : 'nav-inactive'}
                onEnter={() => handleSelectScreen(screenItem.id)}
                onClick={() => handleSelectScreen(screenItem.id)}
                className="w-full justify-start px-5 py-5 shrink-0"
              >
                {info?.isPrivate ? (
                  info.isUnlocked ? (
                    <Unlock className="w-9 h-9 shrink-0 mr-4 text-[#FF6B00]" />
                  ) : (
                    <Lock className="w-9 h-9 shrink-0 mr-4 text-[#FFB800]" />
                  )
                ) : (
                  <IconComponent className="w-9 h-9 shrink-0 mr-4" />
                )}
                <span
                  className={`${
                    isSidebarFocused ? 'inline' : 'hidden group-hover:inline group-focus-within:inline'
                  } text-3xl font-extrabold tracking-wide truncate`}
                >
                  {screenItem.title}
                </span>
                {info?.isPrivate && !info.isUnlocked && (
                  <span
                    className={`${
                      isSidebarFocused ? 'inline' : 'hidden group-hover:inline group-focus-within:inline'
                    } ml-auto text-sm px-3 py-1 rounded bg-[#FFB800]/20 text-[#FFB800] border border-[#FFB800]/30 font-bold`}
                  >
                    Locked
                  </span>
                )}
              </TVButton>
            );
          })}
        </div>

        <div className="pt-4 border-t border-[rgba(245,229,229,0.08)] shrink-0">
          <TVButton
            id="nav-switch-profile"
            groupId="sidebar"
            order={displayScreens.length + 1}
            variant="nav-inactive"
            onEnter={onSwitchProfile}
            onClick={onSwitchProfile}
            className="w-full justify-start px-5 py-5"
          >
            <Users className="w-9 h-9 shrink-0 mr-4" />
            <span
              className={`${
                isSidebarFocused ? 'inline' : 'hidden group-hover:inline group-focus-within:inline'
              } text-3xl font-extrabold tracking-wide truncate`}
            >
              Profiles
            </span>
          </TVButton>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 h-full overflow-y-auto p-12 scrollbar-none">
        {loading ? (
          <div className="w-full h-full flex items-center justify-center text-[#5C3C3C] text-2xl">
            Loading {activeTab}...
          </div>
        ) : isCurrentScreenLocked ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-6 select-none">
            <div className="w-24 h-24 rounded-full bg-[#3B1111] border border-[rgba(245,229,229,0.08)] flex items-center justify-center shadow-xl">
              <Lock className="w-12 h-12 text-[#FFB800]" />
            </div>
            <div className="flex flex-col items-center gap-2">
              <h2 className="text-3xl font-bold text-[#F5E5E5]">Private Library Locked</h2>
              <p className="text-lg text-[#5C3C3C] max-w-md text-center">
                This library is protected with a 4-digit PIN. Unlock it to access its media contents.
              </p>
            </div>
            <TVButton
              id="unlock-library-btn"
              groupId="locked-library"
              variant="primary"
              autoFocus
              onClick={() => onLockedLibrary?.(currentLibInfo?.lib.id || activeTab)}
              onEnter={() => onLockedLibrary?.(currentLibInfo?.lib.id || activeTab)}
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
                    {currentLibInfo?.lib.name || screens.find((s) => s.id === activeTab)?.title || activeTab}
                  </h1>
                </div>
                <TVButton
                  id="library-browse-folders-btn"
                  groupId="browse-library-header"
                  variant="secondary"
                  onClick={() => onBrowseFolder?.(targetLibId)}
                  onEnter={() => onBrowseFolder?.(targetLibId)}
                  className="!py-3.5 !px-7 !text-2xl font-bold rounded-2xl gap-3"
                >
                  <Folder className="w-7 h-7 mr-2" /> Browse Folders
                </TVButton>
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
          <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center space-y-6">
            <div className="w-20 h-20 rounded-full bg-[#D43F15]/10 border border-[#D43F15]/30 flex items-center justify-center">
              <AlertTriangle className="w-10 h-10 text-[#D43F15]" />
            </div>
            <div className="space-y-2 max-w-xl">
              <h2 className="text-3xl font-bold text-[#F5E5E5]">
                Failed to load screen layout.
              </h2>
              <p className="text-lg text-[#D43F15]">
                Error: {layoutError || 'Unable to connect to server'}
              </p>
              <p className="text-sm text-[#5C3C3C] break-all">
                Server URL: {serverUrl}
              </p>
            </div>
            <div className="flex items-center gap-4 mt-4">
              <TVButton
                id="retry-layout-btn"
                groupId="content"
                variant="primary"
                autoFocus
                onClick={() => setRetryCount((c) => c + 1)}
                onEnter={() => setRetryCount((c) => c + 1)}
              >
                <RotateCcw className="w-5 h-5 mr-2" /> Retry
              </TVButton>
              <TVButton
                id="switch-profile-btn"
                groupId="content"
                variant="secondary"
                onClick={() => onSwitchProfile?.()}
                onEnter={() => onSwitchProfile?.()}
              >
                <Users className="w-5 h-5 mr-2" /> Switch Profile
              </TVButton>
              {onSwitchServer && (
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
    </div>
  );
}
