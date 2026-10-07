import { ApiClient } from './client';

export interface UnlockLibraryResponse {
  token: string;
  unlock_token: string;
  expires_at?: number;
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
    }
  );
}
