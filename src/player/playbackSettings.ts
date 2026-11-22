import {
  AUDIO_PREFERENCE_STORAGE_KEY,
  AUDIOBOOK_SPEED_STORAGE_KEY,
} from './audioPreferences';
import {
  SUBTITLE_DELAY_STORAGE_KEY,
  SUBTITLE_PREFERENCE_STORAGE_KEY,
  SUBTITLE_STORAGE_KEY,
} from './subtitleSettings';

export const PLAYBACK_SETTINGS_STORAGE_KEY = 'kadr_playback_settings_v1';

export type HlsQualityCap = 0 | 2160 | 1080 | 720 | 480;
export type PreferredPlayerEngine = 'auto' | 'html5';

export interface PlaybackSettings {
  hlsMaxHeight: HlsQualityCap;
  preferredPlayerEngine: PreferredPlayerEngine;
}

export const DEFAULT_PLAYBACK_SETTINGS: PlaybackSettings = {
  hlsMaxHeight: 1080,
  preferredPlayerEngine: 'auto',
};

export const HLS_QUALITY_OPTIONS: ReadonlyArray<{
  value: HlsQualityCap;
  label: string;
  description: string;
}> = [
  {
    value: 0,
    label: 'Original',
    description: 'Uncapped source resolution when transcoding',
  },
  {
    value: 2160,
    label: '4K (2160p)',
    description: 'Ultra HD up to 2160p',
  },
  {
    value: 1080,
    label: '1080p (Recommended)',
    description: 'Full HD capped at 1080p for smooth TV playback',
  },
  {
    value: 720,
    label: '720p',
    description: 'Bandwidth saver capped at 720p',
  },
  {
    value: 480,
    label: '480p',
    description: 'Low bandwidth capped at 480p',
  },
];

export const PLAYER_ENGINE_OPTIONS: ReadonlyArray<{
  value: PreferredPlayerEngine;
  label: string;
  description: string;
}> = [
  {
    value: 'auto',
    label: 'Auto (Samsung AVPlay)',
    description: 'Uses native Samsung TV AVPlay hardware decoding when available',
  },
  {
    value: 'html5',
    label: 'HTML5 Video',
    description: 'Forces HTML5 video element and hls.js playback engine',
  },
];

const VALID_HLS_QUALITY_CAPS: ReadonlySet<number> = new Set([0, 2160, 1080, 720, 480]);

function isValidHlsQualityCap(value: unknown): value is HlsQualityCap {
  return typeof value === 'number' && Number.isInteger(value) && VALID_HLS_QUALITY_CAPS.has(value);
}

function isValidPlayerEngine(value: unknown): value is PreferredPlayerEngine {
  return value === 'auto' || value === 'html5';
}

/** Load persisted playback quality and engine settings, falling back to safe defaults. */
export function loadPlaybackSettings(): PlaybackSettings {
  try {
    const raw =
      typeof localStorage !== 'undefined'
        ? localStorage.getItem(PLAYBACK_SETTINGS_STORAGE_KEY)
        : null;
    if (!raw) return { ...DEFAULT_PLAYBACK_SETTINGS };
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ...DEFAULT_PLAYBACK_SETTINGS };
    }
    const record = parsed as Record<string, unknown>;
    return {
      hlsMaxHeight: isValidHlsQualityCap(record.hlsMaxHeight)
        ? record.hlsMaxHeight
        : DEFAULT_PLAYBACK_SETTINGS.hlsMaxHeight,
      preferredPlayerEngine: isValidPlayerEngine(record.preferredPlayerEngine)
        ? record.preferredPlayerEngine
        : DEFAULT_PLAYBACK_SETTINGS.preferredPlayerEngine,
    };
  } catch {
    return { ...DEFAULT_PLAYBACK_SETTINGS };
  }
}

/** Persist playback quality and engine settings to localStorage. */
export function savePlaybackSettings(next: PlaybackSettings): void {
  const sanitized: PlaybackSettings = {
    hlsMaxHeight: isValidHlsQualityCap(next.hlsMaxHeight)
      ? next.hlsMaxHeight
      : DEFAULT_PLAYBACK_SETTINGS.hlsMaxHeight,
    preferredPlayerEngine: isValidPlayerEngine(next.preferredPlayerEngine)
      ? next.preferredPlayerEngine
      : DEFAULT_PLAYBACK_SETTINGS.preferredPlayerEngine,
  };
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(PLAYBACK_SETTINGS_STORAGE_KEY, JSON.stringify(sanitized));
    }
  } catch {
    // Storage unavailable: settings simply won't persist
  }
}

const ALL_PLAYBACK_PREFERENCE_KEYS = [
  PLAYBACK_SETTINGS_STORAGE_KEY,
  AUDIO_PREFERENCE_STORAGE_KEY,
  SUBTITLE_PREFERENCE_STORAGE_KEY,
  SUBTITLE_STORAGE_KEY,
  SUBTITLE_DELAY_STORAGE_KEY,
  AUDIOBOOK_SPEED_STORAGE_KEY,
] as const;

/** Clear all playback, audio, subtitle, delay, and audiobook speed preferences from localStorage. */
export function resetAllPlaybackPreferences(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    for (const key of ALL_PLAYBACK_PREFERENCE_KEYS) {
      localStorage.removeItem(key);
    }
  } catch {
    // Storage unavailable
  }
}
