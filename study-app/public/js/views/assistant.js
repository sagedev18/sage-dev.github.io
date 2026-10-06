Views.assistant = (function () {
  const el = () => document.getElementById('view-assistant');

  let threads = [];
  let status = { configured: false, provider: null };
  let sending = false;

  function gate() {
    return `<div class="premium-lock-card">
      <div class="lock-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="4" y="10.5" width="16" height="11" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>
        </svg>
      </div>
      <h3>The AI assistant is premium</h3>
      <p>Ask questions and get answers based on your own notes, syllabus and open tasks.</p>
      <div class="premium-inline-price">
        <span class="a">₦3,500</span>
        <span class="w">₦5,000</span>
      </div>
      <a class="btn-gold" href="/premium.html">Unlock Premium</a>
    </div>`;
  }

  function bubble(role, text) {
    const isUser = role === 'user';
    return `<div style="display:flex;gap:.7rem;margin-bottom:1rem;align-items:flex-start">
      <span style="width:32px;height:32px;border-radius:50%;flex-shrink:0;display:grid;place-items:center;font-size:.75rem;font-weight:600;
        background:${isUser ? 'var(--primary)' : 'var(--brand-grad)'};color:#fff">${isUser ? 'You' : 'AI'}</span>
      <div style="flex:1;min-width:0;padding:.8rem 1rem;border-radius:12px;
        background:${isUser ? 'var(--primary-soft)' : 'var(--surface-2)'};
        color:var(--ink-2);font-size:.92rem;white-space:pre-wrap;word-break:break-word;line-height:1.65">${esc(text)}</div>
    </div>`;
  }

  function body() {
    const chat = threads.length
      ? threads.map((t) => bubble(t.role, t.content)).join('')
      : `<div class="empty" style="padding:2rem 1rem">
           <div class="empty-icon">💬</div>
           <h3>Ask me anything about your subjects</h3>
           <p>Try &ldquo;What should I study next?&rdquo; or &ldquo;Explain my mitosis notes&rdquo;.</p>
         </div>`;

    const providerNote = status.configured
      ? `Answered by ${esc(status.provider)}`
      : 'Answered from your own notes and syllabus. No AI provider is configured on this server yet.';

    return `
      <div class="dash-grid" style="grid-template-columns:1.6fr 1fr">
        <div class="card">
          <div class="card-title">Study assistant <small>${threads.length / 2} questions asked</small></div>

          <div id="chatScroll" style="max-height:52vh;overflow-y:auto;padding-right:.4rem">${chat}</div>

          <form id="askForm" style="margin-top:1.1rem">
            <div class="field">
              <label for="askText">Your question</label>
              <textarea id="askText" placeholder="What should I revise before my next test?" required style="min-height:70px"></textarea>
            </div>
            <div style="display:flex;gap:.6rem;align-items:flex-end;flex-wrap:wrap">
              <div class="field grow" style="margin:0;min-width:180px">
                <label for="askSubject">About which subject?</label>
                <select id="askSubject">${App.subjectOptions('')}</select>
              </div>
              <button class="btn-primary" id="askBtn" type="submit">Ask</button>
              ${threads.length ? '<button class="btn-ghost" data-act="clear" type="button">Clear</button>' : ''}
            </div>
          </form>
        </div>

        <div class="card">
          <div class="card-title">How this works</div>
          <p class="save-state" style="margin-bottom:.9rem">${esc(providerNote)}</p>
          <ul style="list-style:none;display:flex;flex-direction:column;gap:.7rem;font-size:.87rem;color:var(--ink-2)">
            <li style="display:flex;gap:.55rem">
              <span style="color:var(--primary)">1</span>
              <span>The assistant reads your subjects, notes, syllabus topics and open tasks before answering.</span>
            </li>
            <li style="display:flex;gap:.55rem">
              <span style="color:var(--primary)">2</span>
              <span>Without an AI provider configured, it can only report back what is in your own study data.</span>
            </li>
            <li style="display:flex;gap:.55rem">
              <span style="color:var(--primary)">3</span>
              <span>Your questions stay in your account and are never shared with other users.</span>
            </li>
          </ul>
          <div class="form-error" style="background:var(--amber-soft);color:var(--amber);margin-top:1rem;font-size:.8rem">
            An administrator can enable a real AI model by setting <code>AI_PROVIDER</code> and <code>AI_API_KEY</code>.
          </div>
        </div>
      </div>`;
  }

  async function render() {
    if (!App.state.user.isPremium) {
      el().innerHTML = gate();
      return;
    }

    const [history, st] = await Promise.all([api.get('/assistant/history'), api.get('/assistant/status')]);
    threads = history.threads;
    status = st;

    el().innerHTML = body();
    scrollDown();
  }

  function scrollDown() {
    const box = document.getElementById('chatScroll');
    if (box) box.scrollTop = box.scrollHeight;
  }

  el().addEventListener('submit', async (event) => {
    const form = event.target.closest('#askForm');
    if (!form) return;
    event.preventDefault();
    if (sending) return;

    const input = document.getElementById('askText');
    const question = input.value.trim();
    if (!question) return;

    const btn = document.getElementById('askBtn');
    const subjectId = document.getElementById('askSubject').value;
    const subjectName = subjectId ? App.subjectById(subjectId)?.name : '';

    sending = true;
    btn.disabled = true;
    btn.textContent = 'Thinking...';

    threads.push({ role: 'user', content: question });
    input.value = '';
    el().querySelector('#chatScroll').innerHTML = threads.map((t) => bubble(t.role, t.content)).join('') + bubble('assistant', 'Thinking...');
    scrollDown();

    try {
      const res = await api.post('/assistant/ask', { question, subjectName });
      threads.push({ role: 'assistant', content: res.answer });
      status.provider = res.provider;
    } catch (err) {
      if (err.code === 'PREMIUM_REQUIRED') {
        dropPremium();
      } else {
        threads.push({ role: 'assistant', content: `Something went wrong: ${err.message}` });
      }
    } finally {
      sending = false;
      await render();
    }
  });

  function dropPremium() {
    App.state.user.isPremium = false;
    toast('Your premium access has ended.', 'error');
  }

  el().addEventListener('click', async (e) => {
    const clear = e.target.closest('[data-act="clear"]');
    if (!clear) return;

    await api.del('/assistant/history');
    threads = [];
    await render();
  });

  return { render };
})();