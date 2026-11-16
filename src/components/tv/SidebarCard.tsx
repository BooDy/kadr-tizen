import { memo, type CSSProperties, type ReactNode } from 'react';
import { TVButton } from './TVButton';

export interface SidebarCardProps {
  id: string;
  order: number;
  /** Currently selected library / screen. */
  selected: boolean;
  /** D-pad focus is on this card. */
  focused: boolean;
  /** Sidebar is expanded (focus is inside the sidebar). */
  expanded: boolean;
  title: string;
  subtitle: string;
  /** Small mono path chip shown on the right (e.g. "/movies"). */
  chip: string;
  /** Collapsed-rail tile content (monogram letter or lock icon). */
  tile: ReactNode;
  /** Optional status badge next to the title (e.g. "PIN LOCKED"). */
  badge?: string;
  /** Dashed outline used for PIN-protected libraries. */
  dashed?: boolean;
  onSelect: () => void;
}

const FONT_MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

/**
 * Text-first navigation card matching ui/sidebar.html.
 *
 * Every spacing/colour value is applied as an inline style (physical
 * properties only, no flex `gap`, no logical padding) so that it renders the
 * same on Tizen 5.5 / Chromium 69 as it does in the HTML template.
 */
export const SidebarCard = memo(function SidebarCard({
  id,
  order,
  selected,
  focused,
  expanded,
  title,
  subtitle,
  chip,
  tile,
  badge,
  dashed = false,
  onSelect,
}: SidebarCardProps) {
  let background = dashed ? 'rgba(255,255,255,0.015)' : 'rgba(255,255,255,0.03)';
  let border = dashed ? '1px dashed rgba(255,255,255,0.12)' : '1px solid transparent';
  let color = dashed ? '#a1a1aa' : '#d4d4d8';
  let boxShadow = 'none';
  let transform = 'none';

  if (selected) {
    background = 'rgba(255,122,24,0.12)';
    border = '1px solid rgba(255,122,24,0.35)';
    color = '#F5E5E5';
  }
  if (focused) {
    background = 'linear-gradient(to right, #ff7a18, #ff5e1e, #f59e0b)';
    border = '2px solid #FFB800';
    color = '#ffffff';
    boxShadow = '0 4px 12px rgba(0,0,0,0.5)';
    transform = expanded ? 'translateX(6px)' : 'scale(1.04)';
  }

  const style: CSSProperties = {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: expanded ? 'space-between' : 'center',
    width: '100%',
    flexShrink: 0,
    marginBottom: '10px',
    padding: expanded ? '16px 20px' : '8px',
    borderRadius: '12px',
    textAlign: 'left',
    background,
    border,
    color,
    boxShadow,
    transform,
  };

  const chipStyle: CSSProperties = {
    fontFamily: FONT_MONO,
    fontSize: '12px',
    padding: '2px 8px',
    borderRadius: '4px',
    maxWidth: '120px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    background: focused ? 'rgba(0,0,0,0.30)' : 'rgba(39,39,42,0.8)',
    color: focused ? '#ffffff' : '#a1a1aa',
    border: focused ? '1px solid rgba(255,255,255,0.20)' : '1px solid rgba(255,255,255,0.05)',
  };

  return (
    <TVButton
      id={id}
      groupId="sidebar"
      order={order}
      variant={selected ? 'nav-active' : 'nav-inactive'}
      onEnter={onSelect}
      onClick={onSelect}
      className="relative w-full shrink-0"
      aria-label={title}
      style={style}
    >
      {/* Collapsed rail: compact tile */}
      <div
        data-testid={`${id}-tile`}
        style={{
          display: expanded ? 'none' : 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '48px',
          height: '48px',
          borderRadius: '12px',
          fontSize: '22px',
          fontWeight: 800,
          background: focused
            ? 'rgba(0,0,0,0.25)'
            : selected
            ? 'rgba(255,122,24,0.18)'
            : 'rgba(255,255,255,0.05)',
          color: focused ? '#ffffff' : selected ? '#ff9f2e' : '#d4d4d8',
        }}
      >
        {tile}
      </div>

      {/* Expanded card */}
      <div
        data-testid={`${id}-card`}
        style={{
          display: expanded ? 'flex' : 'none',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          minWidth: 0,
        }}
      >
        {focused && (
          <div
            style={{
              position: 'absolute',
              left: '-10px',
              top: '50%',
              marginTop: '-14px',
              width: '6px',
              height: '28px',
              borderRadius: '9999px',
              background: '#ffffff',
            }}
          />
        )}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            flex: 1,
            minWidth: 0,
            marginRight: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', maxWidth: '100%' }}>
            <span
              className="inline text-lg font-bold tracking-wide truncate"
              style={{ minWidth: 0, fontSize: '18px', lineHeight: '24px' }}
            >
              {title}
            </span>
            {selected && !badge && (
              <span
                style={{
                  flexShrink: 0,
                  marginLeft: '8px',
                  fontFamily: FONT_MONO,
                  fontSize: '10px',
                  textTransform: 'uppercase',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  background: 'rgba(0,0,0,0.40)',
                  color: '#fed7aa',
                  border: '1px solid rgba(255,255,255,0.20)',
                }}
              >
                Active
              </span>
            )}
            {badge && (
              <span
                style={{
                  flexShrink: 0,
                  marginLeft: '8px',
                  fontFamily: FONT_MONO,
                  fontSize: '10px',
                  textTransform: 'uppercase',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  background: 'rgba(245,158,11,0.12)',
                  color: '#fbbf24',
                  border: '1px solid rgba(245,158,11,0.30)',
                }}
              >
                {badge}
              </span>
            )}
          </div>
          <span
            style={{
              fontFamily: FONT_MONO,
              fontSize: '12px',
              marginTop: '2px',
              maxWidth: '100%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              color: focused ? 'rgba(255,237,213,0.9)' : '#71717a',
            }}
          >
            {subtitle}
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0 }}>
          <span style={chipStyle}>{chip}</span>
          {focused && (
            <span
              style={{
                fontFamily: FONT_MONO,
                fontSize: '10px',
                marginTop: '4px',
                color: '#fed7aa',
              }}
            >
              [OK] Open
            </span>
          )}
        </div>
      </div>
    </TVButton>
  );
});
