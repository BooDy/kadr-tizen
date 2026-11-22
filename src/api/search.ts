import { ApiClient } from './client';
import { SearchFilterType, SearchResponse } from '../types/kadr';

export const DEFAULT_TV_SEARCH_LIMIT = 48;

export interface FetchSearchOptions {
  q: string;
  itemType?: SearchFilterType;
  libraryId?: string;
  limit?: number;
  signal?: AbortSignal;
}

export interface SavedSearchState {
  query: string;
  filter: SearchFilterType;
}

let savedState: SavedSearchState = {
  query: '',
  filter: 'all',
};

export function getSavedSearchState(): SavedSearchState {
  return { ...savedState };
}

export function setSavedSearchState(next: SavedSearchState): void {
  savedState = {
    query: next.query,
    filter: next.filter,
  };
}

export function resetSavedSearchState(): void {
  savedState = {
    query: '',
    filter: 'all',
  };
}

export async function fetchSearchResults(
  client: ApiClient,
  options: FetchSearchOptions
): Promise<SearchResponse> {
  const trimmed = options.q.trim();
  if (!trimmed) {
    return { query: '', total: 0, items: [] };
  }

  const params = new URLSearchParams();
  params.set('q', trimmed);
  params.set('limit', String(options.limit ?? DEFAULT_TV_SEARCH_LIMIT));
  if (options.itemType && options.itemType !== 'all') {
    params.set('item_type', options.itemType);
  }
  if (options.libraryId && options.libraryId.trim()) {
    params.set('library_id', options.libraryId.trim());
  }

  return client.fetch<SearchResponse>(`/api/v1/search?${params.toString()}`, {
    signal: options.signal,
  });
}
