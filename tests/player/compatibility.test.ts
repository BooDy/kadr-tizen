import { describe, it, expect } from 'vitest';
import { checkMediaCompatibility, KNOWN_COMPATIBILITY_INFO } from '../../src/player/compatibility';

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

  it('identifies unsupported AV1 video on pre-2021 Tizen chipsets', () => {
    const result = checkMediaCompatibility('av1', 'aac', 'mp4');
    expect(result.isSupported).toBe(false);
    expect(result.reasons).toContain('AV1 video decoding is not supported on this TV hardware.');
  });
});
