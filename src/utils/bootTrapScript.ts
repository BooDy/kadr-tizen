export const BOOT_ERROR_ELEMENT_ID = 'kadr-startup-error';

/**
 * Builds the ES5 inline JavaScript for the pre-boot startup error trap.
 * Runs synchronously in `<head>` before the app bundle loads so fatal
 * boot/syntax errors on Tizen Chromium 69 remain visible and dismissible.
 */
export function buildBootErrorTrapInlineJs(): string {
  return `(function() {
  var disarmed = false;
  var keyListenerBound = false;

  function dismissStartupError() {
    var el = document.getElementById('${BOOT_ERROR_ELEMENT_ID}');
    if (el && el.parentNode) {
      el.parentNode.removeChild(el);
    }
    if (keyListenerBound) {
      keyListenerBound = false;
      window.removeEventListener('keydown', onBootErrorKeyDown, true);
    }
  }

  function onBootErrorKeyDown(e) {
    var el = document.getElementById('${BOOT_ERROR_ELEMENT_ID}');
    if (!el) return;
    var code = e.keyCode || e.which;
    var key = e.key || '';
    if (
      code === 10009 ||
      code === 27 ||
      code === 8 ||
      code === 461 ||
      code === 13 ||
      key === 'Escape' ||
      key === 'Backspace' ||
      key === 'Enter' ||
      key === 'XF86Back'
    ) {
      if (e.preventDefault) e.preventDefault();
      if (e.stopPropagation) e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      dismissStartupError();
    }
  }

  function showStartupError(title, err) {
    if (disarmed) return;
    var el = document.getElementById('${BOOT_ERROR_ELEMENT_ID}');
    if (!el) {
      el = document.createElement('div');
      el.id = '${BOOT_ERROR_ELEMENT_ID}';
      el.style.cssText = 'position:fixed;bottom:24px;left:24px;right:24px;max-height:28vh;overflow:hidden;background:#7f1d1d;color:#fee2e2;padding:20px 24px;font-family:monospace;font-size:18px;z-index:999999;border:2px solid #ef4444;border-radius:12px;white-space:pre-wrap;line-height:1.45;box-shadow:0 10px 25px rgba(0,0,0,0.85);cursor:pointer;';
      el.onclick = dismissStartupError;
      (document.body || document.documentElement).appendChild(el);
    }
    var detail = err && err.stack ? err.stack : (err && err.message ? err.message : String(err || 'Unknown startup error'));
    el.textContent = '[Press BACK or OK to dismiss]  ' + title + '\\n' + detail;
    if (!keyListenerBound) {
      keyListenerBound = true;
      window.addEventListener('keydown', onBootErrorKeyDown, true);
    }
  }

  function onWindowError(e) {
    if (disarmed) return;
    showStartupError('Startup Error:', e.error || (e.message + ' at ' + e.filename + ':' + e.lineno + ':' + e.colno));
  }

  function onUnhandledRejection(e) {
    if (disarmed) return;
    showStartupError('Startup Promise Rejection:', e.reason);
  }

  window.addEventListener('error', onWindowError);
  window.addEventListener('unhandledrejection', onUnhandledRejection);

  window.__kadrDisarmBootTrap = function() {
    disarmed = true;
    window.removeEventListener('error', onWindowError);
    window.removeEventListener('unhandledrejection', onUnhandledRejection);
    dismissStartupError();
  };
})();`;
}

/**
 * Wraps the pre-boot error trap inline JS in a `<script>` tag for `index.html`.
 */
export function buildBootErrorTrapScriptTag(): string {
  return `\n    <script>\n${buildBootErrorTrapInlineJs()}\n    </script>`;
}
