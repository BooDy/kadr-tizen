import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Html5PlayerDriver } from '../../src/player/html5-driver';
import { TizenAvplayDriver, createPlayerDriver } from '../../src/player/avplay-driver';

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
    expect(errorSpy).toHaveBeenCalledWith('HTML5 Video Error');
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
      seekTo: vi.fn(),
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
    expect(mockAvplay.seekTo).toHaveBeenCalledWith(15000);
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

    expect(mockAvplay.seekTo).not.toHaveBeenCalled();
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

    expect(errorSpy).toHaveBeenCalledWith('AVPlay Prepare Error');
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
    expect(mockAvplay.seekTo).toHaveBeenCalledWith(25000);

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
