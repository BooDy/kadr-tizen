import { memo, type CSSProperties, type ReactNode } from 'react';
import { TVButton } from './TVButton';
import { useIsFocused } from '../../navigation/FocusContext';

export interface PillButtonProps {
  id: string;
  groupId: string;
  order?: number;
  /** primary = ember gradient CTA, secondary = dark slate pill, current = ember-tinted "you are here" pill */
  variant?: 'primary' | 'secondary' | 'current';
  /** sm is used for dense rows such as breadcrumbs */
  size?: 'md' | 'sm';
  icon?: ReactNode;
  /** Space after the button (flex `gap` is unsupported on Chromium 69). Defaults to 16px. */
  marginRight?: string;
  ariaLabel?: string;
  onSelect: () => void;
  children: ReactNode;
}

/**
 * Inline action button matching the item-detail buttons (ui/medial-details.html).
 * All spacing/colour is inline so it renders identically on Tizen 5.5 / Chromium 69.
 */
export const PillButton = memo(function PillButton({
  id,
  groupId,
  order,
  variant = 'secondary',
  size = 'md',
  icon,
  marginRight = '16px',
  ariaLabel,
  onSelect,
  children,
}: PillButtonProps) {
  const focused = useIsFocused(id);
  const sm = size === 'sm';

  const style: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    padding: sm ? '10px 18px' : '16px 22px',
    marginRight,
    borderRadius: '12px',
    fontSize: sm ? '15px' : '17px',
    fontWeight: 700,
    letterSpacing: '0.025em',
    whiteSpace: 'nowrap',
    transform: focused ? 'scale(1.04)' : 'scale(1)',
  };

  if (variant === 'primary') {
    Object.assign(style, {
      padding: sm ? '10px 20px' : '16px 24px',
      backgroundImage: 'linear-gradient(to right, #ff5e1e, #ff7a18)',
      backgroundColor: '#ff7a18',
      color: '#ffffff',
      border: focused ? '2px solid #ffb871' : '2px solid transparent',
      boxShadow: focused
        ? '0 0 0 2px #ffb871, 0 4px 12px rgba(0, 0, 0, 0.5)'
        : '0 4px 12px rgba(0, 0, 0, 0.4)',
    });
  } else if (variant === 'current') {
    Object.assign(style, {
      backgroundColor: focused ? '#38393f' : 'rgba(255, 122, 24, 0.14)',
      color: focused ? '#ffffff' : '#ffb871',
      border: focused ? '2px solid #ff7a18' : '1px solid rgba(255, 122, 24, 0.5)',
      boxShadow: focused ? '0 0 0 2px #FFB800' : 'none',
    });
  } else {
    Object.assign(style, {
      backgroundColor: focused ? '#38393f' : '#292a2f',
      color: focused ? '#ffffff' : '#e3e1e9',
      border: focused ? '2px solid #ff7a18' : '1px solid rgba(255, 122, 24, 0.18)',
      boxShadow: focused ? '0 0 0 2px #FFB800' : 'none',
    });
  }

  return (
    <TVButton
      id={id}
      groupId={groupId}
      order={order}
      variant={variant === 'primary' ? 'primary' : 'secondary'}
      aria-label={ariaLabel}
      onClick={onSelect}
      onEnter={onSelect}
      style={style}
    >
      {icon && (
        <span
          style={{
            display: 'inline-flex',
            marginRight: sm ? '8px' : '10px',
            color: variant === 'primary' ? '#ffffff' : '#ffb871',
          }}
        >
          {icon}
        </span>
      )}
      <span>{children}</span>
    </TVButton>
  );
});
