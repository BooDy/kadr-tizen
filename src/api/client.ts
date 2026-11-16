export class ApiClient {
  private baseUrl: string;
  private token: string | null = null;
  private libraryUnlockTokens: Map<string, string> = new Map();

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  setToken(token: string | null) {
    this.token = token;
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

  clearLibraryUnlockTokens(): void {
    this.libraryUnlockTokens.clear();
  }

  getUnlockTokens(): string[] {
    return Array.from(this.libraryUnlockTokens.values());
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  async fetch<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers = new Headers(options.headers || {});
    if (this.token) {
      headers.set('Authorization', `Bearer ${this.token}`);
    }
    headers.set('Accept', 'application/json');

    if (this.libraryUnlockTokens.size > 0) {
      const tokens = Array.from(this.libraryUnlockTokens.values());
      headers.set('X-Kadr-Unlocked', tokens.join(','));
      headers.set('X-Library-Unlock-Token', tokens[0]);
    }

    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const res = await fetch(url, { ...options, headers });

    if (!res.ok) {
      throw new Error(`HTTP error ${res.status}: ${res.statusText}`);
    }
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
  async fetchText(urlOrPath: string, options: RequestInit = {}): Promise<string> {
    const headers = new Headers(options.headers || {});
    if (this.token) {
      headers.set('Authorization', `Bearer ${this.token}`);
    }
    headers.set('Accept', 'text/vtt, text/plain, application/x-subrip, */*');

    if (this.libraryUnlockTokens.size > 0) {
      const tokens = Array.from(this.libraryUnlockTokens.values());
      headers.set('X-Kadr-Unlocked', tokens.join(','));
      headers.set('X-Library-Unlock-Token', tokens[0]);
    }

    const url = /^https?:\/\//i.test(urlOrPath)
      ? urlOrPath
      : `${this.baseUrl}${urlOrPath.startsWith('/') ? urlOrPath : `/${urlOrPath}`}`;
    const res = await fetch(url, { ...options, headers });
    if (!res.ok) {
      throw new Error(`HTTP error ${res.status}: ${res.statusText}`);
    }
    return res.text();
  }
}
