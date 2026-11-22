import { useEffect } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { FocusProvider, useFocusContext } from '../../src/navigation/FocusContext';
import { useFocusable } from '../../src/navigation/useFocusable';
import { TVKeys } from '../../src/navigation/keys';
import { ApiClient } from '../../src/api/client';
import {
  loadPlaybackSettings,
  savePlaybackSettings,
} from '../../src/player/playbackSettings';
import {
  loadAudioPreference,
  saveAudioPreference,
  loadAudiobookSpeed,
  saveAudiobookSpeed,
} from '../../src/player/audioPreferences';
import {
  loadSubtitlePreference,
  saveSubtitlePreference,
  loadSubtitleSettings,
  saveSubtitleSettings,
  saveSubtitleDelays,
  loadSubtitleDelays,
} from '../../src/player/subtitleSettings';
import {
  SettingsView,
  isSettingsContentNodeId,
  isSettingsLeftmostNodeId,
  getFirstSettingsFocusableId,
  type SettingsViewProps,
} from '../../src/screens/SettingsView';

function FocusProbe() {
  const { focusedId } = useFocusContext();
  return <div data-testid="probe-focus">{focusedId ?? ''}</div>;
}

function ModalTrapButton({ trapId }: { trapId: string }) {
  const { ref } = useFocusable<HTMLButtonElement>({
    id: `${trapId}-close-btn`,
    groupId: trapId,
    order: 1,
  });
  return (
    <div role="dialog" aria-modal="true" data-testid="mock-modal">
      <button ref={ref} id={`${trapId}-close-btn`} type="button">
        Close
      </button>
    </div>
  );
}

function TrapControl({ trapId }: { trapId: string | null }) {
  const { pushTrap, popTrap } = useFocusContext();
  useEffect(() => {
    if (!trapId) return;
    pushTrap(trapId);
    return () => {
      popTrap(trapId);
    };
  }, [trapId, pushTrap, popTrap]);

  if (!trapId) return null;
  return <ModalTrapButton trapId={trapId} />;
}

function assertNoGapClasses(container: HTMLElement): void {
  expect(container.innerHTML).not.toMatch(/\bgap-/);
  const allElements = container.querySelectorAll('*');
  allElements.forEach((el) => {
    const cls = el.getAttribute('class') ?? '';
    expect(cls).not.toMatch(/(^|\s)gap-/);
  });
}

function sendKey(key: string, keyCode: number) {
  fireEvent.keyDown(window, { key, keyCode });
}

function renderSettings(
  overrides: Partial<SettingsViewProps> & { trapId?: string | null } = {}
) {
  const { trapId = null, ...props } = overrides;
  const client = props.client ?? new ApiClient('http://192.168.1.50:8492');
  const utils = render(
    <FocusProvider>
      <FocusProbe />
      <SettingsView
        client={client}
        serverUrl={props.serverUrl ?? 'http://192.168.1.50:8492'}
        username={props.username ?? 'boody'}
        userRole={props.userRole ?? 'admin'}
        onNavigateToSidebar={props.onNavigateToSidebar}
        onSwitchProfile={props.onSwitchProfile}
        onSwitchServer={props.onSwitchServer}
        onUnlockedLibrariesChanged={props.onUnlockedLibrariesChanged}
      />
      <TrapControl trapId={trapId} />
    </FocusProvider>
  );
  return { ...utils, client };
}

