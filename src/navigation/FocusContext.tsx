import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import { FocusNode, Direction } from '../types/navigation';
import { TVKeys, registerTizenKeys } from './keys';

export interface FocusContextType {
  focusedId: string | null;
  activeTrap: string | null;
  setFocusedId: (id: string | null | ((prev: string | null) => string | null)) => void;
  registerNode: (node: FocusNode) => void;
  unregisterNode: (id: string) => void;
  pushTrap: (trapGroupId: string) => void;
  popTrap: () => void;
  pushFocusTrap: (trapGroupId: string) => void;
  popFocusTrap: () => void;
}

export const FocusContext = createContext<FocusContextType | null>(null);

function isNodeInTrap(nodeGroupId: string, activeTrap: string | null): boolean {
  if (!activeTrap) return true;
  if (nodeGroupId === activeTrap) return true;
  if (activeTrap === 'item-detail-modal') {
    return nodeGroupId === 'season-tabs' || nodeGroupId.startsWith('season-episodes-');
  }
  return false;
}

export function FocusProvider({ children }: { children: React.ReactNode }) {
  const [focusedId, setFocusedIdState] = useState<string | null>(null);
  const [activeTrapState, setActiveTrapState] = useState<string | null>(null);
  const focusedIdRef = useRef<string | null>(null);
  const nodesRef = useRef<Map<string, FocusNode>>(new Map());
  const trapStackRef = useRef<string[]>([]);
  const historyStackRef = useRef<string[]>([]);

  useEffect(() => {
    registerTizenKeys();
  }, []);

  const setFocusedId = useCallback(
    (idOrUpdater: string | null | ((prev: string | null) => string | null)) => {
      if (typeof idOrUpdater !== 'function') {
        focusedIdRef.current = idOrUpdater;
      }
      setFocusedIdState((prev) => {
        const next = typeof idOrUpdater === 'function' ? idOrUpdater(prev) : idOrUpdater;
        focusedIdRef.current = next;
        return next;
      });
    },
    []
  );

  const registerNode = useCallback((node: FocusNode) => {
    nodesRef.current.set(node.id, node);
    const activeTrap = trapStackRef.current[trapStackRef.current.length - 1];
    if (activeTrap && isNodeInTrap(node.groupId, activeTrap)) {
      setFocusedIdState((current) => {
        const currentNode = current ? nodesRef.current.get(current) : null;
        if (!currentNode || !isNodeInTrap(currentNode.groupId, activeTrap)) {
          focusedIdRef.current = node.id;
          return node.id;
        }
        return current;
      });
    }
  }, []);

  const unregisterNode = useCallback((id: string) => {
    nodesRef.current.delete(id);
    setFocusedIdState((current) => {
      if (current === id) {
        focusedIdRef.current = null;
        return null;
      }
      return current;
    });
  }, []);

  const pushTrap = useCallback(
    (trapGroupId: string) => {
      const current = focusedIdRef.current;
      if (current) {
        historyStackRef.current.push(current);
      }
      trapStackRef.current.push(trapGroupId);
      setActiveTrapState(trapGroupId);
      for (const node of nodesRef.current.values()) {
        if (isNodeInTrap(node.groupId, trapGroupId)) {
          setFocusedId(node.id);
          break;
        }
      }
    },
    [setFocusedId]
  );

  const popTrap = useCallback(() => {
    if (trapStackRef.current.length === 0) return;
    trapStackRef.current.pop();
    const activeTrap = trapStackRef.current[trapStackRef.current.length - 1] ?? null;
    setActiveTrapState(activeTrap);
    const prev = historyStackRef.current.pop();
    if (prev && nodesRef.current.has(prev)) {
      setFocusedId(prev);
    } else {
      for (const node of nodesRef.current.values()) {
        if (!activeTrap || isNodeInTrap(node.groupId, activeTrap)) {
          setFocusedId(node.id);
          break;
        }
      }
    }
  }, [setFocusedId]);

  const moveDirection = useCallback(
    (dir: Direction) => {
      const currentId = focusedIdRef.current;
      const activeTrap = trapStackRef.current[trapStackRef.current.length - 1];

      if (!currentId) {
        for (const node of nodesRef.current.values()) {
          if (!activeTrap || isNodeInTrap(node.groupId, activeTrap)) {
            setFocusedId(node.id);
            return;
          }
        }
        return;
      }

      const currentNode = nodesRef.current.get(currentId);
      if (!currentNode || !currentNode.element) return;

      const currentRect = currentNode.element.getBoundingClientRect();

      let candidates = Array.from(nodesRef.current.values()).filter(
        (n) => n.id !== currentId && n.element !== null
      );

      if (activeTrap) {
        candidates = candidates.filter((n) => isNodeInTrap(n.groupId, activeTrap));
      }

      let bestNode: FocusNode | null = null;
      let minDistance = Infinity;

      for (const node of candidates) {
        const rect = node.element!.getBoundingClientRect();
        const dx = rect.left + rect.width / 2 - (currentRect.left + currentRect.width / 2);
        const dy = rect.top + rect.height / 2 - (currentRect.top + currentRect.height / 2);

        let isAligned = false;
        if (dir === 'right' && dx > 15) {
          isAligned = Math.abs(dy) <= Math.max(currentRect.height * 1.5, 30);
        } else if (dir === 'left' && dx < -15) {
          isAligned = Math.abs(dy) <= Math.max(currentRect.height * 1.5, 30);
        } else if (dir === 'down' && dy > 15) {
          isAligned = Math.abs(dx) <= Math.max(currentRect.width * 1.5, 30);
        } else if (dir === 'up' && dy < -15) {
          isAligned = Math.abs(dx) <= Math.max(currentRect.width * 1.5, 30);
        }

        if (isAligned) {
          const dist = Math.hypot(dx, dy);
          if (dist < minDistance) {
            minDistance = dist;
            bestNode = node;
          }
        }
      }

      // Linear fallback within group if geometric layout yields no candidate (e.g. JSDOM/headless)
      if (!bestNode) {
        const allGroupNodes = Array.from(nodesRef.current.values()).filter(
          (n) => n.groupId === currentNode.groupId && isNodeInTrap(n.groupId, activeTrap)
        );
        allGroupNodes.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        const currentIndex = allGroupNodes.findIndex((n) => n.id === currentId);

        if (currentIndex !== -1) {
          if (dir === 'right' || dir === 'down') {
            const next = allGroupNodes[currentIndex + 1];
            if (next) bestNode = next;
          } else if (dir === 'left' || dir === 'up') {
            const prev = allGroupNodes[currentIndex - 1];
            if (prev) bestNode = prev;
          }
        }
      }

      if (bestNode) {
        setFocusedId(bestNode.id);
        bestNode.element?.scrollIntoView?.({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'center',
        });
      }
    },
    [setFocusedId]
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const code = e.keyCode || e.which;

      if (code === TVKeys.LEFT || e.key === 'ArrowLeft') {
        e.preventDefault();
        moveDirection('left');
      } else if (code === TVKeys.RIGHT || e.key === 'ArrowRight') {
        e.preventDefault();
        moveDirection('right');
      } else if (code === TVKeys.UP || e.key === 'ArrowUp') {
        e.preventDefault();
        moveDirection('up');
      } else if (code === TVKeys.DOWN || e.key === 'ArrowDown') {
        e.preventDefault();
        moveDirection('down');
      } else if (code === TVKeys.ENTER || e.key === 'Enter') {
        e.preventDefault();
        const currentId = focusedIdRef.current;
        if (currentId) {
          nodesRef.current.get(currentId)?.onEnter?.();
        }
      } else if (
        code === TVKeys.BACK_TIZEN ||
        code === TVKeys.BACK_WEB ||
        code === TVKeys.BACKSPACE ||
        e.key === 'Escape' ||
        e.key === 'Backspace'
      ) {
        if (
          (code === TVKeys.BACKSPACE || e.key === 'Backspace') &&
          (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)
        ) {
          return;
        }

        const currentId = focusedIdRef.current;
        const currentNode = currentId ? nodesRef.current.get(currentId) : null;
        if (currentNode?.onBack) {
          e.preventDefault();
          currentNode.onBack();
        } else if (trapStackRef.current.length > 0) {
          e.preventDefault();
          popTrap();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [moveDirection, popTrap]);

  const value: FocusContextType = {
    focusedId,
    activeTrap: activeTrapState,
    setFocusedId,
    registerNode,
    unregisterNode,
    pushTrap,
    popTrap,
    pushFocusTrap: pushTrap,
    popFocusTrap: popTrap,
  };

  return <FocusContext.Provider value={value}>{children}</FocusContext.Provider>;
}

export function useFocusContext(): FocusContextType {
  const ctx = useContext(FocusContext);
  if (!ctx) {
    throw new Error('useFocusContext must be used within a FocusProvider');
  }
  return ctx;
}
