const TOKEN_KEY = 'studyflow_token';

const api = {
  get token() {
    return localStorage.getItem(TOKEN_KEY);
  },

  set token(value) {
    if (value) localStorage.setItem(TOKEN_KEY, value);
    else localStorage.removeItem(TOKEN_KEY);
  },

  async request(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (api.token) headers.Authorization = `Bearer ${api.token}`;

    let res;
    try {
      res = await fetch(`/api${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (err) {
      throw new Error('Cannot reach the server. Is it still running?');
    }

    let data = {};
    try {
      data = await res.json();
    } catch (err) {
      // A non-JSON response means something crashed on the server.
      if (!res.ok) throw new Error('Something went wrong on the server.');
    }

    if (!res.ok) {
      const error = new Error(data.error || 'Something went wrong.');
      error.status = res.status;
      // Premium-gated routes answer with a code so the UI can swap in a
      // paywall instead of a generic error toast.
      error.code = data.code;
      throw error;
    }

    return data;
  },

  get(path) {
    return api.request('GET', path);
  },
  post(path, body) {
    return api.request('POST', path, body || {});
  },
  patch(path, body) {
    return api.request('PATCH', path, body);
  },
  del(path) {
    return api.request('DELETE', path);
  },

  async me() {
    if (!api.token) return null;
    try {
      const { user } = await api.get('/auth/me');
      return user;
    } catch (err) {
      if (err.status === 401) api.token = null;
      return null;
    }
  },
};

/** Escapes text before putting it into innerHTML. */
function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toast(message, type = 'info') {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.className = `toast show ${type}`;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => {
    el.className = 'toast';
  }, 3200);
}

/** Shows an error, but sends the user to login when their token expired. */
function handleError(err) {
  if (err.status === 401 && api.token) {
    api.token = null;
    window.location.href = 'index.html';
    return;
  }
  toast(err.message || 'Something went wrong.', 'error');
}

const SUBJECT_COLORS = [
  '#2f6df6', '#ec4899', '#10b981', '#f59e0b',
  '#8b5cf6', '#ef4444', '#06b6d4', '#84cc16',
];

function initials(name) {
  return String(name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

/* ---------- Avatars ----------
   Picked from the built-in library so the app never depends on an upload or a
   remote image. A user with no avatar chosen falls back to their initials. */

let avatarLibrary = [];

/** Loads the library once. Safe to call again; it will not re-fetch. */
async function loadAvatars() {
  if (avatarLibrary.length) return avatarLibrary;
  try {
    const { avatars } = await api.get('/auth/avatars');
    avatarLibrary = avatars;
  } catch (err) {
    avatarLibrary = [];
  }
  return avatarLibrary;
}

function avatarById(id) {
  return avatarLibrary.find((a) => a.id === id) || null;
}

/** Paints an avatar into a .avatar element, or falls back to initials. */
function paintAvatar(el, avatarId, name) {
  if (!el) return;
  const found = avatarById(avatarId);
  el.classList.toggle('avatar-emoji', Boolean(found));
  el.style.removeProperty('--av-from');
  el.style.removeProperty('--av-to');

  if (found) {
    el.style.setProperty('--av-from', found.from);
    el.style.setProperty('--av-to', found.to);
    el.textContent = found.emoji;
  } else {
    el.textContent = initials(name);
  }
}

/* ---------- Subject suggestions ----------
   Suggestions only. Typing your own name is always allowed, because some
   subjects are local and no global list will ever contain them. */

const SubjectSuggest = {
  entries: [],
  groups: [],

  async load() {
    if (this.entries.length) return this.entries;
    try {
      const lib = await api.get('/subjects/library');
      this.entries = lib.entries || [];
      this.groups = lib.groups || [];
    } catch (err) {
      this.entries = [];
    }
    return this.entries;
  },

  /** Prefix matches first, then anything containing the text. */
  match(query, existing) {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const taken = new Set((existing || []).map((n) => n.toLowerCase()));
    const starts = [];
    const inside = [];

    for (const entry of this.entries) {
      if (taken.has(entry.name.toLowerCase())) continue;
      const at = entry.name.toLowerCase().indexOf(q);
      if (at === 0) starts.push(entry);
      else if (at > 0) inside.push(entry);
      if (starts.length >= 8) break;
    }

    return [...starts, ...inside].slice(0, 8);
  },

  /**
   * Attaches a suggestion panel to a text input. Returns nothing; the panel is
   * created once and reused for every keystroke.
   */
  attach(input, getExisting) {
    if (!input || input.dataset.suggestReady) return;
    input.dataset.suggestReady = '1';
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-expanded', 'false');

    const box = document.createElement('div');
    box.className = 'suggest-box';
    box.hidden = true;
    input.parentNode.appendChild(box);

    let active = -1;
    let matches = [];

    const close = () => {
      box.hidden = true;
      box.innerHTML = '';
      active = -1;
      input.setAttribute('aria-expanded', 'false');
    };

    const choose = (value) => {
      input.value = value;
      close();
      input.focus();
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };

    const paint = () => {
      if (!matches.length) return close();

      const typed = input.value.trim();
      const exact = this.entries.some((e) => e.name.toLowerCase() === typed.toLowerCase());

      const custom = exact
        ? ''
        : `<button class="suggest-row custom" type="button" data-value="${esc(typed)}">
             <span class="suggest-name">Use &ldquo;${esc(typed)}&rdquo;</span>
             <span class="suggest-region">your own</span>
           </button>`;

      box.innerHTML =
        custom +
        matches
          .map(
            (m, i) => `<button class="suggest-row${i === active ? ' active' : ''}" type="button"
                             data-value="${esc(m.name)}" data-i="${i}">
                         <span class="suggest-name">${esc(m.name)}</span>
                         <span class="suggest-region">${esc(m.region)}</span>
                       </button>`
          )
          .join('');

      box.hidden = false;
      input.setAttribute('aria-expanded', 'true');
    };

    input.addEventListener('input', () => {
      matches = this.match(input.value, getExisting ? getExisting() : []);
      active = -1;
      paint();
    });

    input.addEventListener('keydown', (e) => {
      if (box.hidden) return;
      const rows = box.querySelectorAll('.suggest-row');

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        active = e.key === 'ArrowDown'
          ? (active + 1) % rows.length
          : (active - 1 + rows.length) % rows.length;
        rows.forEach((r, i) => r.classList.toggle('active', i === active));
        return;
      }

      if (e.key === 'Enter' && active >= 0) {
        e.preventDefault();
        choose(rows[active].dataset.value);
        return;
      }

      if (e.key === 'Escape') close();
    });

    box.addEventListener('mousedown', (e) => {
      const row = e.target.closest('.suggest-row');
      if (!row) return;
      // mousedown, not click, so the input does not blur and rebuild first.
      e.preventDefault();
      choose(row.dataset.value);
    });

    input.addEventListener('blur', () => setTimeout(close, 120));
  },
};