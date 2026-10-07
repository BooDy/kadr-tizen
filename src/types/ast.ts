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
