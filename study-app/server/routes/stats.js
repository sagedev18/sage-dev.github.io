const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');
const { wrap } = require('../helpers');

const router = express.Router();
router.use(requireAuth);

router.get(
  '/',
  wrap((req, res) => {
    const uid = req.user.sub;

    const user = db
      .prepare('SELECT daily_goal_min, setup_skipped FROM users WHERE id = ?')
      .get(uid);

    const todayFocus = db
      .prepare(
        `SELECT COALESCE(SUM(duration_min), 0) AS minutes
           FROM sessions
          WHERE user_id = ? AND mode = 'focus' AND date(started_at) = date('now')`
      )
      .get(uid).minutes;

    const weekFocus = db
      .prepare(
        `SELECT COALESCE(SUM(duration_min), 0) AS minutes
           FROM sessions
          WHERE user_id = ? AND mode = 'focus' AND started_at >= datetime('now', '-6 days', 'start of day')`
      )
      .get(uid).minutes;

    // Last 7 days as separate rows so missing days show as 0 instead of vanishing.
    const dailyRows = db
      .prepare(
        `SELECT date(started_at) AS day,
                COALESCE(SUM(duration_min), 0) AS minutes
           FROM sessions
          WHERE user_id = ? AND mode = 'focus'
            AND started_at >= datetime('now', '-6 days', 'start of day')
          GROUP BY day`
      )
      .all(uid);

    const byDay = Object.fromEntries(dailyRows.map((r) => [r.day, r.minutes]));

    const dailySeries = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      dailySeries.push({ day: key, minutes: byDay[key] || 0 });
    }

    // A day counts toward the streak when the user logs any session on it.
    const activeDays = db
      .prepare(
        `SELECT DISTINCT date(started_at) AS day
           FROM sessions
          WHERE user_id = ?
          ORDER BY day DESC
          LIMIT 400`
      )
      .all(uid)
      .map((r) => r.day);

    const activeSet = new Set(activeDays);

    // Count back from today. If today has no session yet, start at yesterday
    // so an in-progress day does not break yesterday's streak.
    const dayKey = (d) => d.toISOString().slice(0, 10);
    const cursor = new Date();
    if (!activeSet.has(dayKey(cursor))) {
      cursor.setDate(cursor.getDate() - 1);
    }

    let streak = 0;
    while (activeSet.has(dayKey(cursor))) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }

    const bySubject = db
      .prepare(
        `SELECT s.id, s.name, s.color,
                COALESCE(SUM(se.duration_min), 0) AS minutes
           FROM subjects s
           LEFT JOIN sessions se ON se.subject_id = s.id AND se.mode = 'focus'
          WHERE s.user_id = ?
          GROUP BY s.id
          HAVING minutes > 0
          ORDER BY minutes DESC`
      )
      .all(uid);

    const tasks = db
      .prepare(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) AS done,
                SUM(CASE WHEN completed = 0 AND due_date IS NOT NULL AND due_date < date('now') THEN 1 ELSE 0 END) AS overdue
           FROM tasks WHERE user_id = ?`
      )
      .get(uid);

    const dueSoon = db
      .prepare(
        `SELECT t.*, s.name AS subject_name, s.color AS subject_color
           FROM tasks t
           LEFT JOIN subjects s ON s.id = t.subject_id
          WHERE t.user_id = ? AND t.completed = 0
            AND t.due_date IS NOT NULL AND t.due_date <= date('now', '+3 days')
          ORDER BY t.due_date ASC
          LIMIT 8`
      )
      .all(uid);

    const cards = db
      .prepare(
        `SELECT COUNT(*) AS total,
                COALESCE(SUM(cp.known), 0) AS known
           FROM cards c
           LEFT JOIN card_progress cp ON cp.card_id = c.id AND cp.user_id = c.user_id
          WHERE c.user_id = ?`
      )
      .get(uid);

    const syllabus = db
      .prepare(
        `SELECT COUNT(*) AS total, COALESCE(SUM(done), 0) AS done
           FROM syllabus WHERE user_id = ?`
      )
      .get(uid);

    const nextExam = db
      .prepare(
        `SELECT e.*, s.name AS subject_name, s.color AS subject_color,
                CAST(julianday(e.exam_date) - julianday('now') AS INTEGER) AS days_left
           FROM exams e
           LEFT JOIN subjects s ON s.id = e.subject_id
          WHERE e.user_id = ? AND e.exam_date >= date('now')
          ORDER BY e.exam_date ASC
          LIMIT 1`
      )
      .get(uid);

    const subjectCount = db
      .prepare('SELECT COUNT(*) AS n FROM subjects WHERE user_id = ?')
      .get(uid).n;

    const noteCount = db.prepare('SELECT COUNT(*) AS n FROM notes WHERE user_id = ?').get(uid).n;

    // A brand new account has nothing in it. The dashboard uses this to show a
    // getting started card instead of a wall of zeroes.
    const isNewAccount =
      subjectCount === 0 &&
      (tasks.total || 0) === 0 &&
      (cards.total || 0) === 0 &&
      noteCount === 0 &&
      (syllabus.total || 0) === 0 &&
      !nextExam;

    /* Lifetime totals. These never go down, so they answer "what have I actually
       done so far" in a way the seven day chart cannot. */
    const lifetime = {
      focusMin: db
        .prepare(`SELECT COALESCE(SUM(duration_min), 0) AS n FROM sessions WHERE user_id = ? AND mode = 'focus'`)
        .get(uid).n,
      sessions: db.prepare(`SELECT COUNT(*) AS n FROM sessions WHERE user_id = ? AND mode = 'focus'`).get(uid).n,
      tasksDone: db.prepare(`SELECT COUNT(*) AS n FROM tasks WHERE user_id = ? AND completed = 1`).get(uid).n,
      notes: noteCount,
      cardsReviewed: db
        .prepare(
          `SELECT COALESCE(SUM(cp.seen_count), 0) AS n
             FROM cards c
             LEFT JOIN card_progress cp ON cp.card_id = c.id AND cp.user_id = c.user_id
            WHERE c.user_id = ?`
        )
        .get(uid).n,
      decks: db.prepare(`SELECT COUNT(*) AS n FROM decks WHERE user_id = ?`).get(uid).n,
      exams: db.prepare(`SELECT COUNT(*) AS n FROM exams WHERE user_id = ?`).get(uid).n,
      syllabusDone: syllabus.done || 0,
      subjects: subjectCount,
      quizzes: db.prepare(`SELECT COUNT(*) AS n FROM quiz_attempts WHERE user_id = ?`).get(uid).n,
      quizBest: db
        .prepare(`SELECT COALESCE(MAX(score_pct), 0) AS pct FROM quiz_attempts WHERE user_id = ?`)
        .get(uid).pct,
      activeDays: db
        .prepare(`SELECT COUNT(DISTINCT date(started_at)) AS n FROM sessions WHERE user_id = ? AND mode = 'focus'`)
        .get(uid).n,
      bestStreak: db
        .prepare(
          `WITH days AS (
             SELECT DISTINCT date(started_at) AS day
               FROM sessions WHERE user_id = ? AND mode = 'focus'
           ),
           gaps AS (
             SELECT day, julianday(day) - julianday(LAG(day) OVER (ORDER BY day)) AS gap
               FROM days
           )
           SELECT COALESCE(MAX(run), 0) AS best FROM (
             SELECT SUM(CASE WHEN gap = 1 THEN 0 ELSE 1 END) OVER (ORDER BY day) AS run FROM gaps
           )`
        )
        .get(uid).best,
    };

    res.json({
      dailyGoalMin: user ? user.daily_goal_min : 120,
      todayFocusMin: todayFocus,
      weekFocusMin: weekFocus,
      streak,
      dailySeries,
      bySubject,
      isNewAccount,
      setupSkipped: user ? Boolean(user.setup_skipped) : false,
      lifetime,
      counts: { subjects: subjectCount, tasks: tasks.total || 0, notes: noteCount, cards: cards.total || 0 },
      tasks: {
        total: tasks.total || 0,
        done: tasks.done || 0,
        open: (tasks.total || 0) - (tasks.done || 0),
        overdue: tasks.overdue || 0,
      },
      dueSoon,
      cards: { total: cards.total || 0, known: cards.known || 0 },
      syllabus: { total: syllabus.total || 0, done: syllabus.done || 0 },
      nextExam: nextExam || null,
    });
  })
);

module.exports = router;