/* Registers the service worker so the app keeps working with no connection.
   There is no install prompt: StudyFlow is used as a normal website. */
window.PWA = (function () {
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  function register() {
    if (!('serviceWorker' in navigator)) return;

    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Offline support is a bonus. If registration fails the app still works.
      });
    });
  }

  return { register, isStandalone };
})();

window.PWA.register();