Views.notes = (function () {
  const el = () => document.getElementById('view-notes');

  let currentId = null;
  let saveTimer = null;

  function relativeTime(stamp) {
    const then = new Date(stamp.replace(' ', 'T'));
    const mins = Math.round((Date.now() - then) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
    return then.toLocaleDateString('en', { month: 'short', day: 'numeric' });
  }

  function listHtml(notes) {
    if (!notes.length) {
      return `<div class="empty">
        <div class="empty-icon">&#128221;</div>
        <h3>No notes yet</h3>
        <p>Write down what you learn while it is still fresh.</p>
      </div>`;
    }

    return notes
      .map(
        (n) => `<button class="note-item${n.id === currentId ? ' active' : ''}" data-note="${n.id}">
          <div class="note-item-title">${esc(n.title || 'Untitled note')}</div>
          <div class="note-item-meta">
            ${n.subject_name ? `<span class="subject-tag"><i class="subject-dot" style="background:${esc(n.subject_color)}"></i>${esc(n.subject_name)}</span> &middot; ` : ''}
            ${esc(relativeTime(n.updated_at))}
          </div>
        </button>`
      )
      .join('');
  }

  function editorHtml(note) {
    if (!note) {
      return `<div class="empty">
        <div class="empty-icon">&#9998;</div>
        <h3>Pick a note</h3>
        <p>Select a note on the left, or create a new one.</p>
      </div>`;
    }

    return `
      <input class="note-editor-title" id="noteTitle" placeholder="Untitled note" value="${esc(note.title)}">
      <div class="field" style="margin-bottom:1rem">
        <label for="noteSubject">Subject</label>
        <select id="noteSubject">${App.subjectOptions(note.subject_id)}</select>
      </div>
      <textarea class="note-editor-body" id="noteBody" placeholder="Start typing...">${esc(note.body)}</textarea>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:1rem;margin-top:1rem">
        <span class="save-state" id="saveState">Saved</span>
        <button class="btn-danger btn-sm" data-act="delete-note">Delete note</button>
      </div>
    `;
  }

  async function fetchAll() {
    const { notes } = await api.get('/notes');
    return notes;
  }

  async function render() {
    const notes = await fetchAll();

    if (currentId && !notes.some((n) => n.id === currentId)) {
      currentId = null;
    }

    const current = notes.find((n) => n.id === currentId) || null;

    el().innerHTML = `
      <div class="toolbar">
        <button class="btn-primary" data-act="new">+ New note</button>
        <span class="grow"></span>
        <span class="save-state">${notes.length} note${notes.length === 1 ? '' : 's'}</span>
      </div>

      <div class="notes-layout">
        <div class="card">
          <div class="card-title">Your notes</div>
          <div class="note-list">${listHtml(notes)}</div>
        </div>
        <div class="card">${editorHtml(current)}</div>
      </div>
    `;
  }

  async function save() {
    if (!currentId) return;

    const title = document.getElementById('noteTitle').value;
    const body = document.getElementById('noteBody').value;
    const subjectId = document.getElementById('noteSubject').value || null;

    const state = document.getElementById('saveState');
    state.textContent = 'Saving...';

    try {
      await api.patch(`/notes/${currentId}`, { title, body, subjectId });
      state.textContent = 'Saved';
    } catch (err) {
      state.textContent = 'Not saved';
      handleError(err);
    }
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    const state = document.getElementById('saveState');
    if (state) state.textContent = 'Unsaved changes';
    saveTimer = setTimeout(save, 900);
  }

  function bindEditor() {
    ['noteTitle', 'noteBody', 'noteSubject'].forEach((id) => {
      const node = document.getElementById(id);
      if (node) node.addEventListener('input', scheduleSave);
    });
  }

  async function refresh() {
    const notes = await fetchAll();
    const current = notes.find((n) => n.id === currentId) || null;

    el().querySelector('.note-list').innerHTML = listHtml(notes);
    el().querySelector('.notes-layout > .card:last-child').innerHTML = editorHtml(current);
    bindEditor();
  }

  el().addEventListener('click', async (e) => {
    try {
      const noteBtn = e.target.closest('[data-note]');
      if (noteBtn) {
        // Save the open note before switching so nothing is lost.
        if (currentId) await save();
        currentId = Number(noteBtn.dataset.note);
        await refresh();
        return;
      }

      const act = e.target.closest('[data-act]');
      if (!act) return;

      if (act.dataset.act === 'new') {
        if (currentId) await save();
        const { note } = await api.post('/notes', { title: '', body: '' });
        currentId = note.id;
        await refresh();
        const title = document.getElementById('noteTitle');
        if (title) title.focus();
      }

      if (act.dataset.act === 'delete-note') {
        if (!currentId) return;
        if (!confirm('Delete this note? This cannot be undone.')) return;
        await api.del(`/notes/${currentId}`);
        currentId = null;
        toast('Note deleted.', 'success');
        await refresh();
      }
    } catch (err) {
      handleError(err);
    }
  });

  async function renderView() {
    await render();
    bindEditor();
  }

  return { render: renderView };
})();