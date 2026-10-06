const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');
const { required, str, isoDate, bool, wrap } = require('../helpers');

const router = express.Router();

// Scoped to this router's own paths. Mounted at /api, a blanket router.use
// would guard every /api route, including the health check.
router.use(['/exams', '/syllabus'], requireAuth);

/* ---------------- Exams ---------------- */

router.get(
  '/exams',
  wrap((req, res) => {
    const exams = db
      .prepare(
        `SELECT e.*, s.name AS subject_name, s.color AS subject_color,
                CAST(julianday(e.exam_date) - julianday('now') AS INTEGER) AS days_left
           FROM exams e
           LEFT JOIN subjects s ON s.id = e.subject_id
          WHERE e.user_id = ?
          ORDER BY e.exam_date ASC`
      )
      .all(req.user.sub);
    res.json({ exams });
  })
);

router.post(
  '/exams',
  wrap((req, res) => {
    const name = required(req.body.name, 'Exam name', 120);
    const examDate = isoDate(req.body.examDate);
    if (!examDate) return res.status(400).json({ error: 'Please give a valid exam date.' });
    const subjectId = Number(req.body.subjectId) || null;

    const info = db
      .prepare('INSERT INTO exams (user_id, subject_id, name, exam_date) VALUES (?, ?, ?, ?)')
      .run(req.user.sub, subjectId, name, examDate);

    res.status(201).json({ exam: db.prepare('SELECT * FROM exams WHERE id = ?').get(info.lastInsertRowid) });
  })
);

router.delete(
  '/exams/:id',
  wrap((req, res) => {
    const info = db
      .prepare('DELETE FROM exams WHERE id = ? AND user_id = ?')
      .run(Number(req.params.id), req.user.sub);
    if (info.changes === 0) return res.status(404).json({ error: 'Exam not found.' });
    res.json({ ok: true });
  })
);

/* ---------------- Syllabus ---------------- */

router.get(
  '/syllabus',
  wrap((req, res) => {
    const topics = db
      .prepare(
        `SELECT sy.*, s.name AS subject_name, s.color AS subject_color
           FROM syllabus sy
           LEFT JOIN subjects s ON s.id = sy.subject_id
          WHERE sy.user_id = ?
          ORDER BY sy.done ASC, s.name COLLATE NOCASE, sy.id`
      )
      .all(req.user.sub);
    res.json({ topics });
  })
);

router.post(
  '/syllabus',
  wrap((req, res) => {
    const topic = required(req.body.topic, 'Topic', 160);
    const subjectId = Number(req.body.subjectId) || null;

    if (subjectId) {
      const owned = db
        .prepare('SELECT id FROM subjects WHERE id = ? AND user_id = ?')
        .get(subjectId, req.user.sub);
      if (!owned) return res.status(400).json({ error: 'That subject does not exist.' });
    }

    const info = db
      .prepare('INSERT INTO syllabus (user_id, subject_id, topic) VALUES (?, ?, ?)')
      .run(req.user.sub, subjectId, topic);

    res.status(201).json({ topic: db.prepare('SELECT * FROM syllabus WHERE id = ?').get(info.lastInsertRowid) });
  })
);

router.patch(
  '/syllabus/:id',
  wrap((req, res) => {
    const id = Number(req.params.id);
    const current = db.prepare('SELECT * FROM syllabus WHERE id = ? AND user_id = ?').get(id, req.user.sub);
    if (!current) return res.status(404).json({ error: 'Topic not found.' });

    const done = req.body.done !== undefined ? bool(req.body.done) : current.done;
    db.prepare('UPDATE syllabus SET done = ? WHERE id = ?').run(done, id);

    res.json({ topic: db.prepare('SELECT * FROM syllabus WHERE id = ?').get(id) });
  })
);

router.delete(
  '/syllabus/:id',
  wrap((req, res) => {
    const info = db
      .prepare('DELETE FROM syllabus WHERE id = ? AND user_id = ?')
      .run(Number(req.params.id), req.user.sub);
    if (info.changes === 0) return res.status(404).json({ error: 'Topic not found.' });
    res.json({ ok: true });
  })
);

module.exports = router;