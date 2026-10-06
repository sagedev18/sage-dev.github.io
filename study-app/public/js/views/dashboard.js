Views.dashboard = (function () {
  const el = () => document.getElementById('view-dashboard');

  /* Encouragement. Picked fresh on every render, so a refresh gives a
     different line rather than a fixed slogan. */
  const CHEERS = [
    'Small sessions count. Twenty-five minutes is a real answer.',
    'Revision is not about time at the desk. It is about what stuck.',
    'The subject you keep avoiding is the one costing you the most marks.',
    'Testing yourself is faster than rereading. Always.',
    'A past paper under timed conditions is worth three rereads.',
    'If you cannot explain it out loud, you have not learned it yet.',
    'Consistency beats intensity. One hour daily, not seven on Sunday.',
    'Your future self only needs you to start. The rest is momentum.',
    'Sleep is revision. The brain files overnight what you give it by day.',
    'Ask why you got a question wrong. The wrong answer is the useful one.',
    'Nobody remembers the student who crammed. They remember the one who kept going.',
    'Twenty focused minutes and a break is better than two distracted hours.',
    'Write the summary before the exam, not during it.',
    'Progress you cannot see is still progress. Trust the streak.',
    'One cleared topic today beats five planned for tomorrow.',
  ];

  const TIPS = [
    'Set a daily goal you can hit on a bad day.',
    'Name your subjects properly. It makes the statistics readable.',
    'Add past papers as exams so the countdown starts working for you.',
    'Write exam notes in your own words, not copied ones.',
    'Review flashcards before bed. Spacing beats cramming.',
    'Break the syllabus into topics, then tick them as you cover them.',
    'Run a quiz after a topic, not only before the exam.',
  ];

  const first = (name) => (name ? esc(name.split(' ')[0]) : 'there');

  function greeting() {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  }

  /** A different line each render, avoiding the one just shown. */
  function cheer(previous) {
    const pool = CHEERS.filter((c) => c !== previous);
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function tip() {
    return TIPS[Math.floor(Math.random() * TIPS.length)];
  }

  function fmtMin(min) {
    const m = Number(min) || 0;
    if (m < 60) return `${m}m`;
    const hrs = Math.floor(m / 60);
    const rest = m % 60;
    return rest ? `${hrs}h ${rest}m` : `${hrs}h`;
  }

  function weekLabel(isoDay) {
    return new Date(`${isoDay}T00:00:00`).toLocaleDateString('en', { weekday: 'short' });
  }

  /* ---------------- The empty state ---------------- */

  const STEPS = [
    ['planner', 'Add your first subject', 'Start with one subject you are revising right now.', '📚'],
    ['planner', 'Write down what is due', 'Add tasks with a due date so they sort themselves.', '📝'],
    ['exams', 'Set an exam date', 'You get a live countdown and a syllabus checklist.', '📅'],
    ['notes', 'Write your first note', 'Type up one topic properly. The AI assistant reads these.', '✍️'],
    ['focus', 'Run a 25 minute session', 'It logs itself, so your progress just builds up.', '⏱️'],
  ];

  /**
   * Shown when the account is empty. Every step is a button that goes straight
   * to the view which does it, and the whole card can be skipped.
   */
  function gettingStarted(s, name, line) {
    const steps = STEPS.map(
      ([view, title, text, icon], i) => `<li class="start-step">
        <span class="start-num">${icon || i + 1}</span>
        <div class="start-body">
          <strong>${esc(title)}</strong>
          <span>${esc(text)}</span>
        </div>
        <button class="btn-soft btn-sm" data-start="${view}">Start</button>
      </li>`
    ).join('');

    return `
      <div class="hero-strip">
        <div class="hero-text">
          <p class="hero-eyebrow">${greeting()}</p>
          <h2 class="hero-title">${first(name)}, here is where you start</h2>
          <p class="hero-cheer">${esc(line)}</p>
          <div class="hero-actions">
            <button class="btn-primary" data-start="planner">Start with a subject</button>
            <button class="btn-soft" data-skip-setup>Skip this for now</button>
          </div>
        </div>
        <div class="hero-art" aria-hidden="true">
          ${[0, 1, 2, 3]
            .map(
              (i) => `<span class="hero-chip" style="--i:${i}">${['📖', '✏️', '⏱️', '🧠'][i]}</span>`
            )
            .join('')}
        </div>
      </div>

      <div class="card welcome-card">
        <div class="welcome-head">
          <div>
            <h2>Five steps and StudyFlow starts working for you</h2>
            <p>Your account is empty, which is a fine place to be. Do them in any order, or skip to the end.</p>
          </div>
          <span class="welcome-mark">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.7l5.9-.8L12 3.5Z"/></svg>
          </span>
        </div>

        <ol class="start-steps">${steps}</ol>

        <div class="welcome-foot">
          <p class="save-state">Nothing here is required. You can always come back to it from Settings.</p>
          <button class="btn-soft btn-sm" data-skip-setup>Skip setup</button>
        </div>
      </div>

      ${lifetimeSection(s)}`;
  }

  /* ---------------- What you have done so far ---------------- */

  function tile(value, label, icon, accent) {
    return `<div class="lt-tile" style="--accent:${accent}">
      <span class="lt-icon">${icon}</span>
      <strong class="lt-value">${esc(String(value))}</strong>
      <span class="lt-label">${esc(label)}</span>
    </div>`;
  }

  /**
   * The bottom of the dashboard. Lifetime totals only go up, so this is the
   * honest answer to "am I actually getting anywhere".
   */
  function lifetimeSection(s) {
    const L = s.lifetime || {};
    const empty = !L.focusMin && !L.tasksDone && !L.notes && !L.sessions;

    const hero = `
      <div class="lt-hero">
        <div>
          <p class="lt-hero-label">Total focus time, all time</p>
          <p class="lt-hero-value">${fmtMin(L.focusMin || 0)}</p>
          <p class="lt-hero-sub">across ${L.sessions || 0} session${L.sessions === 1 ? '' : 's'} on ${L.activeDays || 0} active day${L.activeDays === 1 ? '' : 's'}</p>
        </div>
        <div class="lt-hero-side">
          <div class="lt-badge">
            <span>Current streak</span>
            <strong>${s.streak || 0}</strong>
            <small>day${s.streak === 1 ? '' : 's'}</small>
          </div>
          <div class="lt-badge">
            <span>Best streak</span>
            <strong>${L.bestStreak || 0}</strong>
            <small>day${L.bestStreak === 1 ? '' : 's'}</small>
          </div>
        </div>
      </div>`;

    const tiles = [
      tile(L.subjects || 0, 'Subjects', '📚', 'var(--primary)'),
      tile(L.tasksDone || 0, 'Tasks finished', '✅', 'var(--green)'),
      tile(L.notes || 0, 'Notes written', '📝', 'var(--violet)'),
      tile(L.cardsReviewed || 0, 'Flashcard reviews', '🃏', 'var(--amber)'),
      tile(L.syllabusDone || 0, 'Topics covered', '🎯', '#0891b2'),
      tile(L.exams || 0, 'Exams tracked', '📅', '#e9448b'),
      tile(L.quizzes || 0, 'Quizzes taken', '🧠', '#7c3aed'),
      tile(L.quizBest ? `${Math.round(L.quizBest)}%` : '—', 'Best quiz score', '🏅', '#d97706'),
    ].join('');

    const tipLine = `<p class="lt-tip"><span>Try this</span> ${esc(tip())}</p>`;

    const body = empty
      ? `<p class="lt-empty">Nothing to count yet. The moment you log a session or finish a task, this fills in and starts adding up.</p>`
      : `<div class="lt-grid">${tiles}</div>${tipLine}`;

    return `
      <section class="lt-section">
        <div class="lt-head">
          <div>
            <h2>What you have done so far</h2>
            <p>Every number below is a lifetime total, so it never resets. This is the part people forget to look at, and it is the part that proves the work is landing.</p>
          </div>
          <span class="lt-head-mark" aria-hidden="true">📈</span>
        </div>

        ${hero}
        ${body}
      </section>`;
  }

  /* ---------------- Main render ---------------- */

  async function render() {
    const s = await api.get('/stats');
    App.updateStreak(s.streak);

    // Picked once per render so every cheer on the page is the same line.
    const line = cheer(App.state.dashboardCheer);
    App.state.dashboardCheer = line;

    const name = (App.state.user.name || '').split(' ')[0];

    // Nothing in the account yet, so the charts would all read zero.
    if (s.isNewAccount && !s.setupSkipped) {
      el().innerHTML = gettingStarted(s, name, line);
      return;
    }

    const goalPct = s.dailyGoalMin > 0 ? Math.min(100, (s.todayFocusMin / s.dailyGoalMin) * 100) : 0;
    const goalDeg = Math.round((goalPct / 100) * 360);

    const examBanner = s.nextExam
      ? `<div class="exam-banner">
           <div class="exam-days">${s.nextExam.days_left}<small>${s.nextExam.days_left === 1 ? 'day' : 'days'}</small></div>
           <div class="exam-banner-body">
             <strong>${esc(s.nextExam.name)} is coming up</strong>
             <span>${s.nextExam.subject_name ? esc(s.nextExam.subject_name) + ' &middot; ' : ''}${esc(s.nextExam.exam_date)}</span>
           </div>
         </div>`
      : '';

    const peak = Math.max(60, ...s.dailySeries.map((d) => d.minutes));

    const bars = s.dailySeries
      .map((d) => {
        const pct = (d.minutes / peak) * 100;
        return `<div class="bar-col">
                  <span class="bar-value">${d.minutes ? d.minutes + 'm' : ''}</span>
                  <div class="bar" data-empty="${d.minutes === 0}" style="height:${Math.max(3, pct)}%"></div>
                  <span class="bar-label">${weekLabel(d.day)}</span>
                </div>`;
      })
      .join('');

    const maxSubject = Math.max(1, ...s.bySubject.map((x) => x.minutes));
    const subjectBars = s.bySubject.length
      ? s.bySubject
          .map((x) => {
            const pct = (x.minutes / maxSubject) * 100;
            return `<div class="subject-bar-row">
                      <span class="subject-bar-name"><i class="subject-dot" style="background:${esc(x.color)}"></i>${esc(x.name)}</span>
                      <span class="subject-bar-time">${fmtMin(x.minutes)}</span>
                      <div class="track"><span class="fill" style="width:${pct}%;background:${esc(x.color)}"></span></div>
                    </div>`;
          })
          .join('')
      : '<p class="save-state">No focus time logged yet. Start a session in the Focus Timer.</p>';

    const dueSoon = s.dueSoon.length
      ? `<div class="mini-list">${s.dueSoon
          .map((t) => {
            const overdue = t.due_date < new Date().toISOString().slice(0, 10);
            return `<div class="mini-task">
                      <i class="subject-dot" style="background:${esc(t.subject_color || '#cbd2e1')}"></i>
                      <span class="mini-title">${esc(t.title)}</span>
                      <span class="mini-due" ${overdue ? 'style="color:var(--red)"' : ''}>${overdue ? 'Overdue' : esc(t.due_date)}</span>
                    </div>`;
          })
          .join('')}</div>`
      : '<p class="save-state">Nothing due in the next three days.</p>';

    el().innerHTML = `
      ${examBanner}

      <div class="stat-grid">
        <div class="stat-card">
          <div class="stat-card-top">
            <span class="stat-label">Focused today</span>
            <span class="stat-icon" style="background:var(--primary-soft);color:var(--primary)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/></svg>
            </span>
          </div>
          <div class="stat-value">${fmtMin(s.todayFocusMin)}</div>
          <div class="stat-sub">Goal: ${fmtMin(s.dailyGoalMin)}</div>
        </div>

        <div class="stat-card">
          <div class="stat-card-top">
            <span class="stat-label">This week</span>
            <span class="stat-icon" style="background:rgba(16,185,129,.12);color:#047857">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l5-5 4 4 8-8"/><path d="M15 8h6v6"/></svg>
            </span>
          </div>
          <div class="stat-value">${fmtMin(s.weekFocusMin)}</div>
          <div class="stat-sub">Last 7 days</div>
        </div>

        <div class="stat-card">
          <div class="stat-card-top">
            <span class="stat-label">Tasks done</span>
            <span class="stat-icon" style="background:rgba(139,92,246,.12);color:var(--violet)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m20 6-11 11-5-5"/></svg>
            </span>
          </div>
          <div class="stat-value">${s.tasks.done}<small> / ${s.tasks.total}</small></div>
          <div class="stat-sub">${s.tasks.overdue} overdue</div>
        </div>

        <div class="stat-card">
          <div class="stat-card-top">
            <span class="stat-label">Flashcards</span>
            <span class="stat-icon" style="background:rgba(245,158,11,.14);color:#b45309">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="6" width="14" height="13" rx="2"/><path d="M6.5 3.5h13a2 2 0 0 1 2 2v11"/></svg>
            </span>
          </div>
          <div class="stat-value">${s.cards.known}<small> / ${s.cards.total}</small></div>
          <div class="stat-sub">Marked as known</div>
        </div>
      </div>

      <div class="cheer-strip">
        <p>${greeting()}, ${first(name)}. ${esc(line)}</p>
        <span class="cheer-tip">${esc(tip())}</span>
      </div>

      <div class="dash-grid">
        <div class="card">
          <div class="card-title">Focus this week <small>${fmtMin(s.weekFocusMin)} total</small></div>
          <div class="bar-chart">${bars}</div>
        </div>

        <div class="card">
          <div class="card-title">Daily goal</div>
          <div class="goal-ring-wrap">
            <div class="goal-ring" style="background:conic-gradient(${goalPct >= 100 ? 'var(--green)' : 'var(--primary)'} ${goalDeg}deg, var(--line) ${goalDeg}deg)">
              <div class="goal-ring-inner">
                <div>
                  <strong>${Math.round(goalPct)}%</strong>
                  <span>${fmtMin(s.todayFocusMin)}</span>
                </div>
              </div>
            </div>
            <div>
              <p style="color:var(--ink);font-size:.95rem;margin-bottom:.3rem">${fmtMin(Math.max(0, s.dailyGoalMin - s.todayFocusMin))} to go</p>
              <p class="save-state">Daily target is ${fmtMin(s.dailyGoalMin)}. Change it in Settings.</p>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-title">Time by subject</div>
          <div class="subject-bars">${subjectBars}</div>
        </div>

        <div class="card">
          <div class="card-title">Due soon <small>next 3 days</small></div>
          ${dueSoon}
        </div>

        <div class="card">
          <div class="card-title">Syllabus</div>
          <div class="goal-ring-wrap">
            <div class="goal-ring" style="background:conic-gradient(var(--violet) ${s.syllabus.total ? (s.syllabus.done / s.syllabus.total) * 360 : 0}deg, var(--line) 0deg)">
              <div class="goal-ring-inner">
                <div>
                  <strong>${s.syllabus.done}</strong>
                  <span>of ${s.syllabus.total}</span>
                </div>
              </div>
            </div>
            <div>
              <p style="color:var(--ink);font-size:.95rem;margin-bottom:.3rem">Topics covered</p>
              <p class="save-state">Tick topics off in the Exams view.</p>
            </div>
          </div>
        </div>
      </div>

      ${lifetimeSection(s)}
    `;
  }

  el().addEventListener('click', async (e) => {
    const start = e.target.closest('[data-start]');
    if (start) {
      App.go(start.dataset.start);
      return;
    }

    if (e.target.closest('[data-skip-setup]')) {
      try {
        const { user } = await api.post('/auth/skip-setup', { skip: true });
        App.state.user = user;
        toast('Setup skipped. You can bring it back from Settings.', 'info');
        await render();
      } catch (err) {
        handleError(err);
      }
    }
  });

  return { render };
})();
