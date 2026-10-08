import { useState, useEffect } from 'react';
import { ProfileCard } from '../types/kadr';
import { PinPadModal } from '../components/pin/PinPadModal';
import { TVKeys } from '../navigation/keys';
import { useFocusable } from '../navigation/useFocusable';
import { Shield } from 'lucide-react';

export interface ProfileSelectScreenProps {
  profiles: ProfileCard[];
  serverName: string;
  onLogin: (
    userId: string,
    pin: string
  ) => Promise<{ success: boolean; error?: string; lockedOutSecs?: number }>;
  onBackToServerConnect?: () => void;
}

const AVATAR_GRADIENTS = [
  'from-[#FF6B00] via-[#D43F15] to-[#FFB800]',
  'from-[#FFB800] via-[#FF6B00] to-[#D43F15]',
  'from-[#D43F15] via-[#FFB800] to-[#FF6B00]',
  'from-[#FF6B00] to-[#FFB800]',
  'from-[#D43F15] to-[#FF6B00]',
];

interface ProfileItemProps {
  profile: ProfileCard;
  index: number;
  autoFocus?: boolean;
  onSelect: () => void;
}

function ProfileItem({ profile, index, autoFocus, onSelect }: ProfileItemProps) {
  const { ref, isFocused } = useFocusable<HTMLDivElement>({
    id: `profile-${profile.id}`,
    groupId: 'profiles-row',
    order: index + 1,
    onEnter: onSelect,
    autoFocus,
  });

  const gradient = AVATAR_GRADIENTS[index % AVATAR_GRADIENTS.length];
  const initials = (profile.username.slice(0, 2) || 'U').toUpperCase();

  return (
    <div
      ref={ref}
      id={`profile-${profile.id}`}
      tabIndex={-1}
      role="button"
      onClick={onSelect}
      className={`group flex flex-col items-center rounded-2xl p-4 bg-[#3B1111] border border-[rgba(245,229,229,0.08)] cursor-pointer transition-all duration-200 outline-none ${
        isFocused ? 'tv-focus-ring scale-105 z-10' : 'scale-100 opacity-90'
      }`}
    >
      {/* Avatar Box with Kadr Gradient Border */}
      <div
        className={`relative h-32 w-32 rounded-2xl p-1 bg-gradient-to-tr ${gradient} shadow-lg transition-transform duration-200 ${
          isFocused ? 'scale-105' : ''
        }`}
      >
        <div className="h-full w-full rounded-xl bg-[#2A0A0A] flex flex-col items-center justify-center overflow-hidden">
          <span className="text-4xl font-black uppercase tracking-wider text-[#F5E5E5]">
            {initials}
          </span>
        </div>

        {/* Role badge */}
        {profile.role === 'admin' && (
          <div
            title="Administrator"
            className="absolute -top-2 -right-2 bg-[#D43F15] text-white p-1.5 rounded-full shadow-md border border-[rgba(245,229,229,0.2)]"
          >
            <Shield className="h-4 w-4" />
          </div>
        )}
      </div>

      {/* Username & Metadata */}
      <div className="mt-4 text-center flex flex-col items-center gap-1.5 w-36">
        <span className="block text-xl font-bold truncate text-[#F5E5E5] w-full">
          {profile.username}
        </span>

        <div className="flex items-center gap-1.5">
          {profile.role === 'admin' ? (
            <span className="inline-block text-xs font-semibold uppercase tracking-wider bg-[#D43F15] text-white px-2.5 py-0.5 rounded-full shadow-xs">
              Administrator
            </span>
          ) : (
            <span className="inline-block text-xs font-semibold uppercase tracking-wider bg-[#2A0A0A] text-[#5C3C3C] border border-[rgba(245,229,229,0.08)] px-2.5 py-0.5 rounded-full">
              Standard
            </span>
          )}
        </div>
      </div>
    </div>
  );
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
    return res;
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
    <div className="w-full h-full flex flex-col items-center justify-center bg-[#2A0A0A] p-16 select-none">
      <div className="text-center mb-8 flex flex-col items-center">
        <img
          src="./kadr-logo.png"
          alt="Kadr"
          className="h-20 w-auto mb-4 object-contain"
          style={{ height: '80px', width: 'auto', maxHeight: '80px' }}
          height="80"
        />
        <h1 className="text-5xl font-extrabold tracking-tight text-[#F5E5E5] mb-2">Who's watching?</h1>
        <p className="text-sm text-[#5C3C3C] max-w-md mx-auto text-center mb-1">
          Select your profile to unlock custom layouts, personalized carousels, and resume playback.
        </p>
        <p className="text-xs font-semibold uppercase tracking-wider text-[#FF6B00] mt-1">{serverName}</p>
      </div>

      <div className="flex gap-8 justify-center items-center">
        {profiles.map((profile, idx) => (
          <ProfileItem
            key={profile.id}
            profile={profile}
            index={idx}
            autoFocus={idx === 0}
            onSelect={() => {
              setErrorMsg(undefined);
              setLockoutSecs(0);
              setSelectedUser(profile);
            }}
          />
        ))}
      </div>

      <PinPadModal
        isOpen={Boolean(selectedUser)}
        username={selectedUser?.username || ''}
        onSubmit={handlePinSubmit}
        onErrorClear={() => setErrorMsg(undefined)}
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
