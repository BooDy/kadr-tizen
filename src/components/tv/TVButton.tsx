import type { ButtonHTMLAttributes, MouseEvent } from 'react';
import { useFocusable } from '../../navigation/useFocusable';

export interface TVButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  id: string;
  groupId: string;
  onEnter?: () => void;
  onBack?: () => void;
  autoFocus?: boolean;
  order?: number;
  variant?: 'primary' | 'secondary' | 'danger' | 'nav-active' | 'nav-inactive';
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
  disabled,
  ...props
}: TVButtonProps) {
  const { ref, isFocused } = useFocusable<HTMLButtonElement>({
    id,
    groupId,
    onEnter: () => {
      if (disabled) return;
      if (onEnter) {
        onEnter();
      } else if (onClick) {
        onClick({} as MouseEvent<HTMLButtonElement>);
      }
    },
    onBack,
    autoFocus,
    order,
  });

  const baseStyle =
    'px-8 py-4 rounded-xl font-semibold text-xl tracking-wide transition-all duration-150 outline-none flex items-center justify-center gap-3 cursor-pointer select-none';
  const variantStyles = {
    primary: isFocused
      ? 'bg-[#FF6B00] text-white tv-focus-ring'
      : 'bg-[#D43F15] text-[#F5E5E5]',
    secondary: isFocused
      ? 'bg-[#4A1616] text-white tv-focus-ring'
      : 'bg-[#3B1111] text-[#F5E5E5] border border-[rgba(245,229,229,0.08)]',
    danger: isFocused
      ? 'bg-[#D43F15] text-white tv-focus-ring'
      : 'bg-[#3B1111] text-[#D43F15] border border-[#D43F15]/30',
    'nav-active': isFocused
      ? 'bg-[#FF6B00] text-white tv-focus-ring'
      : 'bg-[#FF6B00]/15 text-[#F5E5E5]',
    'nav-inactive': isFocused
      ? 'bg-[#FF6B00] text-white tv-focus-ring'
      : 'text-[#5C3C3C] bg-transparent',
  };

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (onClick) {
      onClick(e);
    } else {
      onEnter?.();
    }
  };

  return (
    <button
      ref={ref}
      id={id}
      tabIndex={-1}
      disabled={disabled}
      className={`${baseStyle} ${variantStyles[variant]} ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
      onClick={handleClick}
      {...props}
    >
      {children}
    </button>
  );
}
