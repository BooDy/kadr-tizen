import { ApiClient } from './client';
import { ScreenLayout, ScreenSummary, WidgetDataResponse } from '../types/ast';

export async function fetchScreens(client: ApiClient): Promise<ScreenSummary[]> {
  return client.fetch<ScreenSummary[]>('/api/v1/screens');
}

export async function fetchScreenLayout(client: ApiClient, screenId: string): Promise<ScreenLayout> {
  return client.fetch<ScreenLayout>(`/api/v1/screens/${encodeURIComponent(screenId)}`);
}

export async function fetchWidgetData(
  client: ApiClient,
  widgetId: string,
  screenId?: string,
  offset = 0,
  limit = 20
): Promise<WidgetDataResponse> {
  const params = new URLSearchParams();
  if (screenId) params.set('screen_id', screenId);
  params.set('offset', String(offset));
  params.set('limit', String(limit));

  return client.fetch<WidgetDataResponse>(`/api/v1/widgets/${encodeURIComponent(widgetId)}/data?${params.toString()}`);
}
