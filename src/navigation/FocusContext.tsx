import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  useSyncExternalStore,
} from 'react';
import { FocusNode, Direction } from '../types/navigation';
import { TVKeys, registerTizenKeys } from './keys';
import { isTextInputElement } from './useFocusable';

export interface FocusContextType {
  focusedId: string | null;
  activeTrap: string | null;
  setFocusedId: (id: string | null | ((prev: string | null) => string | null)) => void;
  registerNode: (node: FocusNode) => void;
  unregisterNode: (id: string) => void;
  pushTrap: (trapGroupId: string) => void;
  popTrap: (trapGroupId?: string) => void;
  pushFocusTrap: (trapGroupId: string) => void;
  popFocusTrap: (trapGroupId?: string) => void;
  getFocusedId?: () => string | null;
  getActiveTrap?: () => string | null;
  subscribeNodeFocus?: (id: string, listener: () => void) => () => void;
}

export interface FocusStore {
  getFocusedId: () => string | null;
  getActiveTrap: () => string | null;
  subscribeNodeFocus: (id: string, listener: () => void) => () => void;
  subscribeActiveTrap: (listener: () => void) => () => void;
  setFocusedId: (id: string | null | ((prev: string | null) => string | null)) => void;
  registerNode: (node: FocusNode) => void;
  unregisterNode: (id: string) => void;
  pushTrap: (trapGroupId: string) => void;
  popTrap: (trapGroupId?: string) => void;
  pushFocusTrap: (trapGroupId: string) => void;
  popFocusTrap: (trapGroupId?: string) => void;
}

interface TrapEntry {
  trapGroupId: string;
  previousFocusedId: string | null;
  lastFocusedInsideId: string | null;
}

export const FocusContext = createContext<FocusContextType | null>(null);
export const FocusStoreContext = createContext<FocusStore | null>(null);

export function isNodeInTrap(nodeGroupId: string, activeTrap: string | null | undefined): boolean {
  if (!activeTrap) return true;
  if (nodeGroupId === activeTrap) return true;
  if (nodeGroupId.startsWith(`${activeTrap}-`)) return true;
  if (activeTrap === 'item-detail-modal') {
    return (
      nodeGroupId === 'season-tabs' ||
      nodeGroupId.startsWith('season-episodes-') ||
      nodeGroupId.startsWith('item-detail-')
    );
  }
  if (activeTrap === 'playlist-detail-modal') {
    return nodeGroupId.startsWith('playlist-detail-');
  }
  if (activeTrap === 'add-to-playlist-modal') {
    return nodeGroupId.startsWith('add-to-playlist-');
  }
  if (activeTrap === 'create-edit-playlist-modal') {
    return nodeGroupId.startsWith('create-edit-playlist-');
  }
  if (activeTrap === 'folder-browser-modal') {
    return nodeGroupId.startsWith('folder-browser-') || nodeGroupId.startsWith('folder-');
  }
  if (activeTrap === 'image-viewer-modal') {
    return nodeGroupId.startsWith('image-viewer-');
  }
  if (activeTrap === 'audio-modal') {
    return nodeGroupId === 'audio-modal' || nodeGroupId.startsWith('audio-');
  }
  if (activeTrap === 'pin-pad-modal' || activeTrap === 'pin-modal' || activeTrap === 'tv-modal') {
    return nodeGroupId === 'keypad' || nodeGroupId.startsWith('pin-');
  }
  return false;
}

function isNodeMounted(
  node: FocusNode | null | undefined
): node is FocusNode & { element: HTMLElement } {
  return Boolean(node && node.element && node.element.isConnected);
}

function isNodeEnabled(node: FocusNode | null | undefined): boolean {
  if (!isNodeMounted(node)) return false;
  if (typeof HTMLButtonElement !== 'undefined' && node.element instanceof HTMLButtonElement) {
    return !node.element.disabled;
  }
  return !(node.element as HTMLButtonElement).disabled;
}

function sortNodesDeterministically(nodes: FocusNode[], seqMap: Map<string, number>): FocusNode[] {
  return [...nodes].sort((a, b) => {
    const orderA = a.order ?? Number.MAX_SAFE_INTEGER;
    const orderB = b.order ?? Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;
    return (seqMap.get(a.id) ?? 0) - (seqMap.get(b.id) ?? 0);
  });
}

