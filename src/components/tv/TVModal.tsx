import { useEffect, type ReactNode } from 'react';
import { useFocusContext } from '../../navigation/FocusContext';
import { TVKeys } from '../../navigation/keys';

export interface TVModalProps {
  isOpen: boolean;
  onClose?: () => void;
  trapGroupId?: string;
  children: ReactNode;
  className?: string;
  backdropClassName?: string;
  role?: string;
  'aria-label'?: string;
}

export function TVModal({
  isOpen,
  onClose,
  trapGroupId = 'tv-modal',
  children,
  className = '',
  backdropClassName = '',
  role = 'dialog',
  'aria-label': ariaLabel,
}: TVModalProps) {
  const { pushTrap, popTrap } = useFocusContext();

  useEffect(() => {
    if (isOpen) {
      pushTrap(trapGroupId);
      return () => {
        popTrap();
      };
    }
  }, [isOpen, trapGroupId, pushTrap, popTrap]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const code = e.keyCode || e.which;
      if (
        code === TVKeys.BACK_TIZEN ||
        code === TVKeys.BACK_WEB ||
        e.key === 'Escape'
      ) {
        e.preventDefault();
        onClose?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role={role}
      aria-modal="true"
      aria-label={ariaLabel}
      className={`fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 ${backdropClassName}`}
    >
      <div
        className={`bg-zinc-900 border border-zinc-800 rounded-3xl p-10 flex flex-col items-center ${className}`}
      >
        {children}
      </div>
    </div>
  );
}
