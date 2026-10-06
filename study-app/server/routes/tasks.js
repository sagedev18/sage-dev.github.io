const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');
const { required, str, isoDate, priority, bool, wrap } = require('../helpers');

const router = express.Router();
router.use(requireAuth);

/** Makes sure a subject id belongs to this user before we attach data to it. */
function ownedSubject(userId, subjectId) {
  if (subjectId === null || subjectId === undefined || subjectId === '') return null;
  const n = Number(subjectId);
  if (!Number.isInteger(n)) return undefined;
  const row = db
    .prepare('SELECT id FROM subjects WHERE id = ? AND user_id = ?')
    .get(n, userId);
  return row ? n : undefined;
}

router.get(
  '/',
  wrap((req, res) => {
    const filter = req.query.filter;

    let sql = `SELECT t.*, s.name AS subject_name, s.color AS subject_color
                 FROM tasks t
                 LEFT JOIN subjects s ON s.id = t.subject_id
                WHERE t.user_id = ?`;
    const params = [req.user.sub];

    if (filter === 'open') {
      sql += ' AND t.completed = 0';
    } else if (filter === 'done') {
      sql += ' AND t.completed = 1';
    }

    sql += `
      ORDER BY t.completed ASC,
               CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
               t.due_date IS NULL, t.due_date ASC, t.id DESC`;

    res.json({ tasks: db.prepare(sql).all(...params) });
  })
);

router.post(
  '/',
  wrap((req, res) => {
    const title = required(req.body.title, 'Task title', 160);
    const notes = str(req.body.notes, 2000);
    const dueDate = isoDate(req.body.dueDate);
    const prio = priority(req.body.priority);

    const subjectId = ownedSubject(req.user.sub, req.body.subjectId);
    if (subjectId === undefined) {
      return res.status(400).json({ error: 'That subject does not exist.' });
    }

    const info = db
      .prepare(
        `INSERT INTO tasks (user_id, subject_id, title, notes, due_date, priority)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(req.user.sub, subjectId, title, notes, dueDate, prio);

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json({ task });
  })
);

router.patch(
  '/:id',
  wrap((req, res) => {
    const id = Number(req.params.id);
    const current = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(id, req.user.sub);
    if (!current) return res.status(404).json({ error: 'Task not found.' });

    let subjectId = current.subject_id;
    if (req.body.subjectId !== undefined) {
      const resolved = ownedSubject(req.user.sub, req.body.subjectId);
      if (resolved === undefined) {
        return res.status(400).json({ error: 'That subject does not exist.' });
      }
      subjectId = resolved;
    }

    const title = req.body.title !== undefined ? required(req.body.title, 'Task title', 160) : current.title;
    const notes = req.body.notes !== undefined ? str(req.body.notes, 2000) : current.notes;
    const dueDate = req.body.dueDate !== undefined ? isoDate(req.body.dueDate) : current.due_date;
    const prio = req.body.priority !== undefined ? priority(req.body.priority) : current.priority;

    let completed = current.completed;
    let completedAt = current.completed_at;
    if (req.body.completed !== undefined) {
      completed = bool(req.body.completed);
      completedAt = completed ? new Date().toISOString().replace('T', ' ').slice(0, 19) : null;
    }

    db.prepare(
      `UPDATE tasks
          SET title = ?, notes = ?, due_date = ?, priority = ?, completed = ?, completed_at = ?, subject_id = ?
        WHERE id = ?`
    ).run(title, notes, dueDate, prio, completed, completedAt, subjectId, id);

    res.json({ task: db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) });
  })
);

router.delete(
  '/:id',
  wrap((req, res) => {
    const info = db
      .prepare('DELETE FROM tasks WHERE id = ? AND user_id = ?')
      .run(Number(req.params.id), req.user.sub);
    if (info.changes === 0) return res.status(404).json({ error: 'Task not found.' });
    res.json({ ok: true });
  })
);

module.exports = router;