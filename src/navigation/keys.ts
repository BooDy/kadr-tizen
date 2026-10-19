export const TVKeys = {
  ENTER: 13,
  LEFT: 37,
  UP: 38,
  RIGHT: 39,
  DOWN: 40,
  BACK_TIZEN: 10009,
  BACK_WEB: 27, // Escape
  BACKSPACE: 8,
  PLAY_PAUSE: 10252,
  PLAY: 415,
  PAUSE: 19,
  STOP: 413,
  FAST_FORWARD: 417,
  REWIND: 412,
  NUM_0: 48,
  NUM_9: 57,
} as const;

export function registerTizenKeys(): void {
  if (typeof window === 'undefined') return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tizen = (window as any).tizen;
  if (tizen?.tvinputdevice?.registerKey) {
    const keys = [
      'MediaPlay',
      'MediaPause',
      'MediaPlayPause',
      'MediaStop',
      'MediaFastForward',
      'MediaRewind',
      '0',
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
    ];
    for (const key of keys) {
      try {
        tizen.tvinputdevice.registerKey(key);
      } catch {
        // Ignored
      }
    }
  }
}
