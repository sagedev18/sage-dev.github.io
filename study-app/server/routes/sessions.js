const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');
const { int, bool, isoDateTime, wrap } = require('../helpers');

const router = express.Router();
router.use(requireAuth);

router.get(
  '/',
  wrap((req, res) => {
    const limit = int(req.query.limit, 100, 1, 500);
    const sessions = db
      .prepare(
        `SELECT se.*, s.name AS subject_name, s.color AS subject_color
           FROM sessions se
           LEFT JOIN subjects s ON s.id = se.subject_id
          WHERE se.user_id = ?
          ORDER BY se.started_at DESC
          LIMIT ?`
      )
      .all(req.user.sub, limit);
    res.json({ sessions });
  })
);

router.post(
  '/',
  wrap((req, res) => {
    const durationMin = int(req.body.durationMin, 0, 1, 600);
    const startedAt = isoDateTime(req.body.startedAt) || new Date().toISOString().replace('T', ' ').slice(0, 19);
    const mode = req.body.mode === 'break' ? 'break' : 'focus';
    const finished = req.body.finished === undefined ? 1 : bool(req.body.finished);
    const subjectId = Number(req.body.subjectId) || null;

    if (subjectId) {
      const owned = db
        .prepare('SELECT id FROM subjects WHERE id = ? AND user_id = ?')
        .get(subjectId, req.user.sub);
      if (!owned) return res.status(400).json({ error: 'That subject does not exist.' });
    }

    const info = db
      .prepare(
        `INSERT INTO sessions (user_id, subject_id, started_at, duration_min, mode, finished)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(req.user.sub, subjectId, startedAt, durationMin, mode, finished);

    res.status(201).json({ session: db.prepare('SELECT * FROM sessions WHERE id = ?').get(info.lastInsertRowid) });
  })
);

router.delete(
  '/:id',
  wrap((req, res) => {
    const info = db
      .prepare('DELETE FROM sessions WHERE id = ? AND user_id = ?')
      .run(Number(req.params.id), req.user.sub);
    if (info.changes === 0) return res.status(404).json({ error: 'Session not found.' });
    res.json({ ok: true });
  })
);

module.exports = router;