/**
 * CropOverlay — Content Script Injection
 *
 * This module exports a single function that, when executed as a content script
 * via chrome.scripting.executeScript, renders a full-viewport selection overlay
 * onto the current page and returns the selected rectangle (in CSS pixels with
 * devicePixelRatio scaling pre-applied for screenshot-space coordinates).
 *
 * ISOLATION: The overlay is a plain DOM element appended to document.body.
 * It is NOT inside the Snabby Shadow DOM panel (wsn-root) and will not
 * interfere with it.
 *
 * COORDINATE SYSTEM:
 *   - CSS pixel rect (x, y, width, height) is captured from mouse events.
 *   - devicePixelRatio is multiplied to convert to screenshot-pixel coordinates,
 *     since chrome.tabs.captureVisibleTab() produces images at devicePixelRatio.
 *
 * Return value:
 *   { x, y, width, height, cancelled } — all in screenshot pixel space.
 *   If cancelled, { cancelled: true } is returned.
 */

export type CropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
  cancelled?: boolean;
};

/**
 * Injects the crop selection overlay and returns a Promise that resolves
 * with the selected rectangle (in screenshot-pixel space) or cancellation.
 *
 * Must be called in the content script context (NOT in the service worker).
 */
export function showCropOverlay(): Promise<CropRect> {
  return new Promise<CropRect>((resolve) => {
    const dpr = window.devicePixelRatio || 1;

    // ── Container ──────────────────────────────────────────────────────────
    const overlay = document.createElement('div');
    overlay.id = 'wsn-crop-overlay';
    overlay.style.cssText = [
      'position:fixed',
      'inset:0',
      'z-index:2147483646',           // One below wsn-root (2147483647)
      'cursor:crosshair',
      'background:rgba(0,0,0,0.35)',
      'user-select:none',
    ].join(';');

    // ── Selection rectangle ─────────────────────────────────────────────────
    const selBox = document.createElement('div');
    selBox.style.cssText = [
      'position:fixed',
      'border:2px solid #ffffff',
      'background:rgba(255,255,255,0.08)',
      'box-shadow:0 0 0 1px rgba(0,0,0,0.5)',
      'display:none',
      'pointer-events:none',
    ].join(';');

    // ── Hint label ──────────────────────────────────────────────────────────
    const hint = document.createElement('div');
    hint.textContent = 'Drag to select region  •  Esc to cancel';
    hint.style.cssText = [
      'position:fixed',
      'bottom:32px',
      'left:50%',
      'transform:translateX(-50%)',
      'background:rgba(0,0,0,0.7)',
      'color:#fff',
      'font:13px/1.4 system-ui,sans-serif',
      'padding:6px 14px',
      'border-radius:6px',
      'pointer-events:none',
    ].join(';');

    overlay.appendChild(selBox);
    overlay.appendChild(hint);
    document.body.appendChild(overlay);

    let startX = 0, startY = 0;
    let dragging = false;

    const cleanup = () => {
      overlay.remove();
      document.removeEventListener('keydown', onKeyDown);
    };

    const cancel = () => {
      cleanup();
      resolve({ x: 0, y: 0, width: 0, height: 0, cancelled: true });
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancel();
    };

    overlay.addEventListener('mousedown', (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      selBox.style.display = 'block';
      selBox.style.left = `${startX}px`;
      selBox.style.top = `${startY}px`;
      selBox.style.width = '0px';
      selBox.style.height = '0px';
      hint.style.display = 'none';
    });

    overlay.addEventListener('mousemove', (e: MouseEvent) => {
      if (!dragging) return;
      const x = Math.min(e.clientX, startX);
      const y = Math.min(e.clientY, startY);
      const w = Math.abs(e.clientX - startX);
      const h = Math.abs(e.clientY - startY);
      selBox.style.left = `${x}px`;
      selBox.style.top = `${y}px`;
      selBox.style.width = `${w}px`;
      selBox.style.height = `${h}px`;
    });

    overlay.addEventListener('mouseup', (e: MouseEvent) => {
      if (!dragging) return;
      dragging = false;

      // CSS pixel rect
      const cssX = Math.min(e.clientX, startX);
      const cssY = Math.min(e.clientY, startY);
      const cssW = Math.abs(e.clientX - startX);
      const cssH = Math.abs(e.clientY - startY);

      // Minimum selection size — ignore tiny accidental clicks
      if (cssW < 10 || cssH < 10) {
        // Too small; reset and let user try again
        selBox.style.display = 'none';
        hint.style.display = '';
        return;
      }

      cleanup();

      // Convert CSS pixels → screenshot pixel space
      // captureVisibleTab() captures at devicePixelRatio resolution
      resolve({
        x: Math.round(cssX * dpr),
        y: Math.round(cssY * dpr),
        width: Math.round(cssW * dpr),
        height: Math.round(cssH * dpr),
      });
    });

    document.addEventListener('keydown', onKeyDown);
  });
}
