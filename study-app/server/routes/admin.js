const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const {
  requireAuth,
  requireAdmin,
  requireAdminGate,
  hasAdminPass,
  signAdminPass,
  setAdminPassCookie,
  clearAdminPassCookie,
} = require('../auth');
const { required, str, int, wrap } = require('../helpers');
const { currentSettings, PRICE } = require('./payments');
const mailer = require('../mailer');

const router = express.Router();

// requireAuth runs first so every admin request is a logged-in user, then
// requireAdmin narrows it to accounts with is_admin set.
router.use(requireAuth, requireAdmin);

function log(adminId, action, detail) {
  db.prepare('INSERT INTO admin_log (admin_id, action, detail) VALUES (?, ?, ?)').run(adminId, action, detail);
}

/* ---------------- Code gate ----------------
   These sit before the gate on purpose: they are how someone gets through it. */

router.get(
  '/access',
  wrap((req, res) => {
    res.json({
      unlocked: hasAdminPass(req),
      isAdmin: true,
      codesLeft: db
        .prepare(
          `SELECT COUNT(*) AS n FROM admin_codes
            WHERE revoked = 0 AND used_by IS NULL
              AND (expires_at IS NULL OR expires_at > datetime('now'))`
        )
        .get().n,
    });
  })
);

router.post(
  '/access',
  wrap((req, res) => {
    const code = required(req.body.code, 'Admin code', 40).toUpperCase();

    const row = db
      .prepare(
        `SELECT * FROM admin_codes
          WHERE code = ? AND revoked = 0 AND used_by IS NULL
            AND (expires_at IS NULL OR expires_at > datetime('now'))`
      )
      .get(code);

    if (!row) {
      log(req.user.sub, 'admin_code_fail', `tried "${code}"`);
      return res.status(400).json({ error: 'That code is not valid, has been used, or has expired.' });
    }

    // Single use: redeeming it burns the code.
    db.prepare('UPDATE admin_codes SET used_by = ?, used_at = datetime(\'now\') WHERE id = ?').run(
      req.user.sub,
      row.id
    );

    setAdminPassCookie(res, signAdminPass(req.dbUser));
    log(req.user.sub, 'admin_unlock', `code ${row.label || row.id} redeemed`);

    res.json({ ok: true, label: row.label });
  })
);

router.delete(
  '/access',
  wrap((req, res) => {
    clearAdminPassCookie(res);
    res.json({ ok: true });
  })
);

/* ---------------- Issuing codes ---------------- */

function makeCode() {
  // Ambiguous characters are left out so a code read aloud still works.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(8);
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return `SF-${out.slice(0, 4)}-${out.slice(4)}`;
}

router.get(
  '/codes',
  requireAdminGate,
  wrap((req, res) => {
    const codes = db
      .prepare(
        `SELECT c.*, u.email AS used_by_email
           FROM admin_codes c
           LEFT JOIN users u ON u.id = c.used_by
          ORDER BY c.id DESC LIMIT 200`
      )
      .all();

    res.json({
      codes,
      unused: codes.filter(
        (c) => !c.used_by && !c.revoked && (!c.expires_at || c.expires_at > new Date().toISOString().slice(0, 19).replace('T', ' '))
      ).length,
    });
  })
);

router.post(
  '/codes',
  requireAdminGate,
  wrap((req, res) => {
    const count = Math.min(25, Math.max(1, Number.parseInt(req.body.count, 10) || 5));
    const label = str(req.body.label, 80);
    const days = Number.parseInt(req.body.days, 10) || 0;
    const expiresAt = days > 0
      ? new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 19).replace('T', ' ')
      : null;

    const insert = db.prepare(
      'INSERT INTO admin_codes (code, label, created_by, expires_at) VALUES (?, ?, ?, ?)'
    );

    const made = [];
    for (let i = 0; i < count; i++) {
      let code = makeCode();
      // Collisions are vanishingly unlikely, but a retry costs nothing.
      while (db.prepare('SELECT id FROM admin_codes WHERE code = ?').get(code)) code = makeCode();
      insert.run(code, label, req.user.sub, expiresAt);
      made.push(code);
    }

    log(req.user.sub, 'create_codes', `${count} code(s)${label ? ` "${label}"` : ''}`);

    res.status(201).json({
      codes: made,
      message: `${count} code${count === 1 ? '' : 's'} created. Copy them now, they are not shown in full again.`,
    });
  })
);

