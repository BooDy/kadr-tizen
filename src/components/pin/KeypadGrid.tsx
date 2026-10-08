import { TVButton } from '../tv/TVButton';

export interface KeypadGridProps {
  groupId?: string;
  onDigit: (digit: string) => void;
  onBackspace: () => void;
  onClear?: () => void;
  disabled?: boolean;
}

export function KeypadGrid({
  groupId = 'pin-pad-modal',
  onDigit,
  onBackspace,
  onClear,
  disabled = false,
}: KeypadGridProps) {
  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

  return (
    <div className="grid grid-cols-3 gap-3 my-4">
      {digits.map((d, idx) => (
        <TVButton
          key={d}
          id={`keypad-${d}`}
          data-testid={`keypad-${d}`}
          groupId={groupId}
          order={idx + 1}
          variant="secondary"
          className="w-16 h-16 !px-0 !py-0 text-2xl font-bold rounded-2xl flex items-center justify-center"
          disabled={disabled}
          onClick={() => {
            if (!disabled) onDigit(d);
          }}
          onEnter={() => {
            if (!disabled) onDigit(d);
          }}
        >
          {d}
        </TVButton>
      ))}

      <TVButton
        id="keypad-clear"
        data-testid="keypad-clear"
        groupId={groupId}
        order={10}
        variant="secondary"
        className="w-16 h-16 !px-0 !py-0 text-lg font-bold rounded-2xl flex items-center justify-center text-[#F5E5E5]/80"
        disabled={disabled}
        onClick={() => {
          if (!disabled) onClear?.();
        }}
        onEnter={() => {
          if (!disabled) onClear?.();
        }}
      >
        C
      </TVButton>

      <TVButton
        id="keypad-0"
        data-testid="keypad-0"
        groupId={groupId}
        order={11}
        variant="secondary"
        className="w-16 h-16 !px-0 !py-0 text-2xl font-bold rounded-2xl flex items-center justify-center"
        disabled={disabled}
        onClick={() => {
          if (!disabled) onDigit('0');
        }}
        onEnter={() => {
          if (!disabled) onDigit('0');
        }}
      >
        0
      </TVButton>

      <TVButton
        id="keypad-backspace"
        data-testid="keypad-backspace"
        groupId={groupId}
        order={12}
        variant="secondary"
        className="w-16 h-16 !px-0 !py-0 text-xl font-bold rounded-2xl flex items-center justify-center text-[#F5E5E5]/80"
        disabled={disabled}
        onClick={() => {
          if (!disabled) onBackspace();
        }}
        onEnter={() => {
          if (!disabled) onBackspace();
        }}
      >
        ⌫
      </TVButton>
    </div>
  );
}
