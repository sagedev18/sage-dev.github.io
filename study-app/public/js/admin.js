(function () {
  const TITLES = {
    overview: 'Overview',
    users: 'Users',
    payments: 'Payments',
    settings: 'Store settings',
    codes: 'Access codes',
  };

  const state = {
    tab: 'overview',
    me: null,
    overview: null,
    users: [],
    userFilter: 'all',
    userQuery: '',
    payStatus: 'pending',
    codes: [],
    codesUnused: 0,
    codesLeft: 0,
    newCodes: [],
  };

  const naira = (n) => `₦${Number(n || 0).toLocaleString()}`;
  const when = (value) => (value ? esc(new Date(String(value).replace(' ', 'T')).toLocaleString()) : '<span class="muted">never</span>');
  const shortDate = (value) => esc(new Date(String(value).replace(' ', 'T')).toLocaleDateString());

  function panel(name) {
    return document.getElementById(`panel-${name}`);
  }

  /* ---------------- Overview ---------------- */

  function overviewHtml() {
    const d = state.overview;
    const t = d.totals;
    const maxRevenue = Math.max(...d.revenueByDay.map((r) => r.amount), 1);

    const cards = [
      ['Users', t.users, `${t.newToday} joined today`, '👥'],
      ['Premium', t.premium, `${d.conversion}% conversion`, '⭐'],
      ['Active today', t.activeToday, `${t.everLoggedIn} have ever logged in`, '🔥'],
      ['Revenue', naira(t.revenue), `${t.verified} verified payments`, '💰'],
      ['Pending reviews', t.pending, t.pending ? 'Waiting on you' : 'All clear', '⏳'],
    ];

    const bars = d.revenueByDay.length
      ? `<div class="bars">${d.revenueByDay
          .map(
            (r) => `<div class="bar-col" title="${shortDate(r.day)}: ${naira(r.amount)} from ${r.payments} payment(s)">
              <span class="bar" style="height:${Math.max(3, (r.amount / maxRevenue) * 100)}%"></span>
              <span class="bar-lbl">${esc(String(r.day).slice(8))}</span>
            </div>`
          )
          .join('')}</div>`
      : '<p class="muted">No verified payments yet.</p>';

    const subjects = d.topSubjects.length
      ? `<div class="tag-list">${d.topSubjects.map((s) => `<span class="tag">${esc(s.name)} <b>${s.users}</b></span>`).join('')}</div>`
      : '<p class="muted">No subjects created yet.</p>';

    const log = d.log.length
      ? `<div class="log-list">${d.log
          .map(
            (l) => `<div class="log-row">
              <code>${esc(l.action)}</code>
              <span>${esc(l.detail || '')}</span>
              <time>${when(l.created_at)}</time>
            </div>`
          )
          .join('')}</div>`
      : '<p class="muted">Nothing has been changed yet.</p>';

    return `
      <div class="stat-grid">
        ${cards
          .map(
            ([label, value, sub, icon]) => `<div class="stat-card">
              <div class="stat-card-top">
                <span class="stat-label">${label}</span>
                <span class="stat-icon" style="background:var(--primary-soft);color:var(--primary)">${icon}</span>
              </div>
              <div class="stat-value">${value}</div>
              <div class="stat-sub">${esc(sub)}</div>
            </div>`
          )
          .join('')}
      </div>

      <div class="card">
        <div class="card-title">Verified revenue, last 14 days</div>
        ${bars}
      </div>

      <div class="split-lists">
        <div class="card">
          <div class="card-title">Most studied subjects</div>
          ${subjects}
        </div>
        <div class="card">
          <div class="card-title">Activity log</div>
          ${log}
        </div>
      </div>

      <div class="card" style="margin-top:1.2rem">
        <div class="card-title">Newest accounts</div>
        <div class="table-wrap">
          <table class="data">
            <thead><tr><th>User</th><th>Joined</th><th>Last seen</th><th>Subjects</th><th>Focus</th><th>Plan</th></tr></thead>
            <tbody>
              ${d.recentUsers
                .map(
                  (u) => `<tr>
                    <td><div class="cell-main"><strong>${esc(u.name)}</strong><span>${esc(u.email)}</span></div></td>
                    <td class="num">${shortDate(u.created_at)}</td>
                    <td class="num">${when(u.last_seen_at)}</td>
                    <td class="num">${u.subjects}</td>
                    <td class="num">${u.focus_min}m</td>
                    <td>${
                      u.is_admin
                        ? '<span class="badge-verified admin-badge">Admin</span>'
                        : u.is_premium
                        ? '<span class="chip-premium">Premium</span>'
                        : '<span class="badge-pending admin-badge">Free</span>'
                    }</td>
                  </tr>`
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  /* ---------------- Users ---------------- */

  function usersHtml() {
    return `
      <div class="filter-bar">
        <input type="search" id="userSearch" placeholder="Search by name or email" value="${esc(state.userQuery)}">
        <div class="pill-tabs">
          ${['all', 'premium', 'admin']
            .map(
              (f) =>
                `<button data-user-filter="${f}"${state.userFilter === f ? ' class="active"' : ''}>${
                  f[0].toUpperCase() + f.slice(1)
                }</button>`
            )
            .join('')}
        </div>
      </div>

      <div class="table-wrap">
        <table class="data">
          <thead>
            <tr>
              <th>User</th><th>Joined</th><th>Last seen</th>
              <th>Subjects</th><th>Focus</th><th>Plan</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${
              state.users.length
                ? state.users
                    .map(
                      (u) => `<tr data-user-row="${u.id}">
                        <td><div class="cell-main"><strong>${esc(u.name)}</strong><span>${esc(u.email)}</span></div></td>
                        <td class="num">${shortDate(u.created_at)}</td>
                        <td class="num">${when(u.last_seen_at)}</td>
                        <td class="num">${u.subjects}</td>
                        <td class="num">${u.focus_min}m</td>
                        <td class="row-plan">
                          ${
                            u.is_admin
                              ? '<span class="badge-verified admin-badge">Admin</span>'
                              : u.is_premium
                              ? '<span class="chip-premium">Premium</span>'
                              : '<span class="badge-pending admin-badge">Free</span>'
                          }
                        </td>
                        <td>
                          <div class="row-actions">
                            <button class="btn-soft btn-sm" data-act="premium" data-id="${u.id}" data-grant="${u.is_premium ? 0 : 1}">
                              ${u.is_premium ? 'Remove premium' : 'Grant premium'}
                            </button>
                            <button class="btn-ghost btn-sm" data-act="admin" data-id="${u.id}" data-make="${u.is_admin ? 0 : 1}">
                              ${u.is_admin ? 'Remove admin' : 'Make admin'}
                            </button>
                            <button class="btn-ghost btn-sm" data-act="report" data-id="${u.id}">Email report</button>
                            <button class="btn-ghost btn-sm" data-act="delete" data-id="${u.id}">Delete</button>
                          </div>
                        </td>
                      </tr>`
                    )
                    .join('')
                : '<tr><td colspan="7" class="muted">No accounts match that search.</td></tr>'
            }
          </tbody>
        </table>
      </div>`;
  }

  async function loadUsers() {
    const params = new URLSearchParams({ filter: state.userFilter });
    if (state.userQuery) params.set('q', state.userQuery);
    const { users } = await api.get(`/admin/users?${params}`);
    state.users = users;
  }

  /* ---------------- Payments ---------------- */

  function paymentsHtml() {
    const list = state.payments || [];

    const cards = list.length
      ? list
          .map(
            (p) => `<div class="pay-card ${esc(p.status)}">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:1rem">
                <div>
                  <div class="pay-amount">${naira(p.amount)}</div>
                  <div class="pay-ref">${esc(p.reference)}</div>
                </div>
                <span class="badge-${esc(p.status)} admin-badge">${esc(p.status)}</span>
              </div>

              <div class="pay-meta">
                <span><strong style="color:var(--ink)">${esc(p.user_name)}</strong> &lt;${esc(p.user_email)}&gt;</span>
                <span>Submitted ${when(p.created_at)}</span>
                ${p.payer_name ? `<span>Payer: ${esc(p.payer_name)}</span>` : ''}
                ${p.bank ? `<span>Bank: ${esc(p.bank)}</span>` : ''}
                ${p.reviewed_at ? `<span>Reviewed ${when(p.reviewed_at)}</span>` : ''}
              </div>

              ${p.note ? `<div class="pay-note">${esc(p.note)}</div>` : ''}
              ${
                p.review_note
                  ? `<div class="pay-note" style="color:var(--red)">Reviewer said: ${esc(p.review_note)}</div>`
                  : ''
              }

              ${
                p.status === 'pending'
                  ? `<div class="pay-actions">
                       <button class="btn-primary btn-sm" data-act="verify" data-id="${p.id}">Verify</button>
                       <button class="btn-ghost btn-sm" data-act="reject" data-id="${p.id}">Reject</button>
                     </div>
                     ${p.is_premium ? '<p class="muted" style="margin-top:.6rem">This account is already premium.</p>' : ''}`
                  : ''
              }
            </div>`
          )
          .join('')
      : `<div class="card empty">
           <div class="empty-icon">✅</div>
           <h3>No ${esc(state.payStatus)} payments</h3>
           <p>Nothing to review here.</p>
         </div>`;

    return `
      <div class="filter-bar">
        <div class="pill-tabs">
          ${['pending', 'verified', 'rejected']
            .map(
              (s) =>
                `<button data-pay-status="${s}"${state.payStatus === s ? ' class="active"' : ''}>${
                  s[0].toUpperCase() + s.slice(1)
                }</button>`
            )
            .join('')}
        </div>
        <span class="grow"></span>
        <span class="muted">Verifying a payment turns premium on for that account immediately.</span>
      </div>

      <div class="pay-cards">${cards}</div>`;
  }

  async function loadPayments() {
    const { payments } = await api.get(`/admin/payments?status=${state.payStatus}`);
    state.payments = payments;
  }

  /* ---------------- Settings ---------------- */

  function settingsHtml() {
    const s = state.overview ? state.overview.settings : null;
    if (!s) return '';

    return `
      <div class="card" style="margin-bottom:1.2rem">
        <div class="card-title">Store settings</div>
        <p class="save-state" style="margin-bottom:1.2rem">These values are shown on the landing page and the upgrade page.</p>

        <form id="settingsForm" class="settings-form">
          <div class="field-row">
            <div class="field">
              <label for="price_charged">Amount charged (₦)</label>
              <input id="price_charged" type="number" min="1" value="${s.priceCharged}">
            </div>
            <div class="field">
              <label for="price_listed">Listed price (₦)</label>
              <input id="price_listed" type="number" min="1" value="${s.priceListed}">
            </div>
          </div>

          <div class="field-row">
            <div class="field">
              <label for="bank_name">Bank name</label>
              <input id="bank_name" type="text" value="${esc(s.bankName)}" placeholder="e.g. Access Bank">
            </div>
            <div class="field">
              <label for="account_name">Account name</label>
              <input id="account_name" type="text" value="${esc(s.accountName)}" placeholder="e.g. StudyFlow Nigeria">
            </div>
          </div>

          <div class="field-row">
            <div class="field">
              <label for="account_number">Account number</label>
              <input id="account_number" type="text" value="${esc(s.accountNumber)}" placeholder="0123456789">
            </div>
            <div class="field">
              <label for="support_email">Support email</label>
              <input id="support_email" type="email" value="${esc(s.supportEmail)}" placeholder="help@studyflow.app">
            </div>
          </div>

          <div class="field">
            <label for="payment_details">Extra payment instructions</label>
            <textarea id="payment_details" placeholder="Send only from a bank account in your own name. Allow up to 10 minutes for the transfer.">${esc(
              s.paymentDetails
            )}</textarea>
          </div>

          <label class="switch-row" style="margin-bottom:1.2rem">
            <input id="premium_enabled" type="checkbox" ${s.premiumEnabled ? 'checked' : ''}>
            <span>Premium is on sale</span>
          </label>

          <p class="form-error" id="settingsError" hidden></p>
          <button class="btn-primary" id="settingsSave" type="submit">Save settings</button>
        </form>
      </div>

      <div class="card">
        <div class="card-title">Environment</div>
        <p class="save-state" style="margin-bottom:1rem">
          Put these in your <code>.env</code> file, then restart the server.
        </p>
        <div class="env-list">
          <div class="env-row"><span>Email delivery</span><span>${
            state.overview.emailConfigured ? 'configured (RESEND_API_KEY)' : 'not configured — emails are logged to the console'
          }</span></div>
          <div class="env-row"><span>AI provider</span><span>${
            state.overview.aiConfigured ? 'configured (AI_PROVIDER + AI_API_KEY)' : 'not configured — the assistant answers from your own notes'
          }</span></div>
          <div class="env-row"><span>Admin on signup</span><span>ADMIN_EMAILS</span></div>
          <div class="env-row"><span>Public URL</span><span>APP_URL</span></div>
        </div>
      </div>`;
  }

  /* ---------------- Access codes ---------------- */

  function codeState(c) {
    if (c.used_by) return ['used', 'Used'];
    if (c.revoked) return ['revoked', 'Revoked'];
    if (c.expires_at && new Date(`${c.expires_at.replace(' ', 'T')}Z`) < new Date()) return ['expired', 'Expired'];
    return ['open', 'Unused'];
  }

  function codesHtml() {
    const rows = state.codes;

    const table = rows.length
      ? `<div class="card" style="padding:0;overflow-x:auto">
          <table class="code-table" style="margin:0">
            <thead>
              <tr><th>Code</th><th>Label</th><th>State</th><th>Used by</th><th>Created</th><th></th></tr>
            </thead>
            <tbody>
              ${rows
                .map((c) => {
                  const [cls, label] = codeState(c);
                  return `<tr class="${c.used_by ? 'spent' : ''}">
                    <td><code>${esc(c.code)}</code></td>
                    <td>${esc(c.label || '<span class="muted">none</span>')}</td>
                    <td><span class="code-state ${cls}">${label}</span></td>
                    <td>${c.used_by_email ? esc(c.used_by_email) : '<span class="muted">&mdash;</span>'}</td>
                    <td class="muted">${shortDate(c.created_at)}</td>
                    <td>${
                      cls === 'open'
                        ? `<button class="btn-soft btn-sm" data-act="revoke" data-id="${c.id}">Revoke</button>`
                        : ''
                    }</td>
                  </tr>`;
                })
                .join('')}
            </tbody>
          </table>
        </div>`
      : '<div class="card"><p class="muted">No codes issued yet. Create some above.</p></div>';

    // Freshly created codes are shown in full exactly once. After that only the
    // label survives, so a leaked screenshot cannot be replayed.
    const fresh = state.newCodes.length
      ? `<div class="card">
          <div class="card-title">New codes, shown once</div>
          <p class="muted" style="margin-bottom:.2rem">Copy them now. Once you leave this page they cannot be displayed again.</p>
          <div class="code-out">${state.newCodes.map((c) => `<code>${esc(c)}</code>`).join('')}</div>
        </div>`
      : '';

    return `
      ${fresh}

      <div class="card">
        <div class="card-title">Create codes</div>
        <p class="muted" style="margin-bottom:1rem">
          Anyone with a valid admin account also needs one of these to open the console.
          Each code works once. Unused codes left: <b>${state.codesUnused}</b>.
        </p>

        <form class="code-form-row" id="codeCreateForm">
          <label class="field">
            <span>How many</span>
            <input id="codeCount" type="number" min="1" max="25" value="5" style="width:5.5rem">
          </label>
          <label class="field">
            <span>Label</span>
            <input id="codeLabel" type="text" maxlength="80" placeholder="e.g. School workshop" style="width:13rem">
          </label>
          <label class="field">
            <span>Expires in</span>
            <select id="codeDays">
              <option value="0">Never</option>
              <option value="1">1 day</option>
              <option value="7">7 days</option>
              <option value="30">30 days</option>
            </select>
          </label>
          <button class="btn-primary" id="codeCreateBtn" type="submit">Create</button>
        </form>

        <p class="form-error" id="codeCreateError" hidden></p>
      </div>

      ${table}`;
  }

  async function loadCodes() {
    const data = await api.get('/admin/codes');
    state.codes = data.codes;
    state.codesUnused = data.unused;
  }

  /* ---------------- Code gate ---------------- */

  function showGate(codesLeft) {
    const gate = document.getElementById('codeGate');
    gate.hidden = false;
    const left = document.getElementById('codesLeft');
    if (left) left.textContent = codesLeft;
    const input = document.getElementById('codeInput');
    if (input) {
      input.value = '';
      setTimeout(() => input.focus(), 40);
    }
  }

  function hideGate() {
    document.getElementById('codeGate').hidden = true;
  }

  /** A locked console is its own state, not a generic error toast. */
  function adminError(err) {
    if (err.code === 'ADMIN_CODE_REQUIRED') {
      showGate(null);
      return;
    }
    handleError(err);
  }

  document.getElementById('codeForm').addEventListener('submit', async (event) => {
    event.preventDefault();

    const input = document.getElementById('codeInput');
    const errBox = document.getElementById('codeError');
    const submit = document.getElementById('codeSubmit');

    errBox.hidden = true;
    submit.disabled = true;
    submit.textContent = 'Checking...';

    try {
      await api.post('/admin/access', { code: input.value });
      hideGate();
      toast('Console unlocked.', 'success');
      await render();
    } catch (err) {
      errBox.textContent = err.message;
      errBox.hidden = false;
      input.select();
    } finally {
      submit.disabled = false;
      submit.textContent = 'Open console';
    }
  });

  document.getElementById('adminLock').addEventListener('click', async () => {
    await api.del('/admin/access');
    state.newCodes = [];
    showGate(null);
    toast('Console locked. Enter a code to continue.', 'info');
  });

  /* ---------------- Rendering ---------------- */

  async function render() {
    document.querySelectorAll('.admin-link').forEach((b) => {
      b.classList.toggle('active', b.dataset.tab === state.tab);
    });
    document.getElementById('adminTitle').textContent = TITLES[state.tab];
    ['overview', 'users', 'payments', 'settings', 'codes'].forEach((t) =>
      panel(t).classList.toggle('active', t === state.tab)
    );

    try {
      if (state.tab === 'overview' || state.tab === 'settings') {
        state.overview = await api.get('/admin/overview');
        paintEnvFlags(state.overview);
      }
      if (state.tab === 'overview') panel('overview').innerHTML = overviewHtml();
      if (state.tab === 'users') {
        await loadUsers();
        panel('users').innerHTML = usersHtml();
      }
      if (state.tab === 'payments') {
        await loadPayments();
        panel('payments').innerHTML = paymentsHtml();
      }
      if (state.tab === 'settings') panel('settings').innerHTML = settingsHtml();
      if (state.tab === 'codes') {
        await loadCodes();
        paintCodesBadge();
        panel('codes').innerHTML = codesHtml();
      }
    } catch (err) {
      adminError(err);
    }
  }

  function paintCodesBadge() {
    const badge = document.getElementById('codesBadge');
    badge.hidden = !state.codesUnused;
    badge.textContent = state.codesUnused;
  }

  function paintEnvFlags(o) {
    document.getElementById('envFlags').innerHTML = [
      o.emailConfigured ? '<span class="badge-verified admin-badge">Email on</span>' : '',
      o.aiConfigured ? '<span class="badge-verified admin-badge">AI on</span>' : '',
    ].join('');

    const badge = document.getElementById('pendingBadge');
    badge.hidden = !o.totals.pending;
    badge.textContent = o.totals.pending;
  }

  /* ---------------- Events ---------------- */

  document.querySelectorAll('.admin-link').forEach((b) =>
    b.addEventListener('click', () => {
      // New codes are shown once. Moving off the tab is what drops them.
      if (state.tab === 'codes' && b.dataset.tab !== 'codes') state.newCodes = [];
      state.tab = b.dataset.tab;
      render();
    })
  );

  document.addEventListener('click', async (event) => {
    const target = event.target;

    if (target.closest('[data-refresh]')) {
      await render();
      toast('Refreshed.', 'success');
      return;
    }

    const userFilter = target.closest('[data-user-filter]');
    if (userFilter) {
      state.userFilter = userFilter.dataset.userFilter;
      render();
      return;
    }

    const payStatus = target.closest('[data-pay-status]');
    if (payStatus) {
      state.payStatus = payStatus.dataset.payStatus;
      render();
      return;
    }

    const btn = target.closest('[data-act]');
    if (!btn) return;

    const id = Number(btn.dataset.id);
    btn.disabled = true;

    try {
      if (btn.dataset.act === 'premium') {
        await api.post(`/admin/users/${id}/premium`, { grant: btn.dataset.grant === '1' });
        toast(btn.dataset.grant === '1' ? 'Premium granted.' : 'Premium removed.', 'success');
      }

      if (btn.dataset.act === 'admin') {
        await api.post(`/admin/users/${id}/admin`, { make: btn.dataset.make === '1' });
        toast(btn.dataset.make === '1' ? 'Admin access granted.' : 'Admin access removed.', 'success');
      }

      if (btn.dataset.act === 'report') {
        const res = await api.post(`/admin/report/${id}`);
        toast(res.message, 'success');
      }

      if (btn.dataset.act === 'verify') {
        await api.post(`/admin/payments/${id}/decide`, { approve: true });
        toast('Payment verified. Premium is now active.', 'success');
      }

      if (btn.dataset.act === 'reject') {
        const note = window.prompt('Why is this payment being rejected? (optional)', '');
        if (note === null) return;
        await api.post(`/admin/payments/${id}/decide`, { approve: false, note });
        toast('Payment rejected.', 'success');
      }

      if (btn.dataset.act === 'revoke') {
        const ok = window.confirm('Revoke this code? Anyone holding it will not be able to use it.');
        if (!ok) return;
        await api.del(`/admin/codes/${id}`);
        toast('Code revoked.', 'success');
      }

      if (btn.dataset.act === 'delete') {
        const ok = window.confirm('Delete this account and everything in it? This cannot be undone.');
        if (!ok) return;
        await api.del(`/admin/users/${id}`);
        toast('Account deleted.', 'success');
      }

      await render();
    } catch (err) {
      adminError(err);
      await render();
    } finally {
      btn.disabled = false;
    }
  });

  document.addEventListener('input', (event) => {
    if (event.target.id !== 'userSearch') return;

    clearTimeout(event.target._timer);
    event.target._timer = setTimeout(() => {
      state.userQuery = event.target.value.trim();
      loadUsers()
        .then(() => {
          const tbody = document.querySelector('#panel-users tbody');
          if (tbody) panel('users').innerHTML = usersHtml();
          const box = document.getElementById('userSearch');
          if (box) {
            box.focus();
            box.setSelectionRange(box.value.length, box.value.length);
          }
        })
        .catch(handleError);
    }, 280);
  });

  document.addEventListener('submit', async (event) => {
    const createForm = event.target.closest('#codeCreateForm');
    if (createForm) {
      event.preventDefault();

      const errBox = document.getElementById('codeCreateError');
      const btn = document.getElementById('codeCreateBtn');
      errBox.hidden = true;
      btn.disabled = true;

      try {
        const res = await api.post('/admin/codes', {
          count: Number(document.getElementById('codeCount').value),
          label: document.getElementById('codeLabel').value.trim(),
          days: Number(document.getElementById('codeDays').value),
        });
        state.newCodes = res.codes;
        document.getElementById('codeLabel').value = '';
        toast(res.message, 'success');
        await render();
      } catch (err) {
        errBox.textContent = err.message;
        errBox.hidden = false;
        btn.disabled = false;
      }
      return;
    }

    const form = event.target.closest('#settingsForm');
    if (!form) return;
    event.preventDefault();

    const errBox = document.getElementById('settingsError');
    const save = document.getElementById('settingsSave');
    errBox.hidden = true;
    save.disabled = true;
    save.textContent = 'Saving...';

    try {
      await api.post('/admin/settings', {
        price_charged: Number(document.getElementById('price_charged').value),
        price_listed: Number(document.getElementById('price_listed').value),
        bank_name: document.getElementById('bank_name').value.trim(),
        account_name: document.getElementById('account_name').value.trim(),
        account_number: document.getElementById('account_number').value.trim(),
        support_email: document.getElementById('support_email').value.trim(),
        payment_details: document.getElementById('payment_details').value.trim(),
        premium_enabled: document.getElementById('premium_enabled').checked,
      });

      toast('Settings saved.', 'success');
      await render();
    } catch (err) {
      errBox.textContent = err.message;
      errBox.hidden = false;
      save.disabled = false;
      save.textContent = 'Save settings';
    }
  });

  document.getElementById('adminLogout').addEventListener('click', () => {
    api.token = null;
    window.location.href = '/index.html';
  });

  /* ---------------- Boot ---------------- */

  (async function start() {
    const user = await api.me();
    if (!user) {
      window.location.href = '/index.html';
      return;
    }
    if (!user.isAdmin) {
      toast('That area is for administrators.', 'error');
      window.location.href = '/dashboard.html';
      return;
    }

    state.me = user;
    document.getElementById('adminName').textContent = user.name;
    document.getElementById('adminEmail').textContent = user.email;
    document.getElementById('adminAvatar').textContent = initials(user.name);

    // An admin account is not enough on its own. Check the gate first so the
    // console never flashes its contents before the code screen appears.
    const access = await api.get('/admin/access');
    state.codesLeft = access.codesLeft;

    if (!access.unlocked) {
      showGate(access.codesLeft);
      return;
    }

    await render();
  })();
})();