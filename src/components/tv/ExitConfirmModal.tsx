import { useEffect, useRef } from 'react';
import { useFocusContext } from '../../navigation/FocusContext';
import { TVKeys } from '../../navigation/keys';
import { TVButton } from './TVButton';

export interface ExitConfirmModalProps {
  isOpen: boolean;
  onCancel: () => void;
  onConfirmExit: () => void;
}

const TRAP_ID = 'exit-confirm-modal';

export function ExitConfirmModal({ isOpen, onCancel, onConfirmExit }: ExitConfirmModalProps) {
  const { pushTrap, popTrap, setFocusedId, activeTrap, getActiveTrap } = useFocusContext();

  const activeTrapRef = useRef(activeTrap);
  activeTrapRef.current = activeTrap;

  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  useEffect(() => {
    if (!isOpen) return;
    pushTrap(TRAP_ID);
    setFocusedId('exit-cancel-btn');
    return () => {
      popTrap(TRAP_ID);
    };
  }, [isOpen, pushTrap, popTrap, setFocusedId]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const currentTrap = getActiveTrap?.() ?? activeTrapRef.current;
      if (currentTrap !== TRAP_ID) return;

      const code = e.keyCode || e.which;

      if (
        code === TVKeys.BACK_TIZEN ||
        code === TVKeys.BACK_WEB ||
        code === TVKeys.BACKSPACE ||
        e.key === 'Escape' ||
        e.key === 'Backspace'
      ) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        onCancelRef.current();
        return;
      }

      if (code === TVKeys.LEFT || e.key === 'ArrowLeft') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        setFocusedId('exit-cancel-btn');
        return;
      }

      if (code === TVKeys.RIGHT || e.key === 'ArrowRight') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        setFocusedId('exit-confirm-btn');
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, getActiveTrap, setFocusedId]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Exit Kadr?"
      data-modal-overlay="true"
      className="fixed inset-0 z-[90] bg-[#0d0e15]/95 flex items-center justify-center select-none"
    >
      <div className="bg-[#3B1111] border border-[rgba(245,229,229,0.08)] rounded-3xl p-10 flex flex-col items-center text-center max-w-lg w-full">
        <h2 className="text-3xl font-extrabold text-[#F5E5E5] mb-3">Exit Kadr?</h2>
        <p className="text-lg text-[#F5E5E5]/75 mb-6">
          Are you sure you want to close Kadr and return to your TV home screen?
        </p>
        <div className="flex items-center justify-center">
          <TVButton
            id="exit-cancel-btn"
            groupId={TRAP_ID}
            order={1}
            variant="secondary"
            autoFocus
            onEnter={onCancel}
            onClick={onCancel}
            className="mr-4"
          >
            Cancel
          </TVButton>
          <TVButton
            id="exit-confirm-btn"
            groupId={TRAP_ID}
            order={2}
            variant="danger"
            onEnter={onConfirmExit}
            onClick={onConfirmExit}
          >
            Exit Kadr
          </TVButton>
        </div>
      </div>
    </div>
  );
}
