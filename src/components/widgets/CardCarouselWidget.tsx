import { ASTCarouselWidget } from '../../types/ast';
import { TVCard } from '../tv/TVCard';

export interface CardCarouselProps {
  widget: ASTCarouselWidget;
  serverUrl: string;
  onSelectItem: (itemId: string) => void;
}

export function CardCarouselWidget({ widget, serverUrl, onSelectItem }: CardCarouselProps) {
  const cleanServer = serverUrl.replace(/\/+$/, '');

  return (
    <div className="mb-10">
      <h3 className="text-2xl font-bold text-zinc-100 mb-4 px-2">{widget.title}</h3>
      <div className="flex gap-6 overflow-x-auto scrollbar-none py-2 px-2">
        {widget.items.map((item, index) => {
          const imageUrl = item.poster_url
            ? item.poster_url.startsWith('http://') || item.poster_url.startsWith('https://')
              ? item.poster_url
              : `${cleanServer}${item.poster_url.startsWith('/') ? item.poster_url : `/${item.poster_url}`}`
            : undefined;

          return (
            <TVCard
              key={item.id}
              id={`card-${item.id}`}
              groupId={`carousel-${widget.id}`}
              order={index}
              title={item.title}
              subtitle={item.subtitle}
              imageUrl={imageUrl}
              badge={item.badge}
              progressPercent={item.progress_percent}
              onSelect={() => onSelectItem(item.item_id)}
            />
          );
        })}
      </div>
    </div>
  );
}
