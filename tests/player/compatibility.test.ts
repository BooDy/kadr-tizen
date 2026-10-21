import { describe, it, expect } from 'vitest';
import {
  checkMediaCompatibility,
  KNOWN_COMPATIBILITY_INFO,
  isSupportedOnSamsungTv,
  getPlaybackUrl,
} from '../../src/player/compatibility';

describe('Samsung TV Codec Compatibility Matrix', () => {
  it('exposes known hardware compatibility definitions', () => {
    expect(KNOWN_COMPATIBILITY_INFO.supportedAudio).toContain('aac');
    expect(KNOWN_COMPATIBILITY_INFO.unsupportedAudio).toContain('dts');
  });

  it('identifies supported codecs (h264, hevc, aac, ac3)', () => {
    const result = checkMediaCompatibility('h264', 'aac', 'mp4');
    expect(result.isSupported).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it('identifies unsupported DTS audio on Samsung TV hardware', () => {
    const result = checkMediaCompatibility('hevc', 'dts', 'mkv');
    expect(result.isSupported).toBe(false);
    expect(result.reasons).toContain('DTS audio is not supported on Samsung TV hardware (2018+ models lack DTS decoders).');
  });

  it('identifies unsupported TrueHD audio on Samsung TV hardware', () => {
    const result = checkMediaCompatibility('hevc', 'truehd', 'mkv');
    expect(result.isSupported).toBe(false);
    expect(result.reasons).toContain('Dolby TrueHD audio decoding is not supported on Samsung TV hardware.');
  });

  it('identifies unsupported AV1 video on pre-2021 Tizen chipsets', () => {
    const result = checkMediaCompatibility('av1', 'aac', 'mp4');
    expect(result.isSupported).toBe(false);
    expect(result.reasons).toContain('AV1 video decoding is not supported on this TV hardware.');
  });

  it('verifies isSupportedOnSamsungTv helper function', () => {
    expect(isSupportedOnSamsungTv('h264', 'aac', 'mp4')).toBe(true);
    expect(isSupportedOnSamsungTv('hevc', 'dts', 'mkv')).toBe(false);
    expect(isSupportedOnSamsungTv('av1', 'aac', 'mp4')).toBe(false);
  });

  it('flags MKV and AVI as unsupported when forceHtml5 is true', () => {
    const html5Mkv = checkMediaCompatibility('h264', 'aac', 'mkv', true);
    expect(html5Mkv.isSupported).toBe(false);
    expect(html5Mkv.reasons.some((r) => r.includes('HTML5'))).toBe(true);

    const html5Mp4 = checkMediaCompatibility('h264', 'aac', 'mp4', true);
    expect(html5Mp4.isSupported).toBe(true);
  });
});

describe('getPlaybackUrl helper', () => {
  const serverUrl = 'http://192.168.1.109:8492';

  it('generates direct stream URL for compatible media', () => {
    const res = getPlaybackUrl({
      serverUrl,
      itemId: 101,
      videoCodec: 'h264',
      audioCodec: 'aac',
      container: 'mp4',
      token: 'jwt-token-123',
      unlockTokens: ['secret-token-abc'],
    });

    expect(res.isHls).toBe(false);
    expect(res.url).toContain('/api/v1/stream/101?');
    expect(res.url).toContain('token=jwt-token-123');
    expect(res.url).toContain('unlocked=secret-token-abc');
  });

  it('generates HLS fallback URL for DTS audio', () => {
    const res = getPlaybackUrl({
      serverUrl,
      itemId: 178,
      videoCodec: 'h264',
      audioCodec: 'dts',
      container: 'mkv',
      token: 'jwt-token-123',
    });

    expect(res.isHls).toBe(true);
    expect(res.url).toContain('/api/v1/media/178/hls/master.m3u8?');
    expect(res.url).toContain('video_codec=h264');
    expect(res.url).toContain('audio_codec=aac');
    expect(res.url).toContain('token=jwt-token-123');
    expect(res.reasons.length).toBeGreaterThan(0);
  });

  it('generates HLS URL when forceHls is true', () => {
    const res = getPlaybackUrl({
      serverUrl,
      itemId: 42,
      videoCodec: 'h264',
      audioCodec: 'aac',
      container: 'mp4',
      forceHls: true,
    });

    expect(res.isHls).toBe(true);
    expect(res.url).toContain('/api/v1/media/42/hls/master.m3u8?');
  });

  it('attaches start_time parameter when startSeconds > 0 for HLS streams', () => {
    const res = getPlaybackUrl({
      serverUrl,
      itemId: 178,
      videoCodec: 'h264',
      audioCodec: 'dts',
      container: 'mkv',
      startSeconds: 125.5,
    });

    expect(res.isHls).toBe(true);
    expect(res.url).toContain('start_time=125.500');
  });

  it('omits start_time when startSeconds is 0', () => {
    const res = getPlaybackUrl({
      serverUrl,
      itemId: 178,
      forceHls: true,
      startSeconds: 0,
    });

    expect(res.isHls).toBe(true);
    expect(res.url).not.toContain('start_time=');
  });
});
