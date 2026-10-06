const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');
const { required, str, bool, wrap } = require('../helpers');

const router = express.Router();
router.use(requireAuth);

router.get(
  '/',
  wrap((req, res) => {
    const decks = db
      .prepare(
        `SELECT d.*, s.name AS subject_name, s.color AS subject_color,
                (SELECT COUNT(*) FROM cards c WHERE c.deck_id = d.id) AS card_count,
                (SELECT COUNT(*) FROM cards c
                  JOIN card_progress cp ON cp.card_id = c.id AND cp.user_id = d.user_id
                 WHERE c.deck_id = d.id AND cp.known = 1) AS known_count
           FROM decks d
           LEFT JOIN subjects s ON s.id = d.subject_id
          WHERE d.user_id = ?
          ORDER BY d.name COLLATE NOCASE`
      )
      .all(req.user.sub);
    res.json({ decks });
  })
);

router.post(
  '/',
  wrap((req, res) => {
    const name = required(req.body.name, 'Deck name', 80);
    const subjectId = Number(req.body.subjectId) || null;

    const info = db
      .prepare('INSERT INTO decks (user_id, subject_id, name) VALUES (?, ?, ?)')
      .run(req.user.sub, subjectId, name);

    res.status(201).json({ deck: db.prepare('SELECT * FROM decks WHERE id = ?').get(info.lastInsertRowid) });
  })
);

router.delete(
  '/:id',
  wrap((req, res) => {
    const info = db
      .prepare('DELETE FROM decks WHERE id = ? AND user_id = ?')
      .run(Number(req.params.id), req.user.sub);
    if (info.changes === 0) return res.status(404).json({ error: 'Deck not found.' });
    res.json({ ok: true });
  })
);

router.get(
  '/:id/cards',
  wrap((req, res) => {
    const deckId = Number(req.params.id);
    const deck = db
      .prepare('SELECT * FROM decks WHERE id = ? AND user_id = ?')
      .get(deckId, req.user.sub);
    if (!deck) return res.status(404).json({ error: 'Deck not found.' });

    const cards = db
      .prepare(
        `SELECT c.*, COALESCE(cp.seen_count, 0) AS seen_count, COALESCE(cp.known, 0) AS known
           FROM cards c
           LEFT JOIN card_progress cp ON cp.card_id = c.id AND cp.user_id = c.user_id
          WHERE c.deck_id = ?
          ORDER BY c.id`
      )
      .all(deckId);

    res.json({ deck, cards });
  })
);

router.post(
  '/:id/cards',
  wrap((req, res) => {
    const deckId = Number(req.params.id);
    const deck = db
      .prepare('SELECT * FROM decks WHERE id = ? AND user_id = ?')
      .get(deckId, req.user.sub);
    if (!deck) return res.status(404).json({ error: 'Deck not found.' });

    const front = required(req.body.front, 'Front of card', 1000);
    const back = required(req.body.back, 'Back of card', 1000);

    const info = db
      .prepare('INSERT INTO cards (deck_id, user_id, front, back) VALUES (?, ?, ?, ?)')
      .run(deckId, req.user.sub, front, back);

    res.status(201).json({ card: db.prepare('SELECT * FROM cards WHERE id = ?').get(info.lastInsertRowid) });
  })
);

router.post(
  '/cards/:cardId/review',
  wrap((req, res) => {
    const cardId = Number(req.params.cardId);
    const card = db
      .prepare('SELECT * FROM cards WHERE id = ? AND user_id = ?')
      .get(cardId, req.user.sub);
    if (!card) return res.status(404).json({ error: 'Card not found.' });

    const known = bool(req.body.known);

    db.prepare(
      `INSERT INTO card_progress (card_id, user_id, seen_count, known, last_seen)
            VALUES (?, ?, 1, ?, datetime('now'))
       ON CONFLICT(card_id, user_id)
       DO UPDATE SET seen_count = seen_count + 1,
                     known = excluded.known,
                     last_seen = datetime('now')`
    ).run(cardId, req.user.sub, known);

    res.json({ ok: true });
  })
);

router.delete(
  '/cards/:cardId',
  wrap((req, res) => {
    const info = db
      .prepare('DELETE FROM cards WHERE id = ? AND user_id = ?')
      .run(Number(req.params.cardId), req.user.sub);
    if (info.changes === 0) return res.status(404).json({ error: 'Card not found.' });
    res.json({ ok: true });
  })
);

module.exports = router;