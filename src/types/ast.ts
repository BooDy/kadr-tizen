export interface ASTBadge {
  text: string;
  variant?: 'primary' | 'accent' | 'muted';
}

export interface ASTHeroWidget {
  id: string;
  type: 'hero_spotlight';
  item_id: string;
  title: string;
  backdrop_url?: string;
  synopsis?: string;
  badges?: string[];
  resume_position_ms?: number;
}

export interface ASTCarouselItem {
  id: string;
  item_id: string;
  title: string;
  subtitle?: string;
  poster_url?: string;
  progress_percent?: number;
  badge?: string;
  resume_position_ms?: number;
}

export interface ASTCarouselWidget {
  id: string;
  type: 'card_carousel';
  title: string;
  items: ASTCarouselItem[];
}

export interface ASTGridWidget {
  id: string;
  type: 'catalog_grid';
  title: string;
  items: ASTCarouselItem[];
}

export type ASTWidget = ASTHeroWidget | ASTCarouselWidget | ASTGridWidget;

export interface ScreenLayout {
  screen_id: string;
  title: string;
  widgets: ASTWidget[];
}
