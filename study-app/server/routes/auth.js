const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { hashPassword, verifyPassword, signToken, requireAuth, isAdminEmail } = require('../auth');
const { required, str, wrap } = require('../helpers');
const mailer = require('../mailer');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESET_TTL_MINUTES = 30;

function publicUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    avatar: row.avatar || '',
    dailyGoalMin: row.daily_goal_min,
    setupSkipped: Boolean(row.setup_skipped),
    isPremium: Boolean(row.is_premium),
    isAdmin: Boolean(row.is_admin),
    createdAt: row.created_at,
  };
}

/* The avatar library. Pictures are emoji drawn on a colour pair, so there is no
   file to upload, nothing to host, and it works with no connection. */
const AVATARS = [
  { id: 'aurora', emoji: '🦊', from: '#FF8A5B', to: '#E9448B' },
  { id: 'ocean', emoji: '🐬', from: '#38BDF8', to: '#4C3AE3' },
  { id: 'forest', emoji: '🦉', from: '#34D399', to: '#0E9F6E' },
  { id: 'sunset', emoji: '🌻', from: '#FBBF24', to: '#F97316' },
  { id: 'berry', emoji: '🍓', from: '#FB7185', to: '#E11D48' },
  { id: 'mint', emoji: '🐢', from: '#5EEAD4', to: '#0D9488' },
  { id: 'grape', emoji: '🦄', from: '#C084FC', to: '#7C3AED' },
  { id: 'sky', emoji: '🐧', from: '#93C5FD', to: '#2563EB' },
  { id: 'ember', emoji: '🦁', from: '#FDBA74', to: '#EA580C' },
  { id: 'lilac', emoji: '🐨', from: '#DDD6FE', to: '#8B5CF6' },
  { id: 'peach', emoji: '🐰', from: '#FBCFE8', to: '#DB2777' },
  { id: 'lime', emoji: '🐸', from: '#BEF264', to: '#4D7C0F' },
  { id: 'slate', emoji: '🐙', from: '#CBD5E1', to: '#475569' },
  { id: 'rose', emoji: '🦄', from: '#FECDD3', to: '#9F1239' },
  { id: 'gold', emoji: '🐝', from: '#FDE68A', to: '#CA8A04' },
  { id: 'teal', emoji: '🐬', from: '#99F6E4', to: '#0F766E' },
  { id: 'indigo', emoji: '🐺', from: '#A5B4FC', to: '#4338CA' },
  { id: 'coral', emoji: '🐠', from: '#FECACA', to: '#DC2626' },
  { id: 'violet', emoji: '🦉', from: '#DDD6FE', to: '#6D28D9' },
  { id: 'aqua', emoji: '🐢', from: '#A5F3FC', to: '#0891B2' },
  { id: 'amber', emoji: '🦊', from: '#FCD34D', to: '#D97706' },
  { id: 'plum', emoji: '🐼', from: '#E9D5FF', to: '#7E22CE' },
  { id: 'jade', emoji: '🐉', from: '#A7F3D0', to: '#047857' },
  { id: 'cocoa', emoji: '🐻', from: '#D6BCF5', to: '#78350F' },
];

router.get('/avatars', (req, res) => res.json({ avatars: AVATARS }));

function validAvatar(value) {
  const id = str(value, 40);
  return AVATARS.some((a) => a.id === id) ? id : '';
}

router.post(
  '/register',
  wrap((req, res) => {
    const name = required(req.body.name, 'Name', 80);
    const email = required(req.body.email, 'Email', 160).toLowerCase();
    const password = required(req.body.password, 'Password', 200);

    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'That does not look like a valid email address.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      return res.status(409).json({ error: 'An account with that email already exists.' });
    }

    const info = db
      .prepare('INSERT INTO users (name, email, password_hash, is_admin) VALUES (?, ?, ?, ?)')
      .run(name, email, hashPassword(password), isAdminEmail(email) ? 1 : 0);

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);

    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  })
);

router.post(
  '/login',
  wrap((req, res) => {
    const email = str(req.body.email, 160).toLowerCase();
    const password = str(req.body.password, 200);

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

    // Compare against a dummy hash when the user does not exist so the
    // response time does not reveal which emails are registered.
    const hash = user ? user.password_hash : '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
    const ok = verifyPassword(password, hash);

    if (!user || !ok) {
      return res.status(401).json({ error: 'Incorrect email or password.' });
    }

    db.prepare(
      `INSERT INTO sessions_auth (user_id, last_seen_at) VALUES (?, datetime('now'))
         ON CONFLICT(user_id) DO UPDATE SET last_seen_at = datetime('now')`
    ).run(user.id);

    res.json({ token: signToken(user), user: publicUser(user) });
  })
);

