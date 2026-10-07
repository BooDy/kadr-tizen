import { ScreenLayout } from '../../types/ast';
import { HeroSpotlightWidget } from './HeroSpotlightWidget';
import { CardCarouselWidget } from './CardCarouselWidget';
import { CatalogGridWidget } from './CatalogGridWidget';

export interface WidgetRendererProps {
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
  const firstRenderableWidgetId = layout.widgets.find((w) => {
    if (w.type === 'hero_banner') return Boolean(w.data);
    if (w.type === 'carousel') return (w.items?.length ?? 0) > 0;
    if (w.type === 'grid') return (w.items?.length ?? 0) > 0;
    return false;
  })?.id;

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
              autoFocusFirstItem={!hasHero && widget.id === firstRenderableWidgetId}
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
              autoFocusFirstItem={!hasHero && widget.id === firstRenderableWidgetId}
            />
          );
        }
        return null;
      })}
    </div>
  );
}
