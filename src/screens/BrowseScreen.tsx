import { useState, useEffect, useRef } from 'react';
import { ScreenLayout, ScreenSummary } from '../types/ast';
import { ApiClient } from '../api/client';
import { fetchScreens, fetchScreenLayout } from '../api/screens';
import { WidgetRenderer } from '../components/widgets/WidgetRenderer';
import { TVButton } from '../components/tv/TVButton';
import { Home, Film, Tv, Layers, Users } from 'lucide-react';
import { useFocusContext } from '../navigation/FocusContext';
import { TVKeys } from '../navigation/keys';

export interface BrowseScreenProps {
  client: ApiClient;
  serverUrl: string;
  onSelectItem: (itemId: number | string) => void;
  onPlayItem: (itemId: number | string, resumeMs?: number) => void;
  onSwitchProfile: () => void;
  initialTab?: string;
  refreshKey?: number;
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
  if (!id || !layout) return false;
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
  if (!id || !layout) return false;
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
  initialTab,
  refreshKey,
}: BrowseScreenProps) {
  const [screens, setScreens] = useState<ScreenSummary[]>([]);
  const [activeTab, setActiveTab] = useState<string>(initialTab || 'home');
  const [layout, setLayout] = useState<ScreenLayout | null>(null);
  const [loading, setLoading] = useState(true);

  const { focusedId, setFocusedId, activeTrap } = useFocusContext();

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
    let cancelled = false;
    fetchScreens(client)
      .then((data) => {
        if (!cancelled && data && data.length > 0) {
          setScreens(data);
          if (!initialTab) {
            setActiveTab(data[0].id);
          }
        }
      })
      .catch(() => {
        // Fallback to defaultScreens
      });
    return () => {
      cancelled = true;
    };
  }, [client, initialTab, refreshKey]);

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
          setLoading(false);
          // If no focus is currently set, focus the first focusable element
          if (focusedIdRef.current === null) {
            const firstId = getFirstFocusableId(data);
            if (firstId) {
              setFocusedId(firstId);
            }
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLayout(null);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [client, activeTab, setFocusedId, refreshKey]);

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

  return (
    <div className="w-full h-full flex bg-[#2A0A0A] overflow-hidden">
      {/* Collapsible Left TV Sidebar */}
      <nav
        data-testid="tv-sidebar"
        className={`${
          isSidebarFocused ? 'w-64' : 'w-28'
        } hover:w-64 focus-within:w-64 transition-all duration-200 bg-[#3B1111] border-r border-[rgba(245,229,229,0.08)] p-4 flex flex-col justify-between z-40 group`}
      >
        <div className="flex flex-col gap-4">
          <div className="h-16 flex items-center justify-center">
            <img src="./kadr-logo.png" alt="Kadr" className="h-10 w-auto object-contain" />
          </div>
          {displayScreens.map((screenItem, index) => {
            const IconComponent = getScreenIcon(screenItem.id);
            const isActive = activeTab === screenItem.id;
            return (
              <TVButton
                key={screenItem.id}
                id={`nav-screen-${screenItem.id}`}
                groupId="sidebar"
                order={index + 1}
                variant={isActive ? 'nav-active' : 'nav-inactive'}
                onEnter={() => setActiveTab(screenItem.id)}
                onClick={() => setActiveTab(screenItem.id)}
                className="w-full justify-start px-4"
              >
                <IconComponent className="w-6 h-6 shrink-0" />
                <span
                  className={`${
                    isSidebarFocused ? 'inline' : 'hidden group-hover:inline group-focus-within:inline'
                  } ml-2 text-lg`}
                >
                  {screenItem.title}
                </span>
              </TVButton>
            );
          })}
        </div>

        <TVButton
          id="nav-switch-profile"
          groupId="sidebar"
          order={displayScreens.length + 1}
          variant="nav-inactive"
          onEnter={onSwitchProfile}
          onClick={onSwitchProfile}
          className="w-full justify-start px-4"
        >
          <Users className="w-6 h-6 shrink-0" />
          <span
            className={`${
              isSidebarFocused ? 'inline' : 'hidden group-hover:inline group-focus-within:inline'
            } ml-2 text-lg`}
          >
            Profiles
          </span>
        </TVButton>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 h-full overflow-y-auto p-12 scrollbar-none">
        {loading ? (
          <div className="w-full h-full flex items-center justify-center text-[#5C3C3C] text-2xl">
            Loading {activeTab}...
          </div>
        ) : layout ? (
          <WidgetRenderer
            layout={layout}
            serverUrl={serverUrl}
            onSelectItem={onSelectItem}
            onPlayItem={onPlayItem}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[#D43F15] text-2xl">
            Failed to load screen layout.
          </div>
        )}
      </main>
    </div>
  );
}
