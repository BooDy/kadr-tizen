import type { ButtonHTMLAttributes, MouseEvent } from 'react';
import { useFocusable } from '../../navigation/useFocusable';

export interface TVButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  id: string;
  groupId: string;
  onEnter?: () => void;
  onBack?: () => void;
  autoFocus?: boolean;
  order?: number;
  variant?: 'primary' | 'secondary' | 'danger';
}

export function TVButton({
  id,
  groupId,
  onEnter,
  onBack,
  autoFocus,
  order,
  variant = 'primary',
  children,
  className = '',
  onClick,
  ...props
}: TVButtonProps) {
  const { ref, isFocused } = useFocusable<HTMLButtonElement>({
    id,
    groupId,
    onEnter: () => {
      onEnter?.();
      onClick?.({} as MouseEvent<HTMLButtonElement>);
    },
    onBack,
    autoFocus,
    order,
  });

  const baseStyle =
    'px-8 py-4 rounded-xl font-semibold text-xl tracking-wide transition-all duration-150 outline-none flex items-center justify-center gap-3 cursor-pointer select-none';
  const variantStyles = {
    primary: isFocused
      ? 'bg-sky-500 text-white tv-focus-ring'
      : 'bg-zinc-800 text-zinc-100 hover:bg-zinc-700',
    secondary: isFocused
      ? 'bg-zinc-700 text-white tv-focus-ring'
      : 'bg-zinc-900 text-zinc-300 border border-zinc-700',
    danger: isFocused
      ? 'bg-rose-600 text-white tv-focus-ring'
      : 'bg-zinc-900 text-rose-400 border border-rose-900/50',
  };

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    if (onClick) {
      onClick(e);
    } else {
      onEnter?.();
    }
  };

  return (
    <button
      ref={ref}
      tabIndex={-1}
      className={`${baseStyle} ${variantStyles[variant]} ${className}`}
      onClick={handleClick}
      {...props}
    >
      {children}
    </button>
  );
}