router.delete(
  '/codes/:id',
  requireAdminGate,
  wrap((req, res) => {
    const id = int(req.params.id, 0, 1);
    const info = db.prepare('UPDATE admin_codes SET revoked = 1 WHERE id = ?').run(id);
    if (info.changes === 0) return res.status(404).json({ error: 'Code not found.' });

    log(req.user.sub, 'revoke_code', `code ${id}`);
    res.json({ ok: true });
  })
);

// Everything past this point needs a redeemed code as well as an admin account.
router.use(requireAdminGate);

/* ---------------- Overview ---------------- */

router.get(
  '/overview',
  wrap((req, res) => {
    const totals = db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM users)                                        AS users,
           (SELECT COUNT(*) FROM users WHERE is_premium = 1)                  AS premium,
           (SELECT COUNT(*) FROM payments WHERE status = 'pending')            AS pending,
           (SELECT COUNT(*) FROM payments WHERE status = 'verified')          AS verified,
           (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE status = 'verified') AS revenue,
           (SELECT COUNT(*) FROM users WHERE date(created_at) = date('now'))   AS today,
           (SELECT COUNT(*) FROM sessions_auth WHERE last_seen_at >= datetime('now','-1 day')) AS active_today,
           (SELECT COUNT(*) FROM sessions_auth)                               AS ever_logged_in`
      )
      .get();

    const revenueByDay = db
      .prepare(
        `SELECT date(created_at) AS day, COUNT(*) AS payments, COALESCE(SUM(amount),0) AS amount
           FROM payments WHERE status = 'verified'
          GROUP BY day ORDER BY day DESC LIMIT 14`
      )
      .all()
      .reverse();

    const recentUsers = db
      .prepare(
        `SELECT u.id, u.name, u.email, u.is_premium, u.is_admin, u.created_at, s.last_seen_at,
                (SELECT COUNT(*) FROM subjects sb WHERE sb.user_id = u.id) AS subjects,
                (SELECT COALESCE(SUM(duration_min),0) FROM sessions se WHERE se.user_id = u.id) AS focus_min
           FROM users u
           LEFT JOIN sessions_auth s ON s.user_id = u.id
          ORDER BY u.id DESC LIMIT 12`
      )
      .all();

    const topSubjects = db
      .prepare(
        `SELECT sb.name, COUNT(*) AS users FROM subjects sb GROUP BY lower(sb.name) ORDER BY users DESC LIMIT 8`
      )
      .all();

    const log = db.prepare('SELECT * FROM admin_log ORDER BY id DESC LIMIT 25').all();

    res.json({
      totals: {
        users: totals.users,
        premium: totals.premium,
        free: totals.users - totals.premium,
        pending: totals.pending,
        verified: totals.verified,
        revenue: totals.revenue,
        newToday: totals.today,
        activeToday: totals.active_today,
        everLoggedIn: totals.ever_logged_in,
      },
      conversion: totals.users ? Math.round((totals.premium / totals.users) * 100) : 0,
      revenueByDay,
      recentUsers,
      topSubjects,
      log,
      settings: currentSettings(),
      emailConfigured: mailer.configured(),
      aiConfigured: Boolean(process.env.AI_API_KEY && process.env.AI_PROVIDER),
    });
  })
);

/* ---------------- Users ---------------- */

router.get(
  '/users',
  wrap((req, res) => {
    const q = str(req.query.q, 120);
    const filter = req.query.filter === 'premium' ? 'premium' : req.query.filter === 'admin' ? 'admin' : 'all';

    let sql = `SELECT u.id, u.name, u.email, u.is_premium, u.is_admin, u.premium_at, u.premium_ref,
                      u.created_at, s.last_seen_at,
                      (SELECT COUNT(*) FROM subjects sb WHERE sb.user_id = u.id) AS subjects,
                      (SELECT COALESCE(SUM(duration_min),0) FROM sessions se WHERE se.user_id = u.id) AS focus_min
                 FROM users u
                 LEFT JOIN sessions_auth s ON s.user_id = u.id
                WHERE 1 = 1`;
    const params = [];

    if (q) {
      sql += ' AND (u.name LIKE ? OR u.email LIKE ?)';
      params.push(`%${q}%`, `%${q}%`);
    }
    if (filter === 'premium') sql += ' AND u.is_premium = 1';
    if (filter === 'admin') sql += ' AND u.is_admin = 1';

    sql += ' ORDER BY u.id DESC LIMIT 200';

    res.json({ users: db.prepare(sql).all(...params) });
  })
);

router.post(
  '/users/:id/premium',
  wrap((req, res) => {
    const id = int(req.params.id, 0, 1);
    const grant = req.body.grant !== false;
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    // An admin must not be able to lock themselves out of the admin area.
    if (user.id === req.user.sub && !grant) {
      return res.status(400).json({ error: 'You cannot remove your own admin access.' });
    }

    db.prepare(
      `UPDATE users SET is_premium = ?, premium_at = ?, premium_ref = ? WHERE id = ?`
    ).run(
      grant ? 1 : 0,
      grant ? new Date().toISOString().replace('T', ' ').slice(0, 19) : null,
      grant ? str(req.body.reference, 80) : '',
      id
    );

    log(req.user.sub, grant ? 'grant_premium' : 'revoke_premium', `user ${id} (${user.email})`);

    res.json({ user: db.prepare('SELECT * FROM users WHERE id = ?').get(id) });
  })
);

router.post(
  '/users/:id/admin',
  wrap((req, res) => {
    const id = int(req.params.id, 0, 1);
    const make = req.body.make !== false;
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    if (user.id === req.user.sub && !make) {
      return res.status(400).json({ error: 'You cannot remove your own admin access.' });
    }

    db.prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(make ? 1 : 0, id);
    log(req.user.sub, make ? 'grant_admin' : 'revoke_admin', `user ${id} (${user.email})`);

    res.json({ user: db.prepare('SELECT * FROM users WHERE id = ?').get(id) });
  })
);

router.delete(
  '/users/:id',
  wrap((req, res) => {
    const id = int(req.params.id, 0, 1);
    if (id === req.user.sub) return res.status(400).json({ error: 'You cannot delete your own account here.' });

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    log(req.user.sub, 'delete_user', `user ${id} (${user.email})`);

    res.json({ ok: true });
  })
);

/* ---------------- Payments ---------------- */

router.get(
  '/payments',
  wrap((req, res) => {
    const status = ['pending', 'verified', 'rejected'].includes(req.query.status)
      ? req.query.status
      : 'pending';

    const payments = db
      .prepare(
        `SELECT p.*, u.name AS user_name, u.email AS user_email, u.is_premium
           FROM payments p JOIN users u ON u.id = p.user_id
          WHERE p.status = ?
          ORDER BY p.created_at ASC, p.id ASC`
      )
      .all(status);

    res.json({ payments, status });
  })
);

router.post(
  '/payments/:id/decide',
  wrap(async (req, res) => {
    const id = int(req.params.id, 0, 1);
    const approve = req.body.approve === true;
    const note = str(req.body.note, 300);

    const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(id);
    if (!payment) return res.status(404).json({ error: 'Payment not found.' });
    if (payment.status !== 'pending') {
      return res.status(400).json({ error: `That payment was already ${payment.status}.` });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payment.user_id);

    if (approve) {
      db.prepare(
        `UPDATE payments SET status = 'verified', reviewed_by = ?, reviewed_at = datetime('now'), review_note = ?
          WHERE id = ?`
      ).run(req.user.sub, note, id);

      // This is the moment the account actually unlocks premium.
      db.prepare(
        `UPDATE users SET is_premium = 1, premium_at = datetime('now'), premium_ref = ? WHERE id = ?`
      ).run(payment.reference, payment.user_id);

      log(req.user.sub, 'verify_payment', `payment ${id} from ${user.email}`);

      await mailer
        .send({
          to: user.email,
          subject: 'Your StudyFlow premium is active',
          html: mailer.layout(
            'Premium activated',
            `<p>Hi ${user.name},</p>
             <p>Thanks, we have verified your payment of <strong>&#8358;${payment.amount.toLocaleString()}</strong> (reference <code>${payment.reference}</code>).</p>
             <p>Your premium features are now unlocked:</p>
             <ul>
               <li>AI study assistant</li>
               <li>Quizzes with topic progression</li>
               <li>Full data export</li>
             </ul>
             <p>Log in and you will see everything open.</p>`
          ),
        })
        .catch((err) => console.error('Verification email failed:', err.message));
    } else {
      db.prepare(
        `UPDATE payments SET status = 'rejected', reviewed_by = ?, reviewed_at = datetime('now'), review_note = ?
          WHERE id = ?`
      ).run(req.user.sub, note, id);

      log(req.user.sub, 'reject_payment', `payment ${id} from ${user.email}`);

      await mailer
        .send({
          to: user.email,
          subject: 'We could not verify your StudyFlow payment',
          html: mailer.layout(
            'Payment not verified',
            `<p>Hi ${user.name},</p>
             <p>We were unable to verify your payment of <strong>&#8358;${payment.amount.toLocaleString()}</strong> (reference <code>${payment.reference}</code>).</p>
             ${note ? `<p><strong>Reason given:</strong> ${note}</p>` : ''}
             <p>Check the reference and amount, then submit it again from the upgrade page.</p>`
          ),
        })
        .catch((err) => console.error('Rejection email failed:', err.message));
    }

    res.json({
      payment: db.prepare('SELECT * FROM payments WHERE id = ?').get(id),
      user: db.prepare('SELECT id, name, email, is_premium, premium_ref FROM users WHERE id = ?').get(payment.user_id),
    });
  })
);

/* ---------------- Settings ---------------- */

const EDITABLE = [
  'price_charged',
  'price_listed',
  'payment_details',
  'bank_name',
  'account_name',
  'account_number',
  'support_email',
  'premium_enabled',
];

router.post(
  '/settings',
  wrap((req, res) => {
    const write = db.prepare(
      `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
    );

    for (const key of EDITABLE) {
      if (req.body[key] === undefined) continue;
      let value;

      if (key === 'price_charged' || key === 'price_listed') {
        const n = int(req.body[key], 0, 0, 10_000_000);
        if (n <= 0) return res.status(400).json({ error: 'Prices must be greater than zero.' });
        value = String(n);
      } else if (key === 'premium_enabled') {
        value = req.body[key] === false || req.body[key] === '0' ? '0' : '1';
      } else {
        value = str(req.body[key], 1000);
      }

      write.run(key, value);
    }

    const charged = Number(currentSettings().priceCharged);
    const listed = Number(currentSettings().priceListed);
    if (charged > listed) {
      return res.status(400).json({ error: 'The price charged cannot be higher than the listed price.' });
    }

    log(req.user.sub, 'update_settings', EDITABLE.filter((k) => req.body[k] !== undefined).join(', '));
    res.json({ settings: currentSettings() });
  })
);

