import type { AudioStreamInfo } from '../types/kadr';
import { getSubtitleLanguageName, normalizeSubtitleLanguageCode } from './subtitles';

export type AudioPreference =
  | { mode: 'auto' }
  | { mode: 'language'; language: string; preferCommentary?: boolean };

export const AUDIO_PREFERENCE_STORAGE_KEY = 'kadr_audio_preference_v1';

export function loadAudioPreference(): AudioPreference {
  try {
    const raw =
      typeof localStorage !== 'undefined'
        ? localStorage.getItem(AUDIO_PREFERENCE_STORAGE_KEY)
        : null;
    if (!raw) return { mode: 'auto' };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { mode: 'auto' };
    if (
      parsed.mode === 'language' &&
      typeof parsed.language === 'string' &&
      parsed.language.trim().length > 0
    ) {
      return {
        mode: 'language',
        language: parsed.language.trim(),
        preferCommentary: Boolean(parsed.preferCommentary),
      };
    }
    return { mode: 'auto' };
  } catch {
    return { mode: 'auto' };
  }
}

export function saveAudioPreference(pref: AudioPreference): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(AUDIO_PREFERENCE_STORAGE_KEY, JSON.stringify(pref));
    }
  } catch {
    // Storage unavailable: preference simply won't persist
  }
}

function getAudioTrackPreferenceScore(
  track: AudioStreamInfo,
  preferCommentary: boolean
): number {
  let score = 0;
  if (Boolean(track.is_commentary) === preferCommentary) {
    score += 100;
  }
  if (track.is_default) {
    score += 20;
  }
  const channels =
    typeof track.channels === 'number' && Number.isFinite(track.channels) && track.channels > 0
      ? track.channels
      : 2;
  score += Math.min(10, channels);
  return score;
}

export function pickInitialAudioTrackIndex(
  tracks: AudioStreamInfo[],
  pref: AudioPreference
): number {
  if (!tracks || tracks.length === 0) {
    return 0;
  }

  const fallbackTrack = tracks.find((t) => t.is_default) ?? tracks[0];

  if (pref.mode !== 'language') {
    return fallbackTrack.audio_index;
  }

  const trimmedPrefLang = pref.language.trim();
  const targetLang = normalizeSubtitleLanguageCode(trimmedPrefLang);
  if (targetLang === 'und') {
    return fallbackTrack.audio_index;
  }

  const matching = tracks.filter((t) => {
    const tLang = normalizeSubtitleLanguageCode(t.language);
    return (
      tLang === targetLang ||
      (t.language || '').trim().toLowerCase() === trimmedPrefLang.toLowerCase()
    );
  });

  if (matching.length === 0) {
    return fallbackTrack.audio_index;
  }

  if (matching.length === 1) {
    return matching[0].audio_index;
  }

  const wantCommentary = Boolean(pref.preferCommentary);
  const ranked = [...matching].sort((a, b) => {
    const scoreDiff =
      getAudioTrackPreferenceScore(b, wantCommentary) -
      getAudioTrackPreferenceScore(a, wantCommentary);
    if (scoreDiff !== 0) return scoreDiff;
    return a.audio_index - b.audio_index;
  });

  return ranked[0].audio_index;
}

export function formatAudioChannelLayout(channels?: number | null): string {
  if (typeof channels !== 'number' || !Number.isFinite(channels) || channels <= 0) {
    return '';
  }
  const ch = Math.round(channels);
  switch (ch) {
    case 1:
      return 'Mono';
    case 2:
      return '2.0';
    case 6:
      return '5.1';
    case 8:
      return '7.1';
    default:
      return `${ch}ch`;
  }
}

export function formatAudioTrackLabel(track: AudioStreamInfo): {
  primaryLabel: string;
  codecBadge: string;
  languageBadge: string;
  isDefault: boolean;
  isCommentary: boolean;
} {
  const normLang = normalizeSubtitleLanguageCode(track.language);
  const langName = getSubtitleLanguageName(normLang);
  const languageBadge = normLang !== 'und' ? normLang.toUpperCase() : '';
  const primaryLabel =
    track.title?.trim() ||
    langName ||
    (languageBadge || `Track ${track.audio_index + 1}`);
  const layout = formatAudioChannelLayout(track.channels);
  const codec = (track.codec || '').trim().toUpperCase();
  const codecBadge = [layout, codec].filter(Boolean).join(' ');

  return {
    primaryLabel,
    codecBadge,
    languageBadge,
    isDefault: Boolean(track.is_default),
    isCommentary: Boolean(track.is_commentary),
  };
}