function findFirstNodeForTrap(
  nodesMap: Map<string, FocusNode>,
  seqMap: Map<string, number>,
  trapGroupId: string | null | undefined
): FocusNode | null {
  const mountedInTrap: FocusNode[] = [];
  for (const n of nodesMap.values()) {
    if (isNodeMounted(n) && (!trapGroupId || isNodeInTrap(n.groupId, trapGroupId))) {
      mountedInTrap.push(n);
    }
  }
  if (mountedInTrap.length === 0) return null;
  const enabled = mountedInTrap.filter((n) => isNodeEnabled(n));
  const pool = enabled.length > 0 ? enabled : mountedInTrap;
  return sortNodesDeterministically(pool, seqMap)[0] ?? null;
}

function focusElementPreventScroll(el: HTMLElement | null | undefined): void {
  if (!el || isTextInputElement(el)) return;
  try {
    el.focus?.({ preventScroll: true });
  } catch {
    el.focus?.();
  }
}

function blurStrayActiveElement(targetElement?: HTMLElement | null): void {
  if (typeof document === 'undefined') return;
  const activeEl = document.activeElement as HTMLElement | null;
  if (
    activeEl &&
    activeEl !== document.body &&
    activeEl !== document.documentElement &&
    activeEl !== targetElement
  ) {
    try {
      activeEl.blur?.();
    } catch {
      // Ignored
    }
  }
}

export function scrollElementIntoViewIfNeeded(el: HTMLElement | null | undefined): void {
  if (!el || typeof el.scrollIntoView !== 'function') return;

  if (typeof el.getBoundingClientRect === 'function') {
    const rect = el.getBoundingClientRect();
    // Skip zero-geometry layouts (e.g. unmocked JSDOM or hidden elements)
    if (rect.width === 0 && rect.height === 0 && rect.top === 0 && rect.left === 0) {
      return;
    }

    const viewportW =
      (typeof window !== 'undefined' && window.innerWidth) ||
      (typeof document !== 'undefined' && document.documentElement?.clientWidth) ||
      1920;
    const viewportH =
      (typeof window !== 'undefined' && window.innerHeight) ||
      (typeof document !== 'undefined' && document.documentElement?.clientHeight) ||
      1080;

    let isClipped =
      rect.top < 0 || rect.left < 0 || rect.bottom > viewportH || rect.right > viewportW;

    if (!isClipped) {
      let parent = el.parentElement;
      while (parent && parent !== document.body && parent !== document.documentElement) {
        const vScrollable = parent.scrollHeight > parent.clientHeight + 1;
        const hScrollable = parent.scrollWidth > parent.clientWidth + 1;
        if (vScrollable || hScrollable) {
          const parentRect = parent.getBoundingClientRect();
          if (parentRect.width > 0 || parentRect.height > 0) {
            if (vScrollable && (rect.top < parentRect.top || rect.bottom > parentRect.bottom)) {
              isClipped = true;
              break;
            }
            if (hScrollable && (rect.left < parentRect.left || rect.right > parentRect.right)) {
              isClipped = true;
              break;
            }
          }
        }
        parent = parent.parentElement;
      }
    }

    if (!isClipped) {
      return;
    }
  }

  try {
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  } catch {
    el.scrollIntoView(false);
  }
}

