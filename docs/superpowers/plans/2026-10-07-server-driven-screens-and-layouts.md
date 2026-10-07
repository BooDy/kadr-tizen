# Server-Driven Screens & Declarative Layouts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the Kadr Tizen TV client to dynamically fetch and respect the server's registered screens (`GET /api/v1/screens`) and declarative AST widget layouts (`hero_banner`, `carousel`, `grid`, and `item_details` matching `kadr-core/src/ast.rs`).

**Architecture:** Dynamic screen listing and AST hydration using `ApiClient`, type-safe models mirroring `kadr-core`, updated widget components with server-provided card view models (`CardViewModel`), and dynamic sidebar navigation.

**Tech Stack:** React 19, TypeScript 5.7, Vite 6, Tailwind CSS 4, Vitest.

## Global Constraints
- Target resolution: 1080p canvas (1920 × 1080) with 10-foot UI scale.
- Tizen compatibility: Chromium 69+ (Tizen 5.5+ / 2020+ TVs).
- Spatial Navigation: All dynamic sidebar screens and widget cards must be navigable via TV D-pad (Arrow keys, Enter, Back).
- AST Fidelity: Must mirror Kadr server's AST schema (`hero_banner`, `carousel`, `grid`, `CardViewModel` with `id: number` and `playback_progress: float 0.0-1.0`).

---

### Task 1: Server AST Schema Alignment & Screen API Client

**Files:**
- Modify: `src/types/ast.ts`
- Modify: `src/api/screens.ts`
- Create: `tests/api/screens.test.ts`

**Interfaces:**
- Produces:
  - `ScreenSummary` (`id: string`, `title: string`).
  - `CardViewModel` (`id: number`, `title`, `subtitle`, `poster_url`, `backdrop_url`, `media_type`, `playback_progress`, `rating`, `release_year`, `badge`, `season`, `episode`).
  - `HeroBannerWidgetNode`, `CarouselWidgetNode`, `GridWidgetNode`, `WidgetNode`, `ScreenLayout`, `WidgetDataResponse`.
  - `fetchScreens(client: ApiClient): Promise<ScreenSummary[]>`.
  - `fetchScreenLayout(client: ApiClient, screenId: string): Promise<ScreenLayout>`.
  - `fetchWidgetData(client: ApiClient, widgetId: string, screenId?: string, offset?: number, limit?: number): Promise<WidgetDataResponse>`.

- [ ] **Step 1: Write test for screen endpoints**

```ts
// tests/api/screens.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiClient } from '../../src/api/client';
import { fetchScreens, fetchScreenLayout, fetchWidgetData } from '../../src/api/screens';

describe('Screens API Client', () => {
  let client: ApiClient;

  beforeEach(() => {
    client = new ApiClient('http://localhost:8492');
    client.setToken('test-token');
    vi.restoreAllMocks();
  });

  it('fetches registered screens list from /api/v1/screens', async () => {
    const mockScreens = [
      { id: 'home', title: 'Home' },
      { id: 'movies', title: 'Movies' },
      { id: 'shows', title: 'TV Shows' },
      { id: 'anime', title: 'Anime Collection' },
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockScreens,
    });

    const screens = await fetchScreens(client);
    expect(screens).toHaveLength(4);
    expect(screens[3].title).toBe('Anime Collection');
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8492/api/v1/screens',
      expect.objectContaining({
        headers: expect.any(Headers),
      })
    );
  });

  it('fetches screen layout from /api/v1/screens/:id', async () => {
    const mockLayout = {
      id: 'home',
      title: 'Home',
      widgets: [
        {
          type: 'hero_banner',
          id: 'home_spotlight',
          data: { id: 101, title: 'Inception', media_type: 'movie' },
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockLayout,
    });

    const layout = await fetchScreenLayout(client, 'home');
    expect(layout.title).toBe('Home');
    expect(layout.widgets[0].type).toBe('hero_banner');
  });

  it('fetches widget data from /api/v1/widgets/:id/data', async () => {
    const mockData = {
      widget_id: 'recently_added',
      items: [{ id: 201, title: 'Severance', media_type: 'series' }],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockData,
    });

    const data = await fetchWidgetData(client, 'recently_added', 'home');
    expect(data.items).toHaveLength(1);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8492/api/v1/widgets/recently_added/data?screen_id=home&offset=0&limit=20',
      expect.anything()
    );
  });
});
```

