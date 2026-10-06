import { useState, useEffect } from 'react';
import { TVButton } from '../tv/TVButton';
import { TVModal } from '../tv/TVModal';
import { KeypadGrid } from './KeypadGrid';
import { TVKeys } from '../../navigation/keys';

export interface PinPadModalProps {
  isOpen: boolean;
  username: string;
  onSubmit: (pin: string) => void;
  onClose: () => void;
  lockedOutSecs?: number;
  errorMessage?: string;
}

export function PinPadModal({
  isOpen,
  username,
  onSubmit,
  onClose,
  lockedOutSecs = 0,
  errorMessage,
}: PinPadModalProps) {
  const [pin, setPin] = useState('');
  const [countdown, setCountdown] = useState(lockedOutSecs);

  useEffect(() => {
    setCountdown(lockedOutSecs);
  }, [lockedOutSecs]);

  useEffect(() => {
    if (countdown <= 0) return;
    const interval = setInterval(() => {
      setCountdown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [countdown]);

  useEffect(() => {
    if (!isOpen) {
      setPin('');
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const code = e.keyCode || e.which;

      const isNumKey =
        (code >= TVKeys.NUM_0 && code <= TVKeys.NUM_9) ||
        (code >= 96 && code <= 105) ||
        (e.key >= '0' && e.key <= '9');

      if (isNumKey) {
        if (countdown > 0) return;
        let digit = e.key;
        if (code >= TVKeys.NUM_0 && code <= TVKeys.NUM_9) {
          digit = String(code - TVKeys.NUM_0);
        } else if (code >= 96 && code <= 105) {
          digit = String(code - 96);
        }

        setPin((prev) => {
          if (prev.length < 4) {
            const next = prev + digit;
            if (next.length === 4) onSubmit(next);
            return next;
          }
          return prev;
        });
      } else if (code === TVKeys.BACKSPACE || e.key === 'Backspace') {
        setPin((prev) => prev.slice(0, -1));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, countdown, onSubmit]);

  const handleDigit = (digit: string) => {
    if (countdown > 0) return;
    setPin((prev) => {
      if (prev.length < 4) {
        const next = prev + digit;
        if (next.length === 4) onSubmit(next);
        return next;
      }
      return prev;
    });
  };

  const handleBackspace = () => {
    setPin((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    setPin('');
  };

  if (!isOpen) return null;

  return (
    <TVModal
      isOpen={isOpen}
      onClose={onClose}
      trapGroupId="pin-pad-modal"
      className="w-[540px]"
    >
      <h3 className="text-3xl font-bold text-zinc-100">Enter PIN for {username}</h3>
      <p className="text-zinc-400 mt-2 text-lg">Use your TV remote number buttons</p>

      {countdown > 0 ? (
        <div className="mt-8 text-rose-400 font-semibold text-xl">
          Too many attempts. Locked out for {countdown}s
        </div>
      ) : (
        <>
          <div className="flex gap-4 my-8">
            {[0, 1, 2, 3].map((idx) => (
              <div
                key={idx}
                className={`w-6 h-6 rounded-full border-2 transition-all ${
                  pin.length > idx ? 'bg-sky-400 border-sky-400 scale-125' : 'border-zinc-600'
                }`}
              />
            ))}
          </div>

          <KeypadGrid
            groupId="pin-pad-modal"
            onDigit={handleDigit}
            onBackspace={handleBackspace}
            onClear={handleClear}
          />
        </>
      )}

      {errorMessage && <p className="text-rose-400 text-sm mb-4">{errorMessage}</p>}

      <TVButton
        id="pin-cancel-btn"
        groupId="pin-pad-modal"
        variant="secondary"
        onEnter={onClose}
        onClick={onClose}
        autoFocus
        className="mt-2"
      >
        Cancel (Back)
      </TVButton>
    </TVModal>
  );
}