describe('SettingsView', () => {
  const originalWebapis = (window as unknown as { webapis?: unknown }).webapis;
  const originalTizen = (window as unknown as { tizen?: unknown }).tizen;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    delete (window as unknown as { webapis?: unknown }).webapis;
    delete (window as unknown as { tizen?: unknown }).tizen;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        app: 'kadr',
        server_id: 'srv-1',
        name: 'Living Room Kadr',
        version: '1.4.2',
        protocol_version: 1,
        port: 8492,
        setup_completed: true,
        status: 'online',
      }),
    } as unknown as Response);
  });

  afterEach(() => {
    localStorage.clear();
    globalThis.fetch = originalFetch;
    if (originalWebapis === undefined) {
      delete (window as unknown as { webapis?: unknown }).webapis;
    } else {
      (window as unknown as { webapis?: unknown }).webapis = originalWebapis;
    }
    if (originalTizen === undefined) {
      delete (window as unknown as { tizen?: unknown }).tizen;
    } else {
      (window as unknown as { tizen?: unknown }).tizen = originalTizen;
    }
  });

  it('exports deterministic node classification helpers', () => {
    expect(getFirstSettingsFocusableId()).toBe('settings-cat-playback');

    expect(isSettingsLeftmostNodeId('settings-cat-playback')).toBe(true);
    expect(isSettingsLeftmostNodeId('settings-cat-languages')).toBe(true);
    expect(isSettingsLeftmostNodeId('settings-cat-account')).toBe(true);
    expect(isSettingsLeftmostNodeId('settings-cat-diagnostics')).toBe(true);
    expect(isSettingsLeftmostNodeId('settings-hls-height-0')).toBe(false);
    expect(isSettingsLeftmostNodeId('settings-audio-lang-auto')).toBe(false);
    expect(isSettingsLeftmostNodeId('settings-lock-libraries-btn')).toBe(false);
    expect(isSettingsLeftmostNodeId('settings-ping-server-btn')).toBe(false);
    expect(isSettingsLeftmostNodeId('nav-screen-settings')).toBe(false);
    expect(isSettingsLeftmostNodeId(null)).toBe(false);
    expect(isSettingsLeftmostNodeId(undefined)).toBe(false);

    expect(isSettingsContentNodeId('settings-cat-playback')).toBe(true);
    expect(isSettingsContentNodeId('settings-hls-height-1080')).toBe(true);
    expect(isSettingsContentNodeId('settings-hls-height-0')).toBe(true);
    expect(isSettingsContentNodeId('settings-engine-auto')).toBe(true);
    expect(isSettingsContentNodeId('settings-engine-html5')).toBe(true);
    expect(isSettingsContentNodeId('settings-audiobook-speed-1.5')).toBe(true);
    expect(isSettingsContentNodeId('settings-audio-lang-jpn')).toBe(true);
    expect(isSettingsContentNodeId('settings-sub-lang-ara')).toBe(true);
    expect(isSettingsContentNodeId('settings-sub-size-large')).toBe(true);
    expect(isSettingsContentNodeId('settings-sub-color-yellow')).toBe(true);
    expect(isSettingsContentNodeId('settings-sub-pos-raised')).toBe(true);
    expect(isSettingsContentNodeId('settings-lock-libraries-btn')).toBe(true);
    expect(isSettingsContentNodeId('settings-switch-profile-btn')).toBe(true);
    expect(isSettingsContentNodeId('settings-change-server-btn')).toBe(true);
    expect(isSettingsContentNodeId('settings-ping-server-btn')).toBe(true);
    expect(isSettingsContentNodeId('settings-reset-prefs-btn')).toBe(true);
    expect(isSettingsContentNodeId('nav-screen-settings')).toBe(false);
    expect(isSettingsContentNodeId('')).toBe(false);
    expect(isSettingsContentNodeId(null)).toBe(false);
  });

  it('renders zero gap-* classes across all 4 categories', async () => {
    const { container } = renderSettings({
      onSwitchProfile: vi.fn(),
      onSwitchServer: vi.fn(),
    });

    assertNoGapClasses(container);

    fireEvent.click(screen.getByTestId('settings-cat-languages'));
    assertNoGapClasses(container);

    fireEvent.click(screen.getByTestId('settings-cat-account'));
    assertNoGapClasses(container);

    fireEvent.click(screen.getByTestId('settings-cat-diagnostics'));
    await waitFor(() => {
      expect(screen.getByText(/Living Room Kadr/)).toBeInTheDocument();
    });
    assertNoGapClasses(container);
  });

  it('supports deterministic 2-pane D-pad navigation across category rail, right rows, and sidebar boundary', () => {
    const onNavigateToSidebar = vi.fn();
    renderSettings({ onNavigateToSidebar });

    // Mounts with initial focus on settings-cat-playback
    expect(screen.getByTestId('probe-focus')).toHaveTextContent('settings-cat-playback');
    expect(document.activeElement?.id).toBe('settings-cat-playback');

    // ArrowLeft from category rail calls onNavigateToSidebar
    sendKey('ArrowLeft', TVKeys.LEFT);
    expect(onNavigateToSidebar).toHaveBeenCalledTimes(1);

    // ArrowDown / ArrowUp steps across categories and switches activeCategory immediately
    sendKey('ArrowDown', TVKeys.DOWN);
    expect(screen.getByTestId('probe-focus')).toHaveTextContent('settings-cat-languages');
    expect(screen.getByTestId('settings-audio-lang-auto')).toBeInTheDocument();

    sendKey('ArrowLeft', TVKeys.LEFT);
    expect(onNavigateToSidebar).toHaveBeenCalledTimes(2);

    sendKey('ArrowDown', TVKeys.DOWN);
    expect(screen.getByTestId('probe-focus')).toHaveTextContent('settings-cat-account');
    expect(screen.getByTestId('settings-lock-libraries-btn')).toBeInTheDocument();

    sendKey('ArrowDown', TVKeys.DOWN);
    expect(screen.getByTestId('probe-focus')).toHaveTextContent('settings-cat-diagnostics');
    expect(screen.getByTestId('settings-reset-prefs-btn')).toBeInTheDocument();

    // Clamps at bottom
    sendKey('ArrowDown', TVKeys.DOWN);
    expect(screen.getByTestId('probe-focus')).toHaveTextContent('settings-cat-diagnostics');

    // ArrowUp back to playback
    sendKey('ArrowUp', TVKeys.UP);
    sendKey('ArrowUp', TVKeys.UP);
    sendKey('ArrowUp', TVKeys.UP);
    expect(screen.getByTestId('probe-focus')).toHaveTextContent('settings-cat-playback');

    // ArrowRight enters Row 0 of right panel
    sendKey('ArrowRight', TVKeys.RIGHT);
    expect(screen.getByTestId('probe-focus')).toHaveTextContent('settings-hls-height-0');

    // ArrowRight steps across Row 0 pills and clamps at right edge
    sendKey('ArrowRight', TVKeys.RIGHT);
    expect(screen.getByTestId('probe-focus')).toHaveTextContent('settings-hls-height-2160');
    sendKey('ArrowRight', TVKeys.RIGHT);
    expect(screen.getByTestId('probe-focus')).toHaveTextContent('settings-hls-height-1080');
    sendKey('ArrowRight', TVKeys.RIGHT);
    expect(screen.getByTestId('probe-focus')).toHaveTextContent('settings-hls-height-720');
    sendKey('ArrowRight', TVKeys.RIGHT);
    expect(screen.getByTestId('probe-focus')).toHaveTextContent('settings-hls-height-480');
    sendKey('ArrowRight', TVKeys.RIGHT);
    expect(screen.getByTestId('probe-focus')).toHaveTextContent('settings-hls-height-480');

    // ArrowLeft steps back to col 0, and from col 0 returns to category rail (NEVER sidebar!)
    sendKey('ArrowLeft', TVKeys.LEFT);
    sendKey('ArrowLeft', TVKeys.LEFT);
    sendKey('ArrowLeft', TVKeys.LEFT);
    sendKey('ArrowLeft', TVKeys.LEFT);
    expect(screen.getByTestId('probe-focus')).toHaveTextContent('settings-hls-height-0');

    sendKey('ArrowLeft', TVKeys.LEFT);
    expect(screen.getByTestId('probe-focus')).toHaveTextContent('settings-cat-playback');
    expect(onNavigateToSidebar).toHaveBeenCalledTimes(2);

    // ArrowRight -> ArrowDown steps between right-panel rows preserving active pill
    sendKey('ArrowRight', TVKeys.RIGHT);
    expect(screen.getByTestId('probe-focus')).toHaveTextContent('settings-hls-height-0');

    sendKey('ArrowDown', TVKeys.DOWN);
    expect(screen.getByTestId('probe-focus')).toHaveTextContent('settings-engine-auto');

    // ArrowLeft from col 0 of Row 1 returns to settings-cat-playback
    sendKey('ArrowLeft', TVKeys.LEFT);
    expect(screen.getByTestId('probe-focus')).toHaveTextContent('settings-cat-playback');
    expect(onNavigateToSidebar).toHaveBeenCalledTimes(2);

    // Re-enter Row 0 -> Row 1 -> Row 2 (Audiobook Default Speed, default active pill is 1x)
    sendKey('ArrowRight', TVKeys.RIGHT);
    sendKey('ArrowDown', TVKeys.DOWN);
    sendKey('ArrowDown', TVKeys.DOWN);
    expect(screen.getByTestId('probe-focus')).toHaveTextContent('settings-audiobook-speed-1');

    // ArrowLeft to col 0 (0.75) then ArrowLeft returns to settings-cat-playback
    sendKey('ArrowLeft', TVKeys.LEFT);
    expect(screen.getByTestId('probe-focus')).toHaveTextContent('settings-audiobook-speed-0.75');
    sendKey('ArrowLeft', TVKeys.LEFT);
    expect(screen.getByTestId('probe-focus')).toHaveTextContent('settings-cat-playback');
    expect(onNavigateToSidebar).toHaveBeenCalledTimes(2);
  });

  it('does not intercept D-pad keys or steal focus while a modal trap is active', () => {
    const onNavigateToSidebar = vi.fn();
    renderSettings({ onNavigateToSidebar, trapId: 'exit-modal' });

    expect(screen.getByTestId('probe-focus')).toHaveTextContent('exit-modal-close-btn');

    sendKey('ArrowLeft', TVKeys.LEFT);
    sendKey('ArrowRight', TVKeys.RIGHT);
    sendKey('ArrowDown', TVKeys.DOWN);

    expect(onNavigateToSidebar).not.toHaveBeenCalled();
    expect(screen.getByTestId('probe-focus')).toHaveTextContent('exit-modal-close-btn');
  });

  it('persists playback quality, player engine, and audiobook speed immediately', () => {
    renderSettings();

    // Navigate via D-pad to settings-hls-height-720 and press Enter
    sendKey('ArrowRight', TVKeys.RIGHT); // 0
    sendKey('ArrowRight', TVKeys.RIGHT); // 2160
    sendKey('ArrowRight', TVKeys.RIGHT); // 1080
    sendKey('ArrowRight', TVKeys.RIGHT); // 720
    expect(screen.getByTestId('probe-focus')).toHaveTextContent('settings-hls-height-720');
    sendKey('Enter', TVKeys.ENTER);
    expect(loadPlaybackSettings().hlsMaxHeight).toBe(720);

    // Down to Video Player Engine, step right to html5, press Enter
    sendKey('ArrowDown', TVKeys.DOWN);
    sendKey('ArrowRight', TVKeys.RIGHT);
    expect(screen.getByTestId('probe-focus')).toHaveTextContent('settings-engine-html5');
    sendKey('Enter', TVKeys.ENTER);
    expect(loadPlaybackSettings()).toEqual({
      hlsMaxHeight: 720,
      preferredPlayerEngine: 'html5',
    });

    // Down to Audiobook Default Speed, step to 1.5, press Enter
    sendKey('ArrowDown', TVKeys.DOWN);
    expect(screen.getByTestId('probe-focus')).toHaveTextContent('settings-audiobook-speed-1');
    sendKey('ArrowRight', TVKeys.RIGHT); // 1.25
    sendKey('ArrowRight', TVKeys.RIGHT); // 1.5
    expect(screen.getByTestId('probe-focus')).toHaveTextContent('settings-audiobook-speed-1.5');
    sendKey('Enter', TVKeys.ENTER);
    expect(loadAudiobookSpeed()).toBe(1.5);
  });

  it('persists audio language, subtitle mode/language, subtitle appearance, and updates live subtitle preview', () => {
    renderSettings();

    // Switch to Audio & Subtitles category
    sendKey('ArrowDown', TVKeys.DOWN);
    expect(screen.getByTestId('probe-focus')).toHaveTextContent('settings-cat-languages');

    fireEvent.click(screen.getByTestId('settings-audio-lang-jpn'));
    expect(loadAudioPreference()).toEqual({
      mode: 'language',
      language: 'jpn',
      preferCommentary: false,
    });

    fireEvent.click(screen.getByTestId('settings-sub-lang-ara'));
    expect(loadSubtitlePreference()).toEqual({
      mode: 'language',
      language: 'ara',
      preferForced: false,
    });

    fireEvent.click(screen.getByTestId('settings-sub-size-large'));
    fireEvent.click(screen.getByTestId('settings-sub-color-yellow'));
    fireEvent.click(screen.getByTestId('settings-sub-pos-raised'));

    expect(loadSubtitleSettings()).toEqual({
      fontSize: 'large',
      color: 'yellow',
      placement: 'raised',
    });

    const previewText = screen.getByTestId('settings-subtitle-preview-text');
    expect(previewText).toHaveStyle({
      fontSize: '52px',
      color: '#FFE14D',
    });

    fireEvent.click(screen.getByTestId('settings-sub-lang-off'));
    expect(loadSubtitlePreference()).toEqual({ mode: 'off' });

    fireEvent.click(screen.getByTestId('settings-audio-lang-auto'));
    expect(loadAudioPreference()).toEqual({ mode: 'auto' });
  });

  it('displays account info, re-locks unlocked private libraries, and handles profile/server switching', () => {
    const client = new ApiClient('http://192.168.1.50:8492');
    client.setLibraryUnlockToken('lib-1', 'tok-1');
    client.setLibraryUnlockToken('lib-2', 'tok-2');

    const clearSpy = vi.spyOn(client, 'clearLibraryUnlockTokens');
    const onUnlockedLibrariesChanged = vi.fn();
    const onSwitchProfile = vi.fn();
    const onSwitchServer = vi.fn();

    renderSettings({
      client,
      serverUrl: 'http://192.168.1.50:8492',
      username: 'Abdelrahman',
      userRole: 'admin',
      onUnlockedLibrariesChanged,
      onSwitchProfile,
      onSwitchServer,
    });

    fireEvent.click(screen.getByTestId('settings-cat-account'));

    expect(screen.getByText('Abdelrahman')).toBeInTheDocument();
    expect(screen.getByText('admin')).toBeInTheDocument();
    expect(screen.getByText('http://192.168.1.50:8492')).toBeInTheDocument();
    expect(screen.getByTestId('settings-unlocked-count')).toHaveTextContent('2');

    fireEvent.click(screen.getByTestId('settings-lock-libraries-btn'));
    expect(clearSpy).toHaveBeenCalledTimes(1);
    expect(onUnlockedLibrariesChanged).toHaveBeenCalledTimes(1);
    expect(client.getUnlockTokens()).toEqual([]);
    expect(screen.getByTestId('settings-unlocked-count')).toHaveTextContent('0');

    fireEvent.click(screen.getByTestId('settings-switch-profile-btn'));
    expect(onSwitchProfile).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('settings-change-server-btn'));
    expect(onSwitchServer).toHaveBeenCalledTimes(1);
  });

  it('omits Change Server button when onSwitchServer is not provided', () => {
    renderSettings({ onSwitchProfile: vi.fn(), onSwitchServer: undefined });
    fireEvent.click(screen.getByTestId('settings-cat-account'));
    expect(screen.queryByTestId('settings-change-server-btn')).not.toBeInTheDocument();
  });

  it('displays TV diagnostics telemetry, probes /api/v1/discovery, and resets all preferences', async () => {
    (window as unknown as { webapis: unknown }).webapis = {
      productinfo: { getModel: () => 'UA55TU7000UXEG' },
      avplay: {},
    };
    (window as unknown as { tizen: unknown }).tizen = {
      systeminfo: {
        getCapability: (cap: string) =>
          cap === 'http://tizen.org/feature/platform.version' ? '5.5' : '',
      },
    };

    // Pre-populate non-default preferences to verify Reset All restores everything
    savePlaybackSettings({ hlsMaxHeight: 480, preferredPlayerEngine: 'html5' });
    saveAudiobookSpeed(2);
    saveAudioPreference({ mode: 'language', language: 'jpn' });
    saveSubtitlePreference({ mode: 'off' });
    saveSubtitleSettings({ fontSize: 'xlarge', color: 'cyan', placement: 'top' });
    saveSubtitleDelays({ '12': 1500 });

    renderSettings({ serverUrl: 'http://192.168.1.50:8492/' });

    fireEvent.click(screen.getByTestId('settings-cat-diagnostics'));

    expect(screen.getByText('v1.0.0')).toBeInTheDocument();
    expect(screen.getByText('UA55TU7000UXEG')).toBeInTheDocument();
    expect(screen.getByText(/Tizen 5\.5/)).toBeInTheDocument();
    expect(screen.getByText('Hardware Ready')).toBeInTheDocument();

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://192.168.1.50:8492/api/v1/discovery',
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
      expect(screen.getByText(/Living Room Kadr/)).toBeInTheDocument();
      expect(screen.getByText(/1\.4\.2/)).toBeInTheDocument();
      expect(screen.getByText(/\d+\s*ms/)).toBeInTheDocument();
    });

    // Refresh Server Diagnostics re-runs probe
    fireEvent.click(screen.getByTestId('settings-ping-server-btn'));
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });

    // Reset All Playback & Subtitle Preferences clears all keys and restores defaults
    fireEvent.click(screen.getByTestId('settings-reset-prefs-btn'));

    expect(loadPlaybackSettings()).toEqual({
      hlsMaxHeight: 1080,
      preferredPlayerEngine: 'auto',
    });
    expect(loadAudiobookSpeed()).toBe(1);
    expect(loadAudioPreference()).toEqual({ mode: 'auto' });
    expect(loadSubtitlePreference()).toEqual({ mode: 'auto' });
    expect(loadSubtitleSettings()).toEqual({
      fontSize: 'medium',
      color: 'white',
      placement: 'bottom',
    });
    expect(loadSubtitleDelays()).toEqual({});
  });

  it('aborts in-flight /api/v1/discovery diagnostics probe on unmount without updating state', async () => {
    let capturedSignal: AbortSignal | undefined;
    let rejectPending: ((reason?: unknown) => void) | undefined;
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    globalThis.fetch = vi.fn().mockImplementation((_url, init?: RequestInit) => {
      capturedSignal = init?.signal ?? undefined;
      return new Promise((_resolve, reject) => {
        rejectPending = reject;
      });
    });

    const { unmount } = renderSettings();
    fireEvent.click(screen.getByTestId('settings-cat-diagnostics'));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      expect(capturedSignal).toBeDefined();
      expect(capturedSignal?.aborted).toBe(false);
    });

    unmount();
    expect(capturedSignal?.aborted).toBe(true);

    await act(async () => {
      rejectPending?.(new DOMException('Aborted', 'AbortError'));
      await Promise.resolve();
    });

    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('preserves active/selected pills on vertical row traversal and routes right-panel D-pad in account/diagnostics', async () => {
    savePlaybackSettings({ hlsMaxHeight: 720, preferredPlayerEngine: 'html5' });
    saveAudiobookSpeed(1.5);

    const onSwitchServer = vi.fn();
    renderSettings({ onSwitchProfile: vi.fn(), onSwitchServer });

    // Enter playback right panel -> Row 0 -> Down preserves active pills (html5, 1.5) -> Up preserves (html5, 720)
    sendKey('ArrowRight', TVKeys.RIGHT);
    expect(screen.getByTestId('probe-focus')).toHaveTextContent('settings-hls-height-0');
    sendKey('ArrowDown', TVKeys.DOWN);
    expect(screen.getByTestId('probe-focus')).toHaveTextContent('settings-engine-html5');
    sendKey('ArrowDown', TVKeys.DOWN);
    expect(screen.getByTestId('probe-focus')).toHaveTextContent('settings-audiobook-speed-1.5');
    sendKey('ArrowUp', TVKeys.UP);
    expect(screen.getByTestId('probe-focus')).toHaveTextContent('settings-engine-html5');
    sendKey('ArrowUp', TVKeys.UP);
    expect(screen.getByTestId('probe-focus')).toHaveTextContent('settings-hls-height-720');

    // Return to category rail via ArrowLeft steps
    sendKey('ArrowLeft', TVKeys.LEFT); // 1080
    sendKey('ArrowLeft', TVKeys.LEFT); // 2160
    sendKey('ArrowLeft', TVKeys.LEFT); // 0
    sendKey('ArrowLeft', TVKeys.LEFT); // settings-cat-playback
    expect(screen.getByTestId('probe-focus')).toHaveTextContent('settings-cat-playback');

    // Navigate to Account -> right panel vertical rows -> ArrowLeft returns to settings-cat-account
    sendKey('ArrowDown', TVKeys.DOWN); // languages
    sendKey('ArrowDown', TVKeys.DOWN); // account
    sendKey('ArrowRight', TVKeys.RIGHT);
    expect(screen.getByTestId('probe-focus')).toHaveTextContent('settings-lock-libraries-btn');
    sendKey('ArrowDown', TVKeys.DOWN);
    expect(screen.getByTestId('probe-focus')).toHaveTextContent('settings-switch-profile-btn');
    sendKey('ArrowDown', TVKeys.DOWN);
    expect(screen.getByTestId('probe-focus')).toHaveTextContent('settings-change-server-btn');
    sendKey('Enter', TVKeys.ENTER);
    expect(onSwitchServer).toHaveBeenCalledTimes(1);
    sendKey('ArrowLeft', TVKeys.LEFT);
    expect(screen.getByTestId('probe-focus')).toHaveTextContent('settings-cat-account');

    // Navigate to Diagnostics -> falls back to browser telemetry when webapis/tizen missing and handles probe failure
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network offline'));
    sendKey('ArrowDown', TVKeys.DOWN);
    expect(screen.getByTestId('probe-focus')).toHaveTextContent('settings-cat-diagnostics');
    expect(screen.getByText('Web Dev Harness')).toBeInTheDocument();
    expect(screen.getByText('Browser')).toBeInTheDocument();
    expect(screen.getByText('HTML5 Fallback')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/Server Unreachable \(Network offline\)/)).toBeInTheDocument();
    });
  });

  it('preserves sidebar nav-* focus on mount without stealing focus', () => {
    function SidebarNavButton() {
      const { ref } = useFocusable<HTMLButtonElement>({
        id: 'nav-screen-settings',
        groupId: 'sidebar',
        order: 1,
        autoFocus: true,
      });
      return (
        <button ref={ref} id="nav-screen-settings" type="button">
          Settings Nav
        </button>
      );
    }

    render(
      <FocusProvider>
        <FocusProbe />
        <SidebarNavButton />
        <SettingsView
          client={new ApiClient('http://192.168.1.50:8492')}
          serverUrl="http://192.168.1.50:8492"
        />
      </FocusProvider>
    );

    expect(screen.getByTestId('probe-focus')).toHaveTextContent('nav-screen-settings');
  });
});
