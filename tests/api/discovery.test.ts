import { describe, it, expect, vi, beforeEach } from 'vitest';
import { verifyServer, probeSubnet, discoverLocalServers } from '../../src/api/discovery';

describe('Discovery API', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('verifyServer', () => {
    it('validates a responsive Kadr server', async () => {
      const mockResponse = {
        app: 'kadr',
        server_id: 'test-uuid',
        name: 'Living Room Server',
        version: '0.1.0',
        status: 'online',
        port: 8492,
        setup_completed: true,
        protocol_version: 1,
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await verifyServer('http://192.168.1.100:8492');
      expect(result).not.toBeNull();
      expect(result?.name).toBe('Living Room Server');
      expect(result?.app).toBe('kadr');
      expect(result?.status).toBe('online');
      expect(global.fetch).toHaveBeenCalledWith(
        'http://192.168.1.100:8492/api/v1/discovery',
        expect.objectContaining({
          headers: { Accept: 'application/json' },
        })
      );
    });

    it('rejects invalid or non-kadr endpoints', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ app: 'unknown-app', status: 'online' }),
      });

      const result = await verifyServer('http://192.168.1.50:8492');
      expect(result).toBeNull();
    });

    it('rejects servers that are offline', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ app: 'kadr', status: 'maintenance' }),
      });

      const result = await verifyServer('http://192.168.1.50:8492');
      expect(result).toBeNull();
    });

    it('rejects non-ok response statuses', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      });

      const result = await verifyServer('http://192.168.1.50:8492');
      expect(result).toBeNull();
    });

    it('handles fetch timeout or connection failure', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

      const result = await verifyServer('http://192.168.1.200:8492');
      expect(result).toBeNull();
    });
  });

  describe('probeSubnet', () => {
    it('probes IPs in batches and returns responsive servers', async () => {
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url === 'http://192.168.1.42:8492/api/v1/discovery') {
          return {
            ok: true,
            json: async () => ({
              app: 'kadr',
              server_id: 'srv-42',
              name: 'Bedroom Kadr',
              status: 'online',
              version: '1.0.0',
              protocol_version: 1,
              port: 8492,
              setup_completed: true,
            }),
          };
        }
        return {
          ok: false,
          status: 404,
        };
      });

      const discovered = await probeSubnet('192.168.1', 8492);
      expect(discovered).toHaveLength(1);
      expect(discovered[0]).toEqual({
        url: 'http://192.168.1.42:8492',
        name: 'Bedroom Kadr',
        server_id: 'srv-42',
      });
      expect(global.fetch).toHaveBeenCalledTimes(254);
    });
  });

  describe('discoverLocalServers', () => {
    it('discovers localhost server when available', async () => {
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url === 'http://localhost:8492/api/v1/discovery') {
          return {
            ok: true,
            json: async () => ({
              app: 'kadr',
              server_id: 'local-1',
              name: 'Local Kadr',
              status: 'online',
              version: '1.0.0',
              protocol_version: 1,
              port: 8492,
              setup_completed: true,
            }),
          };
        }
        return { ok: false, status: 404 };
      });

      const servers = await discoverLocalServers();
      expect(servers).toEqual([
        { url: 'http://localhost:8492', name: 'Local Kadr', server_id: 'local-1' },
      ]);
    });

    it('queries Tizen systeminfo and discovers servers on the LAN subnet without duplicates', async () => {
      // Setup mock tizen global
      (window as unknown as { tizen: unknown }).tizen = {
        systeminfo: {
          getPropertyValue: (
            property: string,
            successCallback: (val: { ipAddress?: string }) => void
          ) => {
            if (property === 'WIFI_NETWORK') {
              successCallback({ ipAddress: '192.168.1.15' });
            } else {
              successCallback({});
            }
          },
        },
      };

      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url === 'http://localhost:8492/api/v1/discovery') {
          return {
            ok: true,
            json: async () => ({
              app: 'kadr',
              server_id: 'srv-lan',
              name: 'LAN Kadr',
              status: 'online',
              version: '1.0.0',
              protocol_version: 1,
              port: 8492,
              setup_completed: true,
            }),
          };
        }
        if (url === 'http://192.168.1.25:8492/api/v1/discovery') {
          return {
            ok: true,
            json: async () => ({
              app: 'kadr',
              server_id: 'srv-lan', // same server_id as localhost to test deduplication
              name: 'LAN Kadr',
              status: 'online',
              version: '1.0.0',
              protocol_version: 1,
              port: 8492,
              setup_completed: true,
            }),
          };
        }
        return { ok: false, status: 404 };
      });

      const servers = await discoverLocalServers();
      expect(servers).toHaveLength(1);
      expect(servers[0].server_id).toBe('srv-lan');

      delete (window as unknown as { tizen?: unknown }).tizen;
    });
  });
});
