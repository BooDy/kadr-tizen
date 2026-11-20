export interface CompatibilityResult {
  isSupported: boolean;
  reasons: string[];
  warnings: string[];
}

export interface PlaybackStreamOptions {
  serverUrl: string;
  itemId: number | string;
  token?: string;
  unlockTokens?: string[];
  forceHls?: boolean;
  forceDirect?: boolean;
  forceHtml5?: boolean;
  videoCodec?: string;
  audioCodec?: string;
  container?: string;
  startSeconds?: number;
  maxHeight?: number;
  audioTrackIndex?: number;
}

export interface PlaybackUrlResult {
  url: string;
  isHls: boolean;
  reasons: string[];
}

export const SAMSUNG_TV_HLS_MAX_HEIGHT = 1080;

export const KNOWN_COMPATIBILITY_INFO = {
  supportedVideo: ['h264', 'avc', 'hevc', 'h265', 'vp9', 'mpeg4'],
  unsupportedVideo: ['av1', 'hi10p', 'vc1', 'rv40'],
  supportedAudio: ['aac', 'ac3', 'eac3', 'mp3', 'flac', 'pcm'],
  unsupportedAudio: ['dts', 'dts-hd', 'dts-x', 'truehd'],
  supportedContainers: ['mp4', 'webm', 'ts'],
  unsupportedContainers: ['mkv', 'avi', 'iso', 'vob', 'rmvb'],
};

/**
 * Returns true when probed technical metadata shows a video stream is present
 * (`video_codec` non-empty) while no audio stream exists (`audio_codec` missing/empty/'none').
 * Kadr's ffmpeg HLS builder maps `-map 0:a:0` without `?`, so audio-less videos
 * always fail HLS transcoding with HTTP 500 and should use Direct Stream when compatible.
 */
export function hasMissingAudioStream(
  videoCodec?: string | null,
  audioCodec?: string | null
): boolean {
  const v = videoCodec?.trim() || '';
  if (!v) return false;
  const a = audioCodec?.trim().toLowerCase() || '';
  return a === '' || a === 'none';
}

export function checkMediaCompatibility(
  videoCodec?: string,
  audioCodec?: string,
  container?: string,
  forceHtml5?: boolean
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

  if (forceHtml5) {
    if (c && (c === 'mkv' || c === 'avi' || c === 'ts')) {
      reasons.push(`HTML5 video element does not support ${c.toUpperCase()} containers directly.`);
    }
    if (a && (a.includes('eac3') || a.includes('ac3') || a.includes('dts') || a.includes('truehd'))) {
      reasons.push(`HTML5 video element does not support ${a.toUpperCase()} audio codec directly.`);
    }
    if (v && (v.includes('hevc') || v.includes('h265') || v.includes('hi10p'))) {
      reasons.push(`HTML5 video element does not support ${v.toUpperCase()} video codec directly in browsers.`);
    }
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
  container?: string,
  forceHtml5?: boolean
): boolean {
  return checkMediaCompatibility(videoCodec, audioCodec, container, forceHtml5).isSupported;
}

export function getPlaybackUrl(options: PlaybackStreamOptions): PlaybackUrlResult {
  const cleanBase = options.serverUrl.replace(/\/+$/, '');
  const compat = checkMediaCompatibility(
    options.videoCodec,
    options.audioCodec,
    options.container,
    options.forceHtml5
  );

  const isHls = options.forceDirect
    ? false
    : Boolean(options.forceHls || !compat.isSupported);
  const params = new URLSearchParams();

  if (isHls) {
    params.set('video_codec', 'h264');
    params.set('audio_codec', 'aac');
    if (options.maxHeight) {
      params.set('max_height', String(options.maxHeight));
    }
    if (options.startSeconds !== undefined && options.startSeconds > 0) {
      params.set('start_time', options.startSeconds.toFixed(3));
    }
    if (
      options.audioTrackIndex !== undefined &&
      Number.isFinite(options.audioTrackIndex) &&
      Math.floor(options.audioTrackIndex) > 0
    ) {
      params.set('audio_track', String(Math.floor(options.audioTrackIndex)));
    }
  }

  if (options.token) {
    params.set('token', options.token);
  }
  if (options.unlockTokens && options.unlockTokens.length > 0) {
    params.set('unlocked', options.unlockTokens.join(','));
  }

  const queryStr = params.toString() ? `?${params.toString()}` : '';
  const url = isHls
    ? `${cleanBase}/api/v1/media/${options.itemId}/hls/master.m3u8${queryStr}`
    : `${cleanBase}/api/v1/stream/${options.itemId}${queryStr}`;

  return {
    url,
    isHls,
    reasons: compat.reasons,
  };
}
