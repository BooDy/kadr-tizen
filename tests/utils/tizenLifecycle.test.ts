import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  exitTvApp,
  resetScreenSaverStateForTests,
  setTvScreenSaver,
} from '../../src/utils/tizenLifecycle';

describe('tizenLifecycle platform adapter', () => {
  beforeEach(() => {
    resetScreenSaverStateForTests();
    delete (window as any).webapis;
    delete (window as any).tizen;
  });

  afterEach(() => {
    resetScreenSaverStateForTests();
    delete (window as any).webapis;
    delete (window as any).tizen;
  });

  it('toggles Samsung webapis.appcommon.setScreenSaver OFF (1) and ON (0) without redundant duplicate calls', () => {
    const setScreenSaver = vi.fn((_state, onSuccess) => onSuccess?.());
    (window as any).webapis = {
      appcommon: {
        AppCommonScreenSaverState: {
          SCREEN_SAVER_ON: 0,
          SCREEN_SAVER_OFF: 1,
        },
        setScreenSaver,
      },
    };

    setTvScreenSaver(true);
    setTvScreenSaver(true); // duplicate — skipped
    expect(setScreenSaver).toHaveBeenCalledTimes(1);
    expect(setScreenSaver).toHaveBeenLastCalledWith(
      1,
      expect.any(Function),
      expect.any(Function)
    );

    setTvScreenSaver(false);
    expect(setScreenSaver).toHaveBeenCalledTimes(2);
    expect(setScreenSaver).toHaveBeenLastCalledWith(
      0,
      expect.any(Function),
      expect.any(Function)
    );
  });

  it('exits via tizen.application.getCurrentApplication().exit() and falls back to window.close()', () => {
    const exitSpy = vi.fn();
    (window as any).tizen = {
      application: {
        getCurrentApplication: () => ({ exit: exitSpy }),
      },
    };

    exitTvApp();
    expect(exitSpy).toHaveBeenCalledTimes(1);

    delete (window as any).tizen;
    const closeSpy = vi.spyOn(window, 'close').mockImplementation(() => {});
    try {
      exitTvApp();
      expect(closeSpy).toHaveBeenCalledTimes(1);
    } finally {
      closeSpy.mockRestore();
    }
  });
});
