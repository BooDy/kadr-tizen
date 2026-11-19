export interface ApiRequestOptions extends RequestInit {
  skipUnauthorizedHandler?: boolean;
}

export class ApiClient {
  private baseUrl: string;
  private token: string | null = null;
  private libraryUnlockTokens: Map<string, string> = new Map();
  private onUnauthorizedHandler: (() => void) | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  setToken(token: string | null) {
    this.token = token;
  }

  setOnUnauthorized(handler: (() => void) | null): void {
    this.onUnauthorizedHandler = handler;
  }

  setLibraryUnlockToken(libraryId: string, token: string): void {
    this.libraryUnlockTokens.set(libraryId, token);
  }

  getLibraryUnlockToken(libraryId: string): string | undefined {
    return this.libraryUnlockTokens.get(libraryId);
  }

  isLibraryUnlocked(libraryId: string): boolean {
    return this.libraryUnlockTokens.has(libraryId);
  }

  removeLibraryUnlockToken(libraryId: string): void {
    this.libraryUnlockTokens.delete(libraryId);
  }

  clearLibraryUnlockTokens(): void {
    this.libraryUnlockTokens.clear();
  }

  getUnlockTokens(): string[] {
    return Array.from(this.libraryUnlockTokens.values());
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  private async request(
    url: string,
    accept: string,
    options: ApiRequestOptions = {}
  ): Promise<Response> {
    const { skipUnauthorizedHandler, ...fetchInit } = options;
    const headers = new Headers(fetchInit.headers || {});
    if (this.token) {
      headers.set('Authorization', `Bearer ${this.token}`);
    }
    headers.set('Accept', accept);

    if (this.libraryUnlockTokens.size > 0) {
      const tokens = Array.from(this.libraryUnlockTokens.values());
      headers.set('X-Kadr-Unlocked', tokens.join(','));
      headers.set('X-Library-Unlock-Token', tokens[0]);
    }

    const res = await fetch(url, { ...fetchInit, headers });

    if (!res.ok) {
      if (res.status === 401 && this.token !== null && !skipUnauthorizedHandler) {
        // Clear token synchronously so concurrent 401s trigger the callback once.
        this.token = null;
        this.onUnauthorizedHandler?.();
      }
      throw new Error(`HTTP error ${res.status}: ${res.statusText}`);
    }

    return res;
  }

  async fetch<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const res = await this.request(url, 'application/json', options);

    if (res.status === 204) {
      return undefined as T;
    }
    if (typeof res.json === 'function') {
      try {
        return await res.json();
      } catch {
        return undefined as T;
      }
    }
    return undefined as T;
  }

  /** Fetch a text resource (e.g. a subtitle file) with the same auth headers as `fetch`. */
  async fetchText(urlOrPath: string, options: ApiRequestOptions = {}): Promise<string> {
    const url = /^https?:\/\//i.test(urlOrPath)
      ? urlOrPath
      : `${this.baseUrl}${urlOrPath.startsWith('/') ? urlOrPath : `/${urlOrPath}`}`;
    const res = await this.request(
      url,
      'text/vtt, text/plain, application/x-subrip, */*',
      options
    );
    return res.text();
  }
}
