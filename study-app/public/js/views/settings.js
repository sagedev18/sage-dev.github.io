Views.settings = (function () {
  const el = () => document.getElementById('view-settings');

  const GOALS = [60, 90, 120, 180, 240];

  /** Every avatar as a selectable tile. Nothing is uploaded, nothing is fetched. */
  function avatarPicker(user) {
    if (!avatarLibrary.length) {
      return '<p class="save-state">Loading the avatar library...</p>';
    }

    const chosen = user.avatar || '';
    const picked = avatarById(chosen);

    const preview = picked
      ? `<span class="avatar avatar-lg avatar-emoji" style="--av-from:${picked.from};--av-to:${picked.to}">${picked.emoji}</span>
         <div>
           <strong>${esc(picked.id[0].toUpperCase() + picked.id.slice(1))}</strong>
           <span class="save-state">This is what shows in the sidebar and on your account.</span>
         </div>`
      : `<span class="avatar avatar-lg" id="avatarPreview">${esc(initials(user.name))}</span>
         <div>
           <strong>No avatar chosen</strong>
           <span class="save-state">Your initials are used until you pick one.</span>
         </div>`;

    const tiles = avatarLibrary
      .map(
        (a) => `<button class="avatar-tile${a.id === chosen ? ' active' : ''}" data-avatar="${a.id}"
                  type="button" style="--av-from:${a.from};--av-to:${a.to}"
                  title="${esc(a.id)}" aria-pressed="${a.id === chosen}">
                  <span>${a.emoji}</span>
                </button>`
      )
      .join('');

    const clear = chosen
      ? `<button class="btn-soft btn-sm" data-avatar-clear type="button">Use my initials</button>`
      : '';

    return `
      <div class="avatar-preview">${preview}${clear}</div>
      <div class="avatar-grid">${tiles}</div>`;
  }

  async function render() {
    const user = App.state.user;
    await loadAvatars();

    const section = (title, sub, body) => `
      <section class="set-section">
        <div class="set-section-head">
          <h2>${esc(title)}</h2>
          ${sub ? `<p>${esc(sub)}</p>` : ''}
        </div>
        <div class="set-section-body">${body}</div>
      </section>`;

    el().innerHTML = `
      <div class="settings-wrap">

        ${section(
          'Your profile',
          'How you appear in the app.',
          `<form id="profileForm">
            <div class="set-row">
              <div class="field">
                <label for="p-name">Display name</label>
                <input id="p-name" type="text" value="${esc(user.name)}" required>
              </div>
              <div class="field">
                <label>Email</label>
                <input type="email" value="${esc(user.email)}" disabled>
                <small class="hint">Email cannot be changed yet.</small>
              </div>
            </div>

            <div class="field">
              <label>Avatar</label>
              <p class="save-state" style="margin:0 0 .8rem">Pick one. It appears in the sidebar and next to your account.</p>
              ${avatarPicker(user)}
            </div>

            <button class="btn-primary" type="submit">Save profile</button>
          </form>`
        )}

        ${section(
          'Study preferences',
          'How StudyFlow plans your day.',
          `<div class="card">
            <div class="card-title">Daily focus goal</div>
            <p class="save-state" style="margin-bottom:1rem">How many minutes of focus time do you want each day?</p>
            <div class="goal-presets" style="margin-bottom:1.1rem">
              ${GOALS.map(
                (g) =>
                  `<button class="preset${user.dailyGoalMin === g ? ' active' : ''}" data-goal="${g}" type="button">${
                    g < 60 ? g + 'm' : g / 60 + 'h'
                  }</button>`
              ).join('')}
            </div>
            <form id="goalForm" style="display:flex;gap:.6rem;align-items:flex-end;flex-wrap:wrap">
              <div class="field" style="margin:0;flex:1;min-width:160px">
                <label for="goalMinutes">Or set your own (minutes)</label>
                <input id="goalMinutes" type="number" min="10" max="1440" value="${user.dailyGoalMin}">
              </div>
              <button class="btn-primary" type="submit">Update</button>
            </form>
          </div>

          <div class="card">
            <div class="card-title">Appearance</div>
            <p class="save-state" style="margin-bottom:1rem">Light, dark, or follow your device.</p>
            <div class="goal-presets">
              ${Theme.ORDER.map(
                (t) =>
                  `<button class="preset${Theme.current() === t ? ' active' : ''}" data-theme-pick="${t}" type="button">${
                    t[0].toUpperCase() + t.slice(1)
                  }</button>`
              ).join('')}
            </div>
          </div>

          <div class="card">
            <div class="card-title">Getting started</div>
            <p class="save-state" style="margin-bottom:1rem">${
              user.setupSkipped
                ? 'The setup card is hidden. Bring it back whenever you want.'
                : 'The setup card is showing on your dashboard.'
            }</p>
            <button class="btn-ghost" data-act="toggle-setup" type="button">${
              user.setupSkipped ? 'Show the setup card again' : 'Hide the setup card'
            }</button>
          </div>`
        )}

        ${section(
          'Your plan',
          'What your account can do.',
          `<div class="card">
            ${
              user.isPremium
                ? `<p class="save-state" style="margin-bottom:1rem">
                     Your account is on <span class="chip-premium">&#9733; Premium</span>. Quizzes and the AI assistant are unlocked.
                   </p>
                   <a class="btn-soft" href="/premium.html">View payment details</a>`
                : `<p class="save-state" style="margin-bottom:1rem">
                     You are on the Free plan. Premium adds the AI assistant, generated quizzes, topic progression and data export.
                   </p>
                   <a class="btn-gold" href="/premium.html">Upgrade for &#8358;3,500</a>`
            }
            ${
              user.isAdmin
                ? '<button class="btn-ghost" data-act="admin" type="button" style="margin-top:.6rem">Open the admin console</button>'
                : ''
            }
          </div>`
        )}

        ${section(
          'Security',
          'Your password and this session.',
          `<div class="card">
            <div class="card-title">Change password</div>
            <form id="passwordForm">
              <div class="field">
                <label for="pw-current">Current password</label>
                <input id="pw-current" type="password" autocomplete="current-password" required>
              </div>
              <div class="field">
                <label for="pw-new">New password</label>
                <input id="pw-new" type="password" autocomplete="new-password" minlength="8" required>
                <small class="hint">At least 8 characters.</small>
              </div>
              <button class="btn-primary" type="submit">Change password</button>
            </form>
            <p class="auth-switch" style="text-align:left;margin-top:.9rem">
              <button class="link-btn" data-act="forgot" type="button">Forgot your password?</button>
            </p>
          </div>`
        )}

        ${section(
          'Your data',
          'Everything you add is stored in your account and is only visible to you.',
          `<div class="card">
            <div class="card-title">Download a backup</div>
            <p class="save-state" style="margin-bottom:1rem">A single JSON file with your subjects, tasks, notes, sessions, decks, exams and syllabus.</p>
            <button class="btn-ghost" data-act="export" type="button">Download my data (JSON)</button>
          </div>`
        )}

        ${section(
          'Session',
          'Logging out clears the login from this browser.',
          `<div class="card danger-zone">
            <div class="card-title">Log out</div>
            <button class="btn-danger" data-act="logout" type="button">Log out</button>
          </div>`
        )}

      </div>
    `;
  }

  async function exportData() {
    const [subjects, tasks, notes, sessions, decks, exams, syllabus] = await Promise.all([
      api.get('/subjects'),
      api.get('/tasks'),
      api.get('/notes'),
      api.get('/sessions'),
      api.get('/decks'),
      api.get('/exams'),
      api.get('/syllabus'),
    ]);

    const payload = {
      exportedAt: new Date().toISOString(),
      account: App.state.user,
      subjects: subjects.subjects,
      tasks: tasks.tasks,
      notes: notes.notes,
      sessions: sessions.sessions,
      decks: decks.decks,
      exams: exams.exams,
      syllabus: syllabus.topics,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `studyflow-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    toast('Backup downloaded.', 'success');
  }

  el().addEventListener('click', async (e) => {
    const themeBtn = e.target.closest('[data-theme-pick]');
    if (themeBtn) {
      Theme.set(themeBtn.dataset.themePick);
      await render();
      return;
    }

    // Choosing an avatar saves it straight away, so there is no second click
    // on a save button to forget.
    const tile = e.target.closest('[data-avatar]');
    if (tile) {
      try {
        const { user } = await api.patch('/auth/me', { avatar: tile.dataset.avatar });
        App.state.user = user;
        App.refreshAvatar();
        toast('Avatar updated.', 'success');
        await render();
      } catch (err) {
        handleError(err);
      }
      return;
    }

    if (e.target.closest('[data-avatar-clear]')) {
      try {
        const { user } = await api.patch('/auth/me', { avatar: '' });
        App.state.user = user;
        App.refreshAvatar();
        toast('Back to your initials.', 'success');
        await render();
      } catch (err) {
        handleError(err);
      }
      return;
    }

    const goalBtn = e.target.closest('[data-goal]');
    if (goalBtn) {
      try {
        const { user } = await api.patch('/auth/me', { dailyGoalMin: Number(goalBtn.dataset.goal) });
        App.state.user = user;
        toast('Daily goal updated.', 'success');
        await render();
      } catch (err) {
        handleError(err);
      }
      return;
    }

    const act = e.target.closest('[data-act]');
    if (!act) return;

    if (act.dataset.act === 'logout') {
      api.token = null;
      window.location.href = 'index.html';
    }

    if (act.dataset.act === 'forgot') {
      window.location.href = 'index.html#forgot';
    }

    if (act.dataset.act === 'admin') {
      document.getElementById('adminLink').click();
    }

    if (act.dataset.act === 'toggle-setup') {
      try {
        const { user } = await api.post('/auth/skip-setup', { skip: !App.state.user.setupSkipped });
        App.state.user = user;
        toast(user.setupSkipped ? 'Setup card hidden.' : 'Setup card is back.', 'success');
        await render();
      } catch (err) {
        handleError(err);
      }
    }

    if (act.dataset.act === 'export') {
      try {
        await exportData();
      } catch (err) {
        handleError(err);
      }
    }
  });

  el().addEventListener('submit', async (e) => {
    e.preventDefault();

    try {
      const profileForm = e.target.closest('#profileForm');
      if (profileForm) {
        const { user } = await api.patch('/auth/me', {
          name: document.getElementById('p-name').value.trim(),
        });
        App.state.user = user;
        App.refreshAvatar();
        toast('Profile updated.', 'success');
        await render();
      }

      const goalForm = e.target.closest('#goalForm');
      if (goalForm) {
        const minutes = Number(document.getElementById('goalMinutes').value);
        const { user } = await api.patch('/auth/me', { dailyGoalMin: minutes });
        App.state.user = user;
        toast('Daily goal updated.', 'success');
        await render();
      }

      const passwordForm = e.target.closest('#passwordForm');
      if (passwordForm) {
        await api.post('/auth/change-password', {
          currentPassword: document.getElementById('pw-current').value,
          newPassword: document.getElementById('pw-new').value,
        });
        passwordForm.reset();
        toast('Password changed.', 'success');
      }
    } catch (err) {
      handleError(err);
    }
  });

  return { render };
})();
