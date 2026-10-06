/* Shared app state, navigation and data loading. */
window.Views = window.Views || {};

window.App = (function () {
  const state = {
    user: null,
    subjects: [],
    current: 'dashboard',
  };

  const TITLES = {
    dashboard: ['Dashboard', "Here's how your study is going."],
    planner: ['Planner', 'Subjects, tasks and what to do next.'],
    focus: ['Focus Timer', 'Run a session and it logs itself.'],
    notes: ['Notes', 'Everything you have written down.'],
    cards: ['Flashcards', 'Test yourself on what you have read.'],
    exams: ['Exams', 'Countdowns and syllabus progress.'],
    quizzes: ['Quizzes', 'Test yourself and unlock the next subject.'],
    assistant: ['AI Assistant', 'Ask about your subjects, notes and tasks.'],
    settings: ['Settings', 'Your account and daily targets.'],
  };

  let els = {};

  function cacheEls() {
    els = {
      sidebar: document.getElementById('sidebar'),
      scrim: document.getElementById('sideScrim'),
      menuBtn: document.getElementById('menuBtn'),
      sideClose: document.getElementById('sideClose'),
      logoutBtn: document.getElementById('logoutBtn'),
      title: document.getElementById('viewTitle'),
      sub: document.getElementById('viewSub'),
      streak: document.getElementById('topbarStreak'),
      streakCount: document.getElementById('streakCount'),
      userName: document.getElementById('userName'),
      userEmail: document.getElementById('userEmail'),
      userAvatar: document.getElementById('userAvatar'),
      links: Array.from(document.querySelectorAll('.side-link')),
      themeToggle: document.getElementById('themeToggle'),
      themeLabel: document.getElementById('themeLabel'),
      themeIcon: document.getElementById('themeIcon'),
      upgradeLink: document.getElementById('upgradeLink'),
      adminLink: document.getElementById('adminLink'),
    };
  }

  /* ---------------- Theme ---------------- */

  const SUN =
    '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4"/>';
  const MOON = '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/>';

  function paintTheme() {
    if (!els.themeToggle) return;
    const choice = Theme.current();
    els.themeLabel.textContent = choice[0].toUpperCase() + choice.slice(1);
    els.themeIcon.innerHTML = Theme.effective() === 'dark' ? MOON : SUN;
  }

  /* ---------------- Premium gating ---------------- */

  /** Marks the premium sidebar links with a star and shows the upgrade entry. */
  function applyPlan(user) {
    const premium = Boolean(user.isPremium);

    els.links.forEach((link) => {
      if (!link.dataset.premium) return;
      const lock = document.getElementById(`lock${link.dataset.premium[0].toUpperCase()}${link.dataset.premium.slice(1)}`);
      if (lock) lock.hidden = premium;
      link.classList.toggle('locked', !premium);
    });

    if (els.upgradeLink) els.upgradeLink.hidden = premium;
    if (els.adminLink) els.adminLink.hidden = !user.isAdmin;
  }

  /** Re-reads the account so a just-approved payment unlocks the UI. */
  async function refreshUser() {
    const user = await api.me();
    if (!user) return null;

    state.user = user;
    els.userName.textContent = user.name;
    els.userEmail.textContent = user.email;
    els.userAvatar.textContent = initials(user.name);
    applyPlan(user);

    return user;
  }

  function setSidebar(open) {
    els.sidebar.classList.toggle('open', open);
    els.scrim.classList.toggle('show', open);
  }

  async function loadSubjects() {
    const { subjects } = await api.get('/subjects');
    state.subjects = subjects;
    return subjects;
  }

  function subjectById(id) {
    return state.subjects.find((s) => s.id === Number(id)) || null;
  }

  function subjectOptions(selectedId) {
    return (
      '<option value="">No subject</option>' +
      state.subjects
        .map(
          (s) =>
            `<option value="${s.id}"${Number(selectedId) === s.id ? ' selected' : ''}>${esc(s.name)}</option>`
        )
        .join('')
    );
  }

  /** Renders a view by delegating to whichever module registered it. */
  function go(name) {
    const view = Views[name];
    if (!view) return;

    state.current = name;

    els.links.forEach((l) => l.classList.toggle('active', l.dataset.view === name));
    document.querySelectorAll('.view').forEach((v) => {
      v.classList.toggle('active', v.id === `view-${name}`);
    });

    const [title, sub] = TITLES[name] || ['', ''];
    els.title.textContent = title;
    els.sub.textContent = sub;

    setSidebar(false);

    view.render().catch((err) => {
      if (err.status === 401) return;
      handleError(err);
    });
  }

  function updateStreak(streak) {
    els.streak.hidden = !streak;
    els.streakCount.textContent = streak;
  }

  /** Repaints the sidebar avatar after the user picks a new one. */
  function refreshAvatar() {
    paintAvatar(els.userAvatar, state.user.avatar, state.user.name);
  }

  async function start() {
    cacheEls();

    const user = await api.me();
    if (!user) {
      window.location.href = 'index.html';
      return;
    }

    // The library has to be in memory before the first paint, otherwise the
    // avatar cannot be resolved and everything falls back to initials.
    await loadAvatars();

    state.user = user;
    els.userName.textContent = user.name;
    els.userEmail.textContent = user.email;
    refreshAvatar();
    applyPlan(user);

    els.themeToggle.addEventListener('click', () => {
      Theme.cycle();
      paintTheme();
    });
    // The Settings view can change the theme too, so repaint on every change.
    document.addEventListener('theme:changed', paintTheme);
    paintTheme();

    els.menuBtn.addEventListener('click', () => setSidebar(true));
    els.sideClose.addEventListener('click', () => setSidebar(false));
    els.scrim.addEventListener('click', () => setSidebar(false));

    els.links.forEach((link) => {
      if (link.tagName !== 'BUTTON') return;
      link.addEventListener('click', () => go(link.dataset.view));
    });

    els.adminLink.addEventListener('click', openAdminGate);
    document.getElementById('adminGateCancel').addEventListener('click', closeAdminGate);
    document.getElementById('adminGateForm').addEventListener('submit', submitAdminGate);

    // Escape closes the prompt, matching every other dialog on the site.
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeAdminGate();
    });

    els.logoutBtn.addEventListener('click', () => {
      api.token = null;
      window.location.href = 'index.html';
    });

    await loadSubjects();
    // Warm the suggestion list so the first keystroke in the subject field is
    // instant rather than waiting on a fetch.
    SubjectSuggest.load();

    // The PWA shortcuts deep link with a hash such as /dashboard.html#focus.
    const deepLink = window.location.hash.replace('#', '');
    go(TITLES[deepLink] ? deepLink : 'dashboard');
  }

  /* ---------------- Admin code gate ---------------- */

  function openAdminGate() {
    const gate = document.getElementById('adminGate');
    const errBox = document.getElementById('adminGateError');
    errBox.hidden = true;
    document.getElementById('adminGateInput').value = '';
    gate.hidden = false;
    setTimeout(() => document.getElementById('adminGateInput').focus(), 40);
  }

  function closeAdminGate() {
    document.getElementById('adminGate').hidden = true;
  }

  async function submitAdminGate(event) {
    event.preventDefault();

    const input = document.getElementById('adminGateInput');
    const errBox = document.getElementById('adminGateError');
    const submit = document.getElementById('adminGateSubmit');

    errBox.hidden = true;
    submit.disabled = true;
    submit.textContent = 'Checking...';

    try {
      await api.post('/admin/access', { code: input.value });
      window.location.href = '/admin.html';
    } catch (err) {
      errBox.textContent = err.message;
      errBox.hidden = false;
      input.select();
      submit.disabled = false;
      submit.textContent = 'Open console';
    }
  }

  return {
    state,
    start,
    go,
    loadSubjects,
    subjectById,
    subjectOptions,
    updateStreak,
    refreshUser,
    refreshAvatar,
  };
})();