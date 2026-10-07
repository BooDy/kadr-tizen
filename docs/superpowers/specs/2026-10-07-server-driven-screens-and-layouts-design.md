# Server-Driven Screens & Declarative Layouts — Design Specification

- **Date**: 2026-10-07
- **Target OS**: Samsung Tizen OS (Smart TVs)
- **Status**: Approved

---

## 1. Overview & Goals

The Kadr media server architecture defines declarative, server-driven screen layouts (`crates/kadr-core/src/ast.rs`). Screens are registered in the server's `LayoutRegistry` (e.g., `home`, `movies`, `shows`, and custom user-created libraries or TOML/JSON overrides) and served through:
- `GET /api/v1/screens` — list all available screens (`ScreenSummary[]`).
- `GET /api/v1/screens/{screen_id}` — fetch a hydrated screen layout (`ScreenLayout`).
- `GET /api/v1/widgets/{widget_id}/data?screen_id=...` — fetch paginated or on-demand widget items (`WidgetDataResponse`).

The goal is to update the Kadr Tizen client to dynamically respect the server's screen registry and exact AST layout definitions, rather than relying on hardcoded static tabs and a synthetic schema.

---

## 2. Server AST Schema Alignment

### 2.1 Domain Models (`src/types/ast.ts`)
Directly mirror `crates/kadr-core/src/ast.rs`:

```ts
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

---

## 3. Dynamic Screen Navigation in Sidebar

### 3.1 Screen Listing API
- Add `fetchScreens(client: ApiClient): Promise<ScreenSummary[]>` in `src/api/screens.ts` querying `GET /api/v1/screens`.
- Add `fetchWidgetData(client: ApiClient, widgetId: string, screenId?: string, offset?: number, limit?: number): Promise<WidgetDataResponse>` in `src/api/screens.ts`.

### 3.2 Dynamic TV Sidebar in `BrowseScreen.tsx`
- On mount, query `fetchScreens(client)` to obtain the dynamic list of server screens.
- Render each screen in the collapsible left TV sidebar:
  - Button ID: `nav-screen-${screen.id}`
  - Icon: Map known IDs (`home`, `movies`, `shows`) to Lucide icons (`Home`, `Film`, `Tv`), and use `Layers` / `Film` as clean fallbacks for custom library screens (e.g. `Anime`, `Documentaries`).
  - Active state: Highlight the currently selected screen.
  - Remote Navigation: D-pad `ArrowUp`/`ArrowDown` navigates across dynamic screens; `Enter` switches the active screen; `ArrowRight` enters the active screen content.
  - Retain `Switch Profile` at the bottom of the sidebar.

---

## 4. Widget Rendering Engine (`WidgetRenderer.tsx`)

### 4.1 Hero Banner (`HeroSpotlightWidget.tsx`)
- Accepts `widget.data: CardViewModel`.
- If unhydrated (`widget.data` is undefined), calls `fetchWidgetData(widget.id, screenId)` to fetch the spotlight card item.
- Displays:
  - Full backdrop artwork (`backdrop_url`).
  - Badges: rating badge (e.g. `★ 8.5`), resolution badge (e.g. `4K`), release year, and custom badge (`widget.data.badge`).
  - Subtitle or episode notation (`S01E03: Episode Title`).
  - Action buttons: "Play" / "Resume" (if `playback_progress > 0`) and "Details".

### 4.2 Card Carousel (`CardCarouselWidget.tsx`)
- Accepts `widget.items: CardViewModel[]`.
- Displays the server's exact `title` (e.g. "Continue Watching", "Recently Added", "Action & Adventure").
- If unhydrated, fetches items via `fetchWidgetData`.
- Computes progress bar using `item.playback_progress * 100`.
- Formats subtitle: includes episode tag (`S01E03`) when present, or release year.
- Preserves horizontal D-pad auto-scroll centering.

### 4.3 Catalog Grid (`CatalogGridWidget.tsx`)
- Accepts `widget.items: CardViewModel[]` and `widget.columns: number`.
- Dynamically sets grid columns based on `widget.columns` (defaulting to 6 for 1080p TV).
- Displays total count if provided by server (`${items.length} of ${widget.total_count} items`).

---

## 5. Verification & Testing

- Unit tests in `tests/api/screens.test.ts` for `fetchScreens` and `fetchWidgetData`.
- Unit tests in `tests/widgets/WidgetRenderer.test.tsx` verifying `hero_banner`, `carousel`, and `grid` nodes with server AST payloads.
- Integration tests in `tests/screens/BrowseScreen.test.tsx` verifying dynamic screen listing, switching to custom library screens, and TV D-pad navigation across dynamic sidebar items.
- Full regression test run (`npm test && npm run build && npm run package:wgt`).
