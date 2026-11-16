import { useEffect, type ReactNode } from 'react';
import { useActiveTrap, useFocusStore } from '../../navigation/FocusContext';
import { TVKeys } from '../../navigation/keys';
import { isTextInputElement } from '../../navigation/useFocusable';

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
  const { pushTrap, popTrap } = useFocusStore();
  const activeTrap = useActiveTrap();

  useEffect(() => {
    if (isOpen) {
      pushTrap(trapGroupId);
      return () => {
        popTrap(trapGroupId);
      };
    }
  }, [isOpen, trapGroupId, pushTrap, popTrap]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (activeTrap && activeTrap !== trapGroupId) return;
      const activeEl =
        (typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null) ||
        (e.target as HTMLElement | null);
      const isEditing = isTextInputElement(activeEl);
      const code = e.keyCode || e.which;

      if ((code === TVKeys.BACKSPACE || e.key === 'Backspace') && isEditing) {
        return;
      }

      if (
        code === TVKeys.BACK_TIZEN ||
        code === TVKeys.BACK_WEB ||
        code === TVKeys.BACKSPACE ||
        e.key === 'Escape'
      ) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (isEditing && activeEl && typeof activeEl.blur === 'function') {
          activeEl.blur();
          return;
        }
        onClose?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, onClose, activeTrap, trapGroupId]);

  if (!isOpen) return null;

  return (
    <div
      role={role}
      aria-modal="true"
      aria-label={ariaLabel}
      className={`fixed inset-0 bg-[#0d0e15]/95 flex items-center justify-center ${backdropClassName?.includes('z-') ? '' : 'z-50'} ${backdropClassName}`.trim()}
    >
      <div
        className={`bg-[#3B1111] border border-[rgba(245,229,229,0.08)] rounded-3xl p-10 flex flex-col items-center ${className}`}
      >
        {children}
      </div>
    </div>
  );
}
