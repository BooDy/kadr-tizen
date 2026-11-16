import type { SubtitleTrack } from '../types/kadr';
import { normalizeSubtitleLanguageCode } from './subtitles';

export type SubtitleFontSize = 'small' | 'medium' | 'large' | 'xlarge';
export type SubtitleColor = 'white' | 'yellow' | 'cyan' | 'green';
export type SubtitlePlacement = 'top' | 'raised' | 'bottom';

export interface SubtitleSettings {
  fontSize: SubtitleFontSize;
  color: SubtitleColor;
  placement: SubtitlePlacement;
}

export const DEFAULT_SUBTITLE_SETTINGS: SubtitleSettings = {
  fontSize: 'medium',
  color: 'white',
  placement: 'bottom',
};

export const SUBTITLE_STORAGE_KEY = 'kadr_subtitle_settings';

/** Pixel sizes on the 1920x1080 TV canvas. */
export const FONT_SIZE_PX: Record<SubtitleFontSize, number> = {
  small: 34,
  medium: 42,
  large: 52,
  xlarge: 64,
};

export const COLOR_HEX: Record<SubtitleColor, string> = {
  white: '#FFFFFF',
  yellow: '#FFE14D',
  cyan: '#5CE1FF',
  green: '#7CFF7C',
};

export const FONT_SIZE_OPTIONS: Array<{ value: SubtitleFontSize; label: string }> = [
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
  { value: 'xlarge', label: 'X-Large' },
];

export const COLOR_OPTIONS: Array<{ value: SubtitleColor; label: string }> = [
  { value: 'white', label: 'White' },
  { value: 'yellow', label: 'Yellow' },
  { value: 'cyan', label: 'Cyan' },
  { value: 'green', label: 'Green' },
];

export const PLACEMENT_OPTIONS: Array<{ value: SubtitlePlacement; label: string }> = [
  { value: 'top', label: 'Top' },
  { value: 'raised', label: 'Raised' },
  { value: 'bottom', label: 'Bottom' },
];

export function loadSubtitleSettings(): SubtitleSettings {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(SUBTITLE_STORAGE_KEY) : null;
    if (!raw) return { ...DEFAULT_SUBTITLE_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<SubtitleSettings>;
    return {
      fontSize: parsed.fontSize && parsed.fontSize in FONT_SIZE_PX ? parsed.fontSize : DEFAULT_SUBTITLE_SETTINGS.fontSize,
      color: parsed.color && parsed.color in COLOR_HEX ? parsed.color : DEFAULT_SUBTITLE_SETTINGS.color,
      placement:
        parsed.placement === 'top' || parsed.placement === 'raised' || parsed.placement === 'bottom'
          ? parsed.placement
          : DEFAULT_SUBTITLE_SETTINGS.placement,
    };
  } catch {
    return { ...DEFAULT_SUBTITLE_SETTINGS };
  }
}

export function saveSubtitleSettings(settings: SubtitleSettings): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SUBTITLE_STORAGE_KEY, JSON.stringify(settings));
    }
  } catch {
    // Storage unavailable: settings simply won't persist
  }
}

/* ------------------------------------------------------------------ */
/* Per-track timing offset (subtitle delay)                            */
/* ------------------------------------------------------------------ */

export const SUBTITLE_DELAY_STORAGE_KEY = 'kadr_subtitle_delays';
export const MAX_SUBTITLE_DELAY_MS = 300000;

export function clampSubtitleDelay(ms: number): number {
  if (!Number.isFinite(ms)) return 0;
  const rounded = Math.round(ms / 100) * 100;
  return Math.max(-MAX_SUBTITLE_DELAY_MS, Math.min(MAX_SUBTITLE_DELAY_MS, rounded));
}

/** "+1.5s", "-0.2s" or "0.0s". Positive = subtitles appear later. */
export function formatSubtitleDelay(ms: number): string {
  const seconds = ms / 1000;
  const text = `${Math.abs(seconds).toFixed(1)}s`;
  if (ms > 0) return `+${text}`;
  if (ms < 0) return `-${text}`;
  return text;
}

