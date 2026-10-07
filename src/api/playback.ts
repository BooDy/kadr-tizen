export async function reportPlaybackProgress(
  serverUrl: string,
  token: string,
  itemId: string,
  positionMs: number,
  isPaused: boolean
): Promise<void> {
  const cleanUrl = serverUrl.replace(/\/+$/, '');
  await fetch(`${cleanUrl}/api/v1/playback/progress`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      item_id: itemId,
      position_ms: positionMs,
      is_paused: isPaused,
    }),
  }).catch(() => {});
}
