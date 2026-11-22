import { CarouselWidgetNode } from '../../types/ast';
import { TVCard } from '../tv/TVCard';

export interface CardCarouselProps {
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
      <h3 className="text-2xl font-bold text-[#F5E5E5] mb-4 px-2">{widget.title}</h3>
      <div className="flex overflow-x-auto scrollbar-none py-2 px-2">
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
            <div key={item.id} className="shrink-0 mr-6 last:mr-0">
              <TVCard
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
