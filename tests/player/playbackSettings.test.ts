import { describe, it, expect, beforeEach } from 'vitest';
import { APP_VERSION } from '../../src/version';
import {
  PLAYBACK_SETTINGS_STORAGE_KEY,
  DEFAULT_PLAYBACK_SETTINGS,
  HLS_QUALITY_OPTIONS,
  PLAYER_ENGINE_OPTIONS,
  loadPlaybackSettings,
  savePlaybackSettings,
  resetAllPlaybackPreferences,
  type HlsQualityCap,
} from '../../src/player/playbackSettings';
import {
  AUDIO_PREFERENCE_STORAGE_KEY,
  AUDIOBOOK_SPEED_STORAGE_KEY,
} from '../../src/player/audioPreferences';
import {
  SUBTITLE_STORAGE_KEY,
  SUBTITLE_DELAY_STORAGE_KEY,
  SUBTITLE_PREFERENCE_STORAGE_KEY,
} from '../../src/player/subtitleSettings';

describe('APP_VERSION & playbackSettings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('exports APP_VERSION equal to 1.0.0', () => {
    expect(APP_VERSION).toBe('1.0.0');
  });

  it('exposes default playback settings and option lists for quality and player engine', () => {
    expect(PLAYBACK_SETTINGS_STORAGE_KEY).toBe('kadr_playback_settings_v1');
    expect(DEFAULT_PLAYBACK_SETTINGS).toEqual({
      hlsMaxHeight: 1080,
      preferredPlayerEngine: 'auto',
    });

    expect(HLS_QUALITY_OPTIONS.map((o) => o.value)).toEqual([0, 2160, 1080, 720, 480]);
    for (const opt of HLS_QUALITY_OPTIONS) {
      expect(opt.label.trim().length).toBeGreaterThan(0);
      expect(opt.description.trim().length).toBeGreaterThan(0);
    }

    expect(PLAYER_ENGINE_OPTIONS.map((o) => o.value)).toEqual(['auto', 'html5']);
    for (const opt of PLAYER_ENGINE_OPTIONS) {
      expect(opt.label.trim().length).toBeGreaterThan(0);
      expect(opt.description.trim().length).toBeGreaterThan(0);
    }
  });

  it('defaults to 1080p/auto and round-trips every valid HlsQualityCap and engine choice', () => {
    expect(loadPlaybackSettings()).toEqual({
      hlsMaxHeight: 1080,
      preferredPlayerEngine: 'auto',
    });

    const validCaps: HlsQualityCap[] = [0, 2160, 1080, 720, 480];
    for (const hlsMaxHeight of validCaps) {
      savePlaybackSettings({ hlsMaxHeight, preferredPlayerEngine: 'html5' });
      expect(loadPlaybackSettings()).toEqual({
        hlsMaxHeight,
        preferredPlayerEngine: 'html5',
      });
    }

    savePlaybackSettings({ hlsMaxHeight: 0, preferredPlayerEngine: 'auto' });
    expect(localStorage.getItem(PLAYBACK_SETTINGS_STORAGE_KEY)).toBe(
      JSON.stringify({ hlsMaxHeight: 0, preferredPlayerEngine: 'auto' })
    );
    expect(loadPlaybackSettings()).toEqual({
      hlsMaxHeight: 0,
      preferredPlayerEngine: 'auto',
    });
  });

  it('falls back cleanly on corrupt JSON, non-object JSON, or invalid field values', () => {
    localStorage.setItem(PLAYBACK_SETTINGS_STORAGE_KEY, '{not-valid-json');
    expect(loadPlaybackSettings()).toEqual(DEFAULT_PLAYBACK_SETTINGS);

    localStorage.setItem(PLAYBACK_SETTINGS_STORAGE_KEY, 'null');
    expect(loadPlaybackSettings()).toEqual(DEFAULT_PLAYBACK_SETTINGS);

    localStorage.setItem(PLAYBACK_SETTINGS_STORAGE_KEY, '["unexpected"]');
    expect(loadPlaybackSettings()).toEqual(DEFAULT_PLAYBACK_SETTINGS);

    localStorage.setItem(
      PLAYBACK_SETTINGS_STORAGE_KEY,
      JSON.stringify({ hlsMaxHeight: 1440, preferredPlayerEngine: 'vlc' })
    );
    expect(loadPlaybackSettings()).toEqual(DEFAULT_PLAYBACK_SETTINGS);

    localStorage.setItem(
      PLAYBACK_SETTINGS_STORAGE_KEY,
      JSON.stringify({ hlsMaxHeight: '720', preferredPlayerEngine: 'html5' })
    );
    expect(loadPlaybackSettings()).toEqual({
      hlsMaxHeight: 1080,
      preferredPlayerEngine: 'html5',
    });

    localStorage.setItem(
      PLAYBACK_SETTINGS_STORAGE_KEY,
      JSON.stringify({ hlsMaxHeight: 480, preferredPlayerEngine: 'invalid' })
    );
    expect(loadPlaybackSettings()).toEqual({
      hlsMaxHeight: 480,
      preferredPlayerEngine: 'auto',
    });
  });

  it('resetAllPlaybackPreferences clears all 6 playback, audio, subtitle, and audiobook keys', () => {
    const keysToClear = [
      PLAYBACK_SETTINGS_STORAGE_KEY,
      AUDIO_PREFERENCE_STORAGE_KEY,
      SUBTITLE_PREFERENCE_STORAGE_KEY,
      SUBTITLE_STORAGE_KEY,
      SUBTITLE_DELAY_STORAGE_KEY,
      AUDIOBOOK_SPEED_STORAGE_KEY,
    ];
    expect(keysToClear).toEqual([
      'kadr_playback_settings_v1',
      'kadr_audio_preference_v1',
      'kadr_subtitle_preference_v1',
      'kadr_subtitle_settings',
      'kadr_subtitle_delays',
      'kadr_audiobook_speed_v1',
    ]);

    for (const key of keysToClear) {
      localStorage.setItem(key, 'populated');
    }
    localStorage.setItem('kadr_unrelated_token', 'keep-me');

    resetAllPlaybackPreferences();

    for (const key of keysToClear) {
      expect(localStorage.getItem(key)).toBeNull();
    }
    expect(localStorage.getItem('kadr_unrelated_token')).toBe('keep-me');
    expect(loadPlaybackSettings()).toEqual(DEFAULT_PLAYBACK_SETTINGS);
  });
});
