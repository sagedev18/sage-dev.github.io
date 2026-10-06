(function () {
  const form = document.getElementById('authForm');
  const nameField = document.getElementById('nameField');
  const nameInput = document.getElementById('name');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const pwHint = document.getElementById('pwHint');
  const errorBox = document.getElementById('formError');
  const submitBtn = document.getElementById('submitBtn');
  const switchBtn = document.getElementById('switchBtn');
  const switchText = document.getElementById('switchText');
  const demoBtn = document.getElementById('demoBtn');
  const tabs = document.querySelectorAll('.auth-tab');

  let mode = 'login';

  if (api.token) {
    api.me().then((user) => {
      if (user) window.location.href = '/dashboard.html';
      else api.token = null;
    });
  }

  /* ---------------- theme ---------------- */

  const themeToggle = document.getElementById('themeToggle');
  const themeLabel = document.getElementById('themeLabel');
  const themeIcon = document.getElementById('themeIcon');

  const SUN = '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4"/>';
  const MOON = '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/>';

  function paintTheme() {
    const choice = Theme.current();
    themeLabel.textContent = choice[0].toUpperCase() + choice.slice(1);
    themeIcon.innerHTML = Theme.effective() === 'dark' ? MOON : SUN;
  }

  themeToggle.addEventListener('click', () => {
    Theme.cycle();
    paintTheme();
  });
  paintTheme();

  /* ---------------- forgot password ---------------- */

  const authBlock = document.getElementById('authBlock');
  const forgotBlock = document.getElementById('forgotBlock');
  const forgotForm = document.getElementById('forgotForm');
  const forgotEmail = document.getElementById('forgotEmail');
  const forgotError = document.getElementById('forgotError');
  const forgotOk = document.getElementById('forgotOk');

  document.getElementById('forgotBtn').addEventListener('click', openForgot);

  function openForgot() {
    authBlock.hidden = true;
    forgotBlock.hidden = false;
    forgotEmail.value = emailInput.value.trim();
    forgotEmail.focus();
  }

  // Settings sends people here with #forgot so they land straight on the
  // reset form rather than the log in form.
  if (window.location.hash === '#forgot') openForgot();

  document.getElementById('backToLogin').addEventListener('click', () => {
    forgotBlock.hidden = true;
    authBlock.hidden = false;
  });

  forgotForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    forgotError.hidden = true;
    forgotOk.hidden = true;

    const btn = document.getElementById('forgotSubmit');
    btn.disabled = true;
    btn.textContent = 'Sending...';

    try {
      const res = await api.post('/auth/forgot-password', { email: forgotEmail.value.trim() });
      const message = res.devToken
        ? `${res.message} (development only) Reset link: /reset.html?token=${res.devToken}`
        : res.message;

      forgotOk.textContent = message;
      forgotOk.hidden = false;
      forgotForm.reset();
    } catch (err) {
      forgotError.textContent = err.message;
      forgotError.hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Send reset link';
    }
  });

  /* ---------------- login / register ---------------- */

  function setMode(next) {
    mode = next;
    const registering = mode === 'register';

    tabs.forEach((t) => t.classList.toggle('active', t.dataset.mode === mode));
    nameField.hidden = !registering;
    pwHint.hidden = !registering;
    submitBtn.textContent = registering ? 'Create my account' : 'Log in';
    switchText.textContent = registering ? 'Already have an account?' : 'New here?';
    switchBtn.textContent = registering ? 'Log in instead' : 'Create an account';
    passwordInput.autocomplete = registering ? 'new-password' : 'current-password';
    showError('');
  }

  function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = !message;
  }

  function setBusy(busy) {
    submitBtn.disabled = busy;
    submitBtn.textContent = busy ? 'Please wait...' : mode === 'register' ? 'Create my account' : 'Log in';
  }

  tabs.forEach((tab) => tab.addEventListener('click', () => setMode(tab.dataset.mode)));
  switchBtn.addEventListener('click', () => setMode(mode === 'login' ? 'register' : 'login'));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    showError('');

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
      showError('Please fill in your email and password.');
      return;
    }
    if (mode === 'register' && password.length < 8) {
      showError('Your password needs to be at least 8 characters.');
      return;
    }

    setBusy(true);
    try {
      const payload = mode === 'register'
        ? { name: nameInput.value.trim(), email, password }
        : { email, password };

      const res = await api.post(mode === 'register' ? '/auth/register' : '/auth/login', payload);
      api.token = res.token;

      // Admins go straight to the admin area.
      window.location.href = res.user.isAdmin ? '/admin.html' : '/dashboard.html';
    } catch (err) {
      showError(err.message);
      setBusy(false);
    }
  });

  demoBtn.addEventListener('click', () => {
    setMode('login');
    emailInput.value = 'demo@studyflow.app';
    passwordInput.value = 'demopassword';
    submitBtn.click();
  });
})();