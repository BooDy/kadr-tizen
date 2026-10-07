import { GridWidgetNode } from '../../types/ast';
import { TVCard } from '../tv/TVCard';

export interface CatalogGridProps {
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
