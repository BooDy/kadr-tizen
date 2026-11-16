import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Html5PlayerDriver } from '../../src/player/html5-driver';
import {
  TizenAvplayDriver,
  createPlayerDriver,
  computeFittedDisplayRect,
  extractAvplayVideoMetadata,
  parseResolutionDimensions,
  normalizeRotationDegrees,
} from '../../src/player/avplay-driver';

describe('Html5PlayerDriver', () => {
  let container: HTMLDivElement;
  let driver: Html5PlayerDriver;

  let defaultPlaySpy: ReturnType<typeof vi.spyOn>;
  let defaultPauseSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    defaultPlaySpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    defaultPauseSpy = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    driver = new Html5PlayerDriver();
  });

  afterEach(() => {
    driver.destroy();
    container.remove();
    defaultPlaySpy.mockRestore();
    defaultPauseSpy.mockRestore();
  });

  it('creates video element, sets src, and appends to container on init', async () => {
    await driver.init(container, 'http://test.com/stream.mp4', 0);

    const video = container.querySelector('video');
    expect(video).not.toBeNull();
    expect(video?.src).toBe('http://test.com/stream.mp4');
    expect(video?.preload).toBe('auto');
    expect(defaultPlaySpy).toHaveBeenCalled();
  });

  it('is absolutely positioned and stays invisible until playing when another video is still playing (seamless seek swap)', async () => {
    const oldVideo = document.createElement('video');
    container.appendChild(oldVideo);

    expect(driver.supportsSeamlessSwap).toBe(true);
    await driver.init(container, 'http://test.com/stream.mp4', 0);

    const videos = container.querySelectorAll('video');
    expect(videos.length).toBe(2);
    const newVideo = videos[1] as HTMLVideoElement;
    expect(newVideo.className).toContain('absolute');
    expect(newVideo.className).toContain('inset-0');
    // Hidden so the old picture keeps showing instead of a black box
    expect(newVideo.style.opacity).toBe('0');

    const stateSpy = vi.fn();
    driver.onStateChange(stateSpy);
    newVideo.dispatchEvent(new Event('playing'));
    expect(newVideo.style.opacity).toBe('1');
    expect(stateSpy).toHaveBeenCalledWith('playing');
  });

  it('does not hide the video when it is the only one in the container', async () => {
    await driver.init(container, 'http://test.com/stream.mp4', 0);
    const video = container.querySelector('video') as HTMLVideoElement;
    expect(video.style.opacity).toBe('');
  });

  it('sets initial seek position if startMs > 0', async () => {
    await driver.init(container, 'http://test.com/stream.mp4', 45000);

    const video = container.querySelector('video') as HTMLVideoElement;
    expect(video.currentTime).toBe(45);
  });

  it('propagates timeupdate events with milliseconds', async () => {
    await driver.init(container, 'http://test.com/stream.mp4', 0);
    const video = container.querySelector('video') as HTMLVideoElement;

    const timeUpdateSpy = vi.fn();
    driver.onTimeUpdate(timeUpdateSpy);

    Object.defineProperty(video, 'currentTime', { value: 12.345, writable: true });
    Object.defineProperty(video, 'duration', { value: 120, writable: true });

    video.dispatchEvent(new Event('timeupdate'));

    expect(timeUpdateSpy).toHaveBeenCalledWith(12345, 120000);
  });

  it('reports 0 duration instead of Infinity or NaN when video.duration is non-finite (e.g. HLS event stream)', async () => {
    await driver.init(container, 'http://test.com/master.m3u8', 0);
    const video = container.querySelector('video') as HTMLVideoElement;

    const timeUpdateSpy = vi.fn();
    driver.onTimeUpdate(timeUpdateSpy);

    Object.defineProperty(video, 'currentTime', { value: 15, writable: true });
    Object.defineProperty(video, 'duration', { value: Infinity, writable: true });

    video.dispatchEvent(new Event('timeupdate'));
    expect(timeUpdateSpy).toHaveBeenLastCalledWith(15000, 0);

    Object.defineProperty(video, 'duration', { value: NaN, writable: true });
    video.dispatchEvent(new Event('timeupdate'));
    expect(timeUpdateSpy).toHaveBeenLastCalledWith(15000, 0);
  });

  it('propagates duration on loadedmetadata and durationchange events', async () => {
    await driver.init(container, 'http://test.com/stream.mp4', 0);
    const video = container.querySelector('video') as HTMLVideoElement;

    const timeUpdateSpy = vi.fn();
    driver.onTimeUpdate(timeUpdateSpy);

    Object.defineProperty(video, 'currentTime', { value: 0, writable: true });
    Object.defineProperty(video, 'duration', { value: 90, writable: true });

    video.dispatchEvent(new Event('loadedmetadata'));
    expect(timeUpdateSpy).toHaveBeenLastCalledWith(0, 90000);
  });

  it('propagates player state changes', async () => {
    await driver.init(container, 'http://test.com/stream.mp4', 0);
    const video = container.querySelector('video') as HTMLVideoElement;

    const stateSpy = vi.fn();
    driver.onStateChange(stateSpy);

    video.dispatchEvent(new Event('playing'));
    expect(stateSpy).toHaveBeenCalledWith('playing');

    video.dispatchEvent(new Event('pause'));
    expect(stateSpy).toHaveBeenCalledWith('paused');

    video.dispatchEvent(new Event('waiting'));
    expect(stateSpy).toHaveBeenCalledWith('buffering');

    video.dispatchEvent(new Event('ended'));
    expect(stateSpy).toHaveBeenCalledWith('ended');
  });

  it('propagates error events', async () => {
    await driver.init(container, 'http://test.com/stream.mp4', 0);
    const video = container.querySelector('video') as HTMLVideoElement;

    const errorSpy = vi.fn();
    driver.onError(errorSpy);

    video.dispatchEvent(new Event('error'));
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('HTML5 Video Error'));
  });

  it('supports play, pause, and seekTo', async () => {
    await driver.init(container, 'http://test.com/stream.mp4', 0);
    const video = container.querySelector('video') as HTMLVideoElement;

    driver.play();
    expect(defaultPlaySpy).toHaveBeenCalled();

    driver.pause();
    expect(defaultPauseSpy).toHaveBeenCalled();

    driver.seekTo(30000);
    expect(video.currentTime).toBe(30);

    driver.seekTo(-5000);
    expect(video.currentTime).toBe(0);
  });

  it('cleans up video on destroy', async () => {
    await driver.init(container, 'http://test.com/stream.mp4', 0);

    expect(container.querySelector('video')).not.toBeNull();

    driver.destroy();

    expect(defaultPauseSpy).toHaveBeenCalled();
    expect(container.querySelector('video')).toBeNull();
  });

  it('manages subtitle track elements on setSubtitleTrack and sets mode to showing', async () => {
    const origCreateElement = document.createElement.bind(document);
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const el = origCreateElement(tagName);
      if (tagName === 'track') {
        Object.defineProperty(el, 'track', {
          value: { mode: 'disabled' },
          writable: true,
        });
      }
      return el;
    });

    await driver.init(container, 'http://test.com/stream.mp4', 0);
    const video = container.querySelector('video') as HTMLVideoElement;

    expect(video.querySelector('track')).toBeNull();

    driver.setSubtitleTrack('http://test.com/subtitles/en.vtt');
    const track = video.querySelector('track');
    expect(track).not.toBeNull();
    expect(track?.src).toBe('http://test.com/subtitles/en.vtt');
    expect(track?.kind).toBe('subtitles');
    expect(track?.default).toBe(true);
    expect((track as unknown as { track: { mode: string } }).track?.mode).toBe('showing');

    // Switching track
    driver.setSubtitleTrack('http://test.com/subtitles/fr.vtt');
    const tracks = video.querySelectorAll('track');
    expect(tracks.length).toBe(1);
    expect(tracks[0].src).toBe('http://test.com/subtitles/fr.vtt');

    // Disabling track (null)
    driver.setSubtitleTrack(null);
    expect(video.querySelector('track')).toBeNull();

    createElementSpy.mockRestore();
  });
});

