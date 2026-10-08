import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FocusProvider } from '../../src/navigation/FocusContext';
import { ServerConnectScreen } from '../../src/screens/ServerConnectScreen';
import * as discovery from '../../src/api/discovery';

vi.mock('../../src/api/discovery', () => ({
  discoverLocalServers: vi.fn(),
  verifyServer: vi.fn(),
}));

describe('ServerConnectScreen', () => {
  const mockDiscover = vi.mocked(discovery.discoverLocalServers);
  const mockVerify = vi.mocked(discovery.verifyServer);

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('shows scanning state while discovery is running', async () => {
    let resolveDiscovery!: (servers: any[]) => void;
    mockDiscover.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDiscovery = resolve;
        })
    );

    render(
      <FocusProvider>
        <ServerConnectScreen onServerSelected={vi.fn()} />
      </FocusProvider>
    );

    const logo = screen.getByAltText('Kadr');
    expect(logo).toBeInTheDocument();
    expect(logo).toHaveAttribute('src', './kadr-logo.png');

    const container = logo.closest('.bg-\\[\\#2A0A0A\\]');
    expect(container).toBeInTheDocument();

    const wifiIcon = document.querySelector('.text-\\[\\#FF6B00\\].animate-pulse');
    expect(wifiIcon).toBeInTheDocument();

    expect(screen.getByText(/Searching your Wi-Fi\/LAN for Kadr servers.../i)).toBeInTheDocument();
    expect(screen.getByText(/Connect to Kadr/i)).toBeInTheDocument();

    resolveDiscovery([]);
    await waitFor(() => {
      expect(
        screen.queryByText(/Searching your Wi-Fi\/LAN for Kadr servers.../i)
      ).not.toBeInTheDocument();
    });
  });

  it('auto-selects server when exactly 1 server is discovered', async () => {
    const onServerSelected = vi.fn();
    mockDiscover.mockResolvedValue([
      { server_id: 'srv-1', name: 'Living Room Kadr', url: 'http://192.168.1.100:8492' },
    ]);

    render(
      <FocusProvider>
        <ServerConnectScreen onServerSelected={onServerSelected} />
      </FocusProvider>
    );

    await waitFor(() => {
      expect(onServerSelected).toHaveBeenCalledWith(
        'http://192.168.1.100:8492',
        'Living Room Kadr'
      );
    });
  });

  it('renders server list when multiple servers are discovered and allows selection', async () => {
    const onServerSelected = vi.fn();
    mockDiscover.mockResolvedValue([
      { server_id: 'srv-1', name: 'Server Alpha', url: 'http://192.168.1.10:8492' },
      { server_id: 'srv-2', name: 'Server Beta', url: 'http://192.168.1.20:8492' },
    ]);

    render(
      <FocusProvider>
        <ServerConnectScreen onServerSelected={onServerSelected} />
      </FocusProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Select Discovered Server:')).toBeInTheDocument();
    });

    expect(screen.getByText('Server Alpha')).toBeInTheDocument();
    expect(screen.getByText('Server Beta')).toBeInTheDocument();
    expect(onServerSelected).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Server Beta'));
    expect(onServerSelected).toHaveBeenCalledWith('http://192.168.1.20:8492', 'Server Beta');
  });

  it('renders manual IP fallback input when no servers are discovered', async () => {
    mockDiscover.mockResolvedValue([]);

    render(
      <FocusProvider>
        <ServerConnectScreen onServerSelected={vi.fn()} />
      </FocusProvider>
    );

    await waitFor(() => {
      expect(
        screen.getByText(/No servers discovered on the local network./i)
      ).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText('e.g. 192.168.1.100') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.value).toBe('192.168.1.');
    expect(screen.getByRole('button', { name: /Connect/i })).toBeInTheDocument();
  });

  it('handles manual connection with valid IP and port', async () => {
    const onServerSelected = vi.fn();
    mockDiscover.mockResolvedValue([]);
    mockVerify.mockResolvedValue({
      app: 'kadr',
      server_id: 'srv-manual',
      name: 'Custom Server',
      status: 'online',
      version: '1.0.0',
      port: 8492,
      setup_completed: true,
      protocol_version: 1,
    });

    render(
      <FocusProvider>
        <ServerConnectScreen onServerSelected={onServerSelected} />
      </FocusProvider>
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText('e.g. 192.168.1.100')).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText('e.g. 192.168.1.100');
    fireEvent.change(input, { target: { value: '192.168.1.55' } });

    fireEvent.click(screen.getByRole('button', { name: /Connect/i }));

    await waitFor(() => {
      expect(mockVerify).toHaveBeenCalledWith('http://192.168.1.55:8492');
      expect(onServerSelected).toHaveBeenCalledWith(
        'http://192.168.1.55:8492',
        'Custom Server'
      );
    });
  });

  it('handles manual connection when entering full URL', async () => {
    const onServerSelected = vi.fn();
    mockDiscover.mockResolvedValue([]);
    mockVerify.mockResolvedValue({
      app: 'kadr',
      server_id: 'srv-full',
      name: 'Full URL Server',
      status: 'online',
      version: '1.0.0',
      port: 9000,
      setup_completed: true,
      protocol_version: 1,
    });

    render(
      <FocusProvider>
        <ServerConnectScreen onServerSelected={onServerSelected} />
      </FocusProvider>
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText('e.g. 192.168.1.100')).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText('e.g. 192.168.1.100');
    fireEvent.change(input, { target: { value: 'https://kadr.local:9000' } });

    fireEvent.click(screen.getByRole('button', { name: /Connect/i }));

    await waitFor(() => {
      expect(mockVerify).toHaveBeenCalledWith('https://kadr.local:9000');
      expect(onServerSelected).toHaveBeenCalledWith(
        'https://kadr.local:9000',
        'Full URL Server'
      );
    });
  });

  it('handles manual connection with custom port without appending redundant :8492', async () => {
    const onServerSelected = vi.fn();
    mockDiscover.mockResolvedValue([]);
    mockVerify.mockResolvedValue({
      app: 'kadr',
      server_id: 'srv-custom-port',
      name: 'Custom Port Server',
      status: 'online',
      version: '1.0.0',
      port: 9999,
      setup_completed: true,
      protocol_version: 1,
    });

    render(
      <FocusProvider>
        <ServerConnectScreen onServerSelected={onServerSelected} />
      </FocusProvider>
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText('e.g. 192.168.1.100')).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText('e.g. 192.168.1.100');
    fireEvent.change(input, { target: { value: '192.168.1.77:9999' } });

    fireEvent.click(screen.getByRole('button', { name: /Connect/i }));

    await waitFor(() => {
      expect(mockVerify).toHaveBeenCalledWith('http://192.168.1.77:9999');
      expect(onServerSelected).toHaveBeenCalledWith(
        'http://192.168.1.77:9999',
        'Custom Port Server'
      );
    });
  });

  it('navigates with D-pad between manual IP input and connect button', async () => {
    mockDiscover.mockResolvedValue([]);

    render(
      <FocusProvider>
        <ServerConnectScreen onServerSelected={vi.fn()} />
      </FocusProvider>
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText('e.g. 192.168.1.100')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Connect/i })).toHaveClass('tv-focus-ring');
    });

    const input = screen.getByPlaceholderText('e.g. 192.168.1.100');
    const connectBtn = screen.getByRole('button', { name: /Connect/i });

    // ArrowLeft should move focus to manual-ip-input (order: 1)
    fireEvent.keyDown(window, { key: 'ArrowLeft', code: 'ArrowLeft' });

    expect(input).toHaveClass('border-[#FFB800]');

    // ArrowRight should move focus back to connect button (order: 2)
    fireEvent.keyDown(window, { key: 'ArrowRight', code: 'ArrowRight' });

    expect(connectBtn).toHaveClass('tv-focus-ring');
  });

  it('shows error message when manual connect verification fails', async () => {
    const onServerSelected = vi.fn();
    mockDiscover.mockResolvedValue([]);
    mockVerify.mockResolvedValue(null);

    render(
      <FocusProvider>
        <ServerConnectScreen onServerSelected={onServerSelected} />
      </FocusProvider>
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText('e.g. 192.168.1.100')).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText('e.g. 192.168.1.100');
    fireEvent.change(input, { target: { value: '192.168.1.99' } });

    fireEvent.click(screen.getByRole('button', { name: /Connect/i }));

    await waitFor(() => {
      expect(
        screen.getByText('Could not reach Kadr server at this IP/port.')
      ).toBeInTheDocument();
      expect(onServerSelected).not.toHaveBeenCalled();
    });
  });

  it('supports pressing Enter on manual IP input to trigger connect', async () => {
    const onServerSelected = vi.fn();
    mockDiscover.mockResolvedValue([]);
    mockVerify.mockResolvedValue({
      app: 'kadr',
      server_id: 'srv-enter',
      name: 'Enter Server',
      status: 'online',
      version: '1.0.0',
      port: 8492,
      setup_completed: true,
      protocol_version: 1,
    });

    render(
      <FocusProvider>
        <ServerConnectScreen onServerSelected={onServerSelected} />
      </FocusProvider>
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText('e.g. 192.168.1.100')).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText('e.g. 192.168.1.100');
    fireEvent.change(input, { target: { value: '192.168.1.42' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    await waitFor(() => {
      expect(mockVerify).toHaveBeenCalledWith('http://192.168.1.42:8492');
      expect(onServerSelected).toHaveBeenCalledWith(
        'http://192.168.1.42:8492',
        'Enter Server'
      );
    });
  });

  it('retries discovery when clicking Retry Auto-Discovery', async () => {
    mockDiscover.mockResolvedValueOnce([]);

    render(
      <FocusProvider>
        <ServerConnectScreen onServerSelected={vi.fn()} />
      </FocusProvider>
    );

    await waitFor(() => {
      expect(
        screen.getByText(/No servers discovered on the local network./i)
      ).toBeInTheDocument();
    });

    mockDiscover.mockResolvedValueOnce([
      { server_id: 'srv-retry', name: 'Retry Kadr', url: 'http://192.168.1.100:8492' },
      { server_id: 'srv-retry2', name: 'Retry Kadr 2', url: 'http://192.168.1.101:8492' },
    ]);

    fireEvent.click(screen.getByRole('button', { name: /Retry Auto-Discovery/i }));

    await waitFor(() => {
      expect(screen.getByText('Retry Kadr')).toBeInTheDocument();
      expect(screen.getByText('Retry Kadr 2')).toBeInTheDocument();
    });
    expect(mockDiscover).toHaveBeenCalledTimes(2);
  });

  it('handles discovery exception gracefully without crashing', async () => {
    mockDiscover.mockRejectedValue(new Error('Network unreachable'));

    render(
      <FocusProvider>
        <ServerConnectScreen onServerSelected={vi.fn()} />
      </FocusProvider>
    );

    await waitFor(() => {
      expect(
        screen.getByText(/No servers discovered on the local network./i)
      ).toBeInTheDocument();
    });
  });
});
