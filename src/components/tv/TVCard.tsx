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
  className?: string;
  'data-testid'?: string;
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
  className = '',
  'data-testid': testId,
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
      id={id}
      data-testid={testId || `card-${id}`}
      tabIndex={-1}
      role="button"
      onClick={onSelect}
      className={`relative flex flex-col rounded-2xl overflow-hidden bg-[#3B1111] border border-[rgba(245,229,229,0.08)] cursor-pointer transition-transform duration-200 shrink-0 w-56 ${
        isFocused ? 'tv-focus-ring' : 'scale-100 opacity-90'
      } ${className}`}
    >
      <div className="w-56 h-80 bg-[#2A0A0A] relative overflow-hidden">
        {imageUrl ? (
          <img src={imageUrl} alt={title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl font-bold text-[#5C3C3C]">
            {title.slice(0, 1)}
          </div>
        )}
        {badge && (
          <span className="absolute top-2 right-2 bg-[#D43F15]/90 text-white text-xs font-bold px-2 py-1 rounded">
            {badge}
          </span>
        )}
        {progressPercent !== undefined && progressPercent > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-black/60">
            <div
              className="h-full bg-[#FF6B00]"
              style={{ width: `${Math.min(100, progressPercent)}%` }}
            />
          </div>
        )}
      </div>
      <div className="p-3 w-56">
        <h4 className="text-base font-semibold truncate text-[#F5E5E5]">{title}</h4>
        {subtitle && <p className="text-xs text-[#5C3C3C] truncate mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}
