import { ApiClient } from './client';
import { ScreenLayout } from '../types/ast';

export async function fetchScreenLayout(client: ApiClient, screenId: string): Promise<ScreenLayout> {
  return client.fetch<ScreenLayout>(`/api/v1/screens/${screenId}`);
}
