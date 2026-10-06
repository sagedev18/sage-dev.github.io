const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Uses Node's built-in SQLite (node:sqlite), so there is nothing to compile
// and no native dependency to install.
const db = new DatabaseSync(path.join(dataDir, 'studyflow.db'));

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    name           TEXT    NOT NULL,
    email          TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    password_hash  TEXT    NOT NULL,
    daily_goal_min INTEGER NOT NULL DEFAULT 120,
    created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS subjects (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT    NOT NULL,
    color      TEXT    NOT NULL DEFAULT '#2f6df6',
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject_id   INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
    title        TEXT    NOT NULL,
    notes        TEXT    NOT NULL DEFAULT '',
    due_date     TEXT,
    priority     TEXT    NOT NULL DEFAULT 'medium',
    completed    INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS notes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
    title      TEXT    NOT NULL DEFAULT '',
    body       TEXT    NOT NULL DEFAULT '',
    updated_at TEXT    NOT NULL DEFAULT (datetime('now')),
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject_id   INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
    started_at   TEXT    NOT NULL,
    duration_min INTEGER NOT NULL,
    mode         TEXT    NOT NULL DEFAULT 'focus',
    finished     INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS decks (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
    name       TEXT    NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS cards (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    deck_id    INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    front      TEXT    NOT NULL,
    back       TEXT    NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS exams (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
    name       TEXT    NOT NULL,
    exam_date  TEXT    NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS syllabus (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject_id INTEGER REFERENCES subjects(id) ON DELETE CASCADE,
    topic      TEXT    NOT NULL,
    done       INTEGER NOT NULL DEFAULT 0,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS card_progress (
    card_id    INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    seen_count INTEGER NOT NULL DEFAULT 0,
    known      INTEGER NOT NULL DEFAULT 0,
    last_seen  TEXT,
    PRIMARY KEY (card_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS payments (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount           INTEGER NOT NULL,
    reference        TEXT    NOT NULL,
    payer_name       TEXT    NOT NULL DEFAULT '',
    bank             TEXT    NOT NULL DEFAULT '',
    note             TEXT    NOT NULL DEFAULT '',
    status           TEXT    NOT NULL DEFAULT 'pending',
    reviewed_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at      TEXT,
    review_note      TEXT    NOT NULL DEFAULT '',
    created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS quiz_questions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject_id    INTEGER REFERENCES subjects(id) ON DELETE CASCADE,
    question      TEXT    NOT NULL,
    correct_answer TEXT   NOT NULL,
    wrong_a       TEXT    NOT NULL DEFAULT '',
    wrong_b       TEXT    NOT NULL DEFAULT '',
    wrong_c       TEXT    NOT NULL DEFAULT '',
    explanation   TEXT    NOT NULL DEFAULT '',
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS quiz_attempts (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject_id   INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
    total        INTEGER NOT NULL DEFAULT 0,
    correct      INTEGER NOT NULL DEFAULT 0,
    score_pct    INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS quiz_answers (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    attempt_id    INTEGER NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
    question_id   INTEGER NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
    picked        TEXT    NOT NULL DEFAULT '',
    correct       INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS topic_progress (
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject_id   INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    unlocked     INTEGER NOT NULL DEFAULT 1,
    best_score   INTEGER NOT NULL DEFAULT 0,
    attempts     INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT,
    PRIMARY KEY (user_id, subject_id)
  );

  CREATE TABLE IF NOT EXISTS assistant_threads (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role       TEXT    NOT NULL,
    content    TEXT    NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS reset_tokens (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT    NOT NULL UNIQUE,
    expires_at TEXT    NOT NULL,
    used       INTEGER NOT NULL DEFAULT 0,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS app_settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS admin_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action     TEXT    NOT NULL,
    detail     TEXT    NOT NULL DEFAULT '',
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  /* Entering the admin console needs a code as well as the is_admin flag, so a
     stolen login alone is not enough. Codes are single use and are logged. */
  CREATE TABLE IF NOT EXISTS admin_codes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    code       TEXT    NOT NULL UNIQUE,
    label      TEXT    NOT NULL DEFAULT '',
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT,
    used_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    used_at    TEXT,
    revoked    INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS sessions_auth (
    user_id      INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    last_seen_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_subjects_user ON subjects(user_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_user    ON tasks(user_id, completed);
  CREATE INDEX IF NOT EXISTS idx_notes_user    ON notes(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id, started_at);
  CREATE INDEX IF NOT EXISTS idx_cards_user    ON cards(user_id);
  CREATE INDEX IF NOT EXISTS idx_decks_user    ON decks(user_id);
  CREATE INDEX IF NOT EXISTS idx_exams_user    ON exams(user_id, exam_date);
  CREATE INDEX IF NOT EXISTS idx_syllabus_user ON syllabus(user_id, subject_id);
  CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id, status);
  CREATE INDEX IF NOT EXISTS idx_payments_stat ON payments(status, created_at);
  CREATE INDEX IF NOT EXISTS idx_quizq_user    ON quiz_questions(user_id, subject_id);
  CREATE INDEX IF NOT EXISTS idx_quiza_user   ON quiz_attempts(user_id);
  CREATE INDEX IF NOT EXISTS idx_thread_user   ON assistant_threads(user_id);
  CREATE INDEX IF NOT EXISTS idx_codes_used    ON admin_codes(used_by);
`);

/**
 * Adds a column to an existing table if it is not already there.
 * Lets the app upgrade a database created by an older version.
 */
function ensureColumn(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (cols.some((c) => c.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

ensureColumn('users', 'is_premium', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('users', 'is_admin', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('users', 'premium_at', 'TEXT');
ensureColumn('users', 'premium_ref', "TEXT NOT NULL DEFAULT ''");
ensureColumn('users', 'avatar', "TEXT NOT NULL DEFAULT ''");
ensureColumn('users', 'setup_skipped', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('syllabus', 'position', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('syllabus', 'unlocked', 'INTEGER NOT NULL DEFAULT 1');

module.exports = db;