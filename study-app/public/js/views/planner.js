Views.planner = (function () {
  const el = () => document.getElementById('view-planner');

  let filter = 'all';
  let subjectFilter = 'all';

  const CHECK_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="m20 6-11 11-5-5"/></svg>';
  const EDIT_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
  const TRASH_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>';

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
  }

  function dueLabel(iso) {
    const today = todayIso();
    if (!iso) return '';
    const diff = Math.round((new Date(`${iso}T00:00:00`) - new Date(`${today}T00:00:00`)) / 86400000);
    if (diff === 0) return 'Due today';
    if (diff === 1) return 'Due tomorrow';
    if (diff < 0) return `${Math.abs(diff)} days overdue`;
    return `Due ${iso}`;
  }

  function taskRow(t) {
    const overdue = !t.completed && t.due_date && t.due_date < todayIso();
    const subject = t.subject_name
      ? `<span class="subject-tag"><i class="subject-dot" style="background:${esc(t.subject_color)}"></i>${esc(t.subject_name)}</span>`
      : '';

    return `<div class="task-item${t.completed ? ' done' : ''}" data-id="${t.id}">
      <button class="task-check${t.completed ? ' checked' : ''}" data-act="toggle" title="Mark as done">${CHECK_SVG}</button>
      <div class="task-main">
        <div class="task-title">${esc(t.title)}</div>
        ${t.notes ? `<div class="task-notes">${esc(t.notes)}</div>` : ''}
        <div class="task-meta">
          ${subject}
          <span class="chip chip-${esc(t.priority)}">${esc(t.priority)}</span>
          ${t.due_date ? `<span class="task-due${overdue ? ' overdue' : ''}">${esc(dueLabel(t.due_date))}</span>` : ''}
        </div>
      </div>
      <div class="task-actions">
        <button class="icon-btn" data-act="edit" title="Edit">${EDIT_SVG}</button>
        <button class="icon-btn danger" data-act="delete" title="Delete">${TRASH_SVG}</button>
      </div>
    </div>`;
  }

  function editorHtml(t) {
    const editing = Boolean(t);
    return `<div class="card" style="margin-bottom:1.4rem">
      <div class="card-title">${editing ? 'Edit task' : 'New task'}</div>
      <form id="taskForm" data-id="${editing ? t.id : ''}">
        <div class="field">
          <label for="t-title">What needs doing?</label>
          <input id="t-title" type="text" placeholder="Finish chapter 4 questions" value="${editing ? esc(t.title) : ''}" required>
        </div>
        <div class="field">
          <label for="t-notes">Notes (optional)</label>
          <input id="t-notes" type="text" placeholder="Pages 42 to 55" value="${editing ? esc(t.notes) : ''}">
        </div>
        <div class="field-row">
          <div class="field">
            <label for="t-subject">Subject</label>
            <select id="t-subject">${App.subjectOptions(editing ? t.subject_id : '')}</select>
          </div>
          <div class="field">
            <label for="t-due">Due date</label>
            <input id="t-due" type="date" value="${editing && t.due_date ? esc(t.due_date) : ''}">
          </div>
          <div class="field">
            <label for="t-priority">Priority</label>
            <select id="t-priority">
              ${['high', 'medium', 'low']
                .map(
                  (p) =>
                    `<option value="${p}"${editing && t.priority === p ? ' selected' : ''}>${p[0].toUpperCase() + p.slice(1)}</option>`
                )
                .join('')}
            </select>
          </div>
        </div>
        <div style="display:flex;gap:.6rem">
          <button class="btn-primary" type="submit">${editing ? 'Save changes' : 'Add task'}</button>
          ${editing ? '<button class="btn-ghost" type="button" data-act="cancel">Cancel</button>' : ''}
        </div>
      </form>
    </div>`;
  }

  function subjectPanelHtml() {
    return `<div class="card" style="margin-bottom:1.4rem">
      <div class="card-title">Subjects</div>
      ${App.state.subjects.length ? '' : '<p class="save-state" style="margin-bottom:1rem">Add a subject before creating tasks.</p>'}
      <div class="subject-grid">
        ${App.state.subjects
          .map(
            (s) => `<div class="subject-card">
              <div class="subject-card-top">
                <span class="subject-badge" style="background:${esc(s.color)}">${esc(initials(s.name))}</span>
                <span class="subject-card-name">${esc(s.name)}</span>
                <button class="icon-btn danger" data-del-subject="${s.id}" title="Delete subject" style="margin-left:auto">${TRASH_SVG}</button>
              </div>
              <div class="subject-stats">
                <div><strong>${s.open_tasks}</strong> open tasks</div>
                <div><strong>${s.note_count}</strong> notes</div>
                <div><strong>${s.focus_min}</strong> min</div>
              </div>
            </div>`
          )
          .join('')}
      </div>
      <form id="subjectForm" style="display:flex;gap:.6rem;margin-top:1.2rem;flex-wrap:wrap;align-items:flex-end">
        <div class="field grow suggest-host" style="margin:0">
          <label for="s-name">Add a subject</label>
          <input id="s-name" type="text" placeholder="Mathematics" required>
          <p class="hint">Optional. Type to search subjects from common international curricula, or write your own.</p>
        </div>
        <div class="field" style="margin:0">
          <label for="s-color">Colour</label>
          <input id="s-color" class="color-picker" type="color" value="#2f6df6">
        </div>
        <button class="btn-primary" type="submit">Add</button>
      </form>
    </div>`;
  }

  async function loadTasks() {
    const { tasks } = await api.get('/tasks');
    return tasks.filter((t) => {
      if (filter === 'open' && t.completed) return false;
      if (filter === 'done' && !t.completed) return false;
      if (subjectFilter !== 'all' && String(t.subject_id) !== subjectFilter) return false;
      return true;
    });
  }

  async function render() {
    const tasks = await loadTasks();

    const chips = [
      `<button class="subject-chip${subjectFilter === 'all' ? ' active' : ''}" data-subject="all">All subjects</button>`,
      ...App.state.subjects.map(
        (s) =>
          `<button class="subject-chip${subjectFilter === String(s.id) ? ' active' : ''}" data-subject="${s.id}">
             <i class="subject-dot" style="background:${esc(s.color)}"></i>${esc(s.name)}
           </button>`
      ),
    ].join('');

    const body = tasks.length
      ? `<div class="task-list">${tasks.map(taskRow).join('')}</div>`
      : `<div class="card empty">
           <div class="empty-icon">&#128203;</div>
           <h3>No tasks here</h3>
           <p>${filter === 'done' ? 'Nothing completed yet.' : 'Add your first task using the form above.'}</p>
         </div>`;

    el().innerHTML = `
      ${subjectPanelHtml()}
      ${editorHtml(null)}
      <div class="toolbar">
        <div class="segmented">
          ${['all', 'open', 'done']
            .map(
              (f) =>
                `<button data-filter="${f}" class="${filter === f ? 'active' : ''}">${f === 'all' ? 'All' : f === 'open' ? 'Open' : 'Done'}</button>`
            )
            .join('')}
        </div>
      </div>
      <div class="subject-chips">${chips}</div>
      ${body}
    `;

    // Suggestions are attached after the markup exists, and only once because
    // the input is rebuilt on every render.
    SubjectSuggest.attach(document.getElementById('s-name'), () =>
      App.state.subjects.map((s) => s.name)
    );
  }

  /* ---------------- events ---------------- */

  async function refresh() {
    await App.loadSubjects();
    await render();
  }

  async function handleTaskAction(e) {
    const row = e.target.closest('.task-item');
    if (!row) return;
    const id = Number(row.dataset.id);
    const act = e.target.closest('[data-act]');
    if (!act) return;

    if (act.dataset.act === 'toggle') {
      const { tasks } = await api.get('/tasks');
      const task = tasks.find((t) => t.id === id);
      if (!task) return;
      await api.patch(`/tasks/${id}`, { completed: !task.completed });
      await refresh();
    }

    if (act.dataset.act === 'delete') {
      if (!confirm('Delete this task?')) return;
      await api.del(`/tasks/${id}`);
      toast('Task deleted.', 'success');
      await refresh();
    }

    if (act.dataset.act === 'edit') {
      const { tasks } = await api.get('/tasks');
      const task = tasks.find((t) => t.id === id);
      if (!task) return;

      const form = document.getElementById('taskForm');
      const card = form.closest('.card');
      card.outerHTML = editorHtml(task);
      document.getElementById('t-title').focus();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  async function handleSubjectDelete(e) {
    const btn = e.target.closest('[data-del-subject]');
    if (!btn) return;

    const id = btn.dataset.delSubject;
    const subject = App.subjectById(id);
    if (!confirm(`Delete "${subject.name}"? Its tasks and notes stay but will lose the subject tag.`)) return;

    await api.del(`/subjects/${id}`);
    if (subjectFilter === String(id)) subjectFilter = 'all';
    toast('Subject deleted.', 'success');
    await refresh();
  }

  function bind() {
    el().addEventListener('click', async (e) => {
      try {
        const segBtn = e.target.closest('[data-filter]');
        if (segBtn) {
          filter = segBtn.dataset.filter;
          await render();
          return;
        }

        const chip = e.target.closest('[data-subject]');
        if (chip) {
          subjectFilter = chip.dataset.subject;
          await render();
          return;
        }

        const cancel = e.target.closest('[data-act="cancel"]');
        if (cancel) {
          await refresh();
          return;
        }

        await handleTaskAction(e);
        await handleSubjectDelete(e);
      } catch (err) {
        handleError(err);
      }
    });

    el().addEventListener('submit', async (e) => {
      e.preventDefault();

      const taskForm = e.target.closest('#taskForm');
      const subjectForm = e.target.closest('#subjectForm');

      try {
        if (taskForm) {
          const payload = {
            title: document.getElementById('t-title').value.trim(),
            notes: document.getElementById('t-notes').value.trim(),
            subjectId: document.getElementById('t-subject').value || null,
            dueDate: document.getElementById('t-due').value || null,
            priority: document.getElementById('t-priority').value,
          };

          if (taskForm.dataset.id) {
            await api.patch(`/tasks/${taskForm.dataset.id}`, payload);
            toast('Task updated.', 'success');
          } else {
            await api.post('/tasks', payload);
            toast('Task added.', 'success');
          }
          await refresh();
        }

        if (subjectForm) {
          await api.post('/subjects', {
            name: document.getElementById('s-name').value.trim(),
            color: document.getElementById('s-color').value,
          });
          toast('Subject added.', 'success');
          await refresh();
        }
      } catch (err) {
        handleError(err);
      }
    });
  }

  bind();

  return { render };
})();