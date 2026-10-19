export interface CompatibilityResult {
  isSupported: boolean;
  reasons: string[];
  warnings: string[];
}

export const KNOWN_COMPATIBILITY_INFO = {
  supportedVideo: ['h264', 'avc', 'hevc', 'h265', 'vp9', 'mpeg4'],
  unsupportedVideo: ['av1', 'hi10p', 'vc1', 'rv40'],
  supportedAudio: ['aac', 'ac3', 'eac3', 'mp3', 'flac', 'pcm'],
  unsupportedAudio: ['dts', 'dts-hd', 'dts-x', 'truehd'],
  supportedContainers: ['mp4', 'mkv', 'webm', 'ts'],
  unsupportedContainers: ['iso', 'vob', 'rmvb'],
};

export function checkMediaCompatibility(
  videoCodec?: string,
  audioCodec?: string,
  container?: string
): CompatibilityResult {
  const v = videoCodec?.toLowerCase().trim() || '';
  const a = audioCodec?.toLowerCase().trim() || '';
  const c = container?.toLowerCase().trim() || '';

  const reasons: string[] = [];
  const warnings: string[] = [];

  if (a.includes('truehd')) {
    reasons.push('Dolby TrueHD audio decoding is not supported on Samsung TV hardware.');
  } else if (KNOWN_COMPATIBILITY_INFO.unsupportedAudio.some((bad) => a.includes(bad))) {
    reasons.push('DTS audio is not supported on Samsung TV hardware (2018+ models lack DTS decoders).');
  }

  if (KNOWN_COMPATIBILITY_INFO.unsupportedVideo.some((bad) => v.includes(bad))) {
    if (v.includes('av1')) {
      reasons.push('AV1 video decoding is not supported on this TV hardware.');
    } else if (v.includes('hi10p')) {
      reasons.push('Hi10P (H.264 10-bit) is not supported by TV hardware decoders.');
    } else {
      reasons.push(`Video codec "${videoCodec}" is unsupported on Samsung Tizen.`);
    }
  }

  if (c && KNOWN_COMPATIBILITY_INFO.unsupportedContainers.some((bad) => c.includes(bad))) {
    reasons.push(`Container format "${container}" is not supported.`);
  }

  return {
    isSupported: reasons.length === 0,
    reasons,
    warnings,
  };
}

export function isSupportedOnSamsungTv(
  videoCodec?: string,
  audioCodec?: string,
  container?: string
): boolean {
  return checkMediaCompatibility(videoCodec, audioCodec, container).isSupported;
}
