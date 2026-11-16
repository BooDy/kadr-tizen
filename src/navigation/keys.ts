export const TVKeys = {
  ENTER: 13,
  LEFT: 37,
  UP: 38,
  RIGHT: 39,
  DOWN: 40,
  BACK_TIZEN: 10009,
  BACK_WEB: 27, // Escape
  BACKSPACE: 8,
  IME_DONE: 65376,
  IME_CANCEL: 65385,
  PLAY_PAUSE: 10252,
  PLAY: 415,
  PAUSE: 19,
  STOP: 413,
  FAST_FORWARD: 417,
  REWIND: 412,
  MEDIA_TRACK_NEXT: 10232,
  MEDIA_TRACK_PREVIOUS: 10233,
  CH_UP: 427,
  CH_DOWN: 428,
  PAGE_UP: 33,
  PAGE_DOWN: 34,
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
      'MediaTrackNext',
      'MediaTrackPrevious',
      'ChannelUp',
      'ChannelDown',
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
