import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  AUDIO_PREFERENCE_STORAGE_KEY,
  loadAudioPreference,
  saveAudioPreference,
  pickInitialAudioTrackIndex,
  formatAudioChannelLayout,
  formatAudioTrackLabel,
} from '../../src/player/audioPreferences';
import { getPlaybackUrl } from '../../src/player/compatibility';
import { ApiClient } from '../../src/api/client';
import { fetchItemAudioTracks } from '../../src/api/audio';
import type { AudioStreamInfo } from '../../src/types/kadr';

describe('audioPreferences', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to auto and round-trips AudioPreference with malformed JSON fallback', () => {
    expect(loadAudioPreference()).toEqual({ mode: 'auto' });

    saveAudioPreference({ mode: 'language', language: 'ja', preferCommentary: false });
    expect(localStorage.getItem(AUDIO_PREFERENCE_STORAGE_KEY)).toBe(
      JSON.stringify({ mode: 'language', language: 'ja', preferCommentary: false })
    );
    expect(loadAudioPreference()).toEqual({
      mode: 'language',
      language: 'ja',
      preferCommentary: false,
    });

    saveAudioPreference({ mode: 'auto' });
    expect(loadAudioPreference()).toEqual({ mode: 'auto' });

    localStorage.setItem(AUDIO_PREFERENCE_STORAGE_KEY, '{not-valid-json');
    expect(loadAudioPreference()).toEqual({ mode: 'auto' });

    localStorage.setItem(
      AUDIO_PREFERENCE_STORAGE_KEY,
      JSON.stringify({ mode: 'language', language: '   ' })
    );
    expect(loadAudioPreference()).toEqual({ mode: 'auto' });
  });

  it('picks default track in auto mode and matches ISO-639 language preferring main dialogue over commentary', () => {
    expect(pickInitialAudioTrackIndex([], { mode: 'auto' })).toBe(0);

    const tracks: AudioStreamInfo[] = [
      {
        audio_index: 0,
        stream_index: 1,
        codec: 'aac',
        channels: 2,
        language: 'eng',
        title: 'English',
        is_default: false,
        is_commentary: false,
      },
      {
        audio_index: 1,
        stream_index: 2,
        codec: 'eac3',
        channels: 6,
        language: 'eng',
        title: 'English (Default)',
        is_default: true,
        is_commentary: false,
      },
      {
        audio_index: 2,
        stream_index: 3,
        codec: 'aac',
        channels: 2,
        language: 'jpn',
        title: 'Japanese Commentary',
        is_default: false,
        is_commentary: true,
      },
      {
        audio_index: 3,
        stream_index: 4,
        codec: 'eac3',
        channels: 6,
        language: 'jpn',
        title: 'Japanese',
        is_default: false,
        is_commentary: false,
      },
    ];

    expect(pickInitialAudioTrackIndex(tracks, { mode: 'auto' })).toBe(1);

    // No default -> falls back to first track
    const noDefault = tracks.map((t) => ({ ...t, is_default: false }));
    expect(pickInitialAudioTrackIndex(noDefault, { mode: 'auto' })).toBe(0);

    // 'ja' normalizes to 'jpn', picking main dialogue (3) over commentary (2)
    expect(
      pickInitialAudioTrackIndex(tracks, { mode: 'language', language: 'ja', preferCommentary: false })
    ).toBe(3);

    // preferCommentary: true prefers commentary track (2)
    expect(
      pickInitialAudioTrackIndex(tracks, { mode: 'language', language: 'ja', preferCommentary: true })
    ).toBe(2);

    // Missing preferred language falls back to is_default track (1)
    expect(
      pickInitialAudioTrackIndex(tracks, { mode: 'language', language: 'fra', preferCommentary: false })
    ).toBe(1);

    // Language region tag 'en-US' matches 'eng' and breaks ties by is_default (1) over (0)
    expect(
      pickInitialAudioTrackIndex(tracks, { mode: 'language', language: 'en-US', preferCommentary: false })
    ).toBe(1);

    // Without is_default, prefers higher channel count (6ch > 2ch) among main dialogue tracks
    const tieTracks: AudioStreamInfo[] = [
      { audio_index: 0, stream_index: 1, codec: 'aac', channels: 2, language: 'jpn', is_default: false, is_commentary: false },
      { audio_index: 1, stream_index: 2, codec: 'eac3', channels: 6, language: 'jpn', is_default: false, is_commentary: false },
    ];
    expect(
      pickInitialAudioTrackIndex(tieTracks, { mode: 'language', language: 'jpn', preferCommentary: false })
    ).toBe(1);
  });

  it('formats channel layouts and audio track labels cleanly', () => {
    expect(formatAudioChannelLayout(1)).toBe('Mono');
    expect(formatAudioChannelLayout(2)).toBe('2.0');
    expect(formatAudioChannelLayout(6)).toBe('5.1');
    expect(formatAudioChannelLayout(8)).toBe('7.1');
    expect(formatAudioChannelLayout(5)).toBe('5ch');
    expect(formatAudioChannelLayout(undefined)).toBe('');
    expect(formatAudioChannelLayout(null)).toBe('');

    expect(
      formatAudioTrackLabel({
        audio_index: 0,
        stream_index: 1,
        codec: 'eac3',
        channels: 6,
        language: 'ja',
        is_default: true,
        is_commentary: false,
      })
    ).toEqual({
      primaryLabel: 'Japanese',
      codecBadge: '5.1 EAC3',
      languageBadge: 'JPN',
      isDefault: true,
      isCommentary: false,
    });

    expect(
      formatAudioTrackLabel({
        audio_index: 1,
        stream_index: 2,
        codec: 'aac',
        channels: 2,
        language: 'eng',
        title: "Director's Commentary",
        is_default: false,
        is_commentary: true,
      })
    ).toEqual({
      primaryLabel: "Director's Commentary",
      codecBadge: '2.0 AAC',
      languageBadge: 'ENG',
      isDefault: false,
      isCommentary: true,
    });

    expect(
      formatAudioTrackLabel({
        audio_index: 0,
        stream_index: 1,
        codec: 'aac',
        language: 'und',
      })
    ).toEqual({
      primaryLabel: 'Track 1',
      codecBadge: 'AAC',
      languageBadge: '',
      isDefault: false,
      isCommentary: false,
    });
  });

  it('includes audio_track query param on HLS URLs only when audioTrackIndex > 0', () => {
    const serverUrl = 'http://192.168.1.10:8492';

    const hlsDefault = getPlaybackUrl({
      serverUrl,
      itemId: 42,
      forceHls: true,
    });
    expect(hlsDefault.isHls).toBe(true);
    expect(hlsDefault.url).not.toContain('audio_track=');

    const hlsZero = getPlaybackUrl({
      serverUrl,
      itemId: 42,
      forceHls: true,
      audioTrackIndex: 0,
    });
    expect(hlsZero.isHls).toBe(true);
    expect(hlsZero.url).not.toContain('audio_track=');

    const hlsTrackOne = getPlaybackUrl({
      serverUrl,
      itemId: 42,
      forceHls: true,
      audioTrackIndex: 1,
    });
    expect(hlsTrackOne.isHls).toBe(true);
    expect(hlsTrackOne.url).toContain('audio_track=1');

    const directTrackOne = getPlaybackUrl({
      serverUrl,
      itemId: 42,
      videoCodec: 'h264',
      audioCodec: 'aac',
      container: 'mp4',
      audioTrackIndex: 1,
    });
    expect(directTrackOne.isHls).toBe(false);
    expect(directTrackOne.url).not.toContain('audio_track=');
  });

  it('fetches item audio tracks from GET /api/v1/items/{id}/audio-tracks', async () => {
    const client = new ApiClient('http://127.0.0.1:8492');
    const mockTracks: AudioStreamInfo[] = [
      {
        audio_index: 0,
        stream_index: 1,
        codec: 'aac',
        channels: 2,
        language: 'jpn',
        is_default: true,
        is_commentary: false,
      },
      {
        audio_index: 1,
        stream_index: 2,
        codec: 'eac3',
        channels: 6,
        language: 'eng',
        is_default: false,
        is_commentary: false,
      },
    ];
    const fetchSpy = vi.spyOn(client, 'fetch').mockResolvedValue(mockTracks);

    const tracks = await fetchItemAudioTracks(client, 42);
    expect(fetchSpy).toHaveBeenCalledWith('/api/v1/items/42/audio-tracks');
    expect(tracks).toEqual(mockTracks);
  });
});
