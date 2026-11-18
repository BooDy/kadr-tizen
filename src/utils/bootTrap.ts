import {
  BOOT_ERROR_ELEMENT_ID,
  buildBootErrorTrapInlineJs,
  buildBootErrorTrapScriptTag,
} from './bootTrapScript';

export { BOOT_ERROR_ELEMENT_ID, buildBootErrorTrapInlineJs, buildBootErrorTrapScriptTag };

declare global {
  interface Window {
    __kadrDisarmBootTrap?: () => void;
  }
}

/**
 * Disarms the pre-boot HTML error overlay once the React app has mounted,
 * removes any lingering startup banner, and logs background promise rejections
 * to the console outside test environments.
 */
export function disarmBootErrorTrap(): () => void {
  if (typeof window === 'undefined') return () => {};

  window.__kadrDisarmBootTrap?.();
  if (typeof document !== 'undefined') {
    document.getElementById(BOOT_ERROR_ELEMENT_ID)?.remove();
  }

  const isTestEnv = typeof process !== 'undefined' && process.env?.NODE_ENV === 'test';
  const onBackgroundRejection = (e: PromiseRejectionEvent) => {
    if (!isTestEnv) {
      console.warn('[Kadr] Unhandled background promise rejection:', e.reason);
    }
  };

  window.addEventListener('unhandledrejection', onBackgroundRejection);
  return () => {
    window.removeEventListener('unhandledrejection', onBackgroundRejection);
  };
}
