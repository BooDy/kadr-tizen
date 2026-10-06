import { ScreenLayout } from '../../types/ast';
import { HeroSpotlightWidget } from './HeroSpotlightWidget';
import { CardCarouselWidget } from './CardCarouselWidget';
import { CatalogGridWidget } from './CatalogGridWidget';

export interface WidgetRendererProps {
  layout: ScreenLayout;
  serverUrl: string;
  onSelectItem: (itemId: string) => void;
  onPlayItem: (itemId: string, resumeMs?: number) => void;
}

export function WidgetRenderer({
  layout,
  serverUrl,
  onSelectItem,
  onPlayItem,
}: WidgetRendererProps) {
  const hasHero = layout.widgets.some((w) => w.type === 'hero_spotlight');
  const firstWidgetId = layout.widgets[0]?.id;

  return (
    <div className="flex flex-col w-full pb-16">
      {layout.widgets.map((widget) => {
        if (widget.type === 'hero_spotlight') {
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
        if (widget.type === 'card_carousel') {
          return (
            <CardCarouselWidget
              key={widget.id}
              widget={widget}
              serverUrl={serverUrl}
              autoFocusFirstItem={!hasHero && widget.id === firstWidgetId}
              onSelectItem={onSelectItem}
            />
          );
        }
        if (widget.type === 'catalog_grid') {
          return (
            <CatalogGridWidget
              key={widget.id}
              widget={widget}
              serverUrl={serverUrl}
              autoFocusFirstItem={!hasHero && widget.id === firstWidgetId}
              onSelectItem={onSelectItem}
            />
          );
        }
        return null;
      })}
    </div>
  );
}
