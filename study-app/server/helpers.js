const PRIORITIES = ['low', 'medium', 'high'];

function str(value, maxLength = 200) {
  if (value === null || value === undefined) return '';
  return String(value).trim().slice(0, maxLength);
}

function required(value, field, maxLength = 200) {
  const cleaned = str(value, maxLength);
  if (!cleaned) {
    const err = new Error(`${field} is required.`);
    err.status = 400;
    throw err;
  }
  return cleaned;
}

/**
 * Reads a whole number and clamps it. The bounds are optional so callers can
 * ask for a plain positive integer, e.g. int(req.params.id, 0, 1).
 */
function int(value, fallback, min = -Infinity, max = Infinity) {
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function bool(value) {
  return value === true || value === 1 || value === '1' || value === 'true' ? 1 : 0;
}

/** Accepts YYYY-MM-DD only. Returns null when blank or malformed. */
function isoDate(value) {
  const cleaned = str(value, 10);
  if (!cleaned) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return null;
  const d = new Date(`${cleaned}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return cleaned;
}

function isoDateTime(value) {
  const cleaned = str(value, 40);
  if (!cleaned) return null;
  const d = new Date(cleaned);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

function priority(value) {
  const cleaned = str(value, 10).toLowerCase();
  return PRIORITIES.includes(cleaned) ? cleaned : 'medium';
}

function hexColor(value) {
  const cleaned = str(value, 9);
  return /^#[0-9a-fA-F]{6}$/.test(cleaned) ? cleaned.toLowerCase() : '#2f6df6';
}

/** Express error handler. Keep last. */
function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  const status = err.status || 500;
  if (status >= 500) console.error(err);

  res.status(status).json({
    error: status >= 500 ? 'Something went wrong on the server.' : err.message,
  });
}

function notFound(req, res) {
  res.status(404).json({ error: 'That endpoint does not exist.' });
}

/** Wraps async handlers so thrown errors reach the error handler. */
function wrap(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

module.exports = {
  str,
  required,
  int,
  bool,
  isoDate,
  isoDateTime,
  priority,
  hexColor,
  errorHandler,
  notFound,
  wrap,
};