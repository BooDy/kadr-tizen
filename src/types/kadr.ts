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
