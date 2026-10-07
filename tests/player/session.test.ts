import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PlaybackSessionManager } from '../../src/player/session';
import { ApiClient } from '../../src/api/client';
import * as playbackApi from '../../src/api/playback';

describe('PlaybackSessionManager', () => {
  let client: ApiClient;

  beforeEach(() => {
    vi.useFakeTimers();
    client = new ApiClient('http://localhost:8492');
    client.setToken('test-token');
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts session, sends progress heartbeats, and cleans up on destroy', async () => {
    const startSpy = vi.spyOn(playbackApi, 'startPlaybackSession').mockResolvedValue({
      session_id: 'sess-123',
      media_item_id: 101,
      duration_seconds: 3600,
      resume_position_seconds: 50,
    });
    const progressSpy = vi.spyOn(playbackApi, 'reportSessionProgress').mockResolvedValue();
    const endSpy = vi.spyOn(playbackApi, 'endPlaybackSession').mockResolvedValue();

    const manager = new PlaybackSessionManager(client);
    expect(manager.getSessionId()).toBeNull();

    const session = await manager.start(101);

    expect(startSpy).toHaveBeenCalledWith(client, 101);
    expect(session?.session_id).toBe('sess-123');
    expect(session?.resume_position_seconds).toBe(50);
    expect(manager.getSessionId()).toBe('sess-123');

    // Heartbeat reporting
    await manager.updateProgress(60);
    expect(progressSpy).toHaveBeenCalledWith(client, 'sess-123', 60);

    // Destroy
    await manager.destroy();
    expect(endSpy).toHaveBeenCalledWith(client, 'sess-123');
    expect(manager.getSessionId()).toBeNull();

    // Subsequent destroy is a no-op
    await manager.destroy();
    expect(endSpy).toHaveBeenCalledTimes(1);
  });

  it('handles offline/failure on start gracefully without throwing unhandled exceptions', async () => {
    vi.spyOn(playbackApi, 'startPlaybackSession').mockRejectedValue(new Error('Network error'));
    const manager = new PlaybackSessionManager(client);
    const session = await manager.start(101);
    expect(session).toBeNull();
    expect(manager.getSessionId()).toBeNull();

    // updateProgress when no active session should not call reportSessionProgress
    const progressSpy = vi.spyOn(playbackApi, 'reportSessionProgress');
    await manager.updateProgress(30);
    expect(progressSpy).not.toHaveBeenCalled();

    // destroy when no active session should not throw
    await expect(manager.destroy()).resolves.not.toThrow();
  });

  it('swallows errors silently during updateProgress and destroy', async () => {
    vi.spyOn(playbackApi, 'startPlaybackSession').mockResolvedValue({
      session_id: 'sess-err',
      media_item_id: 101,
      duration_seconds: 1000,
      resume_position_seconds: 0,
    });
    vi.spyOn(playbackApi, 'reportSessionProgress').mockRejectedValue(new Error('Network lost'));
    vi.spyOn(playbackApi, 'endPlaybackSession').mockRejectedValue(new Error('Server unavailable'));

    const manager = new PlaybackSessionManager(client);
    await manager.start(101);

    await expect(manager.updateProgress(45)).resolves.not.toThrow();
    await expect(manager.destroy()).resolves.not.toThrow();
    expect(manager.getSessionId()).toBeNull();
  });

  it('ends existing active session when start is called again', async () => {
    const endSpy = vi.spyOn(playbackApi, 'endPlaybackSession').mockResolvedValue();
    vi.spyOn(playbackApi, 'startPlaybackSession')
      .mockResolvedValueOnce({
        session_id: 'sess-1',
        media_item_id: 101,
        duration_seconds: 1000,
        resume_position_seconds: 0,
      })
      .mockResolvedValueOnce({
        session_id: 'sess-2',
        media_item_id: 102,
        duration_seconds: 1000,
        resume_position_seconds: 10,
      });

    const manager = new PlaybackSessionManager(client);
    await manager.start(101);
    expect(manager.getSessionId()).toBe('sess-1');

    await manager.start(102);
    expect(endSpy).toHaveBeenCalledWith(client, 'sess-1');
    expect(manager.getSessionId()).toBe('sess-2');
  });

  it('immediately destroys session if destroy() is called while start() is in-flight', async () => {
    let resolveStart!: (value: any) => void;
    const startPromise = new Promise((resolve) => {
      resolveStart = resolve;
    });

    vi.spyOn(playbackApi, 'startPlaybackSession').mockReturnValue(startPromise as any);
    const endSpy = vi.spyOn(playbackApi, 'endPlaybackSession').mockResolvedValue();

    const manager = new PlaybackSessionManager(client);
    const startCall = manager.start(101);

    // Call destroy while start() is in-flight
    await manager.destroy();

    // Now resolve startPlaybackSession
    resolveStart({
      session_id: 'sess-inflight',
      media_item_id: 101,
      duration_seconds: 1000,
      resume_position_seconds: 0,
    });

    const result = await startCall;

    expect(result).toBeNull();
    expect(manager.getSessionId()).toBeNull();
    expect(endSpy).toHaveBeenCalledWith(client, 'sess-inflight');
  });
});
