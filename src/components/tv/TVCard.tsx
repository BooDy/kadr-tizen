import { useFocusable } from '../../navigation/useFocusable';

export interface TVCardProps {
  id: string;
  groupId: string;
  title: string;
  subtitle?: string;
  imageUrl?: string;
  badge?: string;
  progressPercent?: number;
  onSelect?: () => void;
  autoFocus?: boolean;
  order?: number;
}

export function TVCard({
  id,
  groupId,
  title,
  subtitle,
  imageUrl,
  badge,
  progressPercent,
  onSelect,
  autoFocus,
  order,
}: TVCardProps) {
  const { ref, isFocused } = useFocusable<HTMLDivElement>({
    id,
    groupId,
    onEnter: onSelect,
    autoFocus,
    order,
  });

  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="button"
      onClick={onSelect}
      className={`relative flex flex-col rounded-2xl overflow-hidden bg-zinc-900 cursor-pointer transition-transform duration-200 ${
        isFocused ? 'tv-focus-ring' : 'scale-100 opacity-90'
      }`}
    >
      <div className="w-56 h-80 bg-zinc-800 relative overflow-hidden">
        {imageUrl ? (
          <img src={imageUrl} alt={title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl font-bold text-zinc-600">
            {title.slice(0, 1)}
          </div>
        )}
        {badge && (
          <span className="absolute top-2 right-2 bg-sky-500/90 text-white text-xs font-bold px-2 py-1 rounded">
            {badge}
          </span>
        )}
        {progressPercent !== undefined && progressPercent > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-black/60">
            <div
              className="h-full bg-sky-400"
              style={{ width: `${Math.min(100, progressPercent)}%` }}
            />
          </div>
        )}
      </div>
      <div className="p-3 w-56">
        <h4 className="text-base font-semibold truncate text-zinc-100">{title}</h4>
        {subtitle && <p className="text-xs text-zinc-400 truncate mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}
