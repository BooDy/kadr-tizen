import { useState, useEffect } from 'react';
import { discoverLocalServers, verifyServer } from '../api/discovery';
import { DiscoveredServer } from '../types/kadr';
import { TVButton } from '../components/tv/TVButton';
import { TVCard } from '../components/tv/TVCard';
import { useFocusable } from '../navigation/useFocusable';
import { Wifi, RefreshCw } from 'lucide-react';

export interface ServerConnectScreenProps {
  onServerSelected: (url: string, name: string) => void;
}

export function formatServerUrl(input: string): string {
  const trimmed = input.trim();
  const withProtocol = trimmed.startsWith('http://') || trimmed.startsWith('https://')
    ? trimmed
    : `http://${trimmed}`;

  try {
    const parsed = new URL(withProtocol);
    if (!parsed.port) {
      parsed.port = '8492';
    }
    return parsed.pathname === '/' || !parsed.pathname
      ? `${parsed.protocol}//${parsed.host}`
      : `${parsed.protocol}//${parsed.host}${parsed.pathname}`.replace(/\/$/, '');
  } catch {
    return withProtocol;
  }
}

export function ServerConnectScreen({ onServerSelected }: ServerConnectScreenProps) {
  const [scanning, setScanning] = useState(true);
  const [servers, setServers] = useState<DiscoveredServer[]>([]);
  const [manualIp, setManualIp] = useState('192.168.1.');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { ref: inputRef, isFocused: isInputFocused } = useFocusable<HTMLInputElement>({
    id: 'manual-ip-input',
    groupId: 'manual',
    order: 1,
    onEnter: () => handleManualConnect(),
  });

  const runDiscovery = async () => {
    setScanning(true);
    setErrorMsg(null);
    try {
      const found = await discoverLocalServers();
      setServers(found);
      setScanning(false);
      if (found.length === 1) {
        onServerSelected(found[0].url, found[0].name);
      }
    } catch {
      setServers([]);
      setScanning(false);
    }
  };

  useEffect(() => {
    runDiscovery();
  }, []);

  const handleManualConnect = async () => {
    setErrorMsg(null);
    const url = formatServerUrl(manualIp);
    const verified = await verifyServer(url);
    if (verified) {
      onServerSelected(url, verified.name);
    } else {
      setErrorMsg('Could not reach Kadr server at this IP/port.');
    }
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-[#2A0A0A] p-16 select-none">
      <div className="flex flex-col items-center gap-2 mb-6">
        <img src="./kadr-logo.png" alt="Kadr" className="h-20 w-auto mb-4" />
        <h1 className="text-5xl font-black text-[#F5E5E5]">Connect to Kadr</h1>
      </div>

      {scanning ? (
        <div className="flex flex-col items-center gap-4 my-12">
          <Wifi className="w-16 h-16 text-[#FF6B00] animate-pulse" />
          <p className="text-2xl text-[#F5E5E5]/90">Searching your Wi-Fi/LAN for Kadr servers...</p>
        </div>
      ) : servers.length > 0 ? (
        <div className="flex flex-col items-center gap-6 my-8">
          <h2 className="text-2xl text-[#F5E5E5]/90">Select Discovered Server:</h2>
          <div className="flex gap-6">
            {servers.map((s, idx) => (
              <TVCard
                key={s.server_id}
                id={`server-${s.server_id}`}
                groupId="servers"
                title={s.name}
                subtitle={s.url}
                onSelect={() => onServerSelected(s.url, s.name)}
                autoFocus={idx === 0}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 my-8">
          <p className="text-xl text-[#5C3C3C]">No servers discovered on the local network.</p>
          <div className="flex items-center gap-4 mt-4">
            <input
              ref={inputRef}
              id="manual-ip-input"
              type="text"
              value={manualIp}
              onChange={(e) => setManualIp(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleManualConnect();
              }}
              placeholder="e.g. 192.168.1.100"
              className={`bg-[#3B1111] border px-6 py-4 rounded-xl text-xl text-[#F5E5E5] outline-none w-96 text-center transition-all ${
                isInputFocused
                  ? 'border-[#FFB800] ring-4 ring-[#FFB800]/30'
                  : 'border-[rgba(245,229,229,0.08)] focus:border-[#FF6B00]'
              }`}
            />
            <TVButton
              id="manual-connect-btn"
              groupId="manual"
              order={2}
              onEnter={handleManualConnect}
              onClick={handleManualConnect}
              autoFocus
            >
              Connect
            </TVButton>
          </div>
          {errorMsg && <p className="text-[#D43F15] mt-2 text-lg">{errorMsg}</p>}
        </div>
      )}

      <div className="mt-8">
        <TVButton
          id="retry-discovery-btn"
          groupId="retry"
          variant="secondary"
          onEnter={runDiscovery}
          onClick={runDiscovery}
        >
          <RefreshCw className="w-5 h-5" /> Retry Auto-Discovery
        </TVButton>
      </div>
    </div>
  );
}
