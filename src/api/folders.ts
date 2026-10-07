import { ApiClient } from './client';
import { LibraryFolderResponse } from '../types/kadr';

export async function fetchLibraryFolders(
  client: ApiClient,
  libraryId: string,
  path?: string
): Promise<LibraryFolderResponse> {
  const query = path !== undefined && path !== '' ? `?path=${encodeURIComponent(path)}` : '';
  return client.fetch<LibraryFolderResponse>(
    `/api/v1/libraries/${encodeURIComponent(libraryId)}/folders${query}`
  );
}
