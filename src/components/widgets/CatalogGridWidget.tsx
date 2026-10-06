import { ASTGridWidget } from '../../types/ast';
import { TVCard } from '../tv/TVCard';

export interface CatalogGridProps {
  widget: ASTGridWidget;
  serverUrl: string;
  onSelectItem: (itemId: string) => void;
  autoFocusFirstItem?: boolean;
}

export function CatalogGridWidget({
  widget,
  serverUrl,
  onSelectItem,
  autoFocusFirstItem,
}: CatalogGridProps) {
  const cleanServer = serverUrl.replace(/\/+$/, '');

  return (
    <div className="mb-10">
      <h3 className="text-2xl font-bold text-zinc-100 mb-4 px-2">{widget.title}</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6 py-2 px-2">
        {widget.items.map((item, index) => {
          const imageUrl = item.poster_url
            ? item.poster_url.startsWith('http://') || item.poster_url.startsWith('https://')
              ? item.poster_url
              : `${cleanServer}${item.poster_url.startsWith('/') ? item.poster_url : `/${item.poster_url}`}`
            : undefined;

          return (
            <TVCard
              key={item.id}
              id={`grid-card-${item.id}`}
              groupId={`grid-${widget.id}`}
              order={index}
              title={item.title}
              subtitle={item.subtitle}
              imageUrl={imageUrl}
              badge={item.badge}
              progressPercent={item.progress_percent}
              autoFocus={autoFocusFirstItem && index === 0}
              onSelect={() => onSelectItem(item.item_id)}
            />
          );
        })}
      </div>
    </div>
  );
}
