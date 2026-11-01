/**
 * Installable web app: a small service worker caches the shell and the last
 * map response, and the as-of banner turns amber when the network is gone
 * (section 12). No third-party cache library for one file.
 */
const SW_PATH = '/sw.js';

export function registerServiceWorker(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  if (import.meta.env.DEV) return;
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(SW_PATH).catch(() => {
      // Offline support is a bonus, never a reason to break the app.
    });
  });
}
