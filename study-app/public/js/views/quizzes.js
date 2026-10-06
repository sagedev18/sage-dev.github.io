Views.quizzes = (function () {
  const el = () => document.getElementById('view-quizzes');

  const state = {
    mode: 'home', // home | builder | quiz | result
    subjects: [],
    activeSubject: null,
    questions: [],
    attempts: [],
    passMark: 70,
    active: null, // { questions, picks }
    result: null,
  };

  function options(subject) {
    return (
      '<option value="">Pick a subject</option>' +
      state.subjects
        .map((s) => `<option value="${s.id}"${subject === s.id ? ' selected' : ''}>${esc(s.name)}</option>`)
        .join('')
    );
  }

  function gate() {
    return `<div class="premium-lock-card">
      <div class="lock-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="4" y="10.5" width="16" height="11" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>
        </svg>
      </div>
      <h3>Quizzes are a premium feature</h3>
      <p>Pay once and get generated quizzes, scoring and topic progression that unlocks each subject as you pass it.</p>
      <div class="premium-inline-price">
        <span class="a">₦3,500</span>
        <span class="w">₦5,000</span>
      </div>
      <a class="btn-gold" href="/premium.html">Unlock Premium</a>
    </div>`;
  }

  function homeHtml() {
    const cards = state.subjects
      .map((s) => {
        const pct = s.questionCount ? Math.round((s.bestScore / 100) * 100) : 0;
        return `<div class="subject-card" style="${s.unlocked ? '' : 'opacity:.62'}">
          <div class="subject-card-top">
            <span class="subject-badge" style="background:${esc(s.color)}">${esc(initials(s.name))}</span>
            <span class="subject-card-name">${esc(s.name)}</span>
            ${s.unlocked ? '' : '<span style="margin-left:auto;font-size:1.1rem" title="Locked">🔒</span>'}
          </div>
          <div class="save-state" style="margin-bottom:.6rem">
            ${s.questionCount} question${s.questionCount === 1 ? '' : 's'} in your bank
            ${s.bestScore ? ` &middot; best ${s.bestScore}%` : ''}
          </div>
          <div class="deck-progress" style="margin-bottom:.8rem"><span style="width:${pct}%;background:${s.passed ? 'var(--green)' : 'var(--primary)'}"></span></div>
          ${
            s.unlocked
              ? `<button class="btn-primary btn-sm" data-quiz="${s.id}">${s.questionCount >= 3 ? 'Take quiz' : 'Add questions'}</button>`
              : `<span class="save-state">Pass ${esc(state.subjects[state.subjects.indexOf(s) - 1] ? state.subjects[state.subjects.indexOf(s) - 1].name : 'the previous subject')} first</span>`
          }
        </div>`;
      })
      .join('');

    const history = state.attempts.length
      ? `<div class="exam-list">${state.attempts
          .map(
            (a) => `<div class="session-row">
              <i class="subject-dot" style="background:${esc(a.subject_color || '#888')}"></i>
              <span>${esc(a.subject_name || 'Quiz')}</span>
              <span class="s-time">${esc(new Date(a.created_at.replace(' ', 'T')).toLocaleDateString())}</span>
              <span class="s-dur" style="color:${a.score_pct >= state.passMark ? 'var(--green)' : 'var(--red)'}">
                ${a.correct}/${a.total} &middot; ${a.score_pct}%
              </span>
            </div>`
          )
          .join('')}</div>`
      : '<p class="save-state">No quiz attempts yet.</p>';

    return `
      <div class="toolbar">
        <div class="pill-tabs">
          <button class="active" data-tab="subjects">Subjects</button>
          <button data-tab="history">History</button>
        </div>
        <span class="grow"></span>
        <span class="save-state">Pass mark is ${state.passMark}%</span>
      </div>

      ${state.subjects.length
        ? `<div class="subject-grid">${cards}</div>`
        : `<div class="card empty">
             <div class="empty-icon">📚</div>
             <h3>No subjects yet</h3>
             <p>Add a subject in the Planner first, then come back to build a quiz for it.</p>
             <a class="btn-primary" href="#" data-go="planner">Go to Planner</a>
           </div>`}

      <div class="card" style="margin-top:1.4rem">
        <div class="card-title">Recent attempts</div>
        ${history}
      </div>`;
  }

  function builderHtml() {
    const s = state.activeSubject;
    const list = state.questions.length
      ? `<div class="exam-list">${state.questions
          .map(
            (q, i) => `<div class="topic-row">
              <span style="font-weight:600;color:var(--ink-3);font-size:.8rem">${i + 1}</span>
              <span class="topic-text">${esc(q.question)}</span>
              <button class="icon-btn danger" data-del-q="${q.id}" title="Delete">&times;</button>
            </div>`
          )
          .join('')}</div>`
      : '<p class="save-state">No questions yet. Add at least three to build a quiz.</p>';

    return `
      <div class="toolbar">
        <button class="btn-ghost" data-back>&larr; All subjects</button>
        <span class="grow"></span>
        <button class="btn-primary" data-start ${state.questions.length >= 3 ? '' : 'disabled'}>
          Build a quiz from these
        </button>
      </div>

      <div class="card" style="margin-bottom:1.2rem">
        <div class="card-title">
          Add a question
          <small>${esc(s ? s.name : '')} &middot; ${state.questions.length} in bank</small>
        </div>

        <form id="questionForm">
          <div class="field">
            <label for="q-text">Question</label>
            <textarea id="q-text" placeholder="Which organelle is the powerhouse of the cell?" required></textarea>
          </div>
          <div class="field">
            <label for="q-correct">Correct answer</label>
            <input id="q-correct" type="text" required placeholder="The mitochondrion">
          </div>
          <div class="field-row">
            <div class="field">
              <label for="q-wa">Wrong option A</label>
              <input id="q-wa" type="text" placeholder="The nucleus">
            </div>
            <div class="field">
              <label for="q-wb">Wrong option B</label>
              <input id="q-wb" type="text" placeholder="The ribosome">
            </div>
            <div class="field">
              <label for="q-wc">Wrong option C</label>
              <input id="q-wc" type="text" placeholder="The vacuole">
            </div>
          </div>
          <div class="field">
            <label for="q-why">Explanation (optional)</label>
            <input id="q-why" type="text" placeholder="Shown after you answer.">
          </div>
          <p class="form-error" id="qError" hidden></p>
          <button class="btn-primary" type="submit">Add question</button>
        </form>
      </div>

      <div class="card">
        <div class="card-title">Your question bank</div>
        ${list}
      </div>`;
  }

  function quizHtml() {
    const { questions, picks } = state.active;
    const answered = Object.keys(picks).length;

    return `
      <div class="quiz-stage">
        <div class="quiz-progress">
          <span>${answered} of ${questions.length} answered</span>
        </div>

        ${questions
          .map(
            (q, i) => `<div class="q-card">
              <div class="q-num">Question ${i + 1}</div>
              <div class="q-text">${esc(q.question)}</div>
              <div class="q-options">
                ${q.options
                  .map(
                    (opt, oi) => `<button class="q-option${picks[q.id] === opt ? ' selected' : ''}" data-pick="${q.id}" data-opt="${esc(opt)}">
                      <span class="q-letter">${'ABCD'[oi]}</span>
                      <span>${esc(opt)}</span>
                    </button>`
                  )
                  .join('')}
              </div>
            </div>`
          )
          .join('')}

        <div style="display:flex;gap:.6rem;justify-content:center;margin-top:1.4rem">
          <button class="btn-ghost" data-quit>Cancel</button>
          <button class="btn-primary" data-submit-quiz ${answered === questions.length ? '' : 'disabled'}>
            Submit answers
          </button>
        </div>
        ${answered < questions.length ? `<p class="save-state" style="text-align:center;margin-top:.6rem">Answer every question to submit.</p>` : ''}
      </div>`;
  }

  function resultHtml() {
    const r = state.result;
    const nextSubject = state.subjects.find((s) => s.unlocked && s.questionCount === 0);

    return `<div class="card quiz-stage">
      <div class="card-title" style="justify-content:center">
        ${r.passed ? 'Passed' : 'Not quite yet'} &middot; ${r.scorePct}%
      </div>

      <div class="quiz-score">
        <div><strong>${r.correct}/${r.total}</strong><span>Correct answers</span></div>
        <div><strong>${r.scorePct}%</strong><span>Pass mark ${r.passMark}%</span></div>
      </div>

      ${
        r.passed
          ? `<p class="save-state" style="margin-bottom:1.3rem">
               Nice work. Your syllabus topics for this subject have been ticked off${
                 nextSubject ? `, and <strong>${esc(nextSubject.name)}</strong> is now open` : ''
               }.
             </p>`
          : `<p class="save-state" style="margin-bottom:1.3rem">
               You need ${r.passMark}% to move on. Review your notes on the ones you missed and try again.
             </p>`
      }

      <div style="text-align:left;margin-bottom:1.4rem">
        ${r.results
          .map(
            (d, i) => `<div class="q-result ${d.correct ? 'right' : 'wrong'}">
              <strong>Q${i + 1} &middot; ${d.correct ? 'Correct' : 'Wrong'}</strong><br>
              ${d.correct ? '' : `You picked: ${esc(d.picked || 'nothing')}<br>`}
              Answer: ${esc(d.correctAnswer)}
              ${d.explanation ? `<br><span style="opacity:.85">${esc(d.explanation)}</span>` : ''}
            </div>`
          )
          .join('')}
      </div>

      <div style="display:flex;gap:.6rem;justify-content:center;flex-wrap:wrap">
        <button class="btn-primary" data-retry>Try again</button>
        <button class="btn-ghost" data-back>All subjects</button>
      </div>
    </div>`;
  }

  async function loadSubjects() {
    const { subjects, passMark } = await api.get('/quizzes/subjects');
    state.subjects = subjects;
    state.passMark = passMark;
  }

  async function loadHistory() {
    const { attempts } = await api.get('/quizzes/history');
    state.attempts = attempts;
  }

  async function openSubject(subjectId) {
    state.activeSubject = state.subjects.find((s) => s.id === subjectId) || null;
    const data = await api.get(`/quizzes/questions?subjectId=${subjectId}`);
    state.questions = data.questions;
    state.attempts = data.attempts;
    state.mode = 'builder';
  }

  async function render() {
    const user = App.state.user;

    if (!user.isPremium) {
      el().innerHTML = gate();
      return;
    }

    if (state.mode === 'builder') return renderBuilder();
    if (state.mode === 'quiz') {
      el().innerHTML = quizHtml();
      return;
    }
    if (state.mode === 'result') {
      el().innerHTML = resultHtml();
      return;
    }

    await loadSubjects();
    await loadHistory();
    el().innerHTML = homeHtml();
  }

  async function renderBuilder() {
    el().innerHTML = builderHtml();
  }

  el().addEventListener('click', async (e) => {
    try {
      if (e.target.closest('[data-go="planner"]')) {
        App.go('planner');
        return;
      }

      const tab = e.target.closest('[data-tab]');
      if (tab) {
        el().querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', b === tab));
        const home = el().querySelector('.subject-grid');
        const historyCard = el().querySelector('.card:last-of-type');
        if (tab.dataset.tab === 'history') {
          if (home) home.style.display = 'none';
          historyCard.style.display = '';
        } else {
          if (home) home.style.display = '';
          historyCard.style.display = 'none';
        }
        return;
      }

      if (e.target.closest('[data-back]')) {
        state.mode = 'home';
        state.activeSubject = null;
        await render();
        return;
      }

      const quizBtn = e.target.closest('[data-quiz]');
      if (quizBtn) {
        const id = Number(quizBtn.dataset.quiz);
        const subject = state.subjects.find((s) => s.id === id);

        if (subject && subject.questionCount >= 3) {
          const res = await api.post('/quizzes/start', { subjectId: id });
          state.activeSubject = subject;
          state.active = { questions: res.questions, picks: {} };
          state.mode = 'quiz';
        } else {
          await openSubject(id);
        }
        await render();
        return;
      }

      const delQ = e.target.closest('[data-del-q]');
      if (delQ) {
        await api.del(`/quizzes/questions/${delQ.dataset.delQ}`);
        await openSubject(state.activeSubject.id);
        await renderBuilder();
        return;
      }

      const pick = e.target.closest('[data-pick]');
      if (pick) {
        const id = pick.dataset.pick;
        state.active.picks[id] = state.active.picks[id] === pick.dataset.opt ? '' : pick.dataset.opt;
        el().innerHTML = quizHtml();
        return;
      }

      if (e.target.closest('[data-submit-quiz]')) {
        const answers = Object.entries(state.active.picks).map(([questionId, picked]) => ({
          questionId: Number(questionId),
          picked,
        }));

        const res = await api.post('/quizzes/submit', {
          answers,
          subjectId: state.activeSubject.id,
        });
        state.result = res;
        state.subjects = res.subjects;
        state.mode = 'result';
        await render();
        return;
      }

      if (e.target.closest('[data-quit]')) {
        state.mode = 'home';
        state.active = null;
        await render();
        return;
      }

      if (e.target.closest('[data-retry]')) {
        const res = await api.post('/quizzes/start', { subjectId: state.activeSubject.id });
        state.active = { questions: res.questions, picks: {} };
        state.mode = 'quiz';
        await render();
      }
    } catch (err) {
      handleError(err);
    }
  });

  el().addEventListener('submit', async (e) => {
    if (!e.target.closest('#questionForm')) return;
    e.preventDefault();

    const errBox = document.getElementById('qError');
    errBox.hidden = true;

    try {
      await api.post('/quizzes/questions', {
        subjectId: state.activeSubject.id,
        question: document.getElementById('q-text').value.trim(),
        correctAnswer: document.getElementById('q-correct').value.trim(),
        wrongA: document.getElementById('q-wa').value.trim(),
        wrongB: document.getElementById('q-wb').value.trim(),
        wrongC: document.getElementById('q-wc').value.trim(),
        explanation: document.getElementById('q-why').value.trim(),
      });

      await openSubject(state.activeSubject.id);
      await loadSubjects();
      await renderBuilder();
    } catch (err) {
      errBox.textContent = err.message;
      errBox.hidden = false;
    }
  });

  return { render };
})();