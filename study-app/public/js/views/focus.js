Views.focus = (function () {
  const el = () => document.getElementById('view-focus');

  const PRESETS = [
    { focus: 25, brk: 5, label: '25 / 5' },
    { focus: 50, brk: 10, label: '50 / 10' },
    { focus: 15, brk: 3, label: '15 / 3' },
  ];

  // The timer keeps running while you move between views, so this state
  // lives here rather than inside render().
  const timer = {
    mode: 'focus',
    focusMin: 25,
    brkMin: 5,
    totalSeconds: 25 * 60,
    remaining: 25 * 60,
    running: false,
    subjectId: '',
    interval: null,
    startedAt: null,
  };

  function fmtClock(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function paint() {
    const display = document.getElementById('timerDisplay');
    const ring = document.getElementById('timerRing');
    if (!display || !ring) return;

    display.textContent = fmtClock(timer.remaining);

    const elapsedPct = (timer.totalSeconds - timer.remaining) / timer.totalSeconds;
    const deg = Math.round(elapsedPct * 360);
    const colour = timer.mode === 'focus' ? 'var(--primary)' : 'var(--green)';
    ring.style.background = `conic-gradient(${colour} ${deg}deg, var(--line) ${deg}deg)`;

    const modeEl = document.getElementById('timerMode');
    if (modeEl) modeEl.textContent = timer.mode === 'focus' ? 'Focus' : 'Break';
  }

  function tick() {
    timer.remaining -= 1;

    if (timer.remaining <= 0) {
      clearInterval(timer.interval);
      timer.interval = null;
      timer.running = false;
      finishSession();
      return;
    }

    paint();
  }

  function start() {
    if (timer.running || timer.remaining <= 0) return;

    if (!timer.startedAt) {
      timer.startedAt = new Date().toISOString();
    }

    timer.running = true;
    timer.interval = setInterval(tick, 1000);
    render();
  }

  function pause() {
    timer.running = false;
    if (timer.interval) clearInterval(timer.interval);
    timer.interval = null;
    render();
  }

  function reset() {
    pause();
    timer.remaining = timer.totalSeconds;
    timer.startedAt = null;
    render();
  }

  function setPreset(focusMin, brkMin) {
    pause();
    timer.mode = 'focus';
    timer.focusMin = focusMin;
    timer.brkMin = brkMin;
    timer.totalSeconds = focusMin * 60;
    timer.remaining = focusMin * 60;
    timer.startedAt = null;
    render();
  }

  function switchMode(mode) {
    pause();
    timer.mode = mode;
    const minutes = mode === 'focus' ? timer.focusMin : timer.brkMin;
    timer.totalSeconds = minutes * 60;
    timer.remaining = minutes * 60;
    timer.startedAt = null;
    render();
  }

  async function finishSession() {
    const wasFocus = timer.mode === 'focus';

    if (wasFocus && timer.focusMin > 0) {
      try {
        await api.post('/sessions', {
          subjectId: timer.subjectId || null,
          startedAt: timer.startedAt,
          durationMin: timer.focusMin,
          mode: 'focus',
          finished: 1,
        });
        toast(`Logged ${timer.focusMin} minutes of focus.`, 'success');
      } catch (err) {
        handleError(err);
      }
    }

    // Auto-switch to a break after a completed focus block.
    if (wasFocus) {
      timer.mode = 'break';
      timer.totalSeconds = timer.brkMin * 60;
      timer.remaining = timer.brkMin * 60;
    } else {
      timer.mode = 'focus';
      timer.totalSeconds = timer.focusMin * 60;
      timer.remaining = timer.focusMin * 60;
    }

    timer.startedAt = null;
    render();
  }

  function sessionRow(s) {
    const when = new Date(s.started_at.replace(' ', 'T'));
    return `<div class="session-row">
      <i class="subject-dot" style="background:${esc(s.subject_color || '#cbd2e1')}"></i>
      <span>${esc(s.subject_name || 'General')}</span>
      <span class="s-time">${when.toLocaleString('en', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
      <span class="s-dur">${s.duration_min} min</span>
    </div>`;
  }

  async function render() {
    const { sessions } = await api.get('/sessions?limit=12');

    const history = sessions.length
      ? `<div class="session-list">${sessions.map(sessionRow).join('')}</div>`
      : '<p class="save-state">No sessions logged yet.</p>';

    const startLabel = timer.running ? 'Pause' : timer.remaining === timer.totalSeconds ? 'Start' : 'Resume';

    el().innerHTML = `
      <div class="card timer-card" style="margin-bottom:1.4rem">
        <div class="preset-row">
          ${PRESETS.map(
            (p) =>
              `<button class="preset${timer.focusMin === p.focus ? ' active' : ''}" data-preset="${p.focus},${p.brk}" ${timer.running ? 'disabled' : ''}>${p.label}</button>`
          ).join('')}
        </div>

        <div class="timer-ring" id="timerRing">
          <div class="timer-ring-inner">
            <div class="timer-display" id="timerDisplay">${fmtClock(timer.remaining)}</div>
            <div class="timer-mode" id="timerMode">${timer.mode === 'focus' ? 'Focus' : 'Break'}</div>
          </div>
        </div>

        <div class="timer-controls">
          ${timer.running
            ? '<button class="btn-primary" data-act="pause">Pause</button>'
            : `<button class="btn-primary" data-act="start">${startLabel}</button>`}
          <button class="btn-ghost" data-act="reset">Reset</button>
          <button class="btn-soft" data-act="toggle-mode">Switch to ${timer.mode === 'focus' ? 'break' : 'focus'}</button>
        </div>

        <div class="field" style="max-width:320px;margin:0 auto;text-align:left">
          <label for="timerSubject">What are you working on?</label>
          <select id="timerSubject">
            ${App.subjectOptions(timer.subjectId)}
          </select>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Recent sessions <small>logged automatically when a block finishes</small></div>
        ${history}
      </div>
    `;

    paint();
  }

  el().addEventListener('click', (e) => {
    const preset = e.target.closest('[data-preset]');
    if (preset) {
      const [f, b] = preset.dataset.preset.split(',').map(Number);
      setPreset(f, b);
      return;
    }

    const act = e.target.closest('[data-act]');
    if (!act) return;

    if (act.dataset.act === 'start') start();
    if (act.dataset.act === 'pause') pause();
    if (act.dataset.act === 'reset') reset();
    if (act.dataset.act === 'toggle-mode') switchMode(timer.mode === 'focus' ? 'break' : 'focus');
  });

  el().addEventListener('change', (e) => {
    if (e.target.id === 'timerSubject') {
      timer.subjectId = e.target.value;
    }
  });

  /** Timer keeps ticking even when you leave this view. */
  window.addEventListener('beforeunload', () => {
    if (timer.interval) clearInterval(timer.interval);
  });

  return { render };
})();