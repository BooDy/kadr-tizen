import { CardViewModel } from './ast';

export type UserRole = 'admin' | 'user';

export interface ProfileCard {
  id: string;
  username: string;
  role: UserRole;
}

export interface DiscoveryResponse {
  app: string;
  server_id: string;
  name: string;
  version: string;
  protocol_version: number;
  port: number;
  setup_completed: boolean;
  status: string;
}

export interface DiscoveredServer {
  url: string;
  name: string;
  server_id: string;
}

export interface AuthSuccess {
  token: string;
  user_id: string;
  username: string;
  role: UserRole;
}

export interface AuthResult {
  success: boolean;
  data?: AuthSuccess;
  error?: string;
  lockedOut?: boolean;
  retryAfterSecs?: number;
}

export interface EpisodeCard {
  id: number;
  title: string;
  subtitle?: string;
  season: number;
  episode: number;
  playback_progress?: number;
  badge?: string;
  poster_url?: string;
}

export interface MediaItemDetail {
  id: number | string;
  title?: string;
  card?: CardViewModel;
  overview?: string;
  genres?: string[];
  duration_seconds?: number;
  duration_ms?: number;
  stream_url?: string;
  resume_position_seconds?: number;
  resume_position_ms?: number;
  episodes?: EpisodeCard[] | null;
  library_id?: string;
  folder_path?: string;
  media_type?: string;
  resolution?: string;
  poster_url?: string;
  backdrop_url?: string;
  release_year?: number;
  technical?: {
    duration_seconds?: number;
    resolution?: string;
    width?: number;
    height?: number;
    rotation?: number;
    video_codec?: string;
    audio_codec?: string;
    audio_channels?: number;
    container?: string;
    audio_tracks?: AudioStreamInfo[];
  };
}

export interface AudioStreamInfo {
  audio_index: number;
  stream_index: number;
  codec: string;
  channels?: number;
  language: string;
  title?: string;
  is_default?: boolean;
  is_commentary?: boolean;
}

export interface PlaybackSession {
  session_id: string;
  media_item_id: number;
  duration_seconds: number;
  resume_position_seconds: number;
}

export interface SubtitleTrack {
  id: number;
  media_item_id: number;
  source: string;
  language: string;
  title: string;
  format: string;
  stream_index?: number;
  is_default: boolean;
  is_forced: boolean;
  stream_url: string;
}

export interface FolderBreadcrumb {
  name: string;
  path: string;
}

export interface FolderDirectory {
  name: string;
  path: string;
  item_count: number;
}

export interface FolderImage {
  name: string;
  path: string;
  url: string;
  size_bytes: number;
}

export interface LibraryFolderResponse {
  library_id: string;
  library_name: string;
  current_path: string;
  parent_path?: string;
  breadcrumbs: FolderBreadcrumb[];
  directories: FolderDirectory[];
  items: CardViewModel[];
  images: FolderImage[];
}

export type SearchFilterType =
  | 'all'
  | 'movie'
  | 'show'
  | 'episode'
  | 'anime'
  | 'music'
  | 'audiobook'
  | 'live_channel';

export interface SearchResultItem {
  id: number;
  library_id: string;
  library_name: string;
  item_type: string;
  title: string;
  original_title?: string | null;
  release_year?: number | null;
  overview?: string | null;
  poster_url: string;
  backdrop_url?: string | null;
  badge?: string | null;
  rating?: number | null;
  duration_seconds: number;
  playback_progress?: number | null;
  series_title?: string | null;
  season?: number | null;
  episode?: number | null;
  genres?: string[];
  director?: string | null;
}

export interface SearchResponse {
  query: string;
  total: number;
  items: SearchResultItem[];
}
