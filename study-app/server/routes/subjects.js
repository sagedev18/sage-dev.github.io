const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { requireAuth } = require('../auth');
const { required, str, hexColor, wrap } = require('../helpers');

const router = express.Router();

/* The subject library is read once at boot. It is a static file, so there is no
   reason to hit the disk on every request. */
const LIBRARY = (() => {
  try {
    const raw = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'data', 'subjects.json'), 'utf8');
    const parsed = JSON.parse(raw);
    const seen = new Set();
    const entries = [];

    const add = (raw, region) => {
      const name = String(raw).trim();
      const key = name.toLowerCase();
      if (!name || seen.has(key)) return;
      seen.add(key);
      entries.push({ name, region });
    };

    for (const group of parsed.groups || []) {
      for (const name of group.subjects || []) add(name, group.region);
    }
    for (const name of parsed.special || []) add(name, 'General');

    return {
      subjects: entries.map((e) => e.name),
      entries,
      groups: (parsed.groups || []).map((g) => ({ region: g.region, systems: g.systems })),
    };
  } catch (err) {
    console.error('Could not read the subject library:', err.message);
    return { subjects: [], entries: [], groups: [] };
  }
})();

router.use(requireAuth);

// Public to anyone logged in, so the picker can offer real subject names.
router.get('/library', (req, res) => res.json(LIBRARY));

router.get(
  '/',
  wrap((req, res) => {
    const subjects = db
      .prepare(
        `SELECT s.*,
                (SELECT COUNT(*) FROM tasks t
                  WHERE t.subject_id = s.id AND t.completed = 0) AS open_tasks,
                (SELECT COUNT(*) FROM notes n WHERE n.subject_id = s.id) AS note_count,
                (SELECT COALESCE(SUM(se.duration_min), 0) FROM sessions se
                  WHERE se.subject_id = s.id) AS focus_min
           FROM subjects s
          WHERE s.user_id = ?
          ORDER BY s.name COLLATE NOCASE`
      )
      .all(req.user.sub);
    res.json({ subjects });
  })
);

router.post(
  '/',
  wrap((req, res) => {
    const name = required(req.body.name, 'Subject name', 80);
    const color = hexColor(req.body.color);

    const info = db
      .prepare('INSERT INTO subjects (user_id, name, color) VALUES (?, ?, ?)')
      .run(req.user.sub, name, color);

    const subject = db.prepare('SELECT * FROM subjects WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json({ subject });
  })
);

router.patch(
  '/:id',
  wrap((req, res) => {
    const id = Number(req.params.id);
    const current = db
      .prepare('SELECT * FROM subjects WHERE id = ? AND user_id = ?')
      .get(id, req.user.sub);
    if (!current) return res.status(404).json({ error: 'Subject not found.' });

    const name = req.body.name !== undefined ? required(req.body.name, 'Subject name', 80) : current.name;
    const color = req.body.color !== undefined ? hexColor(req.body.color) : current.color;

    db.prepare('UPDATE subjects SET name = ?, color = ? WHERE id = ?').run(name, color, id);
    res.json({ subject: db.prepare('SELECT * FROM subjects WHERE id = ?').get(id) });
  })
);

router.delete(
  '/:id',
  wrap((req, res) => {
    const id = Number(req.params.id);
    const info = db
      .prepare('DELETE FROM subjects WHERE id = ? AND user_id = ?')
      .run(id, req.user.sub);
    if (info.changes === 0) return res.status(404).json({ error: 'Subject not found.' });
    res.json({ ok: true });
  })
);

module.exports = router;