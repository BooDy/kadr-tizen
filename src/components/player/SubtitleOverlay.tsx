import type { CSSProperties } from 'react';
import {
  COLOR_HEX,
  FONT_SIZE_PX,
  SubtitleSettings,
} from '../../player/subtitleSettings';

export interface SubtitleOverlayProps {
  text: string;
  settings: SubtitleSettings;
  /** The OSD controls are on screen: lift bottom-anchored subtitles above them. */
  osdVisible?: boolean;
  /** 1 = full 1920x1080 canvas; smaller values render a miniature preview. */
  scale?: number;
}

/** Vertical offset (px on a 1080p canvas) between the screen edge and the subtitle block. */
export function getSubtitleOffsetPx(
  placement: SubtitleSettings['placement'],
  osdVisible: boolean
): number {
  switch (placement) {
    case 'top':
      return 64;
    case 'raised':
      return osdVisible ? 300 : 200;
    case 'bottom':
    default:
      return osdVisible ? 250 : 64;
  }
}

/**
 * Renders the active subtitle cue in the web layer so it works with both the HTML5 and the
 * Tizen AVPlay driver. Uses only physical, widely supported CSS (Chromium 69).
 */
export function SubtitleOverlay({
  text,
  settings,
  osdVisible = false,
  scale = 1,
}: SubtitleOverlayProps) {
  if (!text) return null;

  const offset = getSubtitleOffsetPx(settings.placement, osdVisible) * scale;
  const fontSize = FONT_SIZE_PX[settings.fontSize] * scale;

  const wrapperStyle: CSSProperties = {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    pointerEvents: 'none',
    zIndex: 20,
    ...(settings.placement === 'top' ? { top: `${offset}px` } : { bottom: `${offset}px` }),
  };

  const textStyle: CSSProperties = {
    display: 'inline-block',
    maxWidth: '80%',
    padding: `${6 * scale}px ${18 * scale}px`,
    borderRadius: `${8 * scale}px`,
    background: 'rgba(0, 0, 0, 0.45)',
    color: COLOR_HEX[settings.color],
    fontSize: `${fontSize}px`,
    lineHeight: 1.3,
    fontWeight: 600,
    whiteSpace: 'pre-line',
    unicodeBidi: 'plaintext',
    textShadow: `0 0 ${4 * scale}px #000, ${2 * scale}px ${2 * scale}px ${3 * scale}px #000, -${2 * scale}px -${2 * scale}px ${3 * scale}px #000`,
  };

  return (
    <div data-testid="subtitle-overlay" style={wrapperStyle}>
      <span data-testid="subtitle-overlay-text" dir="auto" style={textStyle}>
        {text}
      </span>
    </div>
  );
}
