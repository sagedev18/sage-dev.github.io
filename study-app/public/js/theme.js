/* Theme handling. Light and dark are genuinely different designs, not just
   inverted colours, so each theme sets its own variables. */
(function () {
  const KEY = 'studyflow_theme';
  const ORDER = ['light', 'dark', 'auto'];

  function systemPrefersDark() {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function resolve(choice) {
    if (choice === 'auto') return systemPrefersDark() ? 'dark' : 'light';
    return choice;
  }

  function current() {
    let stored = localStorage.getItem(KEY);
    if (!ORDER.includes(stored)) stored = 'auto';
    return stored;
  }

  function effective() {
    return resolve(current());
  }

  function apply() {
    const theme = effective();
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.colorScheme = theme;

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#07070f' : '#ffffff');

    document.dispatchEvent(new CustomEvent('theme:changed', { detail: { choice: current(), theme } }));
  }

  function set(choice) {
    if (!ORDER.includes(choice)) return;
    localStorage.setItem(KEY, choice);
    apply();
  }

  function cycle() {
    const next = ORDER[(ORDER.indexOf(current()) + 1) % ORDER.length];
    set(next);
    return next;
  }

  // Apply immediately so the page never flashes the wrong theme.
  apply();

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (current() === 'auto') apply();
  });

  window.addEventListener('theme:changed', () => {});

  window.Theme = { set, cycle, current, effective, ORDER };
})();