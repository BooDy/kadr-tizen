import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AUDIO_MEDIA_TYPES,
  isAudioMediaType,
  checkAudioCompatibility,
  getPlaybackUrl,
} from '../../src/player/compatibility';
import { Html5PlayerDriver } from '../../src/player/html5-driver';
import { TizenAvplayDriver } from '../../src/player/avplay-driver';
import {
  AUDIOBOOK_SPEED_STORAGE_KEY,
  AUDIOBOOK_SPEED_OPTIONS,
  loadAudiobookSpeed,
  saveAudiobookSpeed,
  cycleAudiobookSpeed,
  cycleAudioRepeatMode,
  type AudioRepeatMode,
} from '../../src/player/audioPreferences';

describe('audioModePrimitives', () => {
  describe('isAudioMediaType', () => {
    it('matches music and audiobook case-insensitively and rejects video or empty types', () => {
      expect(AUDIO_MEDIA_TYPES).toEqual(['music', 'audiobook']);
      expect(isAudioMediaType('music')).toBe(true);
      expect(isAudioMediaType('MUSIC')).toBe(true);
      expect(isAudioMediaType('audiobook')).toBe(true);
      expect(isAudioMediaType('Audiobook')).toBe(true);
      expect(isAudioMediaType('  music  ')).toBe(true);

      expect(isAudioMediaType('movie')).toBe(false);
      expect(isAudioMediaType('episode')).toBe(false);
      expect(isAudioMediaType('tv')).toBe(false);
      expect(isAudioMediaType('')).toBe(false);
      expect(isAudioMediaType(null)).toBe(false);
      expect(isAudioMediaType(undefined)).toBe(false);
    });
  });

  describe('checkAudioCompatibility & getPlaybackUrl (isAudioOnly)', () => {
    it('allows direct stream for supported audio formats even with mjpeg cover art videoCodec', () => {
      const supportedCases: Array<{ container: string; audioCodec: string }> = [
        { container: 'flac', audioCodec: 'flac' },
        { container: 'mp3', audioCodec: 'mp3' },
        { container: 'm4a', audioCodec: 'aac' },
        { container: 'm4b', audioCodec: 'aac' },
        { container: 'ogg', audioCodec: 'vorbis' },
        { container: 'opus', audioCodec: 'opus' },
        { container: 'wav', audioCodec: 'pcm_s16le' },
      ];

      for (const { container, audioCodec } of supportedCases) {
        const compat = checkAudioCompatibility(audioCodec, container);
        expect(compat.isSupported).toBe(true);
        expect(compat.reasons).toEqual([]);

        const playback = getPlaybackUrl({
          serverUrl: 'http://localhost:8492/',
          itemId: 42,
          token: 'tok-1',
          videoCodec: 'mjpeg',
          audioCodec,
          container,
          isAudioOnly: true,
        });

        expect(playback.isHls).toBe(false);
        expect(playback.url).toBe('http://localhost:8492/api/v1/stream/42?token=tok-1');
        expect(playback.reasons).toEqual([]);
      }
    });

    it('routes unsupported audio codecs and containers to audio-only AAC HLS without max_height', () => {
      const unsupportedCases: Array<{ audioCodec: string; container: string }> = [
        { audioCodec: 'wmav2', container: 'wma' },
        { audioCodec: 'alac', container: 'm4a' },
        { audioCodec: 'dts', container: 'mka' },
        { audioCodec: 'ape', container: 'ape' },
      ];

      for (const { audioCodec, container } of unsupportedCases) {
        const compat = checkAudioCompatibility(audioCodec, container);
        expect(compat.isSupported).toBe(false);
        expect(compat.reasons.length).toBeGreaterThan(0);

        const playback = getPlaybackUrl({
          serverUrl: 'http://localhost:8492',
          itemId: 99,
          token: 'tok-2',
          audioCodec,
          container,
          maxHeight: 1080,
          isAudioOnly: true,
        });

        expect(playback.isHls).toBe(true);
        expect(playback.url).toContain('http://localhost:8492/api/v1/media/99/hls/master.m3u8?');
        const parsed = new URL(playback.url);
        expect(parsed.searchParams.get('video_codec')).toBe('none');
        expect(parsed.searchParams.get('audio_codec')).toBe('aac');
        expect(parsed.searchParams.has('max_height')).toBe(false);
        expect(parsed.searchParams.get('token')).toBe('tok-2');
      }
    });

    it('preserves video HLS params when isAudioOnly is false or omitted', () => {
      const playback = getPlaybackUrl({
        serverUrl: 'http://localhost:8492',
        itemId: 7,
        videoCodec: 'av1',
        audioCodec: 'aac',
        container: 'mp4',
        maxHeight: 1080,
      });

      expect(playback.isHls).toBe(true);
      const parsed = new URL(playback.url);
      expect(parsed.searchParams.get('video_codec')).toBe('h264');
      expect(parsed.searchParams.get('audio_codec')).toBe('aac');
      expect(parsed.searchParams.get('max_height')).toBe('1080');
    });
  });

  describe('PlayerDriver.setPlaybackRate', () => {
    let container: HTMLDivElement;
    let playSpy: ReturnType<typeof vi.spyOn>;
    let pauseSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      container = document.createElement('div');
      document.body.appendChild(container);
      playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
      pauseSpy = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    });

    afterEach(() => {
      playSpy.mockRestore();
      pauseSpy.mockRestore();
      container.remove();
    });

    it('sets playbackRate and preservesPitch on Html5PlayerDriver after init and across lifecycle events', async () => {
      const driver = new Html5PlayerDriver();
      await driver.init(container, 'http://localhost:8492/api/v1/stream/1', 0);

      const video = container.querySelector('video') as HTMLVideoElement & {
        preservesPitch?: boolean;
        webkitPreservesPitch?: boolean;
      };
      expect(video).not.toBeNull();

      expect(driver.setPlaybackRate(1.5)).toBe(true);
      expect(video.playbackRate).toBe(1.5);
      expect(video.preservesPitch).toBe(true);
      expect(video.webkitPreservesPitch).toBe(true);

      // Reset manually to simulate browser resetting rate on metadata/playing
      video.playbackRate = 1;
      video.preservesPitch = false;
      video.dispatchEvent(new Event('loadedmetadata'));
      expect(video.playbackRate).toBe(1.5);
      expect(video.preservesPitch).toBe(true);

      video.playbackRate = 1;
      video.preservesPitch = false;
      video.dispatchEvent(new Event('playing'));
      expect(video.playbackRate).toBe(1.5);
      expect(video.preservesPitch).toBe(true);

      driver.destroy();
    });

    it('retains playbackRate set before init() and clamps out-of-range inputs', async () => {
      const driver = new Html5PlayerDriver();
      expect(driver.setPlaybackRate(1.75)).toBe(true);

      await driver.init(container, 'http://localhost:8492/api/v1/stream/2', 0);
      const video = container.querySelector('video') as HTMLVideoElement & {
        preservesPitch?: boolean;
      };
      expect(video.playbackRate).toBe(1.75);
      expect(video.preservesPitch).toBe(true);

      expect(driver.setPlaybackRate(0.1)).toBe(true);
      expect(video.playbackRate).toBe(0.5);

      expect(driver.setPlaybackRate(10)).toBe(true);
      expect(video.playbackRate).toBe(3);

      expect(driver.setPlaybackRate(Number.NaN)).toBe(false);
      expect(video.playbackRate).toBe(3);

      driver.destroy();
    });

    it('returns false on TizenAvplayDriver.setPlaybackRate', () => {
      const avDriver = new TizenAvplayDriver();
      expect(avDriver.setPlaybackRate(1.5)).toBe(false);
    });
  });

  describe('audiobook speed & repeat mode preferences', () => {
    beforeEach(() => {
      localStorage.clear();
    });

    it('loads default 1x, persists speed, and falls back to 1 on invalid storage values', () => {
      expect(AUDIOBOOK_SPEED_STORAGE_KEY).toBe('kadr_audiobook_speed_v1');
      expect(AUDIOBOOK_SPEED_OPTIONS).toEqual([0.75, 1, 1.25, 1.5, 1.75, 2]);
      expect(loadAudiobookSpeed()).toBe(1);

      saveAudiobookSpeed(1.5);
      expect(localStorage.getItem(AUDIOBOOK_SPEED_STORAGE_KEY)).toBe('1.5');
      expect(loadAudiobookSpeed()).toBe(1.5);

      localStorage.setItem(AUDIOBOOK_SPEED_STORAGE_KEY, 'not-a-number');
      expect(loadAudiobookSpeed()).toBe(1);

      localStorage.setItem(AUDIOBOOK_SPEED_STORAGE_KEY, '-2');
      expect(loadAudiobookSpeed()).toBe(1);

      localStorage.setItem(AUDIOBOOK_SPEED_STORAGE_KEY, '99');
      expect(loadAudiobookSpeed()).toBe(1);
    });

    it('cycles audiobook speed through 0.75 -> 1 -> 1.25 -> 1.5 -> 1.75 -> 2 -> 0.75', () => {
      let speed = 0.75;
      const visited: number[] = [speed];
      for (let i = 0; i < 6; i++) {
        speed = cycleAudiobookSpeed(speed);
        visited.push(speed);
      }
      expect(visited).toEqual([0.75, 1, 1.25, 1.5, 1.75, 2, 0.75]);
    });

    it('cycles audio repeat mode through off -> all -> one -> off', () => {
      let mode: AudioRepeatMode = 'off';
      mode = cycleAudioRepeatMode(mode);
      expect(mode).toBe('all');
      mode = cycleAudioRepeatMode(mode);
      expect(mode).toBe('one');
      mode = cycleAudioRepeatMode(mode);
      expect(mode).toBe('off');
    });
  });
});