- [ ] **Step 2: Update `src/types/ast.ts`**

```ts
// src/types/ast.ts
export interface ScreenSummary {
  id: string;
  title: string;
}

export interface CardViewModel {
  id: number;
  title: string;
  subtitle?: string;
  poster_url?: string;
  backdrop_url?: string;
  media_type: string;
  playback_progress?: number; // 0.0 - 1.0 (float)
  rating?: number;
  release_year?: number;
  badge?: string;
  season?: number;
  episode?: number;
}

export interface HeroBannerWidgetNode {
  type: 'hero_banner';
  id: string;
  binding?: {
    macro_type: string | Record<string, unknown>;
    limit?: number;
  };
  data?: CardViewModel;
}

export interface CarouselWidgetNode {
  type: 'carousel';
  id: string;
  title: string;
  binding?: {
    macro_type: string | Record<string, unknown>;
    limit?: number;
  };
  items?: CardViewModel[];
  next_cursor?: string;
}

export interface GridWidgetNode {
  type: 'grid';
  id: string;
  title: string;
  columns: number;
  binding?: {
    macro_type: string | Record<string, unknown>;
    limit?: number;
  };
  items?: CardViewModel[];
  next_cursor?: string;
  total_count?: number;
}

export type WidgetNode =
  | HeroBannerWidgetNode
  | CarouselWidgetNode
  | GridWidgetNode;

export interface ScreenLayout {
  id: string;
  title: string;
  widgets: WidgetNode[];
}

export interface WidgetDataResponse {
  widget_id: string;
  items: CardViewModel[];
  next_cursor?: string;
  total_count?: number;
}
```

- [ ] **Step 3: Implement functions in `src/api/screens.ts`**

```ts
// src/api/screens.ts
import { ApiClient } from './client';
import { ScreenLayout, ScreenSummary, WidgetDataResponse } from '../types/ast';

export async function fetchScreens(client: ApiClient): Promise<ScreenSummary[]> {
  return client.fetch<ScreenSummary[]>('/api/v1/screens');
}

export async function fetchScreenLayout(client: ApiClient, screenId: string): Promise<ScreenLayout> {
  return client.fetch<ScreenLayout>(`/api/v1/screens/${encodeURIComponent(screenId)}`);
}

export async function fetchWidgetData(
  client: ApiClient,
  widgetId: string,
  screenId?: string,
  offset = 0,
  limit = 20
): Promise<WidgetDataResponse> {
  const params = new URLSearchParams();
  if (screenId) params.set('screen_id', screenId);
  params.set('offset', String(offset));
  params.set('limit', String(limit));

  return client.fetch<WidgetDataResponse>(`/api/v1/widgets/${encodeURIComponent(widgetId)}/data?${params.toString()}`);
}
```

- [ ] **Step 4: Run tests and commit**

Run: `npm test tests/api/screens.test.ts`
Expected: PASS

```bash
git add src/types/ast.ts src/api/screens.ts tests/api/screens.test.ts
git commit -m "feat: align AST types with kadr-core and implement dynamic screen and widget endpoints"
```

---

### Task 2: Widget Renderer Alignment (`HeroSpotlight`, `CardCarousel`, `CatalogGrid`, `WidgetRenderer`)

**Files:**
- Modify: `src/components/widgets/HeroSpotlightWidget.tsx`
- Modify: `src/components/widgets/CardCarouselWidget.tsx`
- Modify: `src/components/widgets/CatalogGridWidget.tsx`
- Modify: `src/components/widgets/WidgetRenderer.tsx`
- Modify: `tests/widgets/WidgetRenderer.test.tsx`