/* ---------------- Weekly report ---------------- */

router.post(
  '/report/:userId',
  wrap(async (req, res) => {
    const id = int(req.params.userId, 0, 1);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const stats = db
      .prepare(
        `SELECT COALESCE(SUM(duration_min),0) AS minutes, COUNT(*) AS sessions
           FROM sessions WHERE user_id = ? AND started_at >= datetime('now','-7 days')`
      )
      .get(id);

    const tasks = db
      .prepare(
        `SELECT COUNT(*) AS total, SUM(CASE WHEN completed=1 THEN 1 ELSE 0 END) AS done
           FROM tasks WHERE user_id = ? AND created_at >= datetime('now','-7 days')`
      )
      .get(id);

    const result = await mailer.send({
      to: user.email,
      subject: 'Your StudyFlow week in review',
      html: mailer.layout(
        'Your week in review',
        `<p>Hi ${user.name},</p>
         <p>Here is how your last seven days went.</p>
         <ul>
           <li><strong>${stats.minutes}</strong> minutes of focus time across <strong>${stats.sessions}</strong> sessions</li>
           <li><strong>${tasks.done || 0}</strong> of <strong>${tasks.total}</strong> tasks completed</li>
         </ul>
         <p>Keep the streak alive and carry on.</p>`
      ),
    });

    log(req.user.sub, 'send_report', `user ${id}`);

    res.json({
      ok: true,
      delivered: result.delivered,
      message: result.delivered
        ? `Report sent to ${user.email}.`
        : 'No email provider is configured, so the report was only logged to the server console.',
      stats: { ...stats, tasksDone: tasks.done || 0, tasksTotal: tasks.total || 0 },
    });
  })
);

module.exports = router;