import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { createPlayerDriver } from '../player/avplay-driver';
import { PlayerDriver, PlayerState } from '../player/driver';
import { reportPlaybackProgress } from '../api/playback';
import { ApiClient } from '../api/client';
import { PlaybackSessionManager } from '../player/session';
import { TVKeys } from '../navigation/keys';
import { PlayerOSD } from '../components/osd/PlayerOSD';

export interface PlayerScreenProps {
  itemId: number | string;
  title: string;
  serverUrl: string;
  token: string;
  initialTimeMs?: number;
  initialResumeMs?: number;
  client?: ApiClient;
  onExit: () => void;
}

export function PlayerScreen({
  itemId,
  title,
  serverUrl,
  token,
  initialTimeMs = 0,
  initialResumeMs,
  client,
  onExit,
}: PlayerScreenProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const driverRef = useRef<PlayerDriver | null>(null);
  const initialResume = initialResumeMs ?? initialTimeMs ?? 0;
  const [playerState, setPlayerState] = useState<PlayerState>('buffering');
  const [positionMs, setPositionMs] = useState(initialResume);
  const [durationMs, setDurationMs] = useState(0);
  const [showOSD, setShowOSD] = useState(true);

  const apiClient = useMemo(() => {
    if (client) return client;
    const c = new ApiClient(serverUrl);
    if (token) c.setToken(token);
    return c;
  }, [client, serverUrl, token]);

  const sessionManager = useMemo(() => new PlaybackSessionManager(apiClient), [apiClient]);
  const hasActiveSessionRef = useRef(false);

  const positionMsRef = useRef(positionMs);
  positionMsRef.current = positionMs;

  const durationMsRef = useRef(durationMs);
  durationMsRef.current = durationMs;

  const playerStateRef = useRef(playerState);
  playerStateRef.current = playerState;

  const osdTimerRef = useRef<NodeJS.Timeout | null>(null);

  const resetOsdTimer = useCallback(() => {
    setShowOSD(true);
    if (osdTimerRef.current) clearTimeout(osdTimerRef.current);
    if (playerStateRef.current === 'playing') {
      osdTimerRef.current = setTimeout(() => {
        setShowOSD(false);
      }, 4000);
    }
  }, []);

  useEffect(() => {
    if (playerState === 'playing') {
      if (osdTimerRef.current) clearTimeout(osdTimerRef.current);
      osdTimerRef.current = setTimeout(() => {
        setShowOSD(false);
      }, 4000);
    } else {
      setShowOSD(true);
      if (osdTimerRef.current) clearTimeout(osdTimerRef.current);
    }
  }, [playerState]);

  useEffect(() => {
    if (!containerRef.current) return;
    let isMounted = true;

    const cleanServerUrl = serverUrl.replace(/\/+$/, '');
    const streamUrl = `${cleanServerUrl}/api/v1/streaming/${itemId}`;
    const driver = createPlayerDriver();
    driverRef.current = driver;

    driver.onTimeUpdate((pos, dur) => {
      setPositionMs(pos);
      setDurationMs(dur);
      positionMsRef.current = pos;
      durationMsRef.current = dur;
    });

    driver.onStateChange((state) => {
      setPlayerState(state);
      playerStateRef.current = state;
    });

    driver.init(containerRef.current, streamUrl, initialResume);

    const numericItemId = typeof itemId === 'number' ? itemId : parseInt(itemId, 10);
    if (!isNaN(numericItemId)) {
      sessionManager.start(numericItemId).then((session) => {
        if (!isMounted) {
          sessionManager.destroy();
          return;
        }
        if (session) {
          hasActiveSessionRef.current = true;
          if (session.resume_position_seconds > 0 && initialResume === 0) {
            const resumeMs = session.resume_position_seconds * 1000;
            driver.seekTo(resumeMs);
            setPositionMs(resumeMs);
            positionMsRef.current = resumeMs;
          }
        }
      });
    }

    // 10s Scrobble interval
    const scrobbleInterval = setInterval(() => {
      if (hasActiveSessionRef.current) {
        sessionManager.updateProgress(Math.floor(positionMsRef.current / 1000));
      } else {
        reportPlaybackProgress(
          serverUrl,
          token,
          itemId,
          positionMsRef.current,
          playerStateRef.current === 'paused'
        );
      }
    }, 10000);

    return () => {
      isMounted = false;
      clearInterval(scrobbleInterval);
      if (osdTimerRef.current) clearTimeout(osdTimerRef.current);
      // Final scrobble sync before teardown
      if (hasActiveSessionRef.current) {
        sessionManager.updateProgress(Math.floor(positionMsRef.current / 1000));
        sessionManager.destroy();
      } else {
        reportPlaybackProgress(serverUrl, token, itemId, positionMsRef.current, true);
        sessionManager.destroy();
      }
      driver.destroy();
    };
  }, [itemId, serverUrl, token, initialResume, sessionManager]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const code = e.keyCode || e.which;
      resetOsdTimer();

      if (
        code === TVKeys.ENTER ||
        code === TVKeys.PLAY_PAUSE ||
        code === TVKeys.PLAY ||
        code === TVKeys.PAUSE
      ) {
        if (playerStateRef.current === 'playing') {
          driverRef.current?.pause();
        } else {
          driverRef.current?.play();
        }
      } else if (code === TVKeys.LEFT) {
        const newPos = Math.max(0, positionMsRef.current - 10000);
        positionMsRef.current = newPos;
        setPositionMs(newPos);
        driverRef.current?.seekTo(newPos);
      } else if (code === TVKeys.RIGHT) {
        const maxPos = durationMsRef.current > 0 ? durationMsRef.current : Infinity;
        const newPos = Math.min(maxPos, positionMsRef.current + 10000);
        positionMsRef.current = newPos;
        setPositionMs(newPos);
        driverRef.current?.seekTo(newPos);
      } else if (
        code === TVKeys.BACK_TIZEN ||
        code === TVKeys.BACK_WEB ||
        code === TVKeys.BACKSPACE ||
        e.key === 'Escape'
      ) {
        e.preventDefault();
        sessionManager.updateProgress(Math.floor(positionMsRef.current / 1000));
        sessionManager.destroy();
        onExit();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onExit, resetOsdTimer, sessionManager]);

  return (
    <div className="relative w-full h-full bg-transparent overflow-hidden select-none">
      <div ref={containerRef} className="w-full h-full bg-transparent" />
      <PlayerOSD
        title={title}
        playerState={playerState}
        positionMs={positionMs}
        durationMs={durationMs}
        visible={showOSD}
      />
    </div>
  );
}
