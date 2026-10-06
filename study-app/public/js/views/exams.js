Views.exams = (function () {
  const el = () => document.getElementById('view-exams');

  function urgencyClass(days) {
    if (days <= 7) return 'urgent';
    if (days <= 30) return 'soon';
    return '';
  }

  function examRow(e) {
    const days = e.days_left;
    const past = days < 0;

    return `<div class="exam-row">
      <div class="exam-countdown ${past ? '' : urgencyClass(days)}">
        ${past ? Math.abs(days) : days}<small>${past ? 'days ago' : days === 1 ? 'day' : 'days'}</small>
      </div>
      <div class="exam-row-body">
        <strong>${esc(e.name)}</strong>
        <span>
          ${e.subject_name ? `${esc(e.subject_name)} &middot; ` : ''}${esc(e.exam_date)}
        </span>
      </div>
      <button class="icon-btn danger" data-del-exam="${e.id}" title="Delete">&#10005;</button>
    </div>`;
  }

  function syllabusHtml(topics) {
    if (!topics.length) {
      return `<div class="card empty">
        <div class="empty-icon">&#128203;</div>
        <h3>No syllabus topics yet</h3>
        <p>Break your subjects into topics so you can tick them off one by one.</p>
      </div>`;
    }

    const groups = new Map();
    for (const t of topics) {
      const key = t.subject_id || 0;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(t);
    }

    return [...groups.entries()]
      .map(([subjectId, list]) => {
        const done = list.filter((t) => t.done).length;
        const pct = Math.round((done / list.length) * 100);
        const first = list[0];

        return `<div class="syllabus-group">
          <div class="syllabus-head">
            ${first.subject_name ? `<i class="subject-dot" style="background:${esc(first.subject_color)}"></i>` : ''}
            <h3>${first.subject_name ? esc(first.subject_name) : 'General'}</h3>
            <span class="pct">${done}/${list.length} &middot; ${pct}%</span>
          </div>
          <div class="syllabus-bar">
            <span style="width:${pct}%;background:${first.subject_color || 'var(--primary)'}"></span>
          </div>
          ${list
            .map(
              (t) => `<div class="topic-row${t.done ? ' done' : ''}">
                <input type="checkbox" data-topic="${t.id}" ${t.done ? 'checked' : ''} style="width:18px;height:18px;accent-color:var(--primary);cursor:pointer">
                <span class="topic-text">${esc(t.topic)}</span>
                <button class="icon-btn danger" data-del-topic="${t.id}" title="Remove">&#10005;</button>
              </div>`
            )
            .join('')}
        </div>`;
      })
      .join('');
  }

  async function render() {
    const [{ exams }, { topics }] = await Promise.all([api.get('/exams'), api.get('/syllabus')]);

    const upcoming = exams.filter((e) => e.days_left >= 0);
    const past = exams.filter((e) => e.days_left < 0);

    const examList = upcoming.length
      ? `<div class="exam-list">${upcoming.map(examRow).join('')}</div>`
      : `<div class="card empty">
           <div class="empty-icon">&#128197;</div>
           <h3>No exams set</h3>
           <p>Add your exam dates to see a live countdown.</p>
         </div>`;

    el().innerHTML = `
      <div class="card" style="margin-bottom:1.4rem">
        <div class="card-title">Add an exam</div>
        <form id="examForm" style="display:flex;gap:.6rem;flex-wrap:wrap;align-items:flex-end">
          <div class="field grow" style="margin:0;min-width:190px">
            <label for="examName">Exam name</label>
            <input id="examName" type="text" placeholder="WAEC Mathematics" required>
          </div>
          <div class="field" style="margin:0;min-width:170px">
            <label for="examSubject">Subject (optional)</label>
            <select id="examSubject">${App.subjectOptions('')}</select>
          </div>
          <div class="field" style="margin:0">
            <label for="examDate">Date</label>
            <input id="examDate" type="date" required>
          </div>
          <button class="btn-primary" type="submit">Add exam</button>
        </form>
      </div>

      <div class="card" style="margin-bottom:1.4rem">
        <div class="card-title">Countdown <small>${upcoming.length} upcoming</small></div>
        ${examList}
        ${past.length ? `<h4 style="margin:1.4rem 0 .7rem;font-size:.9rem;font-weight:500;color:var(--ink-3)">Past exams</h4>
        <div class="exam-list">${past.slice(0, 5).map(examRow).join('')}</div>` : ''}
      </div>

      <div class="card" style="margin-bottom:1.4rem">
        <div class="card-title">Add a syllabus topic</div>
        <form id="topicForm" style="display:flex;gap:.6rem;flex-wrap:wrap;align-items:flex-end">
          <div class="field grow" style="margin:0;min-width:200px">
            <label for="topicText">Topic</label>
            <input id="topicText" type="text" placeholder="Photosynthesis" required>
          </div>
          <div class="field" style="margin:0;min-width:170px">
            <label for="topicSubject">Subject (optional)</label>
            <select id="topicSubject">${App.subjectOptions('')}</select>
          </div>
          <button class="btn-primary" type="submit">Add topic</button>
        </form>
      </div>

      <div class="card">
        <div class="card-title">Syllabus progress <small>${topics.length} topics</small></div>
        ${syllabusHtml(topics)}
      </div>
    `;
  }

  el().addEventListener('change', async (e) => {
    const box = e.target.closest('[data-topic]');
    if (!box) return;

    try {
      await api.patch(`/syllabus/${box.dataset.topic}`, { done: box.checked });
    } catch (err) {
      handleError(err);
    }
  });

  el().addEventListener('click', async (e) => {
    try {
      const delExam = e.target.closest('[data-del-exam]');
      if (delExam) {
        await api.del(`/exams/${delExam.dataset.delExam}`);
        toast('Exam deleted.', 'success');
        await render();
        return;
      }

      const delTopic = e.target.closest('[data-del-topic]');
      if (delTopic) {
        await api.del(`/syllabus/${delTopic.dataset.delTopic}`);
        await render();
      }
    } catch (err) {
      handleError(err);
    }
  });

  el().addEventListener('submit', async (e) => {
    const examForm = e.target.closest('#examForm');
    const topicForm = e.target.closest('#topicForm');

    try {
      if (examForm) {
        await api.post('/exams', {
          name: document.getElementById('examName').value.trim(),
          subjectId: document.getElementById('examSubject').value || null,
          examDate: document.getElementById('examDate').value,
        });
        toast('Exam added.', 'success');
        await render();
      }

      if (topicForm) {
        await api.post('/syllabus', {
          topic: document.getElementById('topicText').value.trim(),
          subjectId: document.getElementById('topicSubject').value || null,
        });
        await render();
      }
    } catch (err) {
      handleError(err);
    }
  });

  return { render };
})();