export function FocusProvider({ children }: { children: React.ReactNode }) {
  const [focusedId, setFocusedIdState] = useState<string | null>(null);
  const [activeTrapState, setActiveTrapState] = useState<string | null>(null);
  const focusedIdRef = useRef<string | null>(null);
  const activeTrapRef = useRef<string | null>(null);
  const nodesRef = useRef<Map<string, FocusNode>>(new Map());
  const nodeSeqRef = useRef<Map<string, number>>(new Map());
  const nextSeqCounterRef = useRef<number>(1);
  const trapStackRef = useRef<TrapEntry[]>([]);

  // O(1) per-node focus listeners so only prevId & nextId re-render on focus moves
  const nodeListenersRef = useRef<Map<string, Set<() => void>>>(new Map());
  const trapListenersRef = useRef<Set<() => void>>(new Set());

  useEffect(() => {
    registerTizenKeys();
  }, []);

  const notifyNodeListeners = useCallback((id: string | null) => {
    if (!id) return;
    const listeners = nodeListenersRef.current.get(id);
    if (!listeners || listeners.size === 0) return;
    for (const listener of Array.from(listeners)) {
      listener();
    }
  }, []);

  const notifyTrapListeners = useCallback(() => {
    if (trapListenersRef.current.size === 0) return;
    for (const listener of Array.from(trapListenersRef.current)) {
      listener();
    }
  }, []);

  const commitActiveTrap = useCallback(
    (nextTrap: string | null) => {
      const prevTrap = activeTrapRef.current;
      activeTrapRef.current = nextTrap;
      setActiveTrapState(nextTrap);
      if (prevTrap !== nextTrap) {
        notifyTrapListeners();
      }
    },
    [notifyTrapListeners]
  );

  const commitFocusedId = useCallback(
    (
      idOrUpdater: string | null | ((prev: string | null) => string | null),
      options?: { bypassTrapGuard?: boolean }
    ) => {
      const prev = focusedIdRef.current;
      const next = typeof idOrUpdater === 'function' ? idOrUpdater(prev) : idOrUpdater;

      const topTrap = trapStackRef.current[trapStackRef.current.length - 1];
      const activeTrap = topTrap?.trapGroupId ?? null;

      // Prevent background screens (e.g. BrowseScreen) from stealing focus while a modal trap is active
      if (!options?.bypassTrapGuard && activeTrap && next !== null) {
        const nextNode = nodesRef.current.get(next);
        if (nextNode && !isNodeInTrap(nextNode.groupId, activeTrap)) {
          return;
        }
      }

      if (topTrap && next !== null) {
        const nextNode = nodesRef.current.get(next);
        if (!nextNode || isNodeInTrap(nextNode.groupId, topTrap.trapGroupId)) {
          topTrap.lastFocusedInsideId = next;
        }
      }

      if (prev === next) {
        if (next !== null) {
          const sameNode = nodesRef.current.get(next);
          if (
            sameNode?.element &&
            !isTextInputElement(sameNode.element) &&
            typeof document !== 'undefined' &&
            document.activeElement !== sameNode.element
          ) {
            focusElementPreventScroll(sameNode.element);
          }
        }
        return;
      }

      focusedIdRef.current = next;
      setFocusedIdState(next);
      notifyNodeListeners(prev);
      notifyNodeListeners(next);
    },
    [notifyNodeListeners]
  );

  const setFocusedId = useCallback(
    (idOrUpdater: string | null | ((prev: string | null) => string | null)) => {
      commitFocusedId(idOrUpdater);
    },
    [commitFocusedId]
  );

  const getFocusedId = useCallback(() => focusedIdRef.current, []);
  const getActiveTrap = useCallback(() => activeTrapRef.current, []);

  const subscribeNodeFocus = useCallback((id: string, listener: () => void) => {
    let set = nodeListenersRef.current.get(id);
    if (!set) {
      set = new Set();
      nodeListenersRef.current.set(id, set);
    }
    set.add(listener);
    return () => {
      const existing = nodeListenersRef.current.get(id);
      if (!existing) return;
      existing.delete(listener);
      if (existing.size === 0) {
        nodeListenersRef.current.delete(id);
      }
    };
  }, []);

  const subscribeActiveTrap = useCallback((listener: () => void) => {
    trapListenersRef.current.add(listener);
    return () => {
      trapListenersRef.current.delete(listener);
    };
  }, []);

  const registerNode = useCallback(
    (node: FocusNode) => {
      if (!node.element) {
        nodesRef.current.delete(node.id);
        return;
      }
      if (!nodeSeqRef.current.has(node.id)) {
        nodeSeqRef.current.set(node.id, nextSeqCounterRef.current++);
      }
      nodesRef.current.set(node.id, node);

      const topTrap = trapStackRef.current[trapStackRef.current.length - 1];
      const activeTrap = topTrap?.trapGroupId ?? null;
      if (activeTrap && isNodeInTrap(node.groupId, activeTrap) && isNodeEnabled(node)) {
        const currentId = focusedIdRef.current;
        const currentNode = currentId ? nodesRef.current.get(currentId) : null;
        if (
          !currentNode ||
          !isNodeMounted(currentNode) ||
          !isNodeInTrap(currentNode.groupId, activeTrap)
        ) {
          commitFocusedId(node.id, { bypassTrapGuard: true });
        }
      }
    },
    [commitFocusedId]
  );

  const unregisterNode = useCallback(
    (id: string) => {
      nodesRef.current.delete(id);
      nodeSeqRef.current.delete(id);
      if (focusedIdRef.current === id) {
        commitFocusedId(null, { bypassTrapGuard: true });
      }
    },
    [commitFocusedId]
  );

  const pushTrap = useCallback(
    (trapGroupId: string) => {
      const top = trapStackRef.current[trapStackRef.current.length - 1];
      if (top?.trapGroupId === trapGroupId) {
        return;
      }

      if (typeof document !== 'undefined' && isTextInputElement(document.activeElement)) {
        document.activeElement.blur();
      }

      const currentId = focusedIdRef.current;
      const currentNode = currentId ? nodesRef.current.get(currentId) : null;
      let previousFocusedId = currentId;
      // If a child node inside the new trap already grabbed focus before pushTrap ran,
      // preserve the parent trap's last focused item instead of overwriting it.
      if (
        top &&
        (!previousFocusedId ||
          (currentNode && isNodeInTrap(currentNode.groupId, trapGroupId))) &&
        top.lastFocusedInsideId
      ) {
        previousFocusedId = top.lastFocusedInsideId;
      }

      const firstInTrap = findFirstNodeForTrap(
        nodesRef.current,
        nodeSeqRef.current,
        trapGroupId
      );

      trapStackRef.current.push({
        trapGroupId,
        previousFocusedId,
        lastFocusedInsideId: firstInTrap ? firstInTrap.id : null,
      });
      commitActiveTrap(trapGroupId);

      if (firstInTrap) {
        blurStrayActiveElement(firstInTrap.element);
        commitFocusedId(firstInTrap.id, { bypassTrapGuard: true });
        focusElementPreventScroll(firstInTrap.element);
      } else {
        blurStrayActiveElement(null);
        commitFocusedId(null, { bypassTrapGuard: true });
      }
    },
    [commitActiveTrap, commitFocusedId]
  );

  const popTrap = useCallback(
    (trapGroupId?: string) => {
      if (trapStackRef.current.length === 0) return;

      if (trapGroupId !== undefined) {
        let targetIndex = -1;
        for (let i = trapStackRef.current.length - 1; i >= 0; i--) {
          if (trapStackRef.current[i].trapGroupId === trapGroupId) {
            targetIndex = i;
            break;
          }
        }
        if (targetIndex === -1) return;

        // If a lower trap unmounts while a child modal trap is still active on top,
        // remove only the lower trap entry without disturbing the active child trap.
        if (targetIndex < trapStackRef.current.length - 1) {
          const [removed] = trapStackRef.current.splice(targetIndex, 1);
          const childAbove = trapStackRef.current[targetIndex];
          if (childAbove) {
            const childPrevNode = childAbove.previousFocusedId
              ? nodesRef.current.get(childAbove.previousFocusedId)
              : null;
            if (!childPrevNode || isNodeInTrap(childPrevNode.groupId, removed.trapGroupId)) {
              childAbove.previousFocusedId = removed.previousFocusedId;
            }
          }
          return;
        }
      }

      const popped = trapStackRef.current.pop()!;
      const nowTop = trapStackRef.current[trapStackRef.current.length - 1] ?? null;
      const activeTrap = nowTop?.trapGroupId ?? null;
      commitActiveTrap(activeTrap);

      const candidateIds = [popped.previousFocusedId, nowTop?.lastFocusedInsideId ?? null];
      let restoredNode: (FocusNode & { element: HTMLElement }) | null = null;

      for (const candId of candidateIds) {
        if (!candId) continue;
        const candNode = nodesRef.current.get(candId);
        if (
          candNode &&
          isNodeMounted(candNode) &&
          (!activeTrap || isNodeInTrap(candNode.groupId, activeTrap))
        ) {
          restoredNode = candNode;
          break;
        }
      }

      if (!restoredNode) {
        const fallback = findFirstNodeForTrap(nodesRef.current, nodeSeqRef.current, activeTrap);
        if (fallback && isNodeMounted(fallback)) {
          restoredNode = fallback;
        }
      }

      if (restoredNode) {
        blurStrayActiveElement(restoredNode.element);
        commitFocusedId(restoredNode.id, { bypassTrapGuard: true });
        focusElementPreventScroll(restoredNode.element);
      } else {
        blurStrayActiveElement(null);
        commitFocusedId(null, { bypassTrapGuard: true });
      }
    },
    [commitActiveTrap, commitFocusedId]
  );

  const moveDirection = useCallback(
    (dir: Direction) => {
      const currentId = focusedIdRef.current;
      const activeTrap =
        trapStackRef.current[trapStackRef.current.length - 1]?.trapGroupId ?? null;

      const currentNode = currentId ? nodesRef.current.get(currentId) : null;
      if (
        !currentId ||
        !currentNode ||
        !isNodeMounted(currentNode) ||
        (activeTrap && !isNodeInTrap(currentNode.groupId, activeTrap))
      ) {
        const fallback = findFirstNodeForTrap(nodesRef.current, nodeSeqRef.current, activeTrap);
        if (fallback) {
          commitFocusedId(fallback.id, { bypassTrapGuard: true });
          scrollElementIntoViewIfNeeded(fallback.element);
        }
        return;
      }

      const currentRect = currentNode.element.getBoundingClientRect();
      const isCurrentSidebar = currentNode.groupId === 'sidebar';

      const candidateRects: Array<{ node: FocusNode; rect: DOMRect }> = [];
      let hasCandidateGeometry = false;

      for (const n of nodesRef.current.values()) {
        if (n.id === currentId) continue;
        if (activeTrap && !isNodeInTrap(n.groupId, activeTrap)) continue;
        // Sidebar isolation: navigation within sidebar stays in sidebar; content never jumps to sidebar
        if (isCurrentSidebar ? n.groupId !== 'sidebar' : n.groupId === 'sidebar') continue;
        if (!isNodeEnabled(n)) continue;

        const rect = n.element!.getBoundingClientRect();
        if (rect.width > 0 || rect.height > 0) {
          hasCandidateGeometry = true;
        }
        candidateRects.push({ node: n, rect });
      }

      const hasCurrentGeometry = currentRect.width > 0 || currentRect.height > 0;
      const isGeometricLayout = hasCurrentGeometry || hasCandidateGeometry;

      let bestNode: FocusNode | null = null;
      let minScore = Infinity;

      if (isGeometricLayout) {
        const curCx = currentRect.left + currentRect.width / 2;
        const curCy = currentRect.top + currentRect.height / 2;

        for (const { node, rect } of candidateRects) {
          if (rect.width <= 0 && rect.height <= 0) continue;

          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          const dx = cx - curCx;
          const dy = cy - curCy;

          if (dir === 'right' || dir === 'left') {
            const isInHorizDir =
              dir === 'right'
                ? dx > 8 && rect.left >= currentRect.left + 4
                : dx < -8 && rect.right <= currentRect.right - 4;
            if (!isInHorizDir) continue;

            // Require genuine same-row vertical overlap so Left/Right never jumps diagonally across rows
            const verticalOverlap =
              Math.min(currentRect.bottom, rect.bottom) - Math.max(currentRect.top, rect.top);
            const minHeight = Math.min(currentRect.height, rect.height);
            const isSameRow =
              verticalOverlap > 0 || Math.abs(dy) <= Math.max(minHeight * 0.5, 16);
            if (!isSameRow) continue;

            const hGap =
              dir === 'right'
                ? Math.max(0, rect.left - currentRect.right)
                : Math.max(0, currentRect.left - rect.right);
            const score = hGap + Math.abs(dx) * 0.25 + Math.abs(dy) * 2;
            if (score < minScore) {
              minScore = score;
              bestNode = node;
            }
          } else {
            const overlapTolerance = Math.min(currentRect.height, rect.height) * 0.35;
            const isInVertDir =
              dir === 'down'
                ? dy > 10 && rect.top >= currentRect.bottom - overlapTolerance
                : dy < -10 && rect.bottom <= currentRect.top + overlapTolerance;
            if (!isInVertDir) continue;

            const vGap =
              dir === 'down'
                ? Math.max(0, rect.top - currentRect.bottom)
                : Math.max(0, currentRect.top - rect.bottom);
            const hGap = Math.max(
              0,
              Math.max(currentRect.left, rect.left) - Math.min(currentRect.right, rect.right)
            );
            const horizTieBreak =
              currentRect.width >= rect.width * 1.8
                ? Math.abs(rect.left - currentRect.left)
                : Math.abs(dx);
            const score = vGap * 4 + hGap * 1.5 + horizTieBreak * 0.15;
            if (score < minScore) {
              minScore = score;
              bestNode = node;
            }
          }
        }
      } else {
        // Linear fallback within group ONLY when layout has zero geometry (e.g. JSDOM/headless)
        const groupNodes: FocusNode[] = [];
        for (const n of nodesRef.current.values()) {
          if (
            n.groupId === currentNode.groupId &&
            isNodeEnabled(n) &&
            isNodeInTrap(n.groupId, activeTrap)
          ) {
            groupNodes.push(n);
          }
        }
        const allGroupNodes = sortNodesDeterministically(groupNodes, nodeSeqRef.current);
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
        if (
          typeof document !== 'undefined' &&
          isTextInputElement(document.activeElement) &&
          document.activeElement !== bestNode.element
        ) {
          document.activeElement.blur();
        }
        commitFocusedId(bestNode.id, { bypassTrapGuard: true });
      }
    },
    [commitFocusedId]
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const code = e.keyCode || e.which;
      const activeEl = typeof document !== 'undefined' ? document.activeElement : null;
      const isEditingTextInput = isTextInputElement(activeEl);

      // Samsung Tizen virtual keyboard (IME) Done (65376) & Cancel (65385)
      if (code === TVKeys.IME_DONE || code === TVKeys.IME_CANCEL) {
        if (isEditingTextInput) {
          e.preventDefault();
          activeEl.blur();
        }
        return;
      }

      if (code === TVKeys.LEFT || e.key === 'ArrowLeft') {
        // Allow native caret movement inside <input>/<textarea> while actively editing
        if (isEditingTextInput) return;
        e.preventDefault();
        moveDirection('left');
      } else if (code === TVKeys.RIGHT || e.key === 'ArrowRight') {
        if (isEditingTextInput) return;
        e.preventDefault();
        moveDirection('right');
      } else if (code === TVKeys.UP || e.key === 'ArrowUp') {
        e.preventDefault();
        if (isEditingTextInput) {
          activeEl.blur();
        }
        moveDirection('up');
      } else if (code === TVKeys.DOWN || e.key === 'ArrowDown') {
        e.preventDefault();
        if (isEditingTextInput) {
          activeEl.blur();
        }
        moveDirection('down');
      } else if (code === TVKeys.ENTER || e.key === 'Enter') {
        const activeTrap =
          trapStackRef.current[trapStackRef.current.length - 1]?.trapGroupId ?? null;
        const currentId = focusedIdRef.current;
        const currentNode = currentId ? nodesRef.current.get(currentId) : null;

        // Guard against stale/unmounted nodes or background nodes outside the active modal trap
        if (
          currentNode &&
          (!isNodeMounted(currentNode) ||
            (activeTrap && !isNodeInTrap(currentNode.groupId, activeTrap)))
        ) {
          e.preventDefault();
          const fallback = findFirstNodeForTrap(nodesRef.current, nodeSeqRef.current, activeTrap);
          if (fallback && isNodeMounted(fallback)) {
            blurStrayActiveElement(fallback.element);
            commitFocusedId(fallback.id, { bypassTrapGuard: true });
            focusElementPreventScroll(fallback.element);
          } else {
            blurStrayActiveElement(null);
            commitFocusedId(null, { bypassTrapGuard: true });
          }
          return;
        }

        if (!currentNode) {
          // If a modal trap is active while focusedId is null, prevent Enter from firing a native
          // click on any stray background DOM activeElement.
          if (activeTrap && !isEditingTextInput) {
            e.preventDefault();
            const fallback = findFirstNodeForTrap(nodesRef.current, nodeSeqRef.current, activeTrap);
            if (fallback && isNodeMounted(fallback)) {
              blurStrayActiveElement(fallback.element);
              commitFocusedId(fallback.id, { bypassTrapGuard: true });
              focusElementPreventScroll(fallback.element);
            } else {
              blurStrayActiveElement(null);
            }
          }
          return;
        }

        if (currentNode.element && isTextInputElement(currentNode.element)) {
          e.preventDefault();
          if (activeEl !== currentNode.element) {
            // Activate native focus synchronously inside user Enter gesture to open Samsung Tizen IME
            currentNode.element.focus();
            try {
              const len = currentNode.element.value.length;
              currentNode.element.setSelectionRange?.(len, len);
            } catch {
              // Ignored for input types that do not support selection ranges
            }
          } else {
            // Pressing Enter while already editing blurs the input (and invokes optional onEnter)
            currentNode.element.blur();
            currentNode.onEnter?.();
          }
          return;
        }

        // Always preventDefault on Enter for non-input focusable nodes so Chromium never
        // synthesizes a duplicate/stray native click event on document.activeElement.
        e.preventDefault();
        if (isNodeEnabled(currentNode)) {
          currentNode.onEnter?.();
        }
      } else if (
        code === TVKeys.BACK_TIZEN ||
        code === TVKeys.BACK_WEB ||
        code === TVKeys.BACKSPACE ||
        e.key === 'Escape' ||
        e.key === 'Backspace'
      ) {
        if (e.defaultPrevented) return;

        if (
          (code === TVKeys.BACKSPACE || e.key === 'Backspace') &&
          (isEditingTextInput || isTextInputElement(e.target))
        ) {
          return;
        }

        // Pressing TV Return (10009) or Escape while editing an <input>/<textarea>
        // dismisses the virtual keyboard without closing the parent modal/screen
        if (isEditingTextInput) {
          e.preventDefault();
          activeEl.blur();
          return;
        }

        const activeTrap =
          trapStackRef.current[trapStackRef.current.length - 1]?.trapGroupId ?? null;
        const currentId = focusedIdRef.current;
        const currentNode = currentId ? nodesRef.current.get(currentId) : null;
        if (
          currentNode?.onBack &&
          isNodeMounted(currentNode) &&
          (!activeTrap || isNodeInTrap(currentNode.groupId, activeTrap))
        ) {
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
  }, [moveDirection, popTrap, commitFocusedId]);

  const storeValue = useMemo<FocusStore>(
    () => ({
      getFocusedId,
      getActiveTrap,
      subscribeNodeFocus,
      subscribeActiveTrap,
      setFocusedId,
      registerNode,
      unregisterNode,
      pushTrap,
      popTrap,
      pushFocusTrap: pushTrap,
      popFocusTrap: popTrap,
    }),
    [
      getFocusedId,
      getActiveTrap,
      subscribeNodeFocus,
      subscribeActiveTrap,
      setFocusedId,
      registerNode,
      unregisterNode,
      pushTrap,
      popTrap,
    ]
  );

  const contextValue = useMemo<FocusContextType>(
    () => ({
      focusedId,
      activeTrap: activeTrapState,
      setFocusedId,
      registerNode,
      unregisterNode,
      pushTrap,
      popTrap,
      pushFocusTrap: pushTrap,
      popFocusTrap: popTrap,
      getFocusedId,
      getActiveTrap,
      subscribeNodeFocus,
    }),
    [
      focusedId,
      activeTrapState,
      setFocusedId,
      registerNode,
      unregisterNode,
      pushTrap,
      popTrap,
      getFocusedId,
      getActiveTrap,
      subscribeNodeFocus,
    ]
  );

  return (
    <FocusStoreContext.Provider value={storeValue}>
      <FocusContext.Provider value={contextValue}>{children}</FocusContext.Provider>
    </FocusStoreContext.Provider>
  );
}

export function useFocusContext(): FocusContextType {
  const ctx = useContext(FocusContext);
  if (!ctx) {
    throw new Error('useFocusContext must be used within a FocusProvider');
  }
  return ctx;
}

export function useFocusStore(): FocusStore {
  const store = useContext(FocusStoreContext);
  if (!store) {
    throw new Error('useFocusStore must be used within a FocusProvider');
  }
  return store;
}

export function useIsFocused(id: string): boolean {
  const store = useFocusStore();
  const subscribe = useCallback(
    (onStoreChange: () => void) => store.subscribeNodeFocus(id, onStoreChange),
    [store, id]
  );
  const getSnapshot = useCallback(() => store.getFocusedId() === id, [store, id]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useActiveTrap(): string | null {
  const store = useFocusStore();
  return useSyncExternalStore(
    store.subscribeActiveTrap,
    store.getActiveTrap,
    store.getActiveTrap
  );
}
