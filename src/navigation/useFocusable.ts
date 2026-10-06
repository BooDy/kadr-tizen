import { useEffect, useRef, useCallback } from 'react';
import { useFocusContext } from './FocusContext';

export interface UseFocusableOptions {
  id: string;
  groupId: string;
  onEnter?: () => void;
  onBack?: () => void;
  autoFocus?: boolean;
  order?: number;
}

export type FocusableRef<T extends HTMLElement = HTMLElement> = ((node: T | null) => void) & {
  current: T | null;
};

export interface UseFocusableResult<T extends HTMLElement = HTMLElement> {
  ref: FocusableRef<T>;
  isFocused: boolean;
  focus: () => void;
}

export function useFocusable<T extends HTMLElement = HTMLElement>({
  id,
  groupId,
  onEnter,
  onBack,
  autoFocus,
  order,
}: UseFocusableOptions): UseFocusableResult<T> {
  const { focusedId, setFocusedId, registerNode, unregisterNode } = useFocusContext();
  const elementRef = useRef<T | null>(null);

  const optionsRef = useRef({ id, groupId, onEnter, onBack, order });
  optionsRef.current = { id, groupId, onEnter, onBack, order };

  const callbackRef = useCallback(
    (node: T | null) => {
      elementRef.current = node;
      (callbackRef as unknown as { current: T | null }).current = node;
      registerNode({
        id: optionsRef.current.id,
        groupId: optionsRef.current.groupId,
        element: node,
        onEnter: optionsRef.current.onEnter,
        onBack: optionsRef.current.onBack,
        order: optionsRef.current.order,
      });
    },
    [registerNode]
  );

  const ref = callbackRef as unknown as FocusableRef<T>;
  ref.current = elementRef.current;

  useEffect(() => {
    registerNode({
      id,
      groupId,
      element: elementRef.current,
      onEnter,
      onBack,
      order,
    });

    if (autoFocus) {
      setFocusedId((prev) => (prev === null ? id : prev));
    }

    return () => {
      unregisterNode(id);
    };
  }, [id, groupId, onEnter, onBack, autoFocus, order, registerNode, unregisterNode, setFocusedId]);

  return {
    ref,
    isFocused: focusedId === id,
    focus: () => setFocusedId(id),
  };
}
