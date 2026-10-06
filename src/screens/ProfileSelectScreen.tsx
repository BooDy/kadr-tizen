import { useState, useEffect } from 'react';
import { ProfileCard } from '../types/kadr';
import { TVCard } from '../components/tv/TVCard';
import { PinPadModal } from '../components/pin/PinPadModal';
import { TVKeys } from '../navigation/keys';

export interface ProfileSelectScreenProps {
  profiles: ProfileCard[];
  serverName: string;
  onLogin: (
    userId: string,
    pin: string
  ) => Promise<{ success: boolean; error?: string; lockedOutSecs?: number }>;
  onBackToServerConnect?: () => void;
}

export function ProfileSelectScreen({
  profiles,
  serverName,
  onLogin,
  onBackToServerConnect,
}: ProfileSelectScreenProps) {
  const [selectedUser, setSelectedUser] = useState<ProfileCard | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | undefined>();
  const [lockoutSecs, setLockoutSecs] = useState(0);

  const handlePinSubmit = async (pin: string) => {
    if (!selectedUser) return;
    const res = await onLogin(selectedUser.id, pin);
    if (!res.success) {
      setErrorMsg(res.error || 'Invalid PIN');
      if (res.lockedOutSecs) setLockoutSecs(res.lockedOutSecs);
    } else {
      setSelectedUser(null);
      setErrorMsg(undefined);
      setLockoutSecs(0);
    }
  };

  useEffect(() => {
    if (selectedUser) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const code = e.keyCode || e.which;
      if (
        code === TVKeys.BACK_TIZEN ||
        code === TVKeys.BACK_WEB ||
        code === TVKeys.BACKSPACE ||
        e.key === 'Escape' ||
        e.key === 'Backspace'
      ) {
        onBackToServerConnect?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedUser, onBackToServerConnect]);

  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-950 p-16 select-none">
      <div className="text-center mb-12">
        <h1 className="text-5xl font-extrabold tracking-tight text-white mb-3">Who's watching?</h1>
        <p className="text-zinc-400 text-xl">{serverName}</p>
      </div>

      <div className="flex gap-8 justify-center items-center">
        {profiles.map((profile, idx) => (
          <TVCard
            key={profile.id}
            id={`profile-${profile.id}`}
            groupId="profiles-row"
            order={idx + 1}
            title={profile.username}
            subtitle={profile.role === 'admin' ? 'Administrator' : 'Standard'}
            onSelect={() => {
              setErrorMsg(undefined);
              setLockoutSecs(0);
              setSelectedUser(profile);
            }}
            autoFocus={idx === 0}
          />
        ))}
      </div>

      <PinPadModal
        isOpen={Boolean(selectedUser)}
        username={selectedUser?.username || ''}
        onSubmit={handlePinSubmit}
        onClose={() => {
          setSelectedUser(null);
          setErrorMsg(undefined);
          setLockoutSecs(0);
        }}
        onLockoutEnd={() => setLockoutSecs(0)}
        errorMessage={errorMsg}
        lockedOutSecs={lockoutSecs}
      />
    </div>
  );
}
