import { useState, useEffect, useRef } from 'react';
import { ScreenLayout } from '../types/ast';
import { ApiClient } from '../api/client';
import { fetchScreenLayout } from '../api/screens';
import { WidgetRenderer } from '../components/widgets/WidgetRenderer';
import { TVButton } from '../components/tv/TVButton';
import { Home, Film, Tv, Users } from 'lucide-react';
import { useFocusContext } from '../navigation/FocusContext';
import { TVKeys } from '../navigation/keys';

export interface BrowseScreenProps {
  client: ApiClient;
  serverUrl: string;
  onSelectItem: (itemId: string) => void;
  onPlayItem: (itemId: string, resumeMs?: number) => void;
  onSwitchProfile: () => void;
  initialTab?: 'home' | 'movies' | 'shows';
}

function getFirstFocusableId(layout: ScreenLayout): string | null {
  for (const widget of layout.widgets) {
    if (widget.type === 'hero_spotlight') {
      return `hero-play-${widget.id}`;
    }
    if (widget.type === 'card_carousel' && widget.items.length > 0) {
      return `card-${widget.items[0].id}`;
    }
    if (widget.type === 'catalog_grid' && widget.items.length > 0) {
      return `grid-card-${widget.items[0].id}`;
    }
  }
  return null;
}

function isLeftmostContentNode(id: string | null, layout: ScreenLayout | null): boolean {
  if (!id || !layout) return false;
  for (const widget of layout.widgets) {
    if (widget.type === 'hero_spotlight') {
      if (id === `hero-play-${widget.id}`) return true;
    } else if (widget.type === 'card_carousel') {
      if (widget.items.length > 0 && id === `card-${widget.items[0].id}`) return true;
    } else if (widget.type === 'catalog_grid') {
      const idx = widget.items.findIndex((item) => `grid-card-${item.id}` === id);
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
        // Fallback for 1080p fixed canvas with 6 columns (xl:grid-cols-6)
        return idx % 6 === 0;
      }
    }
  }
  return false;
}

function isValidContentNode(id: string | null, layout: ScreenLayout | null): boolean {
  if (!id || !layout) return false;
  for (const widget of layout.widgets) {
    if (widget.type === 'hero_spotlight') {
      if (id === `hero-play-${widget.id}` || id === `hero-details-${widget.id}`) return true;
    } else if (widget.type === 'card_carousel') {
      if (widget.items.some((item) => `card-${item.id}` === id)) return true;
    } else if (widget.type === 'catalog_grid') {
      if (widget.items.some((item) => `grid-card-${item.id}` === id)) return true;
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
  initialTab = 'home',
}: BrowseScreenProps) {
  const [activeTab, setActiveTab] = useState<'home' | 'movies' | 'shows'>(initialTab);
  const [layout, setLayout] = useState<ScreenLayout | null>(null);
  const [loading, setLoading] = useState(true);

  const { focusedId, setFocusedId, activeTrap } = useFocusContext();

  const sidebarIds = ['nav-home', 'nav-movies', 'nav-shows', 'nav-switch-profile'];
  const isSidebarFocused = sidebarIds.includes(focusedId ?? '');

  const focusedIdRef = useRef(focusedId);
  focusedIdRef.current = focusedId;

  const isSidebarFocusedRef = useRef(isSidebarFocused);
  isSidebarFocusedRef.current = isSidebarFocused;

  const lastContentFocusedIdRef = useRef<string | null>(null);

  useEffect(() => {
    lastContentFocusedIdRef.current = null;
  }, [activeTab]);

  useEffect(() => {
    if (focusedId && !sidebarIds.includes(focusedId)) {
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
  }, [client, activeTab, setFocusedId]);

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
          setFocusedId(`nav-${activeTab}`);
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
          setFocusedId(`nav-${activeTab}`);
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

  return (
    <div className="w-full h-full flex bg-zinc-950 overflow-hidden">
      {/* Collapsible Left TV Sidebar */}
      <nav
        data-testid="tv-sidebar"
        className={`${
          isSidebarFocused ? 'w-64' : 'w-28'
        } hover:w-64 focus-within:w-64 transition-all duration-200 bg-zinc-900/90 border-r border-zinc-800/80 p-4 flex flex-col justify-between z-40 group`}
      >
        <div className="flex flex-col gap-4">
          <div className="h-16 flex items-center justify-center font-black text-2xl text-sky-400">
            KADR
          </div>
          <TVButton
            id="nav-home"
            groupId="sidebar"
            order={1}
            variant={activeTab === 'home' ? 'primary' : 'secondary'}
            onEnter={() => setActiveTab('home')}
            className="w-full justify-start px-4"
          >
            <Home className="w-6 h-6 shrink-0" />
            <span
              className={`${
                isSidebarFocused ? 'inline' : 'hidden group-hover:inline group-focus-within:inline'
              } ml-2 text-lg`}
            >
              Home
            </span>
          </TVButton>
          <TVButton
            id="nav-movies"
            groupId="sidebar"
            order={2}
            variant={activeTab === 'movies' ? 'primary' : 'secondary'}
            onEnter={() => setActiveTab('movies')}
            className="w-full justify-start px-4"
          >
            <Film className="w-6 h-6 shrink-0" />
            <span
              className={`${
                isSidebarFocused ? 'inline' : 'hidden group-hover:inline group-focus-within:inline'
              } ml-2 text-lg`}
            >
              Movies
            </span>
          </TVButton>
          <TVButton
            id="nav-shows"
            groupId="sidebar"
            order={3}
            variant={activeTab === 'shows' ? 'primary' : 'secondary'}
            onEnter={() => setActiveTab('shows')}
            className="w-full justify-start px-4"
          >
            <Tv className="w-6 h-6 shrink-0" />
            <span
              className={`${
                isSidebarFocused ? 'inline' : 'hidden group-hover:inline group-focus-within:inline'
              } ml-2 text-lg`}
            >
              Shows
            </span>
          </TVButton>
        </div>

        <TVButton
          id="nav-switch-profile"
          groupId="sidebar"
          order={4}
          variant="secondary"
          onEnter={onSwitchProfile}
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
          <div className="w-full h-full flex items-center justify-center text-zinc-500 text-2xl">
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
          <div className="w-full h-full flex items-center justify-center text-rose-400 text-2xl">
            Failed to load screen layout.
          </div>
        )}
      </main>
    </div>
  );
}
