import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listProfiles, authenticatePin } from '../../src/api/auth';

describe('Auth API', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('listProfiles', () => {
    it('lists profiles correctly', async () => {
      const mockProfiles = [
        { id: 'u1', username: 'Boody', role: 'admin' },
        { id: 'u2', username: 'Guest', role: 'user' },
      ];
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockProfiles,
      });

      const profiles = await listProfiles('http://localhost:8492');
      expect(profiles).toHaveLength(2);
      expect(profiles[0].username).toBe('Boody');
      expect(global.fetch).toHaveBeenCalledWith('http://localhost:8492/api/v1/users/profiles', {
        headers: { Accept: 'application/json' },
      });
    });

    it('strips trailing slashes from serverUrl', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [],
      });

      await listProfiles('http://localhost:8492///');
      expect(global.fetch).toHaveBeenCalledWith('http://localhost:8492/api/v1/users/profiles', {
        headers: { Accept: 'application/json' },
      });
    });

    it('throws error when response is not ok', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });

      await expect(listProfiles('http://localhost:8492')).rejects.toThrow(
        'Failed to load profiles (500)'
      );
    });
  });

  describe('authenticatePin', () => {
    it('successfully authenticates with valid credentials', async () => {
      const mockSuccessData = {
        token: 'jwt-token-xyz',
        user_id: 'u1',
        username: 'Boody',
        role: 'admin',
      };
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockSuccessData,
      });

      const res = await authenticatePin('http://localhost:8492', 'u1', '1234');
      expect(res.success).toBe(true);
      expect(res.data).toEqual(mockSuccessData);
      expect(global.fetch).toHaveBeenCalledWith('http://localhost:8492/api/v1/auth/pin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ user_id: 'u1', pin: '1234' }),
      });
    });

    it('handles 429 lockout rate limiting during PIN auth using Retry-After header', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        headers: new Headers({ 'Retry-After': '30' }),
        json: async () => ({ error: 'Too many attempts', retry_after_seconds: 30 }),
      });

      const res = await authenticatePin('http://localhost:8492', 'u1', '0000');
      expect(res.success).toBe(false);
      expect(res.lockedOut).toBe(true);
      expect(res.retryAfterSecs).toBe(30);
      expect(res.error).toBe('Too many attempts. Locked out.');
    });

    it('handles 429 lockout rate limiting falling back to json body retry_after_seconds', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        headers: new Headers(),
        json: async () => ({ error: 'Too many attempts', retry_after_seconds: 45 }),
      });

      const res = await authenticatePin('http://localhost:8492', 'u1', '0000');
      expect(res.success).toBe(false);
      expect(res.lockedOut).toBe(true);
      expect(res.retryAfterSecs).toBe(45);
    });

    it('handles invalid PIN response with custom error message from server', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        headers: new Headers(),
        json: async () => ({ error: 'Incorrect PIN provided' }),
      });

      const res = await authenticatePin('http://localhost:8492', 'u1', '9999');
      expect(res.success).toBe(false);
      expect(res.error).toBe('Incorrect PIN provided');
    });

    it('handles invalid PIN response when server returns no json body', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        headers: new Headers(),
        json: async () => {
          throw new Error('Not JSON');
        },
      });

      const res = await authenticatePin('http://localhost:8492', 'u1', '9999');
      expect(res.success).toBe(false);
      expect(res.error).toBe('Invalid PIN');
    });

    it('handles network failure gracefully', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network disconnected'));

      const res = await authenticatePin('http://localhost:8492', 'u1', '1234');
      expect(res.success).toBe(false);
      expect(res.error).toBe('Network disconnected');
    });
  });
});
