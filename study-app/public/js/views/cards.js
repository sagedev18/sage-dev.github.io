Views.cards = (function () {
  const el = () => document.getElementById('view-cards');

  // Quiz state lives here so it survives moving between views.
  const quiz = {
    deckId: null,
    deckName: '',
    cards: [],
    index: 0,
    revealed: false,
    known: 0,
    missed: 0,
    done: false,
  };

  async function render() {
    if (quiz.deckId && !quiz.done) {
      await renderQuiz();
      return;
    }
    await renderDecks();
  }

  async function renderDecks() {
    const { decks } = await api.get('/decks');

    const cards = decks.length
      ? `<div class="deck-grid">${decks
          .map((d) => {
            const pct = d.card_count ? Math.round((d.known_count / d.card_count) * 100) : 0;
            return `<div class="deck-card">
              <div class="deck-name">${esc(d.name)}</div>
              <div class="save-state">
                ${d.card_count} card${d.card_count === 1 ? '' : 's'} &middot; ${d.known_count} known
                ${d.subject_name ? ` &middot; ${esc(d.subject_name)}` : ''}
              </div>
              <div class="deck-progress"><span style="width:${pct}%"></span></div>
              <div class="deck-actions">
                <button class="btn-primary btn-sm" data-study="${d.id}">Study</button>
                <button class="btn-soft btn-sm" data-manage="${d.id}">Cards</button>
                <button class="btn-ghost btn-sm" data-del-deck="${d.id}">Delete</button>
              </div>
            </div>`;
          })
          .join('')}</div>`
      : `<div class="card empty">
           <div class="empty-icon">&#128220;</div>
           <h3>No decks yet</h3>
           <p>Create a deck, add question and answer pairs, then test yourself.</p>
         </div>`;

    el().innerHTML = `
      <div class="card" style="margin-bottom:1.4rem">
        <div class="card-title">New deck</div>
        <form id="deckForm" style="display:flex;gap:.6rem;flex-wrap:wrap;align-items:flex-end">
          <div class="field grow" style="margin:0">
            <label for="deckName">Deck name</label>
            <input id="deckName" type="text" placeholder="Biology - Cell Structure" required>
          </div>
          <div class="field" style="margin:0;min-width:170px">
            <label for="deckSubject">Subject (optional)</label>
            <select id="deckSubject">${App.subjectOptions('')}</select>
          </div>
          <button class="btn-primary" type="submit">Create</button>
        </form>
      </div>

      ${cards}
    `;
  }

  async function startQuiz(deckId) {
    const { deck, cards } = await api.get(`/decks/${deckId}/cards`);

    if (!cards.length) {
      toast('That deck has no cards yet.', 'error');
      return;
    }

    quiz.deckId = deck.id;
    quiz.deckName = deck.name;
    quiz.cards = cards;
    quiz.index = 0;
    quiz.revealed = false;
    quiz.known = 0;
    quiz.missed = 0;
    quiz.done = false;

    await renderQuiz();
  }

  async function renderQuiz() {
    if (quiz.done) {
      const total = quiz.known + quiz.missed;
      const pct = total ? Math.round((quiz.known / total) * 100) : 0;

      el().innerHTML = `
        <div class="card quiz-stage">
          <div class="card-title" style="justify-content:center">Session complete</div>
          <p class="save-state" style="margin-bottom:.4rem">${esc(quiz.deckName)}</p>
          <div class="quiz-score">
            <div><strong>${quiz.known}</strong><span>Marked as known</span></div>
            <div><strong>${pct}%</strong><span>Score</span></div>
          </div>
          <p class="save-state" style="margin-bottom:1.4rem">${quiz.missed} card${quiz.missed === 1 ? '' : 's'} still need work.</p>
          <div style="display:flex;gap:.6rem;justify-content:center;flex-wrap:wrap">
            <button class="btn-primary" data-act="again">Study again</button>
            <button class="btn-ghost" data-act="back">Back to decks</button>
          </div>
        </div>
      `;
      return;
    }

    const card = quiz.cards[quiz.index];

    el().innerHTML = `
      <div class="card quiz-stage">
        <div class="quiz-progress">
          <span>${quiz.index + 1} of ${quiz.cards.length}</span>
          <span class="quiz-dots">
            ${quiz.cards
              .map((c, i) => {
                const state = i < quiz.index ? (c.known ? 'known' : 'seen') : '';
                return `<i class="quiz-dot ${state}"></i>`;
              })
              .join('')}
          </span>
        </div>

        <div class="flashcard" data-act="flip">
          <span class="fc-label">${quiz.revealed ? 'Answer' : 'Question'}</span>
          <div class="fc-text">${esc(quiz.revealed ? card.back : card.front)}</div>
        </div>

        <p class="save-state" style="margin:1rem 0">
          ${quiz.revealed ? 'How well did you know it?' : 'Tap the card to reveal the answer.'}
        </p>

        ${
          quiz.revealed
            ? `<div class="timer-controls" style="margin:0">
                 <button class="btn-ghost" data-act="miss">Still learning</button>
                 <button class="btn-primary" data-act="got">I knew it</button>
               </div>`
            : `<button class="btn-primary" data-act="flip">Show answer</button>`
        }
      </div>
    `;
  }

  async function answer(wasKnown) {
    const card = quiz.cards[quiz.index];
    if (wasKnown) quiz.known += 1;
    else quiz.missed += 1;

    try {
      await api.post(`/decks/cards/${card.id}/review`, { known: wasKnown });
      quiz.cards[quiz.index].known = wasKnown ? 1 : 0;
    } catch (err) {
      handleError(err);
    }

    quiz.index += 1;
    quiz.revealed = false;

    if (quiz.index >= quiz.cards.length) quiz.done = true;
    await renderQuiz();
  }

  async function showCardManager(deckId) {
    const { deck, cards } = await api.get(`/decks/${deckId}/cards`);

    el().innerHTML = `
      <div class="toolbar">
        <button class="btn-ghost" data-act="back">&larr; Back to decks</button>
        <span class="grow"></span>
        <h3 style="color:var(--ink);font-size:1.05rem;font-weight:500">${esc(deck.name)}</h3>
        <span class="save-state">${cards.length} cards</span>
      </div>

      <div class="card" style="margin-bottom:1.4rem">
        <div class="card-title">Add a card</div>
        <form id="cardForm">
          <div class="field">
            <label for="cardFront">Question / front</label>
            <textarea id="cardFront" placeholder="What organ pumps blood around the body?" required></textarea>
          </div>
          <div class="field">
            <label for="cardBack">Answer / back</label>
            <textarea id="cardBack" placeholder="The heart." required></textarea>
          </div>
          <button class="btn-primary" type="submit">Add card</button>
        </form>
      </div>

      <div class="card">
        <div class="card-title">Cards in this deck</div>
        ${
          cards.length
            ? `<div class="mini-list">
                ${cards
                  .map(
                    (c) => `<div class="mini-task">
                      <div style="flex:1;min-width:0">
                        <div style="color:var(--ink);font-size:.9rem">${esc(c.front)}</div>
                        <div class="save-state">${esc(c.back)}</div>
                      </div>
                      ${c.known ? '<span class="chip chip-low">known</span>' : ''}
                      <button class="icon-btn danger" data-del-card="${c.id}" title="Delete">&#10005;</button>
                    </div>`
                  )
                  .join('')}
               </div>`
            : '<p class="save-state">No cards in this deck yet.</p>'
        }
      </div>
    `;
  }

  el().addEventListener('click', async (e) => {
    try {
      const study = e.target.closest('[data-study]');
      if (study) {
        await startQuiz(Number(study.dataset.study));
        return;
      }

      const delDeck = e.target.closest('[data-del-deck]');
      if (delDeck) {
        if (!confirm('Delete this deck and all of its cards?')) return;
        await api.del(`/decks/${delDeck.dataset.delDeck}`);
        toast('Deck deleted.', 'success');
        await renderDecks();
        return;
      }

      const manage = e.target.closest('[data-manage]');
      if (manage) {
        quiz.deckId = Number(manage.dataset.manage);
        await showCardManager(quiz.deckId);
        return;
      }

      const delCard = e.target.closest('[data-del-card]');
      if (delCard) {
        await api.del(`/decks/cards/${delCard.dataset.delCard}`);
        await showCardManager(quiz.deckId);
        return;
      }

      const act = e.target.closest('[data-act]');
      if (!act) return;

      switch (act.dataset.act) {
        case 'flip':
          quiz.revealed = !quiz.revealed;
          await renderQuiz();
          break;
        case 'got':
          await answer(true);
          break;
        case 'miss':
          await answer(false);
          break;
        case 'again':
          quiz.index = 0;
          quiz.revealed = false;
          quiz.known = 0;
          quiz.missed = 0;
          quiz.done = false;
          await renderQuiz();
          break;
        case 'back':
          quiz.deckId = null;
          quiz.done = false;
          await renderDecks();
          break;
        case 'manage':
          await showCardManager(quiz.deckId);
          break;
        default:
          break;
      }
    } catch (err) {
      handleError(err);
    }
  });

  el().addEventListener('submit', async (e) => {
    const deckForm = e.target.closest('#deckForm');
    const cardForm = e.target.closest('#cardForm');

    try {
      if (deckForm) {
        const { deck } = await api.post('/decks', {
          name: document.getElementById('deckName').value.trim(),
          subjectId: document.getElementById('deckSubject').value || null,
        });
        toast('Deck created.', 'success');
        quiz.deckId = deck.id;
        await showCardManager(deck.id);
      }

      if (cardForm) {
        await api.post(`/decks/${quiz.deckId}/cards`, {
          front: document.getElementById('cardFront').value.trim(),
          back: document.getElementById('cardBack').value.trim(),
        });
        await showCardManager(quiz.deckId);
      }
    } catch (err) {
      handleError(err);
    }
  });

  return { render };
})();