const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('./db');

const ROUNDS = 12;

function getSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;

  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set in production. See .env.example.');
  }

  // Development fallback. Tokens reset whenever the server restarts,
  // which is fine locally but must never happen in production.
  return crypto.randomBytes(32).toString('hex');
}

const SECRET = getSecret();

function hashPassword(plain) {
  return bcrypt.hashSync(plain, ROUNDS);
}

function verifyPassword(plain, hash) {
  return bcrypt.compareSync(plain, hash);
}

function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      name: user.name,
      isAdmin: Boolean(user.is_admin),
      isPremium: Boolean(user.is_premium),
    },
    SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

function isAdminEmail(email) {
  const list = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(String(email || '').toLowerCase());
}

/** Loads the live user row and keeps it on req.user. */
function loadUser(req) {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.sub);
  if (!row) return null;

  db.prepare(
    `INSERT INTO sessions_auth (user_id, last_seen_at) VALUES (?, datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET last_seen_at = datetime('now')`
  ).run(row.id);

  req.dbUser = row;
  return row;
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;

  if (!token) {
    return res.status(401).json({ error: 'You need to be logged in to do that.' });
  }

  let payload;
  try {
    payload = jwt.verify(token, SECRET);
  } catch (err) {
    const message =
      err.name === 'TokenExpiredError'
        ? 'Your login has expired. Please log in again.'
        : 'Your login is not valid. Please log in again.';
    return res.status(401).json({ error: message });
  }

  req.user = payload;

  // The token carries flags, but the database is the source of truth. If an
  // admin revokes premium, the change takes effect on the next request rather
  // than when the old token happens to expire.
  if (!loadUser(req)) {
    return res.status(401).json({ error: 'That account no longer exists.' });
  }

  next();
}

function requireAdmin(req, res, next) {
  if (!req.dbUser || !req.dbUser.is_admin) {
    return res.status(403).json({ error: 'That area is for administrators only.' });
  }
  next();
}

/* ---------------- Admin code gate ----------------
   Holding an admin account is not enough on its own. The console also wants a
   one-time code, redeemed for a signed cookie. Both halves are checked on every
   admin request, so neither half is worth stealing on its own. */

const ADMIN_PASS_COOKIE = 'sf_admin_pass';
const ADMIN_PASS_DAYS = 7;

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const at = part.indexOf('=');
    if (at === -1) continue;
    out[part.slice(0, at).trim()] = decodeURIComponent(part.slice(at + 1).trim());
  }
  return out;
}

/** Signs the short proof that a code was redeemed on this browser. */
function signAdminPass(user) {
  return jwt.sign({ sub: user.id, purpose: 'admin-gate' }, SECRET, {
    expiresIn: `${ADMIN_PASS_DAYS}d`,
  });
}

function setAdminPassCookie(res, value) {
  res.cookie(ADMIN_PASS_COOKIE, value, {
    httpOnly: true,
    sameSite: 'strict',
    maxAge: ADMIN_PASS_DAYS * 24 * 60 * 60 * 1000,
    secure: process.env.NODE_ENV === 'production',
  });
}

function clearAdminPassCookie(res) {
  res.clearCookie(ADMIN_PASS_COOKIE);
}

/** True when this browser has already redeemed a valid code for this account. */
function hasAdminPass(req) {
  const token = parseCookies(req.headers.cookie)[ADMIN_PASS_COOKIE];
  if (!token) return false;

  try {
    const payload = jwt.verify(token, SECRET);
    return payload.purpose === 'admin-gate' && Number(payload.sub) === Number(req.user.sub);
  } catch (err) {
    return false;
  }
}

/** Blocks the console until a code has been redeemed. Use after requireAdmin. */
function requireAdminGate(req, res, next) {
  if (hasAdminPass(req)) return next();

  res.status(403).json({
    error: 'Enter an admin code to open the console.',
    code: 'ADMIN_CODE_REQUIRED',
  });
}

/**
 * Blocks premium features. Always used on the server so a locked feature
 * cannot be reached by editing the page or calling the API directly.
 */
function requirePremium(req, res, next) {
  if (req.dbUser && req.dbUser.is_premium) return next();

  res.status(403).json({
    error: 'This is a premium feature.',
    code: 'PREMIUM_REQUIRED',
    upgrade: true,
  });
}

module.exports = {
  hashPassword,
  verifyPassword,
  signToken,
  requireAuth,
  requireAdmin,
  requireAdminGate,
  hasAdminPass,
  signAdminPass,
  setAdminPassCookie,
  clearAdminPassCookie,
  requirePremium,
  isAdminEmail,
};