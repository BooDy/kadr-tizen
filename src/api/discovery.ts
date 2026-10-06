import { DiscoveryResponse, DiscoveredServer } from '../types/kadr';

export async function verifyServer(url: string, timeoutMs = 1500): Promise<DiscoveryResponse | null> {
  const cleanUrl = url.replace(/\/+$/, '');
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${cleanUrl}/api/v1/discovery`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(id);
    if (!res.ok) return null;
    const data = (await res.json()) as DiscoveryResponse;
    if (data.app === 'kadr' && data.status === 'online') {
      return data;
    }
    return null;
  } catch {
    clearTimeout(id);
    return null;
  }
}

export async function probeSubnet(baseSubnet: string, port = 8492): Promise<DiscoveredServer[]> {
  const discovered: DiscoveredServer[] = [];
  const batchSize = 25;
  const ips = Array.from({ length: 254 }, (_, i) => `${baseSubnet}.${i + 1}`);

  for (let i = 0; i < ips.length; i += batchSize) {
    const chunk = ips.slice(i, i + batchSize);
    const promises = chunk.map(async (ip) => {
      const url = `http://${ip}:${port}`;
      const server = await verifyServer(url, 1200);
      if (server) {
        discovered.push({ url, name: server.name, server_id: server.server_id });
      }
    });
    await Promise.all(promises);
  }

  return discovered;
}

export async function discoverLocalServers(): Promise<DiscoveredServer[]> {
  const discovered: DiscoveredServer[] = [];

  // Check localhost first (common for testing)
  const local = await verifyServer('http://localhost:8492', 500);
  if (local) {
    discovered.push({ url: 'http://localhost:8492', name: local.name, server_id: local.server_id });
  }

  // Tizen Network API to get device IP
  let baseSubnet: string | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tizen = (window as any).tizen;
    if (tizen?.systeminfo) {
      const wifi = await new Promise<any>((resolve) =>
        tizen.systeminfo.getPropertyValue('WIFI_NETWORK', resolve, () => resolve(null))
      );
      const eth = await new Promise<any>((resolve) =>
        tizen.systeminfo.getPropertyValue('ETHERNET_NETWORK', resolve, () => resolve(null))
      );
      const ip = wifi?.ipAddress || eth?.ipAddress;
      if (ip && typeof ip === 'string' && ip.includes('.')) {
        baseSubnet = ip.split('.').slice(0, 3).join('.');
      }
    }
  } catch {
    // Fallback if not on Tizen
  }

  if (baseSubnet) {
    const lanServers = await probeSubnet(baseSubnet);
    for (const s of lanServers) {
      if (!discovered.some((d) => d.server_id === s.server_id)) {
        discovered.push(s);
      }
    }
  }

  return discovered;
}
