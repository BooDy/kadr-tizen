import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  BOOT_ERROR_ELEMENT_ID,
  buildBootErrorTrapInlineJs,
  disarmBootErrorTrap,
} from '../../src/utils/bootTrap';
import { TVKeys } from '../../src/navigation/keys';

describe('Boot-scoped error trap & post-mount disarm', () => {
  let cleanupDisarm: (() => void) | null = null;

  beforeEach(() => {
    document.getElementById(BOOT_ERROR_ELEMENT_ID)?.remove();
    delete (window as any).__kadrDisarmBootTrap;
  });

  afterEach(() => {
    cleanupDisarm?.();
    cleanupDisarm = null;
    (window as any).__kadrDisarmBootTrap?.();
    document.getElementById(BOOT_ERROR_ELEMENT_ID)?.remove();
    delete (window as any).__kadrDisarmBootTrap;
  });

  it('shows #kadr-startup-error before boot and dismisses it on Tizen Back (10009), Enter (13), or click', () => {
    const install = new Function(buildBootErrorTrapInlineJs());
    install();

    window.dispatchEvent(new ErrorEvent('error', { message: 'Bundle syntax failure' }));
    const banner = document.getElementById(BOOT_ERROR_ELEMENT_ID);
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain('Bundle syntax failure');
    expect(banner?.textContent).toContain('BACK');

    const downstreamSpy = vi.fn();
    window.addEventListener('keydown', downstreamSpy);
    try {
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          keyCode: TVKeys.BACK_TIZEN,
          key: 'XF86Back',
          bubbles: true,
          cancelable: true,
        })
      );
      expect(document.getElementById(BOOT_ERROR_ELEMENT_ID)).toBeNull();
      expect(downstreamSpy).not.toHaveBeenCalled();

      // Re-trigger and dismiss via Enter (13)
      window.dispatchEvent(new ErrorEvent('error', { message: 'Second boot error' }));
      expect(document.getElementById(BOOT_ERROR_ELEMENT_ID)).not.toBeNull();

      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          keyCode: TVKeys.ENTER,
          key: 'Enter',
          bubbles: true,
          cancelable: true,
        })
      );
      expect(document.getElementById(BOOT_ERROR_ELEMENT_ID)).toBeNull();
      expect(downstreamSpy).not.toHaveBeenCalled();

      // Re-trigger and dismiss via clicking the banner
      window.dispatchEvent(new ErrorEvent('error', { message: 'Third boot error' }));
      const thirdBanner = document.getElementById(BOOT_ERROR_ELEMENT_ID);
      expect(thirdBanner).not.toBeNull();
      thirdBanner?.click();
      expect(document.getElementById(BOOT_ERROR_ELEMENT_ID)).toBeNull();
    } finally {
      window.removeEventListener('keydown', downstreamSpy);
    }
  });

  it('disarms completely after disarmBootErrorTrap() so runtime errors and unhandled rejections never render #kadr-startup-error', () => {
    const install = new Function(buildBootErrorTrapInlineJs());
    install();

    // Pre-boot transient error appears
    window.dispatchEvent(new ErrorEvent('error', { message: 'Early warning' }));
    expect(document.getElementById(BOOT_ERROR_ELEMENT_ID)).not.toBeNull();

    // App mounts and disarms the boot trap
    cleanupDisarm = disarmBootErrorTrap();
    expect(document.getElementById(BOOT_ERROR_ELEMENT_ID)).toBeNull();

    // Subsequent runtime error & unhandled promise rejection during video playback must NOT create banner
    window.dispatchEvent(new ErrorEvent('error', { message: 'Background runtime error' }));
    const rejectionEvent = new Event('unhandledrejection') as Event & { reason?: unknown };
    rejectionEvent.reason = new Error('Background fetch timeout');
    window.dispatchEvent(rejectionEvent);

    expect(document.getElementById(BOOT_ERROR_ELEMENT_ID)).toBeNull();
  });
});
