export type PlaylistUpdatedAction = 'created' | 'updated' | 'deleted' | 'items_changed';

export interface PlaylistUpdatedPayload {
  playlist_id: string;
  user_id: string;
  action: PlaylistUpdatedAction;
  timestamp: number;
}

export function subscribeEvents(
  serverUrl: string,
  token: string | null,
  onEvent: (eventType: string, payload: unknown) => void,
  onError?: (err: unknown) => void
): () => void {
  const cleanUrl = serverUrl.replace(/\/+$/, '');
  const url = `${cleanUrl}/api/v1/events${token ? `?token=${encodeURIComponent(token)}` : ''}`;
  const es = new EventSource(url);

  const eventNames = ['layout:changed', 'session:synced', 'library:updated', 'playlist:updated'];
  const listeners: Array<{ name: string; handler: (ev: MessageEvent) => void }> = [];

  for (const name of eventNames) {
    const handler = (ev: MessageEvent) => {
      let data = ev.data;
      try {
        data = JSON.parse(ev.data);
      } catch {
        // fallback to raw data if not JSON
      }
      onEvent(name, data);
    };
    es.addEventListener(name, handler);
    listeners.push({ name, handler });
  }

  if (onError) {
    es.onerror = (err: unknown) => {
      onError(err);
    };
  }

  return () => {
    for (const { name, handler } of listeners) {
      es.removeEventListener(name, handler);
    }
    es.close();
  };
}
