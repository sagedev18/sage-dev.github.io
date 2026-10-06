const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');
const { str, wrap } = require('../helpers');

const router = express.Router();
router.use(requireAuth);

router.get(
  '/',
  wrap((req, res) => {
    const notes = db
      .prepare(
        `SELECT n.*, s.name AS subject_name, s.color AS subject_color
           FROM notes n
           LEFT JOIN subjects s ON s.id = n.subject_id
          WHERE n.user_id = ?
          ORDER BY n.updated_at DESC, n.id DESC`
      )
      .all(req.user.sub);
    res.json({ notes });
  })
);

router.post(
  '/',
  wrap((req, res) => {
    const title = str(req.body.title, 160) || 'Untitled note';
    const body = str(req.body.body, 20000);
    const subjectId = Number(req.body.subjectId) || null;

    if (subjectId) {
      const owned = db
        .prepare('SELECT id FROM subjects WHERE id = ? AND user_id = ?')
        .get(subjectId, req.user.sub);
      if (!owned) return res.status(400).json({ error: 'That subject does not exist.' });
    }

    const info = db
      .prepare('INSERT INTO notes (user_id, subject_id, title, body) VALUES (?, ?, ?, ?)')
      .run(req.user.sub, subjectId, title, body);

    res.status(201).json({ note: db.prepare('SELECT * FROM notes WHERE id = ?').get(info.lastInsertRowid) });
  })
);

router.patch(
  '/:id',
  wrap((req, res) => {
    const id = Number(req.params.id);
    const current = db.prepare('SELECT * FROM notes WHERE id = ? AND user_id = ?').get(id, req.user.sub);
    if (!current) return res.status(404).json({ error: 'Note not found.' });

    const title = req.body.title !== undefined ? str(req.body.title, 160) || 'Untitled note' : current.title;
    const body = req.body.body !== undefined ? str(req.body.body, 20000) : current.body;
    const subjectId = req.body.subjectId !== undefined ? Number(req.body.subjectId) || null : current.subject_id;

    db.prepare(
      "UPDATE notes SET title = ?, body = ?, subject_id = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(title, body, subjectId, id);

    res.json({ note: db.prepare('SELECT * FROM notes WHERE id = ?').get(id) });
  })
);

router.delete(
  '/:id',
  wrap((req, res) => {
    const info = db
      .prepare('DELETE FROM notes WHERE id = ? AND user_id = ?')
      .run(Number(req.params.id), req.user.sub);
    if (info.changes === 0) return res.status(404).json({ error: 'Note not found.' });
    res.json({ ok: true });
  })
);

module.exports = router;