**Interfaces:**
- Produces:
  - `HeroSpotlightWidget` consuming `HeroBannerWidgetNode` with `CardViewModel` (poster/backdrop, `playback_progress`, rating, badges, release year).
  - `CardCarouselWidget` consuming `CarouselWidgetNode` with `items: CardViewModel[]`, computing `progressPercent = (item.playback_progress || 0) * 100`, formatting subtitles (`S01E05` for episodes, or release year).
  - `CatalogGridWidget` consuming `GridWidgetNode` with server-defined `columns` (defaulting to 6 for 1080p).
  - `WidgetRenderer` dispatching `hero_banner`, `carousel`, and `grid`.

- [ ] **Step 1: Write test for server AST widget rendering**

```tsx
// tests/widgets/WidgetRenderer.test.tsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FocusProvider } from '../../src/navigation/FocusContext';
import { WidgetRenderer } from '../../src/components/widgets/WidgetRenderer';
import { ScreenLayout } from '../../src/types/ast';

describe('WidgetRenderer with Server AST', () => {
  it('renders hero_banner, carousel, and grid from server AST layout', () => {
    const mockLayout: ScreenLayout = {
      id: 'home',
      title: 'Home',
      widgets: [
        {
          type: 'hero_banner',
          id: 'home_spotlight',
          data: {
            id: 101,
            title: 'Interstellar',
            subtitle: 'Mankind was born on Earth. It was never meant to die here.',
            backdrop_url: '/api/v1/artwork/101/backdrop',
            media_type: 'movie',
            rating: 8.7,
            release_year: 2014,
            badge: '4K',
            playback_progress: 0.65,
          },
        },
        {
          type: 'carousel',
          id: 'continue_watching',
          title: 'Continue Watching',
          items: [
            {
              id: 201,
              title: 'Severance',
              subtitle: 'Good news about hell',
              poster_url: '/api/v1/artwork/201/poster',
              media_type: 'episode',
              season: 1,
              episode: 1,
              playback_progress: 0.45,
            },
          ],
        },
        {
          type: 'grid',
          id: 'all_movies',
          title: 'All Movies',
          columns: 6,
          items: [
            {
              id: 301,
              title: 'The Dark Knight',
              media_type: 'movie',
              release_year: 2008,
            },
          ],
        },
      ],
    };

    render(
      <FocusProvider>
        <WidgetRenderer
          layout={mockLayout}
          serverUrl="http://localhost:8492"
          onSelectItem={vi.fn()}
          onPlayItem={vi.fn()}
        />
      </FocusProvider>
    );

    expect(screen.getByText('Interstellar')).toBeInTheDocument();
    expect(screen.getByText(/Resume/i)).toBeInTheDocument();
    expect(screen.getByText('Continue Watching')).toBeInTheDocument();
    expect(screen.getByText('Severance')).toBeInTheDocument();
    expect(screen.getByText('All Movies')).toBeInTheDocument();
    expect(screen.getByText('The Dark Knight')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Update `HeroSpotlightWidget.tsx`**

```tsx
// src/components/widgets/HeroSpotlightWidget.tsx
import React from 'react';
import { HeroBannerWidgetNode } from '../../types/ast';
import { TVButton } from '../tv/TVButton';
import { Play, Info, Star } from 'lucide-react';

interface HeroSpotlightProps {
  widget: HeroBannerWidgetNode;
  serverUrl: string;
  onPlay: (itemId: number, resumeMs?: number) => void;
  onDetails: (itemId: number) => void;
}