router.get(
  '/me',
  requireAuth,
  wrap((req, res) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.sub);
    if (!user) return res.status(404).json({ error: 'Account not found.' });
    res.json({ user: publicUser(user) });
  })
);

router.patch(
  '/me',
  requireAuth,
  wrap((req, res) => {
    const current = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.sub);
    if (!current) return res.status(404).json({ error: 'Account not found.' });

    const name = req.body.name !== undefined ? required(req.body.name, 'Name', 80) : current.name;
    const avatar = req.body.avatar !== undefined ? validAvatar(req.body.avatar) : current.avatar;
    const dailyGoalMin =
      req.body.dailyGoalMin !== undefined
        ? Math.min(1440, Math.max(10, Number.parseInt(req.body.dailyGoalMin, 10) || current.daily_goal_min))
        : current.daily_goal_min;

    db.prepare('UPDATE users SET name = ?, daily_goal_min = ?, avatar = ? WHERE id = ?').run(
      name,
      dailyGoalMin,
      avatar,
      current.id
    );

    res.json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(current.id)) });
  })
);

// Hiding the getting-started card is stored on the account, so it follows the
// user to another device instead of resetting with the browser.
router.post(
  '/skip-setup',
  requireAuth,
  wrap((req, res) => {
    const skip = req.body.skip === false ? 0 : 1;
    db.prepare('UPDATE users SET setup_skipped = ? WHERE id = ?').run(skip, req.user.sub);
    res.json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.sub)) });
  })
);

router.post(
  '/change-password',
  requireAuth,
  wrap((req, res) => {
    const current = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.sub);
    if (!current) return res.status(404).json({ error: 'Account not found.' });

    const currentPassword = str(req.body.currentPassword, 200);
    const newPassword = required(req.body.newPassword, 'New password', 200);

    if (!verifyPassword(currentPassword, current.password_hash)) {
      return res.status(401).json({ error: 'Your current password is not correct.' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters.' });
    }

    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(newPassword), current.id);

    // A password change invalidates any outstanding reset links.
    db.prepare('UPDATE reset_tokens SET used = 1 WHERE user_id = ?').run(current.id);

    res.json({ ok: true });
  })
);

/* ---------------- Password reset ---------------- */

router.post(
  '/forgot-password',
  wrap(async (req, res) => {
    const email = str(req.body.email, 160).toLowerCase();
    const generic = {
      message: 'If that email has a StudyFlow account, a reset link is on its way.',
    };

    if (!EMAIL_RE.test(email)) return res.json(generic);

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) return res.json(generic);

    const token = crypto.randomBytes(32).toString('hex');
    const hash = crypto.createHash('sha256').update(token).digest('hex');

    db.prepare('DELETE FROM reset_tokens WHERE user_id = ?').run(user.id);
    db.prepare(
      `INSERT INTO reset_tokens (user_id, token_hash, expires_at)
       VALUES (?, ?, datetime('now', '+${RESET_TTL_MINUTES} minutes'))`
    ).run(user.id, hash);

    const link = `${process.env.APP_URL || 'http://localhost:3000'}/reset.html?token=${token}`;

    await mailer
      .send({
        to: user.email,
        subject: 'Reset your StudyFlow password',
        html: mailer.layout(
          'Reset your password',
          `<p>Hi ${user.name},</p>
           <p>Use the link below to choose a new password. It works once and expires in ${RESET_TTL_MINUTES} minutes.</p>
           <p><a href="${link}" style="display:inline-block;background:#2f6df6;color:#fff;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:500">Choose a new password</a></p>
           <p>If you did not ask to reset your password, ignore this email. Nothing has changed.</p>`
        ),
      })
      .catch((err) => console.error('Reset email failed:', err.message));

    // In development, with no mail provider configured, the token is logged
    // by the mailer. Returning it here would be a real leak in production,
    // so it is only exposed when explicitly told to.
    if (process.env.NODE_ENV !== 'production' && process.env.EXPOSE_RESET_TOKEN === 'true') {
      return res.json({ ...generic, devToken: token });
    }

    res.json(generic);
  })
);

router.post(
  '/reset-password',
  wrap((req, res) => {
    const token = required(req.body.token, 'Reset token', 200);
    const password = required(req.body.password, 'New password', 200);

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    const hash = crypto.createHash('sha256').update(token).digest('hex');

    const row = db
      .prepare(
        `SELECT * FROM reset_tokens
          WHERE token_hash = ? AND used = 0 AND expires_at > datetime('now')`
      )
      .get(hash);

    if (!row) {
      return res.status(400).json({ error: 'That reset link is invalid or has expired.' });
    }

    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), row.user_id);
    db.prepare('UPDATE reset_tokens SET used = 1 WHERE id = ?').run(row.id);

    res.json({ ok: true });
  })
);

module.exports = router;