import { ApiClient } from './client';

export interface UnlockLibraryResponse {
  token: string;
  unlock_token: string;
  expires_at?: number;
}

export interface LibrarySummary {
  id: string;
  name: string;
  media_type?: string;
  is_private: boolean;
}

export async function fetchLibraries(client: ApiClient): Promise<LibrarySummary[]> {
  return client.fetch<LibrarySummary[]>('/api/v1/libraries');
}

export async function unlockLibrary(
  client: ApiClient,
  libraryId: string,
  pin: string
): Promise<UnlockLibraryResponse> {
  return client.fetch<UnlockLibraryResponse>(
    `/api/v1/libraries/${encodeURIComponent(libraryId)}/unlock`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ pin }),
      skipUnauthorizedHandler: true,
    }
  );
}