/** Timing offsets are stored per subtitle track id because each file can be off by a different amount. */
export function loadSubtitleDelays(): Record<string, number> {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(SUBTITLE_DELAY_STORAGE_KEY) : null;
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const result: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed || {})) {
      if (typeof value === 'number' && Number.isFinite(value) && value !== 0) {
        result[key] = clampSubtitleDelay(value);
      }
    }
    return result;
  } catch {
    return {};
  }
}

export function saveSubtitleDelays(delays: Record<string, number>): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SUBTITLE_DELAY_STORAGE_KEY, JSON.stringify(delays));
    }
  } catch {
    // Storage unavailable: offsets simply won't persist
  }
}

/* ------------------------------------------------------------------ */
/* Subtitle Preference (auto / off / language)                         */
/* ------------------------------------------------------------------ */

export type SubtitlePreference =
  | { mode: 'auto' }
  | { mode: 'off' }
  | { mode: 'language'; language: string; preferForced?: boolean };

export const SUBTITLE_PREFERENCE_STORAGE_KEY = 'kadr_subtitle_preference_v1';

export function loadSubtitlePreference(): SubtitlePreference {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(SUBTITLE_PREFERENCE_STORAGE_KEY) : null;
    if (!raw) return { mode: 'auto' };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { mode: 'auto' };
    if (parsed.mode === 'off') return { mode: 'off' };
    if (parsed.mode === 'language' && typeof parsed.language === 'string' && parsed.language.trim().length > 0) {
      return {
        mode: 'language',
        language: parsed.language.trim(),
        preferForced: Boolean(parsed.preferForced),
      };
    }
    return { mode: 'auto' };
  } catch {
    return { mode: 'auto' };
  }
}

export function saveSubtitlePreference(pref: SubtitlePreference): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SUBTITLE_PREFERENCE_STORAGE_KEY, JSON.stringify(pref));
    }
  } catch {
    // Storage unavailable: preference simply won't persist
  }
}

function getTrackPreferenceScore(track: SubtitleTrack, preferForced: boolean): number {
  let score = 0;
  // 1. Forced match preference
  const wantForced = Boolean(preferForced);
  if (Boolean(track.is_forced) === wantForced) {
    score += 100;
  }
  // 2. Non-SDH / non-signs preference
  const title = (track.title || '').toLowerCase();
  const isSdhOrSigns = /sdh|hearing impaired|\bcc\b|signs/i.test(title);
  if (!isSdhOrSigns) {
    score += 20;
  }
  // 3. Default track preference
  if (track.is_default) {
    score += 10;
  }
  return score;
}

export function pickInitialSubtitleTrack(
  tracks: SubtitleTrack[],
  pref: SubtitlePreference
): number | null {
  if (!tracks || tracks.length === 0) {
    return null;
  }

  if (pref.mode === 'off') {
    return null;
  }

  if (pref.mode === 'auto') {
    return tracks.find((t) => t.is_default)?.id ?? null;
  }

  if (pref.mode === 'language') {
    const targetLang = normalizeSubtitleLanguageCode(pref.language);
    const matching = tracks.filter((t) => {
      const tLang = normalizeSubtitleLanguageCode(t.language);
      return tLang === targetLang || (t.language || '').toLowerCase() === pref.language.toLowerCase();
    });

    if (matching.length === 0) {
      // Fallback cleanly to container default track, or null if none
      return tracks.find((t) => t.is_default)?.id ?? null;
    }

    if (matching.length === 1) {
      return matching[0].id;
    }

    const wantForced = Boolean(pref.preferForced);
    // Stable sort by score descending
    const ranked = [...matching].sort((a, b) => {
      return getTrackPreferenceScore(b, wantForced) - getTrackPreferenceScore(a, wantForced);
    });

    return ranked[0].id;
  }

  return tracks.find((t) => t.is_default)?.id ?? null;
}
