const express = require('express');
const db = require('../db');
const { requireAuth, requirePremium } = require('../auth');
const { required, str, int, wrap } = require('../helpers');

const router = express.Router();
router.use(requireAuth);

// Passing a subject unlocks the next one, so students work through their
// subjects in order instead of spreading themselves thin.
const PASS_MARK = 70;

/** Returns a new array in random order. */
function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function ownedSubject(userId, subjectId) {
  const n = Number(subjectId);
  if (!Number.isInteger(n)) return undefined;
  return db.prepare('SELECT * FROM subjects WHERE id = ? AND user_id = ?').get(n, userId) ? n : undefined;
}

function subjectProgress(userId) {
  const subjects = db
    .prepare('SELECT id, name, color FROM subjects WHERE user_id = ? ORDER BY created_at ASC, id ASC')
    .all(userId);

  const counts = Object.fromEntries(
    db
      .prepare(
        `SELECT subject_id, COUNT(*) AS n FROM quiz_questions
          WHERE user_id = ? GROUP BY subject_id`
      )
      .all(userId)
      .map((r) => [r.subject_id, r.n])
  );

  const bests = Object.fromEntries(
    db
      .prepare(
        `SELECT subject_id, MAX(score_pct) AS best FROM quiz_attempts
          WHERE user_id = ? GROUP BY subject_id`
      )
      .all(userId)
      .map((r) => [r.subject_id, r.best])
  );

  // The first subject is always open. Every subject after it stays locked
  // until the one before it has enough questions and a passing score.
  return subjects.map((s, index) => {
    const questionCount = counts[s.id] || 0;
    const bestScore = bests[s.id] || 0;

    let unlocked = true;
    if (index > 0) {
      const prev = subjects[index - 1];
      unlocked = (counts[prev.id] || 0) >= 3 && (bests[prev.id] || 0) >= PASS_MARK;
    }

    return {
      ...s,
      questionCount,
      bestScore,
      unlocked,
      passed: bestScore >= PASS_MARK,
    };
  });
}

/* ---------------- Questions ---------------- */

router.get(
  '/subjects',
  wrap((req, res) => res.json({ subjects: subjectProgress(req.user.sub), passMark: PASS_MARK }))
);

router.get(
  '/questions',
  wrap((req, res) => {
    const subjectId = ownedSubject(req.user.sub, req.query.subjectId);
    if (subjectId === undefined) return res.status(400).json({ error: 'Pick a subject first.' });

    const questions = db
      .prepare('SELECT * FROM quiz_questions WHERE user_id = ? AND subject_id = ? ORDER BY id DESC')
      .all(req.user.sub, subjectId);

    const attempts = db
      .prepare(
        `SELECT id, total, correct, score_pct, created_at
           FROM quiz_attempts WHERE user_id = ? AND subject_id = ? ORDER BY created_at DESC, id DESC LIMIT 10`
      )
      .all(req.user.sub, subjectId);

    res.json({ questions, attempts, passMark: PASS_MARK });
  })
);

