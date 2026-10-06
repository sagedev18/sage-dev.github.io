(function () {
  /* theme */
  const toggle = document.getElementById('themeToggle');
  const label = document.getElementById('themeLabel');
  const icon = document.getElementById('themeIcon');
  const MOON = '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/>';

  function paintTheme() {
    const c = Theme.current();
    label.textContent = c[0].toUpperCase() + c.slice(1);
    icon.innerHTML = Theme.effective() === 'dark' ? MOON : '';
  }
  toggle.addEventListener('click', () => {
    Theme.cycle();
    paintTheme();
  });
  paintTheme();

  const FEATURES = [
    ['AI study assistant', 'Ask questions and get answers grounded in your own notes and syllabus.'],
    ['Auto-generated quizzes', 'Turn your study into multiple choice tests that check what stuck.'],
    ['Topic progression', 'Pass a subject to unlock the next one, so you finish in order.'],
    ['Full data export', 'Download everything you have added as a JSON backup.'],
    ['Priority support', 'Email support for premium users.'],
    ['Everything in Free', 'Tasks, timer, notes, flashcards, exams and syllabus.'],
  ];

  document.getElementById('featureList').innerHTML = FEATURES.map(
    ([title, text]) => `<div style="display:flex;gap:.7rem;align-items:flex-start">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" style="width:17px;height:17px;color:var(--green);flex-shrink:0;margin-top:3px"><path d="M20 6 9 17l-5-5"/></svg>
        <div>
          <strong style="display:block;font-size:.92rem;color:var(--ink);font-weight:500">${esc(title)}</strong>
          <span class="save-state">${esc(text)}</span>
        </div>
      </div>`
  ).join('');

  const naira = (n) => `₦${Number(n).toLocaleString()}`;

  async function loadPricing() {
    const data = await api.get('/payments/pricing');

    document.getElementById('priceCharged').textContent = naira(data.priceCharged);
    document.getElementById('priceListed').textContent = naira(data.priceListed);
    document.getElementById('priceSavings').textContent = `Save ${naira(data.savings)}`;
    document.getElementById('amount').value = data.priceCharged;

    if (data.isPremium) {
      document.getElementById('premiumActive').hidden = false;
      document.getElementById('paymentBlock').hidden = true;
    }

    const details = document.getElementById('payDetails');

    if (data.bankName || data.accountNumber) {
      details.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:1rem;margin-bottom:1rem">
          ${detail('Bank', data.bankName)}
          ${detail('Account name', data.accountName)}
          ${detail('Account number', data.accountNumber)}
        </div>
        ${data.accountNumber ? `<button class="btn-soft btn-sm" id="copyAcct" type="button">Copy account number</button>` : ''}
        ${data.paymentDetails ? `<p class="save-state" style="margin-top:1rem;white-space:pre-line">${esc(data.paymentDetails)}</p>` : ''}
      `;

      const copyBtn = document.getElementById('copyAcct');
      if (copyBtn) {
        copyBtn.addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(data.accountNumber);
            toast('Account number copied.', 'success');
          } catch (err) {
            toast('Copy failed. Type it out instead.', 'error');
          }
        });
      }
    } else {
      details.innerHTML = `<p class="save-state">Payment details have not been published yet. Please check back shortly.</p>`;
    }
  }

  function detail(label, value) {
    if (!value) return '';
    return `<div>
      <span class="save-state" style="display:block">${esc(label)}</span>
      <strong style="color:var(--ink);font-size:1rem">${esc(value)}</strong>
    </div>`;
  }

  async function loadHistory() {
    const { payments } = await api.get('/payments');
    document.getElementById('payCount').textContent = `${payments.length} total`;

    const el = document.getElementById('paymentHistory');

    if (!payments.length) {
      el.innerHTML = `<p class="save-state">Nothing submitted yet.</p>`;
      return;
    }

    el.innerHTML = `<div class="exam-list">${payments
      .map(
        (p) => `<div class="exam-row">
          <div class="exam-countdown ${
            p.status === 'verified' ? '' : p.status === 'rejected' ? 'urgent' : 'soon'
          }" style="min-width:58px;height:58px;font-size:1rem">${naira(p.amount)}<small>${esc(p.status)}</small></div>
          <div class="exam-row-body">
            <strong>${esc(p.reference)}</strong>
            <span>${esc(new Date(p.created_at.replace(' ', 'T')).toLocaleString())}${
              p.bank ? ` &middot; ${esc(p.bank)}` : ''
            }</span>
            ${p.review_note ? `<span style="display:block;color:var(--red);font-size:.8rem;margin-top:.2rem">${esc(p.review_note)}</span>` : ''}
          </div>
        </div>`
      )
      .join('')}</div>`;
  }

  /* The submit button asks twice. This is the one action on the page that
     commits something to an admin's queue, so it should not be a single stray
     click away. */
  const ARM_MS = 6000;
  const IDLE = { label: 'Yes, I have paid', sub: 'Send these details for verification' };
  const ARMED = { label: 'Press again to submit', sub: 'Waiting for your confirmation' };

  const submitLabel = document.getElementById('paySubmitLabel');
  const submitSub = document.getElementById('paySubmitSub');
  const submitBtn = document.getElementById('paySubmit');

  function paintSubmit(state) {
    submitLabel.textContent = state.label;
    submitSub.textContent = state.sub;
    submitBtn.classList.toggle('armed', state === ARMED);
  }

  let armed = false;
  let armTimer = null;

  function disarm() {
    armed = false;
    clearTimeout(armTimer);
    paintSubmit(IDLE);
  }

  document.getElementById('paymentForm').addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!armed) {
      armed = true;
      paintSubmit(ARMED);
      armTimer = setTimeout(disarm, ARM_MS);
      return;
    }

    disarm();

    const err = document.getElementById('payError');
    err.hidden = true;
    submitBtn.disabled = true;
    submitBtn.classList.add('busy');
    paintSubmit({ label: 'Submitting...', sub: 'Sending your details' });

    try {
      await api.post('/payments', {
        amount: Number(document.getElementById('amount').value),
        reference: document.getElementById('reference').value.trim(),
        payerName: document.getElementById('payerName').value.trim(),
        bank: document.getElementById('bank').value.trim(),
        note: document.getElementById('note').value.trim(),
      });

      event.target.reset();
      toast('Payment submitted. We will verify it shortly.', 'success');
      await loadHistory();
    } catch (e) {
      err.textContent = e.message;
      err.hidden = false;
    } finally {
      submitBtn.disabled = false;
      submitBtn.classList.remove('busy');
      paintSubmit(IDLE);
    }
  });

  // Editing a field after arming invalidates the confirmation.
  document.getElementById('paymentForm').addEventListener('input', () => {
    if (armed) disarm();
  });

  (async function start() {
    const user = await api.me();
    if (!user) {
      window.location.href = '/index.html';
      return;
    }

    try {
      await loadPricing();
      await loadHistory();
    } catch (e) {
      handleError(e);
    }
  })();
})();