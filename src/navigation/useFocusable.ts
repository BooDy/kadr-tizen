import { useEffect, useRef, useCallback, useSyncExternalStore } from 'react';
import { scrollElementIntoViewIfNeeded, useFocusStore } from './FocusContext';

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

export function isTextInputElement(
  el: Element | EventTarget | null | undefined
): el is HTMLInputElement | HTMLTextAreaElement {
  if (!el || typeof el !== 'object') return false;
  if (typeof HTMLInputElement !== 'undefined' && el instanceof HTMLInputElement) return true;
  if (typeof HTMLTextAreaElement !== 'undefined' && el instanceof HTMLTextAreaElement) return true;
  const tag = (el as HTMLElement).tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA';
}

export function useFocusable<T extends HTMLElement = HTMLElement>({
  id,
  groupId,
  onEnter,
  onBack,
  autoFocus,
  order,
}: UseFocusableOptions): UseFocusableResult<T> {
  const store = useFocusStore();
  const { setFocusedId, registerNode, unregisterNode } = store;

  const subscribe = useCallback(
    (onStoreChange: () => void) => store.subscribeNodeFocus(id, onStoreChange),
    [store, id]
  );
  const getSnapshot = useCallback(() => store.getFocusedId() === id, [store, id]);
  const isFocused = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const elementRef = useRef<T | null>(null);
  const hasAutoFocusedRef = useRef(false);

  const optionsRef = useRef({ id, groupId, onEnter, onBack, order });
  optionsRef.current = { id, groupId, onEnter, onBack, order };

  const callbackRef = useCallback(
    (node: T | null) => {
      const prevNode = elementRef.current;
      elementRef.current = node;
      (callbackRef as unknown as { current: T | null }).current = node;
      if (node) {
        registerNode({
          id: optionsRef.current.id,
          groupId: optionsRef.current.groupId,
          element: node,
          onEnter: optionsRef.current.onEnter,
          onBack: optionsRef.current.onBack,
          order: optionsRef.current.order,
        });
      } else if (prevNode) {
        // Detach DOM reference from nodesRef without calling setState synchronously during React's commit phase;
        // passive useEffect unmount cleanup calls unregisterNode(id) to clear focusedId safely after commit.
        registerNode({
          id: optionsRef.current.id,
          groupId: optionsRef.current.groupId,
          element: null,
        });
      }
    },
    [registerNode]
  );

  const ref = callbackRef as unknown as FocusableRef<T>;
  ref.current = elementRef.current;

  // Unregister node only when unmounting or when id changes
  useEffect(() => {
    hasAutoFocusedRef.current = false;
    return () => {
      unregisterNode(id);
    };
  }, [id, unregisterNode]);

  // Handle autoFocus once per activation without re-snapping focus on re-renders
  useEffect(() => {
    if (!autoFocus) {
      hasAutoFocusedRef.current = false;
      return;
    }
    if (!hasAutoFocusedRef.current && elementRef.current) {
      hasAutoFocusedRef.current = true;
      setFocusedId((prev) => (prev === null ? id : prev));
    }
  }, [id, autoFocus, setFocusedId]);

  // Property update effect: synchronize node attributes only when a DOM element is mounted
  useEffect(() => {
    if (!elementRef.current) return;
    registerNode({
      id,
      groupId,
      element: elementRef.current,
      onEnter,
      onBack,
      order,
    });
  }, [id, groupId, onEnter, onBack, order, registerNode]);

  useEffect(() => {
    if (!isFocused || !elementRef.current) return;
    const el = elementRef.current;

    // Do not auto-invoke native .focus() on <input>/<textarea> during passive D-pad navigation:
    // on Samsung Tizen TV, native .focus() must be triggered on Enter to open the virtual keyboard
    // and passive focus would either fail to open IME or trap D-pad arrow keys prematurely.
    if (!isTextInputElement(el)) {
      try {
        el.focus?.({ preventScroll: true });
      } catch {
        el.focus?.();
      }
    }

    if (groupId !== 'sidebar') {
      scrollElementIntoViewIfNeeded(el);
    }
  }, [isFocused, groupId]);

  const focus = useCallback(() => {
    setFocusedId(id);
  }, [setFocusedId, id]);

  return {
    ref,
    isFocused,
    focus,
  };
}
