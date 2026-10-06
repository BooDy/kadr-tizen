import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FocusProvider } from '../../src/navigation/FocusContext';
import { ProfileSelectScreen } from '../../src/screens/ProfileSelectScreen';
import { ProfileCard } from '../../src/types/kadr';
import { TVKeys } from '../../src/navigation/keys';

describe('ProfileSelectScreen', () => {
  const mockProfiles: ProfileCard[] = [
    { id: 'u1', username: 'Boody', role: 'admin' },
    { id: 'u2', username: 'Guest', role: 'user' },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders profile cards with usernames and roles', () => {
    const onLogin = vi.fn().mockResolvedValue({ success: true });
    const onBackToServerConnect = vi.fn();

    render(
      <FocusProvider>
        <ProfileSelectScreen
          profiles={mockProfiles}
          serverName="Living Room Server"
          onLogin={onLogin}
          onBackToServerConnect={onBackToServerConnect}
        />
      </FocusProvider>
    );

    expect(screen.getByText("Who's watching?")).toBeInTheDocument();
    expect(screen.getByText('Living Room Server')).toBeInTheDocument();
    expect(screen.getByText('Boody')).toBeInTheDocument();
    expect(screen.getByText('Administrator')).toBeInTheDocument();
    expect(screen.getByText('Guest')).toBeInTheDocument();
    expect(screen.getByText('Standard')).toBeInTheDocument();
  });

  it('opens PinPadModal when a profile card is selected', () => {
    const onLogin = vi.fn().mockResolvedValue({ success: true });

    render(
      <FocusProvider>
        <ProfileSelectScreen
          profiles={mockProfiles}
          serverName="Kadr Server"
          onLogin={onLogin}
          onBackToServerConnect={vi.fn()}
        />
      </FocusProvider>
    );

    // Modal is not visible initially
    expect(screen.queryByText(/Enter PIN/i)).not.toBeInTheDocument();

    // Select Boody's profile card
    fireEvent.click(screen.getByText('Boody'));

    // Modal should now be open
    expect(screen.getByText(/Enter PIN for Boody/i)).toBeInTheDocument();
  });

  it('calls onLogin with userId and PIN on submission and closes modal on success', async () => {
    const onLogin = vi.fn().mockResolvedValue({ success: true });

    render(
      <FocusProvider>
        <ProfileSelectScreen
          profiles={mockProfiles}
          serverName="Kadr Server"
          onLogin={onLogin}
          onBackToServerConnect={vi.fn()}
        />
      </FocusProvider>
    );

    fireEvent.click(screen.getByText('Boody'));

    // Type PIN 1234
    fireEvent.keyDown(window, { key: '1', keyCode: 49 });
    fireEvent.keyDown(window, { key: '2', keyCode: 50 });
    fireEvent.keyDown(window, { key: '3', keyCode: 51 });
    fireEvent.keyDown(window, { key: '4', keyCode: 52 });

    expect(onLogin).toHaveBeenCalledWith('u1', '1234');

    await waitFor(() => {
      expect(screen.queryByText(/Enter PIN for Boody/i)).not.toBeInTheDocument();
    });
  });

  it('displays error message and lockout countdown on failed login', async () => {
    const onLogin = vi.fn().mockResolvedValue({
      success: false,
      error: 'Invalid PIN code',
      lockedOutSecs: 30,
    });

    render(
      <FocusProvider>
        <ProfileSelectScreen
          profiles={mockProfiles}
          serverName="Kadr Server"
          onLogin={onLogin}
          onBackToServerConnect={vi.fn()}
        />
      </FocusProvider>
    );

    fireEvent.click(screen.getByText('Guest'));

    // Type 4 digits
    fireEvent.keyDown(window, { key: '0', keyCode: 48 });
    fireEvent.keyDown(window, { key: '0', keyCode: 48 });
    fireEvent.keyDown(window, { key: '0', keyCode: 48 });
    fireEvent.keyDown(window, { key: '0', keyCode: 48 });

    expect(onLogin).toHaveBeenCalledWith('u2', '0000');

    await waitFor(() => {
      expect(screen.getByText('Invalid PIN code')).toBeInTheDocument();
      expect(screen.getByText(/Locked out for 30s/i)).toBeInTheDocument();
    });
  });

  it('calls onBackToServerConnect when Back key is pressed on main screen', () => {
    const onBackToServerConnect = vi.fn();

    render(
      <FocusProvider>
        <ProfileSelectScreen
          profiles={mockProfiles}
          serverName="Kadr Server"
          onLogin={vi.fn()}
          onBackToServerConnect={onBackToServerConnect}
        />
      </FocusProvider>
    );

    // Press Tizen Back key while on profile screen
    fireEvent.keyDown(window, { keyCode: TVKeys.BACK_TIZEN });
    expect(onBackToServerConnect).toHaveBeenCalledTimes(1);

    // Press Escape key
    fireEvent.keyDown(window, { key: 'Escape', keyCode: TVKeys.BACK_WEB });
    expect(onBackToServerConnect).toHaveBeenCalledTimes(2);
  });

  it('closes modal and returns to profile screen when modal Cancel is clicked', () => {
    render(
      <FocusProvider>
        <ProfileSelectScreen
          profiles={mockProfiles}
          serverName="Kadr Server"
          onLogin={vi.fn()}
          onBackToServerConnect={vi.fn()}
        />
      </FocusProvider>
    );

    fireEvent.click(screen.getByText('Boody'));
    expect(screen.getByText(/Enter PIN for Boody/i)).toBeInTheDocument();

    fireEvent.click(screen.getByText(/Cancel/i));
    expect(screen.queryByText(/Enter PIN for Boody/i)).not.toBeInTheDocument();
  });
});