router.post(
  '/questions',
  requirePremium,
  wrap((req, res) => {
    const subjectId = ownedSubject(req.user.sub, req.body.subjectId);
    if (subjectId === undefined) return res.status(400).json({ error: 'Pick a subject first.' });

    const question = required(req.body.question, 'Question', 800);
    const correctAnswer = required(req.body.correctAnswer, 'Correct answer', 400);
    const wrongA = str(req.body.wrongA, 400);
    const wrongB = str(req.body.wrongB, 400);
    const wrongC = str(req.body.wrongC, 400);
    const explanation = str(req.body.explanation, 1000);

    const options = [wrongA, wrongB, wrongC].filter(Boolean);
    if (options.length < 2) {
      return res.status(400).json({ error: 'Give at least two wrong answers.' });
    }

    const info = db
      .prepare(
        `INSERT INTO quiz_questions (user_id, subject_id, question, correct_answer, wrong_a, wrong_b, wrong_c, explanation)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(req.user.sub, subjectId, question, correctAnswer, wrongA, wrongB, wrongC, explanation);

    res.status(201).json({
      question: db.prepare('SELECT * FROM quiz_questions WHERE id = ?').get(info.lastInsertRowid),
    });
  })
);

router.delete(
  '/questions/:id',
  wrap((req, res) => {
    const info = db
      .prepare('DELETE FROM quiz_questions WHERE id = ? AND user_id = ?')
      .run(Number(req.params.id), req.user.sub);
    if (info.changes === 0) return res.status(404).json({ error: 'Question not found.' });
    res.json({ ok: true });
  })
);

/* ---------------- Attempts ---------------- */

/** Builds a multiple-choice quiz, mixing this subject's questions with easy ones from others. */
router.post(
  '/start',
  requirePremium,
  wrap((req, res) => {
    const subjectId = ownedSubject(req.user.sub, req.body.subjectId);
    if (subjectId === undefined) return res.status(400).json({ error: 'Pick a subject first.' });

    const own = db
      .prepare(
        `SELECT * FROM quiz_questions WHERE user_id = ? AND subject_id = ?
          ORDER BY RANDOM() LIMIT 10`
      )
      .all(req.user.sub, subjectId);

    const pool = [...own];

    if (pool.length < 5) {
      const extra = db
        .prepare(
          `SELECT * FROM quiz_questions WHERE user_id = ? AND subject_id != ?
            ORDER BY RANDOM() LIMIT ?`
        )
        .all(req.user.sub, subjectId, 5 - pool.length);
      pool.push(...extra);
    }

    if (pool.length < 3) {
      return res.status(400).json({
        error: 'Add at least three questions to your bank before taking a quiz.',
      });
    }

    // Correct answers are withheld until the attempt is submitted, and the
    // options are shuffled so the right answer is not always in the same slot.
    res.json({
      subjectId,
      questions: pool.map((q) => ({
        id: q.id,
        question: q.question,
        options: shuffle([q.correct_answer, q.wrong_a, q.wrong_b, q.wrong_c].filter(Boolean)),
      })),
    });
  })
);

router.post(
  '/submit',
  requirePremium,
  wrap((req, res) => {
    const answers = Array.isArray(req.body.answers) ? req.body.answers : null;
    if (!answers || !answers.length) {
      return res.status(400).json({ error: 'No answers were submitted.' });
    }

    // A quiz can be padded with questions from other subjects, so the attempt
    // belongs to the subject the student was actually revising. That claim is
    // checked against the progression rules rather than taken on trust.
    const progress = subjectProgress(req.user.sub);
    const claimed = Number(req.body.subjectId);

    let subject = progress.find((s) => s.id === claimed);

    if (!subject) {
      // No usable claim, so fall back to the subject of one of their questions.
      for (const answer of answers) {
        const row = db
          .prepare('SELECT subject_id FROM quiz_questions WHERE user_id = ? AND id = ?')
          .get(req.user.sub, Number(answer.questionId));
        if (row) {
          subject = progress.find((s) => s.id === row.subject_id);
          if (subject) break;
        }
      }
    }

    if (!subject) return res.status(400).json({ error: 'Pick a subject first.' });
    if (!subject.unlocked) {
      return res.status(403).json({ error: 'Pass the previous subject before testing this one.' });
    }
    const subjectId = subject.id;

    const unique = new Map();
    for (const a of answers) unique.set(Number(a.questionId), str(a.picked, 400));

    const ids = [...unique.keys()].filter((id) => Number.isInteger(id));
    if (!ids.length) return res.status(400).json({ error: 'No valid answers were submitted.' });

    const rows = db
      .prepare(
        `SELECT id, subject_id, correct_answer, explanation FROM quiz_questions
          WHERE user_id = ? AND id IN (${ids.map(() => '?').join(',')})`
      )
      .all(req.user.sub, ...ids);

    if (!rows.length) return res.status(400).json({ error: 'Those questions do not exist.' });

    let correct = 0;
    const detail = rows.map((q) => {
      const picked = unique.get(q.id);
      const isRight = String(picked).trim().toLowerCase() === String(q.correct_answer).trim().toLowerCase();
      if (isRight) correct += 1;
      return {
        id: q.id,
        picked: picked || '',
        correctAnswer: q.correct_answer,
        correct: isRight ? 1 : 0,
        explanation: q.explanation,
      };
    });

    const total = rows.length;
    const scorePct = Math.round((correct / total) * 100);

    const attemptInfo = db
      .prepare(
        'INSERT INTO quiz_attempts (user_id, subject_id, total, correct, score_pct) VALUES (?, ?, ?, ?, ?)'
      )
      .run(req.user.sub, subjectId, total, correct, scorePct);

    const attemptId = Number(attemptInfo.lastInsertRowid);

    const insertAnswer = db.prepare(
      'INSERT INTO quiz_answers (attempt_id, question_id, picked, correct) VALUES (?, ?, ?, ?)'
    );
    for (const d of detail) insertAnswer.run(attemptId, d.id, d.picked, d.correct);

    const passed = scorePct >= PASS_MARK;

    if (passed) {
      db.prepare(
        `INSERT INTO topic_progress (user_id, subject_id, unlocked, best_score, attempts, completed_at)
              VALUES (?, ?, 1, ?, 1, datetime('now'))
         ON CONFLICT(user_id, subject_id)
         DO UPDATE SET best_score = MAX(best_score, excluded.best_score),
                       attempts = attempts + 1,
                       completed_at = CASE WHEN excluded.best_score >= best_score THEN datetime('now') ELSE completed_at END`
      ).run(req.user.sub, subjectId, scorePct);
    } else {
      db.prepare(
        `INSERT INTO topic_progress (user_id, subject_id, unlocked, best_score, attempts)
              VALUES (?, ?, 1, ?, 1)
         ON CONFLICT(user_id, subject_id)
         DO UPDATE SET attempts = attempts + 1,
                       best_score = MAX(best_score, excluded.best_score)`
      ).run(req.user.sub, subjectId, scorePct);
    }

    // A pass marks the subject's syllabus topics as covered.
    if (passed) {
      db.prepare(
        'UPDATE syllabus SET done = 1 WHERE user_id = ? AND subject_id = ?'
      ).run(req.user.sub, subjectId);
    }

    res.json({
      attemptId,
      total,
      correct,
      scorePct,
      passed,
      passMark: PASS_MARK,
      results: detail,
      subjects: subjectProgress(req.user.sub),
    });
  })
);

router.get(
  '/history',
  wrap((req, res) => {
    const attempts = db
      .prepare(
        `SELECT qa.*, s.name AS subject_name, s.color AS subject_color
           FROM quiz_attempts qa
           LEFT JOIN subjects s ON s.id = qa.subject_id
          WHERE qa.user_id = ?
          ORDER BY qa.created_at DESC, qa.id DESC LIMIT 25`
      )
      .all(req.user.sub);
    res.json({ attempts, passMark: PASS_MARK });
  })
);

module.exports = router;
module.exports.PASS_MARK = PASS_MARK;