describe('TizenAvplayDriver', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockAvplay: any;

  beforeEach(() => {
    mockAvplay = {
      open: vi.fn(),
      setDisplayRect: vi.fn(),
      setListener: vi.fn(),
      prepareAsync: vi.fn((cb: () => void) => cb && cb()),
      play: vi.fn(),
      pause: vi.fn(),
      seekTo: vi.fn((_ms: number, successCb?: () => void) => {
        if (successCb) successCb();
      }),
      stop: vi.fn(),
      close: vi.fn(),
      getDuration: vi.fn(() => 60000),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).webapis = { avplay: mockAvplay };
  });

  afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).webapis;
  });

  it('throws error when webapis.avplay is missing', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).webapis;
    const driver = new TizenAvplayDriver();
    const container = document.createElement('div');

    await expect(driver.init(container, 'http://stream.m3u8', 0)).rejects.toThrow(
      'Tizen AVPlay API not available'
    );
  });

  it('silences the native AVPlay subtitle renderer so only the adjustable overlay is shown', async () => {
    mockAvplay.setSilentSubtitle = vi.fn();
    const driver = new TizenAvplayDriver();
    await driver.init(document.createElement('div'), 'http://stream.m3u8', 0);
    expect(mockAvplay.setSilentSubtitle).toHaveBeenCalledWith(true);

    // A throwing / missing setSilentSubtitle must never break playback
    mockAvplay.setSilentSubtitle = vi.fn(() => {
      throw new Error('not supported');
    });
    const driver2 = new TizenAvplayDriver();
    await expect(driver2.init(document.createElement('div'), 'http://stream.m3u8', 0)).resolves.toBeUndefined();
    expect(mockAvplay.play).toHaveBeenCalled();
  });

  it('initializes AVPlay with display rect and registers listeners', async () => {
    const driver = new TizenAvplayDriver();
    const container = document.createElement('div');
    const stateSpy = vi.fn();
    const timeSpy = vi.fn();
    const errorSpy = vi.fn();

    driver.onStateChange(stateSpy);
    driver.onTimeUpdate(timeSpy);
    driver.onError(errorSpy);

    await driver.init(container, 'http://stream.m3u8', 15000);

    expect(mockAvplay.open).toHaveBeenCalledWith('http://stream.m3u8');
    expect(mockAvplay.setDisplayRect).toHaveBeenCalledWith(0, 0, 1920, 1080);
    expect(mockAvplay.setListener).toHaveBeenCalled();
    expect(mockAvplay.prepareAsync).toHaveBeenCalled();
    expect(mockAvplay.seekTo).toHaveBeenCalledWith(15000, expect.any(Function), expect.any(Function));
    expect(mockAvplay.play).toHaveBeenCalled();
    expect(stateSpy).toHaveBeenCalledWith('playing');

    // Test listener callbacks
    const listener = mockAvplay.setListener.mock.calls[0][0];
    listener.onbufferingstart();
    expect(stateSpy).toHaveBeenCalledWith('buffering');

    listener.onbufferingcomplete();
    expect(stateSpy).toHaveBeenCalledWith('playing');

    listener.oncurrentplaytime(20000);
    expect(timeSpy).toHaveBeenCalledWith(20000, 60000);

    listener.onerror();
    expect(errorSpy).toHaveBeenCalledWith('AVPlay Hardware Error');

    listener.onstreamcompleted();
    expect(stateSpy).toHaveBeenCalledWith('ended');
  });

  it('guards against asynchronous race if destroy is called before prepareAsync completes', async () => {
    let prepareSuccessCb: (() => void) | undefined;
    mockAvplay.prepareAsync = vi.fn((successCb) => {
      prepareSuccessCb = successCb;
    });

    const driver = new TizenAvplayDriver();
    const container = document.createElement('div');
    const stateSpy = vi.fn();
    driver.onStateChange(stateSpy);

    await driver.init(container, 'http://stream.m3u8', 15000);

    // Call destroy before prepareAsync callback finishes
    driver.destroy();

    // Now invoke the pending callback
    prepareSuccessCb?.();

    expect(mockAvplay.play).not.toHaveBeenCalled();
    expect(stateSpy).not.toHaveBeenCalled();
  });

  it('handles prepareAsync error callback', async () => {
    let prepareErrorCb: ((err: unknown) => void) | undefined;
    mockAvplay.prepareAsync = vi.fn((_successCb, errorCb) => {
      prepareErrorCb = errorCb;
    });

    const driver = new TizenAvplayDriver();
    const container = document.createElement('div');
    const errorSpy = vi.fn();
    driver.onError(errorSpy);

    await driver.init(container, 'http://stream.m3u8', 0);

    prepareErrorCb?.(new Error('Prepare failed'));

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('AVPlay Prepare Error'));
  });

  it('handles play, pause, seekTo, and destroy', () => {
    const driver = new TizenAvplayDriver();
    const stateSpy = vi.fn();
    driver.onStateChange(stateSpy);

    driver.play();
    expect(mockAvplay.play).toHaveBeenCalled();
    expect(stateSpy).toHaveBeenCalledWith('playing');

    driver.pause();
    expect(mockAvplay.pause).toHaveBeenCalled();
    expect(stateSpy).toHaveBeenCalledWith('paused');

    driver.seekTo(25000);
    expect(mockAvplay.seekTo).toHaveBeenCalledWith(
      25000,
      expect.any(Function),
      expect.any(Function)
    );

    driver.destroy();
    expect(mockAvplay.stop).toHaveBeenCalled();
    expect(mockAvplay.close).toHaveBeenCalled();

    // After destroy, play/pause/seek should be no-ops
    driver.play();
    expect(mockAvplay.play).toHaveBeenCalledTimes(1);
    driver.pause();
    expect(mockAvplay.pause).toHaveBeenCalledTimes(1);
    driver.seekTo(1000);
    expect(mockAvplay.seekTo).toHaveBeenCalledTimes(1);
  });

  it('invokes webapis.avplay.seekTo with success and error callbacks', () => {
    const driver = new TizenAvplayDriver();
    const seekSpy = vi.fn();
    (window as any).webapis = {
      avplay: {
        seekTo: seekSpy,
      },
    };

    driver.seekTo(15000);
    expect(seekSpy).toHaveBeenCalledWith(
      15000,
      expect.any(Function),
      expect.any(Function)
    );
  });

  it('allows seeking to 0ms without clamping to 100ms', () => {
    const driver = new TizenAvplayDriver();
    driver.seekTo(0);
    expect(mockAvplay.seekTo).toHaveBeenCalledWith(
      0,
      expect.any(Function),
      expect.any(Function)
    );
  });

  it('falls back to jumpForward and jumpBackward using tracked currentTimeMs when seekTo fails or throws', async () => {
    const driver = new TizenAvplayDriver();
    const container = document.createElement('div');
    mockAvplay.jumpForward = vi.fn((_ms: number, ok?: () => void) => ok?.());
    mockAvplay.jumpBackward = vi.fn((_ms: number, ok?: () => void) => ok?.());

    await driver.init(container, 'http://stream.mp4', 0);
    const listener = mockAvplay.setListener.mock.calls[0][0];
    listener.oncurrentplaytime(20000);

    // Simulate seekTo invoking errorCallback
    mockAvplay.seekTo = vi.fn((_ms: number, _ok?: () => void, errCb?: (e: unknown) => void) => {
      errCb?.(new Error('PLAYER_ERROR_SEEK_FAILED'));
    });

    const onCompleteFwd = vi.fn();
    driver.seekTo(50000, onCompleteFwd);
    expect(mockAvplay.jumpForward).toHaveBeenCalledWith(
      30000,
      expect.any(Function),
      expect.any(Function)
    );
    expect(onCompleteFwd).toHaveBeenCalled();

    // Simulate seekTo throwing synchronously when seeking backward from 50000 to 15000
    mockAvplay.seekTo = vi.fn(() => {
      throw new Error('Sync seek exception');
    });

    const onCompleteBwd = vi.fn();
    driver.seekTo(15000, onCompleteBwd);
    expect(mockAvplay.jumpBackward).toHaveBeenCalledWith(
      35000,
      expect.any(Function),
      expect.any(Function)
    );
    expect(onCompleteBwd).toHaveBeenCalled();
  });

  it('invokes onSeekFailure when both seekTo and jumpForward fail', async () => {
    const driver = new TizenAvplayDriver();
    const container = document.createElement('div');
    const seekFailSpy = vi.fn();
    driver.onSeekFailure(seekFailSpy);

    await driver.init(container, 'http://stream.mp4', 0);
    const listener = mockAvplay.setListener.mock.calls[0][0];
    listener.oncurrentplaytime(10000);

    mockAvplay.seekTo = vi.fn((_ms: number, _ok?: () => void, errCb?: (e: unknown) => void) => {
      errCb?.(new Error('PLAYER_ERROR_SEEK_FAILED'));
    });
    mockAvplay.jumpForward = vi.fn((_ms: number, _ok?: () => void, errCb?: (e: unknown) => void) => {
      errCb?.(new Error('JUMP_FAILED'));
    });

    driver.seekTo(40000);
    expect(seekFailSpy).toHaveBeenCalledWith(40000);
  });

  it('retries seekTo after play() if seekTo in READY state fails during init', async () => {
    const callOrder: string[] = [];
    mockAvplay.open = vi.fn(() => callOrder.push('open'));
    mockAvplay.prepareAsync = vi.fn((cb: () => void) => {
      callOrder.push('prepareAsync');
      cb?.();
    });
    mockAvplay.play = vi.fn(() => callOrder.push('play'));
    let callCount = 0;
    mockAvplay.seekTo = vi.fn((_ms: number, ok?: () => void, errCb?: (e: unknown) => void) => {
      callCount += 1;
      callOrder.push(`seekTo#${callCount}`);
      if (callCount === 1) {
        errCb?.(new Error('INVALID_STATE in READY'));
      } else {
        ok?.();
      }
    });

    const driver = new TizenAvplayDriver();
    const container = document.createElement('div');
    await driver.init(container, 'http://stream.mp4', 30000);

    expect(callOrder).toEqual(['open', 'prepareAsync', 'seekTo#1', 'play', 'seekTo#2']);
    expect(mockAvplay.seekTo).toHaveBeenCalledTimes(2);
    expect(mockAvplay.seekTo).toHaveBeenLastCalledWith(
      30000,
      expect.any(Function),
      expect.any(Function)
    );
  });

  it('forces segment-0 start on HLS streams with startMs=0 and rewinds if AVPlay joins EVENT live edge', async () => {
    const driver = new TizenAvplayDriver();
    const container = document.createElement('div');
    const timeSpy = vi.fn();
    const seekFailSpy = vi.fn();
    driver.onTimeUpdate(timeSpy);
    driver.onSeekFailure(seekFailSpy);

    await driver.init(
      container,
      'http://192.168.1.10:8492/api/v1/media/42/hls/master.m3u8?video_codec=h264&audio_codec=aac',
      0
    );

    // Must explicitly seek to 0 in READY state before play() on HLS streams
    expect(mockAvplay.seekTo).toHaveBeenCalledWith(0, expect.any(Function), expect.any(Function));

    mockAvplay.seekTo.mockClear();
    const listener = mockAvplay.setListener.mock.calls[0][0];

    // Simulate Tizen firmware overriding initial HLS position to EVENT live edge (e.g. 3m00s)
    listener.oncurrentplaytime(180000);

    // Bogus live-edge timestamp must NOT be emitted to PlayerScreen, and driver must rewind to 0ms
    expect(timeSpy).not.toHaveBeenCalledWith(180000, expect.anything());
    expect(mockAvplay.seekTo).toHaveBeenCalledWith(0, expect.any(Function), expect.any(Function));
    expect(seekFailSpy).not.toHaveBeenCalled();

    // Subsequent playtime after rewind emits normally
    listener.oncurrentplaytime(500);
    expect(timeSpy).toHaveBeenCalledWith(500, 60000);
  });

  it('queues seekTo called while prepareAsync is in flight without triggering onSeekFailure', async () => {
    let prepareSuccessCb: (() => void) | undefined;
    mockAvplay.prepareAsync = vi.fn((successCb: () => void) => {
      prepareSuccessCb = successCb;
    });

    const driver = new TizenAvplayDriver();
    const container = document.createElement('div');
    const seekFailSpy = vi.fn();
    const onCompleteSpy = vi.fn();
    driver.onSeekFailure(seekFailSpy);

    await driver.init(container, 'http://stream.mp4', 0);

    // Session resume arrives while AVPlay is still in PREPARING state
    driver.seekTo(45000, onCompleteSpy);
    expect(mockAvplay.seekTo).not.toHaveBeenCalled();
    expect(seekFailSpy).not.toHaveBeenCalled();

    // Now prepareAsync transitions to READY -> queued seek executes cleanly before play()
    prepareSuccessCb?.();

    expect(mockAvplay.seekTo).toHaveBeenCalledTimes(1);
    expect(mockAvplay.seekTo).toHaveBeenCalledWith(
      45000,
      expect.any(Function),
      expect.any(Function)
    );
    expect(onCompleteSpy).toHaveBeenCalledTimes(1);
    expect(mockAvplay.play).toHaveBeenCalledTimes(1);
    expect(seekFailSpy).not.toHaveBeenCalled();
  });

  it('coalesces overlapping async seekTo calls and suppresses stale oncurrentplaytime while seeking', async () => {
    const driver = new TizenAvplayDriver();
    const container = document.createElement('div');
    const timeSpy = vi.fn();
    driver.onTimeUpdate(timeSpy);

    await driver.init(container, 'http://stream.mp4', 0);
    const listener = mockAvplay.setListener.mock.calls[0][0];
    listener.oncurrentplaytime(10000);
    timeSpy.mockClear();

    const pendingCallbacks: Array<() => void> = [];
    mockAvplay.seekTo = vi.fn((_ms: number, ok?: () => void) => {
      if (ok) pendingCallbacks.push(ok);
    });

    const firstComplete = vi.fn();
    const secondComplete = vi.fn();
    const thirdComplete = vi.fn();

    driver.seekTo(60000, firstComplete);
    driver.seekTo(90000, secondComplete);
    driver.seekTo(120000, thirdComplete);

    // Only the first seek is in flight; 90000 was superseded by 120000
    expect(mockAvplay.seekTo).toHaveBeenCalledTimes(1);
    expect(mockAvplay.seekTo).toHaveBeenCalledWith(60000, expect.any(Function), expect.any(Function));
    expect(secondComplete).toHaveBeenCalledTimes(1);

    // Stale playtime event during in-flight seek is ignored
    listener.oncurrentplaytime(10500);
    expect(timeSpy).not.toHaveBeenCalled();

    // Finish first seek -> automatically dispatches coalesced 120000 seek
    pendingCallbacks.shift()?.();
    expect(firstComplete).toHaveBeenCalledTimes(1);
    expect(mockAvplay.seekTo).toHaveBeenCalledTimes(2);
    expect(mockAvplay.seekTo).toHaveBeenLastCalledWith(
      120000,
      expect.any(Function),
      expect.any(Function)
    );

    pendingCallbacks.shift()?.();
    expect(thirdComplete).toHaveBeenCalledTimes(1);

    listener.oncurrentplaytime(120500);
    expect(timeSpy).toHaveBeenCalledWith(120500, 60000);
  });

  describe('Aspect-Ratio Letterboxing, Pillarboxing & Rotation on Samsung Tizen AVPlay', () => {
    beforeEach(() => {
      mockAvplay.setDisplayMethod = vi.fn();
      mockAvplay.setDisplayRotation = vi.fn();
      mockAvplay.getCurrentStreamInfo = vi.fn(() => []);
    });

    it('applies PLAYER_DISPLAY_MODE_LETTER_BOX after open, in READY state, and in PLAYING state', async () => {
      const callLog: string[] = [];
      mockAvplay.open = vi.fn(() => callLog.push('open'));
      mockAvplay.setDisplayRect = vi.fn((x: number, y: number, w: number, h: number) =>
        callLog.push(`rect:${x},${y},${w},${h}`)
      );
      mockAvplay.setDisplayMethod = vi.fn((mode: string) => callLog.push(`mode:${mode}`));
      mockAvplay.prepareAsync = vi.fn((ok: () => void) => {
        callLog.push('prepareAsync');
        ok();
      });
      mockAvplay.play = vi.fn(() => callLog.push('play'));

      const driver = new TizenAvplayDriver();
      await driver.init(document.createElement('div'), 'http://stream.mp4', 0);

      expect(mockAvplay.setDisplayMethod).toHaveBeenCalledWith('PLAYER_DISPLAY_MODE_LETTER_BOX');
      expect(mockAvplay.setDisplayMethod).toHaveBeenCalledTimes(3);
      expect(callLog).toEqual([
        'open',
        'rect:0,0,1920,1080',
        'mode:PLAYER_DISPLAY_MODE_LETTER_BOX',
        'prepareAsync',
        'rect:0,0,1920,1080',
        'mode:PLAYER_DISPLAY_MODE_LETTER_BOX',
        'play',
        'mode:PLAYER_DISPLAY_MODE_LETTER_BOX',
      ]);
    });

    it('keeps full 0,0,1920,1080 hardware plane + PLAYER_DISPLAY_MODE_LETTER_BOX on vertical 9:16 (1080x1920 / 720x1280) video instead of shrinking setDisplayRect to a sub-rect', async () => {
      mockAvplay.getCurrentStreamInfo = vi.fn(() => [
        { index: 0, type: 'AUDIO', extra_info: '{"channels":"2","sample_rate":"48000"}' },
        {
          index: 1,
          type: 'VIDEO',
          extra_info: '{"fourCC":"H264","Width":"1080","Height":"1920","Bit_rate":"6500000"}',
        },
      ]);

      const driver = new TizenAvplayDriver();
      const rectSpy = vi.fn();
      driver.onDisplayRectChange(rectSpy);

      await driver.init(document.createElement('div'), 'http://stream/vertical.m3u8', 0);

      for (const call of mockAvplay.setDisplayRect.mock.calls) {
        expect(call).toEqual([0, 0, 1920, 1080]);
      }
      expect(mockAvplay.setDisplayRect).toHaveBeenLastCalledWith(0, 0, 1920, 1080);
      expect(mockAvplay.setDisplayMethod).toHaveBeenLastCalledWith('PLAYER_DISPLAY_MODE_LETTER_BOX');
      expect(rectSpy).toHaveBeenCalledWith({ x: 0, y: 0, width: 1920, height: 1080 });
      expect(mockAvplay.setDisplayRotation).not.toHaveBeenCalled();
    });

    it('keeps full 0,0,1920,1080 hardware plane + PLAYER_DISPLAY_MODE_LETTER_BOX for 16:9, 4:3, and 21:9 streams while computeFittedDisplayRect remains pure', async () => {
      for (const streamCase of [
        { url: 'http://stream/movie.m3u8', extra: '{"Width":"1920","Height":"1080"}' },
        { url: 'http://stream/classic.m3u8', extra: '{"width":1440,"height":1080}' },
        { url: 'http://stream/cinema.mp4', extra: '{"Width":"3840","Height":"1600","fourCC":"HEVC"}' },
      ]) {
        mockAvplay.setDisplayRect.mockClear();
        mockAvplay.setDisplayMethod.mockClear();
        mockAvplay.getCurrentStreamInfo = vi.fn(() => [
          { type: 'VIDEO', extra_info: streamCase.extra },
        ]);

        const driver = new TizenAvplayDriver();
        const rectSpy = vi.fn();
        driver.onDisplayRectChange(rectSpy);

        await driver.init(document.createElement('div'), streamCase.url, 0);

        for (const call of mockAvplay.setDisplayRect.mock.calls) {
          expect(call).toEqual([0, 0, 1920, 1080]);
        }
        expect(mockAvplay.setDisplayMethod).toHaveBeenLastCalledWith('PLAYER_DISPLAY_MODE_LETTER_BOX');
        expect(rectSpy).toHaveBeenCalledWith({ x: 0, y: 0, width: 1920, height: 1080 });
      }

      expect(computeFittedDisplayRect(1080, 1920)).toEqual({ x: 656, y: 0, width: 608, height: 1080 });
      expect(computeFittedDisplayRect(3840, 2160)).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
      expect(computeFittedDisplayRect(1440, 1080)).toEqual({ x: 240, y: 0, width: 1440, height: 1080 });
      expect(computeFittedDisplayRect(3840, 1600)).toEqual({ x: 0, y: 140, width: 1920, height: 800 });
    });

    it('applies hardware rotation for 90° and 270° (-90°) rotated phone videos on Direct Play (not HLS) while keeping 0,0,1920,1080 + LETTER_BOX and resetting rotation on destroy', async () => {
      mockAvplay.getCurrentStreamInfo = vi.fn(() => [
        {
          type: 'VIDEO',
          extra_info: '{"Width":"1920","Height":"1080","Rotation":"90","fourCC":"H264"}',
        },
      ]);

      const driver90 = new TizenAvplayDriver();
      const rectSpy90 = vi.fn();
      driver90.onDisplayRectChange(rectSpy90);

      await driver90.init(document.createElement('div'), 'http://stream/phone90.mp4', 0);

      expect(mockAvplay.setDisplayRotation).toHaveBeenCalledWith('PLAYER_DISPLAY_ROTATION_90');
      expect(mockAvplay.setDisplayRect).toHaveBeenLastCalledWith(0, 0, 1920, 1080);
      expect(mockAvplay.setDisplayMethod).toHaveBeenLastCalledWith('PLAYER_DISPLAY_MODE_LETTER_BOX');
      expect(rectSpy90).toHaveBeenCalledWith({ x: 0, y: 0, width: 1920, height: 1080 });

      driver90.destroy();
      expect(mockAvplay.setDisplayRotation).toHaveBeenLastCalledWith('PLAYER_DISPLAY_ROTATION_NONE');

      // Test -90° (270°) orientation metadata on Direct Play
      mockAvplay.setDisplayRotation.mockClear();
      mockAvplay.getCurrentStreamInfo = vi.fn(() => [
        {
          type: 'VIDEO',
          extra_info: '{"Width":"1920","Height":"1080","orientation":"-90"}',
        },
      ]);

      const driver270 = new TizenAvplayDriver();
      await driver270.init(document.createElement('div'), 'http://stream/phone270.mp4', 0);

      expect(mockAvplay.setDisplayRotation).toHaveBeenCalledWith('PLAYER_DISPLAY_ROTATION_270');
      expect(mockAvplay.setDisplayRect).toHaveBeenLastCalledWith(0, 0, 1920, 1080);
      driver270.destroy();

      // HLS streams already have rotation baked in by ffmpeg and must NOT call setDisplayRotation
      mockAvplay.setDisplayRotation.mockClear();
      const hlsDriver = new TizenAvplayDriver();
      hlsDriver.setMediaHints({ resolution: '1080x1920', rotation: 90 });
      await hlsDriver.init(document.createElement('div'), 'http://stream/master.m3u8?video_codec=h264', 0);
      expect(mockAvplay.setDisplayRotation).not.toHaveBeenCalled();
    });

    it('uses setMediaHints rotation fallback on Direct Play when getCurrentStreamInfo omits rotation and keeps 0,0,1920,1080 + LETTER_BOX', async () => {
      mockAvplay.getCurrentStreamInfo = vi.fn(() => [
        { type: 'VIDEO', extra_info: '{"Width":"0","Height":"0"}' },
      ]);

      const hintedDriver = new TizenAvplayDriver();
      hintedDriver.setMediaHints({ resolution: '1080x1920', rotation: 90 });
      await hintedDriver.init(document.createElement('div'), 'http://stream/direct-phone.mp4', 0);

      expect(mockAvplay.setDisplayRotation).toHaveBeenCalledWith('PLAYER_DISPLAY_ROTATION_90');
      expect(mockAvplay.setDisplayRect).toHaveBeenLastCalledWith(0, 0, 1920, 1080);
      expect(mockAvplay.setDisplayMethod).toHaveBeenLastCalledWith('PLAYER_DISPLAY_MODE_LETTER_BOX');
    });

    it('never mutates setDisplayRect mid-playback on onbufferingcomplete (preventing Samsung TU7000 hardware plane blanking)', async () => {
      mockAvplay.getCurrentStreamInfo = vi.fn(() => [
        { type: 'VIDEO', extra_info: '{"Width":"1080","Height":"1920"}' },
      ]);

      const driver = new TizenAvplayDriver();
      await driver.init(document.createElement('div'), 'http://stream/master.m3u8', 0);
      expect(mockAvplay.setDisplayRect).toHaveBeenLastCalledWith(0, 0, 1920, 1080);

      mockAvplay.setDisplayRect.mockClear();
      const listener = mockAvplay.setListener.mock.calls[0][0];
      listener.onbufferingcomplete();

      expect(mockAvplay.setDisplayRect).not.toHaveBeenCalled();
    });

    it('parses resolution strings, rotation angles, and extra_info edge cases cleanly', () => {
      expect(parseResolutionDimensions('1080x1920')).toEqual({ width: 1080, height: 1920 });
      expect(parseResolutionDimensions('3840×1600')).toEqual({ width: 3840, height: 1600 });
      expect(parseResolutionDimensions('1080p')).toBeNull();
      expect(parseResolutionDimensions('4K')).toBeNull();
      expect(normalizeRotationDegrees(-90)).toBe(270);
      expect(normalizeRotationDegrees('PLAYER_DISPLAY_ROTATION_90')).toBe(90);
      expect(
        extractAvplayVideoMetadata([
          { type: 'VIDEO', extra_info: 'Width=1440,Height=1080,Rotation=0' },
        ])
      ).toEqual({ width: 1440, height: 1080, rotation: 0 });
    });
  });
});

describe('createPlayerDriver factory', () => {
  afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).webapis;
  });

  it('returns Html5PlayerDriver when webapis is not available', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).webapis;
    const driver = createPlayerDriver();
    expect(driver).toBeInstanceOf(Html5PlayerDriver);
  });

  it('returns TizenAvplayDriver when webapis.avplay is available', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).webapis = { avplay: {} };
    const driver = createPlayerDriver();
    expect(driver).toBeInstanceOf(TizenAvplayDriver);
  });
});
