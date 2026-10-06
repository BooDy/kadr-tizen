import { ProfileCard, AuthResult } from '../types/kadr';

export async function listProfiles(serverUrl: string): Promise<ProfileCard[]> {
  const cleanUrl = serverUrl.replace(/\/+$/, '');
  const res = await fetch(`${cleanUrl}/api/v1/users/profiles`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Failed to load profiles (${res.status})`);
  }
  return res.json();
}

export async function authenticatePin(serverUrl: string, userId: string, pin: string): Promise<AuthResult> {
  const cleanUrl = serverUrl.replace(/\/+$/, '');
  try {
    const res = await fetch(`${cleanUrl}/api/v1/auth/pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ user_id: userId, pin }),
    });

    if (res.status === 429) {
      const data = await res.json().catch(() => ({}));
      const retryAfter = Number(res.headers.get('Retry-After')) || data.retry_after_seconds || 30;
      return { success: false, lockedOut: true, retryAfterSecs: retryAfter, error: 'Too many attempts. Locked out.' };
    }

    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: 'Invalid PIN' }));
      return { success: false, error: data.error || 'Invalid PIN' };
    }

    const data = await res.json();
    return { success: true, data };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Network error';
    return { success: false, error: msg };
  }
}