export function HeroSpotlightWidget({ widget, serverUrl, onPlay, onDetails }: HeroSpotlightProps) {
  const item = widget.data;
  if (!item) return null;

  const backdrop = item.backdrop_url
    ? item.backdrop_url.startsWith('http')
      ? item.backdrop_url
      : `${serverUrl.replace(/\/+$/, '')}${item.backdrop_url.startsWith('/') ? '' : '/'}${item.backdrop_url}`
    : undefined;

  const hasResume = (item.playback_progress ?? 0) > 0;
  // Convert float progress to milliseconds placeholder if duration is unknown (or let player seek)
  const resumeMs = hasResume ? Math.round(item.playback_progress! * 100) : 0;

  return (
    <div className="relative w-full h-[520px] rounded-3xl overflow-hidden mb-10 bg-zinc-900 border border-zinc-800">
      {backdrop && (
        <img
          src={backdrop}
          alt={item.title}
          className="absolute inset-0 w-full h-full object-cover opacity-40"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/60 to-transparent p-12 flex flex-col justify-end">
        <div className="flex items-center gap-3 mb-3">
          {item.badge && (
            <span className="px-2.5 py-1 bg-sky-500/20 text-sky-400 border border-sky-500/30 text-xs font-bold rounded">
              {item.badge}
            </span>
          )}
          {item.rating && (
            <span className="flex items-center gap-1 text-amber-400 text-sm font-semibold bg-zinc-900/80 px-2 py-0.5 rounded border border-zinc-700">
              <Star className="w-3.5 h-3.5 fill-current" /> {item.rating.toFixed(1)}
            </span>
          )}
          {item.release_year && (
            <span className="text-zinc-400 text-sm font-medium">{item.release_year}</span>
          )}
        </div>

        <h2 className="text-5xl font-black text-white max-w-3xl mb-4 tracking-tight drop-shadow-md">
          {item.title}
        </h2>
        {item.subtitle && (
          <p className="text-zinc-300 text-lg max-w-2xl line-clamp-3 mb-6 leading-relaxed">
            {item.subtitle}
          </p>
        )}

        <div className="flex gap-4">
          <TVButton
            id={`hero-play-${widget.id}`}
            groupId="hero"
            variant="primary"
            onEnter={() => onPlay(item.id, resumeMs)}
            autoFocus
          >
            <Play className="w-6 h-6 fill-current" />
            {hasResume ? 'Resume' : 'Play'}
          </TVButton>
          <TVButton
            id={`hero-details-${widget.id}`}
            groupId="hero"
            variant="secondary"
            onEnter={() => onDetails(item.id)}
          >
            <Info className="w-6 h-6" /> Details
          </TVButton>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Update `CardCarouselWidget.tsx` and `CatalogGridWidget.tsx`**

```tsx
// src/components/widgets/CardCarouselWidget.tsx
import React from 'react';
import { CarouselWidgetNode } from '../../types/ast';
import { TVCard } from '../tv/TVCard';

interface CardCarouselProps {
  widget: CarouselWidgetNode;
  serverUrl: string;
  onSelectItem: (itemId: number) => void;
  autoFocusFirstItem?: boolean;
}

export function CardCarouselWidget({
  widget,
  serverUrl,
  onSelectItem,
  autoFocusFirstItem = false,
}: CardCarouselProps) {
  const items = widget.items || [];
  if (items.length === 0) return null;
  const cleanServer = serverUrl.replace(/\/+$/, '');

  return (
    <div className="mb-10">
      <h3 className="text-2xl font-bold text-zinc-100 mb-4 px-2">{widget.title}</h3>
      <div className="flex gap-6 overflow-x-auto scrollbar-none py-2 px-2">
        {items.map((item, idx) => {
          const imgUrl = item.poster_url
            ? item.poster_url.startsWith('http')
              ? item.poster_url
              : `${cleanServer}${item.poster_url.startsWith('/') ? '' : '/'}${item.poster_url}`
            : undefined;

          const subtitle = item.season && item.episode
            ? `S${String(item.season).padStart(2, '0')}E${String(item.episode).padStart(2, '0')}`
            : item.subtitle || (item.release_year ? String(item.release_year) : undefined);

          const progressPercent = item.playback_progress
            ? Math.round(item.playback_progress * 100)
            : undefined;

          return (
            <TVCard
              key={item.id}
              id={`card-${widget.id}-${item.id}`}
              groupId={`carousel-${widget.id}`}
              title={item.title}
              subtitle={subtitle}
              imageUrl={imgUrl}
              badge={item.badge}
              progressPercent={progressPercent}
              onSelect={() => onSelectItem(item.id)}
              autoFocus={autoFocusFirstItem && idx === 0}
            />
          );
        })}
      </div>
    </div>
  );
}
```

```tsx
// src/components/widgets/CatalogGridWidget.tsx
import React from 'react';
import { GridWidgetNode } from '../../types/ast';
import { TVCard } from '../tv/TVCard';

interface CatalogGridProps {
  widget: GridWidgetNode;
  serverUrl: string;
  onSelectItem: (itemId: number) => void;
  autoFocusFirstItem?: boolean;
}

export function CatalogGridWidget({
  widget,
  serverUrl,
  onSelectItem,
  autoFocusFirstItem = false,
}: CatalogGridProps) {
  const items = widget.items || [];
  if (items.length === 0) return null;
  const cleanServer = serverUrl.replace(/\/+$/, '');

  return (
    <div className="mb-10">
      <div className="flex justify-between items-baseline mb-4 px-2">
        <h3 className="text-2xl font-bold text-zinc-100">{widget.title}</h3>
        {widget.total_count !== undefined && (
          <span className="text-zinc-500 text-sm font-semibold">
            {items.length} of {widget.total_count} items
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6 py-2 px-2">
        {items.map((item, idx) => {
          const imgUrl = item.poster_url
            ? item.poster_url.startsWith('http')
              ? item.poster_url
              : `${cleanServer}${item.poster_url.startsWith('/') ? '' : '/'}${item.poster_url}`
            : undefined;

          const subtitle = item.season && item.episode
            ? `S${String(item.season).padStart(2, '0')}E${String(item.episode).padStart(2, '0')}`
            : item.subtitle || (item.release_year ? String(item.release_year) : undefined);

          const progressPercent = item.playback_progress
            ? Math.round(item.playback_progress * 100)
            : undefined;

          return (
            <TVCard
              key={item.id}
              id={`grid-${widget.id}-${item.id}`}
              groupId={`grid-${widget.id}`}
              title={item.title}
              subtitle={subtitle}
              imageUrl={imgUrl}
              badge={item.badge}
              progressPercent={progressPercent}
              onSelect={() => onSelectItem(item.id)}
              autoFocus={autoFocusFirstItem && idx === 0}
            />
          );
        })}
      </div>
    </div>
  );
}
```

```tsx
// src/components/widgets/WidgetRenderer.tsx
import React from 'react';
import { ScreenLayout } from '../../types/ast';
import { HeroSpotlightWidget } from './HeroSpotlightWidget';
import { CardCarouselWidget } from './CardCarouselWidget';
import { CatalogGridWidget } from './CatalogGridWidget';

interface WidgetRendererProps {
  layout: ScreenLayout;
  serverUrl: string;
  onSelectItem: (itemId: number) => void;
  onPlayItem: (itemId: number, resumeMs?: number) => void;
}

export function WidgetRenderer({
  layout,
  serverUrl,
  onSelectItem,
  onPlayItem,
}: WidgetRendererProps) {
  const hasHero = layout.widgets.some((w) => w.type === 'hero_banner' && Boolean(w.data));
  const firstWidgetId = layout.widgets[0]?.id;

  return (
    <div className="flex flex-col w-full pb-16">
      {layout.widgets.map((widget) => {
        if (widget.type === 'hero_banner') {
          return (
            <HeroSpotlightWidget
              key={widget.id}
              widget={widget}
              serverUrl={serverUrl}
              onPlay={onPlayItem}
              onDetails={onSelectItem}
            />
          );
        }
        if (widget.type === 'carousel') {
          return (
            <CardCarouselWidget
              key={widget.id}
              widget={widget}
              serverUrl={serverUrl}
              onSelectItem={onSelectItem}
              autoFocusFirstItem={!hasHero && widget.id === firstWidgetId}
            />
          );
        }
        if (widget.type === 'grid') {
          return (
            <CatalogGridWidget
              key={widget.id}
              widget={widget}
              serverUrl={serverUrl}
              onSelectItem={onSelectItem}
              autoFocusFirstItem={!hasHero && widget.id === firstWidgetId}
            />
          );
        }
        return null;
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run tests and commit**

Run: `npm test tests/widgets/WidgetRenderer.test.tsx`
Expected: PASS

```bash
git add src/components/widgets/ tests/widgets/
git commit -m "feat: update widget renderers to support Kadr server AST layout nodes"
```

---

### Task 3: Dynamic Screen Navigation & Sidebar Integration

**Files:**
- Modify: `src/screens/BrowseScreen.tsx`
- Modify: `tests/screens/BrowseScreen.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/api/items.ts`
- Modify: `src/screens/ItemDetailModal.tsx`

**Interfaces:**
- Produces:
  - `BrowseScreen` dynamically loads screens from `fetchScreens(client)`.
  - Sidebar renders dynamic tabs (`nav-screen-${screen.id}`) with server titles and icons.
  - Switches layouts on TV remote Enter key.
  - Bridges D-pad focus between sidebar and content widgets.

- [ ] **Step 1: Write test for dynamic screens in BrowseScreen**

```tsx
// tests/screens/BrowseScreen.test.tsx
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { FocusProvider } from '../../src/navigation/FocusContext';
import { BrowseScreen } from '../../src/screens/BrowseScreen';
import { ApiClient } from '../../src/api/client';
import * as screensApi from '../../src/api/screens';

describe('BrowseScreen with Dynamic Screens', () => {
  let client: ApiClient;

  beforeEach(() => {
    client = new ApiClient('http://localhost:8492');
    client.setToken('test-token');
    vi.restoreAllMocks();
  });

  it('loads dynamic screens from server and renders custom library tabs in sidebar', async () => {
    const mockScreens = [
      { id: 'home', title: 'Home' },
      { id: 'movies', title: 'Movies' },
      { id: 'shows', title: 'TV Shows' },
      { id: 'anime', title: 'Anime' },
    ];

    const mockHomeLayout = {
      id: 'home',
      title: 'Home',
      widgets: [],
    };

    vi.spyOn(screensApi, 'fetchScreens').mockResolvedValue(mockScreens);
    vi.spyOn(screensApi, 'fetchScreenLayout').mockResolvedValue(mockHomeLayout);

    render(
      <FocusProvider>
        <BrowseScreen
          client={client}
          serverUrl="http://localhost:8492"
          onSelectItem={vi.fn()}
          onPlayItem={vi.fn()}
          onSwitchProfile={vi.fn()}
        />
      </FocusProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Anime')).toBeInTheDocument();
    });
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Movies')).toBeInTheDocument();
    expect(screen.getByText('TV Shows')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Update `BrowseScreen.tsx` with dynamic screens**

Fetch `fetchScreens(client)` on mount, store in state `screens: ScreenSummary[]`, default `activeTab` to `screens[0]?.id || 'home'`, map icons (Home for home, Film for movies, Tv for shows, Layers for custom), and update spatial navigation bridges to handle dynamic screen tab IDs.

- [ ] **Step 3: Update `ItemDetailModal.tsx`, `src/api/items.ts`, and `src/App.tsx` for numeric item IDs**

Ensure `itemId: number` is supported smoothly across item details, streaming, and player screens.

- [ ] **Step 4: Run tests and commit**

Run: `npm test`
Expected: PASS

```bash
git add src/screens/BrowseScreen.tsx tests/screens/BrowseScreen.test.tsx src/App.tsx src/api/items.ts src/screens/ItemDetailModal.tsx
git commit -m "feat: dynamically load and navigate server screens in TV sidebar"
```

---

### Task 4: Full System Verification & WGT Packaging

**Files:**
- Test: Full build, tests, and packaging

- [ ] **Step 1: Run comprehensive tests and build**

Run: `npm run build && npm test && npm run package:wgt`
Expected: All tests pass, build succeeds, and `kadr.wgt` is updated.

- [ ] **Step 2: Commit any final adjustments**

```bash
git commit -am "chore: verify server-driven screens and layouts pipeline and package wgt"
```
