import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiClient } from '../../src/api/client';

describe('ApiClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('normalizes base url by stripping trailing slashes', () => {
    const client = new ApiClient('http://192.168.1.50:8492///');
    expect(client.getBaseUrl()).toBe('http://192.168.1.50:8492');
  });

  it('performs GET request and parses JSON', async () => {
    const client = new ApiClient('http://192.168.1.50:8492');
    const mockData = { version: '1.0.0' };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockData,
    });

    const res = await client.fetch<typeof mockData>('/api/v1/system/info');
    expect(res).toEqual(mockData);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://192.168.1.50:8492/api/v1/system/info',
      expect.objectContaining({
        headers: expect.any(Headers),
      })
    );
  });

  it('adds Authorization bearer header when token is set', async () => {
    const client = new ApiClient('http://192.168.1.50:8492');
    client.setToken('auth-token-123');

    global.fetch = vi.fn().mockImplementation(async (_url, init) => {
      const headers = init.headers as Headers;
      expect(headers.get('Authorization')).toBe('Bearer auth-token-123');
      expect(headers.get('Accept')).toBe('application/json');
      return {
        ok: true,
        json: async () => ({ success: true }),
      };
    });

    await client.fetch('test-path');
  });

  it('removes Authorization header if token is set to null', async () => {
    const client = new ApiClient('http://192.168.1.50:8492');
    client.setToken('auth-token-123');
    client.setToken(null);

    global.fetch = vi.fn().mockImplementation(async (_url, init) => {
      const headers = init.headers as Headers;
      expect(headers.get('Authorization')).toBeNull();
      return {
        ok: true,
        json: async () => ({ success: true }),
      };
    });

    await client.fetch('/test-path');
  });

  it('throws error when response is not ok', async () => {
    const client = new ApiClient('http://192.168.1.50:8492');

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
    });

    await expect(client.fetch('/secret')).rejects.toThrow('HTTP error 403: Forbidden');
  });
});
