import { ApiClient } from '../api/client';
import { PlaybackSession } from '../types/kadr';
import { startPlaybackSession, reportSessionProgress, endPlaybackSession } from '../api/playback';

export class PlaybackSessionManager {
  private client: ApiClient;
  private sessionId: string | null = null;
  private isDestroyed: boolean = false;
  private currentStartId: number = 0;

  constructor(client: ApiClient) {
    this.client = client;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  async start(mediaItemId: number): Promise<PlaybackSession | null> {
    if (this.sessionId) {
      await this.destroy();
    }
    this.isDestroyed = false;
    const startId = ++this.currentStartId;

    try {
      const session = await startPlaybackSession(this.client, mediaItemId);
      if (this.isDestroyed || this.currentStartId !== startId) {
        try {
          await endPlaybackSession(this.client, session.session_id);
        } catch {
          // Silent catch
        }
        return null;
      }
      this.sessionId = session.session_id;
      return session;
    } catch {
      if (this.currentStartId === startId) {
        this.sessionId = null;
      }
      return null;
    }
  }

  async updateProgress(positionSeconds: number): Promise<void> {
    if (this.isDestroyed || !this.sessionId) return;
    try {
      await reportSessionProgress(this.client, this.sessionId, positionSeconds);
    } catch {
      // Catches any error silently to avoid disrupting playback
    }
  }

  async destroy(): Promise<void> {
    this.isDestroyed = true;
    this.currentStartId++;
    if (!this.sessionId) return;
    const currentSessionId = this.sessionId;
    this.sessionId = null;
    try {
      await endPlaybackSession(this.client, currentSessionId);
    } catch {
      // Catches any error silently
    }
  }
}
