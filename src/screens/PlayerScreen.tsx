import { useEffect, useRef, useState, useCallback } from 'react';
import { createPlayerDriver } from '../player/avplay-driver';
import { PlayerDriver, PlayerState } from '../player/driver';
import { reportPlaybackProgress } from '../api/playback';
import { TVKeys } from '../navigation/keys';
import { PlayerOSD } from '../components/osd/PlayerOSD';

export interface PlayerScreenProps {
  itemId: string;
  title: string;
  serverUrl: string;
  token: string;
  initialTimeMs?: number;
  onExit: () => void;
}

export function PlayerScreen({
  itemId,
  title,
  serverUrl,
  token,
  initialTimeMs = 0,
  onExit,
}: PlayerScreenProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const driverRef = useRef<PlayerDriver | null>(null);
  const [playerState, setPlayerState] = useState<PlayerState>('buffering');
  const [positionMs, setPositionMs] = useState(initialTimeMs);
  const [durationMs, setDurationMs] = useState(0);
  const [showOSD, setShowOSD] = useState(true);

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

    driver.init(containerRef.current, streamUrl, initialTimeMs);

    // 10s Scrobble interval
    const scrobbleInterval = setInterval(() => {
      reportPlaybackProgress(
        serverUrl,
        token,
        itemId,
        positionMsRef.current,
        playerStateRef.current === 'paused'
      );
    }, 10000);

    return () => {
      clearInterval(scrobbleInterval);
      if (osdTimerRef.current) clearTimeout(osdTimerRef.current);
      // Final scrobble sync before teardown
      reportPlaybackProgress(serverUrl, token, itemId, positionMsRef.current, true);
      driver.destroy();
    };
  }, [itemId, serverUrl, token, initialTimeMs]);

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
        onExit();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onExit, resetOsdTimer]);

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
