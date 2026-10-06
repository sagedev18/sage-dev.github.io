const express = require('express');
const db = require('../db');
const { requireAuth, requirePremium } = require('../auth');
const { required, str, wrap } = require('../helpers');
const ai = require('../ai');

const router = express.Router();
router.use(requireAuth);

router.get(
  '/status',
  wrap((req, res) => {
    res.json({
      configured: ai.configured(),
      provider: ai.configured() ? process.env.AI_PROVIDER : null,
    });
  })
);

router.post(
  '/ask',
  requirePremium,
  wrap(async (req, res) => {
    const question = required(req.body.question, 'Question', 1000);
    const subjectName = str(req.body.subjectName, 80);

    res.json(await ai.ask(req.user.sub, question, subjectName));
  })
);

router.get(
  '/history',
  wrap((req, res) => {
    const threads = db
      .prepare(
        `SELECT id, role, content, created_at FROM assistant_threads
          WHERE user_id = ? ORDER BY id DESC LIMIT 40`
      )
      .all(req.user.sub)
      .reverse();

    res.json({ threads });
  })
);

router.delete(
  '/history',
  wrap((req, res) => {
    db.prepare('DELETE FROM assistant_threads WHERE user_id = ?').run(req.user.sub);
    res.json({ ok: true });
  })
);

module.exports = router;