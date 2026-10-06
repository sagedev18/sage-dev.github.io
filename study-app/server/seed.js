/* Seeds the demo, premium and admin accounts with sample study data.
   Safe to run more than once: anything that already exists is left alone. */
require('dotenv').config();

const db = require('./db');
const { hashPassword } = require('./auth');

const ACCOUNTS = {
  demo: { name: 'Demo Student', email: 'demo@studyflow.app', password: 'demopassword' },
  premium: { name: 'Premium Student', email: 'premium@studyflow.app', password: 'premiumpassword' },
  admin: { name: 'StudyFlow Admin', email: 'admin@studyflow.app', password: 'adminpassword' },
};

const findUser = db.prepare('SELECT id FROM users WHERE email = ?');

/** Builds an admin access code. Ambiguous characters are left out. */
function makeCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = require('crypto').randomBytes(8);
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return `SF-${out.slice(0, 4)}-${out.slice(4)}`;
}

/* ---------------- Accounts ---------------- */

/** Returns the id of an account, creating it when it is not there yet. */
function ensureAccount(key, insert) {
  const account = ACCOUNTS[key];
  const existing = findUser.get(account.email);

  if (existing) {
    console.log(`  ${key.padEnd(8)} already exists  ${account.email}`);
    return existing.id;
  }

  const id = Number(insert(hashPassword(account.password)).lastInsertRowid);
  console.log(`  ${key.padEnd(8)} created         ${account.email}`);
  return id;
}

console.log('Seeding StudyFlow accounts.');

const demoId = ensureAccount('demo', (passwordHash) =>
  db.prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)').run(
    ACCOUNTS.demo.name,
    ACCOUNTS.demo.email,
    passwordHash
  )
);

const premiumId = ensureAccount('premium', (passwordHash) =>
  db
    .prepare(
      `INSERT INTO users (name, email, password_hash, is_premium, premium_at, premium_ref)
       VALUES (?, ?, ?, 1, datetime('now'), 'SEED-0001')`
    )
    .run(ACCOUNTS.premium.name, ACCOUNTS.premium.email, passwordHash)
);

const adminId = ensureAccount('admin', (passwordHash) =>
  db
    .prepare('INSERT INTO users (name, email, password_hash, is_admin) VALUES (?, ?, ?, 1)')
    .run(ACCOUNTS.admin.name, ACCOUNTS.admin.email, passwordHash)
);

// Make sure the roles are set even if the account was created by an earlier run.
if (premiumId) db.prepare('UPDATE users SET is_premium = 1 WHERE id = ?').run(premiumId);
if (adminId) db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(adminId);

/* ---------------- Sample study data for the demo account ---------------- */

const sample = db.prepare('SELECT COUNT(*) AS n FROM subjects WHERE user_id = ?').get(demoId);

if (sample.n > 0) {
  console.log('\n  Demo data already present, skipping the sample content.');
} else {
  console.log('\n  Adding sample content for the demo account.');

  const subjectData = [
    ['Mathematics', '#2f6df6'],
    ['English Language', '#ec4899'],
    ['Biology', '#10b981'],
    ['Physics', '#f59e0b'],
    ['Chemistry', '#8b5cf6'],
  ];

  const addSubject = db.prepare('INSERT INTO subjects (user_id, name, color) VALUES (?, ?, ?)');
  const subjectIds = subjectData.map(([name, color]) =>
    Number(addSubject.run(demoId, name, color).lastInsertRowid)
  );

  const day = (offset) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return d.toISOString().slice(0, 10);
  };

  const stamp = new Date().toISOString().replace('T', ' ').slice(0, 19);

  const addTask = db.prepare(
    `INSERT INTO tasks (user_id, subject_id, title, notes, due_date, priority, completed, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const tasks = [
    [subjectIds[0], 'Finish quadratic equations worksheet', 'Questions 1 to 20, show all working', day(0), 'high', 0, null],
    [subjectIds[0], 'Revise surds formulas', '', day(2), 'medium', 0, null],
    [subjectIds[1], 'Write essay plan: climate change', 'Three body paragraphs, 500 words', day(1), 'high', 0, null],
    [subjectIds[1], 'Read chapter 4 of Things Fall Apart', 'Annotate key symbols', day(-1), 'medium', 1, stamp],
    [subjectIds[2], 'Label the heart diagram', '', day(1), 'medium', 0, null],
    [subjectIds[2], 'Memorise stages of mitosis', 'PMAT', day(3), 'low', 0, null],
    [subjectIds[3], 'Past paper: mechanics section A', 'Timed, 45 minutes', day(4), 'high', 0, null],
    [subjectIds[4], 'Balance these chemical equations', '', day(-2), 'low', 1, stamp],
    [subjectIds[4], 'Revise the periodic table groups', 'Groups 1, 2, 17, 18', day(6), 'medium', 0, null],
    [null, 'Organise study desk', 'Clear old notes, restock paper', day(0), 'low', 0, null],
  ];

  for (const [subjectId, title, notes, dueDate, priority, completed, completedAt] of tasks) {
    addTask.run(demoId, subjectId, title, notes, dueDate, priority, completed, completedAt);
  }

  const addNote = db.prepare('INSERT INTO notes (user_id, subject_id, title, body) VALUES (?, ?, ?, ?)');

  addNote.run(
    demoId,
    subjectIds[0],
    'Quadratic formula notes',
    'ax² + bx + c = 0\n\nx = (-b ± √(b² - 4ac)) / 2a\n\nThe discriminant tells you how many roots exist:\n- b² - 4ac > 0  → two real roots\n- b² - 4ac = 0  → one repeated root\n- b² - 4ac < 0  → no real roots\n\nCompleting the square is usually faster if there is no b term.'
  );

  addNote.run(
    demoId,
    subjectIds[2],
    'Mitosis stages',
    '1. Prophase - chromosomes condense, spindle forms\n2. Metaphase - chromosomes line up on the equator\n3. Anaphase - sister chromatids separate\n4. Telophase - two nuclei form\n5. Cytokinesis - cytoplasm divides\n\nRemember: PMAT (plus cytokinesis).'
  );

  addNote.run(
    demoId,
    subjectIds[1],
    'Essay structure template',
    'Introduction - hook, context, thesis\nBody 1 - strongest argument with example\nBody 2 - counter argument then rebuttal\nBody 3 - implications or consequences\nConclusion - restate thesis in new words, no new points\n\nAim for 5 paragraphs in 40 minutes.'
  );

  const addSession = db.prepare(
    `INSERT INTO sessions (user_id, subject_id, started_at, duration_min, mode, finished)
     VALUES (?, ?, ?, ?, 'focus', 1)`
  );

  for (let daysAgo = 6; daysAgo >= 0; daysAgo--) {
    const blocks = daysAgo === 3 ? 0 : daysAgo % 2 === 0 ? 3 : 2;
    for (let i = 0; i < blocks; i++) {
      const d = new Date();
      d.setDate(d.getDate() - daysAgo);
      d.setHours(9 + i * 2, 30, 0, 0);
      addSession.run(
        demoId,
        subjectIds[(daysAgo + i) % subjectIds.length],
        d.toISOString().replace('T', ' ').slice(0, 19),
        25
      );
    }
  }

  const deck = db
    .prepare('INSERT INTO decks (user_id, subject_id, name) VALUES (?, ?, ?)')
    .run(demoId, subjectIds[2], 'Biology - Cell Structure');
  const deckId = Number(deck.lastInsertRowid);

  const addCard = db.prepare('INSERT INTO cards (deck_id, user_id, front, back) VALUES (?, ?, ?, ?)');

  const cards = [
    ['What organelle is known as the powerhouse of the cell?', 'The mitochondrion'],
    ['What controls what enters and leaves the cell?', 'The cell membrane'],
    ['Where is genetic material stored in a eukaryotic cell?', 'In the nucleus'],
    ['What is the function of ribosomes?', 'They build proteins by joining amino acids'],
    ['Which organelle packages and ships proteins?', 'The Golgi apparatus'],
    ['What fills plant cells but not animal cells?', 'A large permanent vacuole'],
  ];

  for (const [front, back] of cards) {
    addCard.run(deckId, demoId, front, back);
  }

  const addExam = db.prepare('INSERT INTO exams (user_id, subject_id, name, exam_date) VALUES (?, ?, ?, ?)');
  addExam.run(demoId, subjectIds[0], 'WAEC Mathematics', day(38));
  addExam.run(demoId, subjectIds[2], 'Biology Mid-Term', day(12));
  addExam.run(demoId, subjectIds[1], 'English Essay Test', day(6));
  addExam.run(demoId, null, 'Practice Exam Day', day(21));

  const addTopic = db.prepare('INSERT INTO syllabus (user_id, subject_id, topic, done) VALUES (?, ?, ?, ?)');

  const syllabus = [
    [subjectIds[0], 'Quadratic equations', 1],
    [subjectIds[0], 'Surds and indices', 1],
    [subjectIds[0], 'Trigonometry ratios', 0],
    [subjectIds[0], 'Mensuration', 0],
    [subjectIds[2], 'Cell structure', 1],
    [subjectIds[2], 'Cell division (mitosis)', 0],
    [subjectIds[2], 'Transport in plants', 0],
    [subjectIds[4], 'Atomic structure', 1],
    [subjectIds[4], 'Chemical bonding', 0],
    [subjectIds[1], 'Summary writing', 0],
  ];

  for (const [subjectId, topic, done] of syllabus) {
    addTopic.run(demoId, subjectId, topic, done);
  }

  // Quiz questions so the premium screens have something to work with.
  const addQuestion = db.prepare(
    `INSERT INTO quiz_questions (user_id, subject_id, question, correct_answer, wrong_a, wrong_b, wrong_c, explanation)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const questions = [
    [subjectIds[2], 'Which organelle is known as the powerhouse of the cell?', 'The mitochondrion', 'The nucleus', 'The ribosome', 'The vacuole', 'It makes ATP through aerobic respiration.'],
    [subjectIds[2], 'What controls what enters and leaves a cell?', 'The cell membrane', 'The cell wall', 'The cytoplasm', 'The nucleus', 'It is selectively permeable.'],
    [subjectIds[2], 'Where is genetic material stored in a eukaryotic cell?', 'In the nucleus', 'In the cytoplasm', 'In the ribosome', 'In the membrane', 'The nucleus holds the chromosomes.'],
    [subjectIds[0], 'What does a negative discriminant tell you?', 'No real roots', 'Two real roots', 'One repeated root', 'The roots are equal', 'b² - 4ac < 0 means there are no real solutions.'],
    [subjectIds[0], 'What is the quadratic formula?', 'x = (-b ± √(b² - 4ac)) / 2a', 'x = (b² - 4ac) / 2a', 'x = -b ± √(b² + 4ac)', 'x = (a + b) / c', 'It solves any ax² + bx + c = 0.'],
    [subjectIds[4], 'What is the valency of oxygen?', '2', '1', '3', '4', 'Oxygen has a valency of two.'],
  ];

  for (const [subjectId, question, correct, a, b, c, explanation] of questions) {
    addQuestion.run(demoId, subjectId, question, correct, a, b, c, explanation);
  }

  console.log('  Sample subjects, tasks, notes, sessions, cards, exams, syllabus and questions added.');
}

/* ---------------- Sample study data for the premium account ---------------- */

// The paywalled screens need something real to show, so the premium account
// gets its own subjects, notes, syllabus and a full question bank.
const premiumSample = db.prepare('SELECT COUNT(*) AS n FROM subjects WHERE user_id = ?').get(premiumId);

if (premiumId && premiumSample.n === 0) {
  console.log('\n  Adding sample content for the premium account.');

  const day = (offset) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return d.toISOString().slice(0, 10);
  };

  const addSubject = db.prepare('INSERT INTO subjects (user_id, name, color) VALUES (?, ?, ?)');
  const bio = Number(addSubject.run(premiumId, 'Biology', '#10b981').lastInsertRowid);
  const chem = Number(addSubject.run(premiumId, 'Chemistry', '#8b5cf6').lastInsertRowid);

  db.prepare('INSERT INTO notes (user_id, subject_id, title, body) VALUES (?, ?, ?, ?)').run(
    premiumId,
    bio,
    'Cell division',
    'Mitosis moves through five named stages:\n1. Prophase - chromosomes condense, spindle forms\n2. Metaphase - chromosomes line up on the equator\n3. Anaphase - sister chromatids separate\n4. Telophase - two nuclei form\n5. Cytokinesis - cytoplasm divides\n\nMnemonic: PMAT.'
  );

  db.prepare('INSERT INTO tasks (user_id, subject_id, title, due_date, priority) VALUES (?, ?, ?, ?, ?)').run(
    premiumId,
    bio,
    'Draw and label a cell',
    day(1),
    'high'
  );

  db.prepare('INSERT INTO syllabus (user_id, subject_id, topic, done) VALUES (?, ?, ?, ?)').run(premiumId, bio, 'Cell structure', 1);
  db.prepare('INSERT INTO syllabus (user_id, subject_id, topic, done) VALUES (?, ?, ?, ?)').run(premiumId, bio, 'Cell division', 0);

  const addQuestion = db.prepare(
    `INSERT INTO quiz_questions (user_id, subject_id, question, correct_answer, wrong_a, wrong_b, wrong_c, explanation)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const bank = [
    [bio, 'Which organelle is known as the powerhouse of the cell?', 'The mitochondrion', 'The nucleus', 'The ribosome', 'The vacuole', 'It makes ATP through aerobic respiration.'],
    [bio, 'What controls what enters and leaves the cell?', 'The cell membrane', 'The cell wall', 'The cytoplasm', 'The nucleus', 'It is selectively permeable.'],
    [bio, 'Where is genetic material stored in a eukaryotic cell?', 'In the nucleus', 'In the cytoplasm', 'In the ribosome', 'In the membrane', 'The nucleus holds the chromosomes.'],
    [bio, 'Which stage of mitosis has chromosomes lining up on the equator?', 'Metaphase', 'Prophase', 'Anaphase', 'Telophase', 'They line up at the metaphase plate.'],
    [chem, 'What is the valency of oxygen?', '2', '1', '3', '4', 'Oxygen has a valency of two.'],
    [chem, 'What is the pH of pure water at 25 degrees?', '7', '0', '5', '14', 'Pure water is neutral.'],
  ];

  for (const [subjectId, question, correct, a, b, c, explanation] of bank) {
    addQuestion.run(premiumId, subjectId, question, correct, a, b, c, explanation);
  }

  console.log('  Subjects, notes, tasks, syllabus and quiz questions added.');
}

/* ---------------- A payment waiting for review ---------------- */

const seededPayment = db.prepare("SELECT id FROM payments WHERE reference = 'TRF-SEED0001'").get();

if (!seededPayment && premiumId) {
  db.prepare(
    `INSERT INTO payments (user_id, amount, reference, payer_name, bank, note)
     VALUES (?, 3500, 'TRF-SEED0001', 'Premium Student', 'Demo Bank', 'Seeded example submission.')`
  ).run(premiumId);
  console.log('  One pending payment added for the admin queue.');
}

if (adminId) {
  db.prepare('INSERT INTO admin_log (admin_id, action, detail) VALUES (?, ?, ?)').run(
    adminId,
    'seed',
    'Created demo, premium and admin accounts'
  );
}

/* ---------------- Admin access codes ---------------- */

const SEED_CODE_COUNT = 10;

const codesLeft = db.prepare('SELECT COUNT(*) AS n FROM admin_codes').get().n;

let seedCodes = [];

if (codesLeft === 0) {
  const insert = db.prepare(
    'INSERT INTO admin_codes (code, label, created_by, expires_at) VALUES (?, ?, ?, NULL)'
  );

  seedCodes = Array.from({ length: SEED_CODE_COUNT }, (_, i) => {
    const code = makeCode();
    insert.run(code, `Starter code ${i + 1}`, adminId || null);
    return code;
  });

  console.log(`\n  Created ${SEED_CODE_COUNT} admin access codes.`);
} else {
  console.log(`\n  ${codesLeft} admin code(s) already issued.`);
}

console.log('\nSign in with:');
console.log(`  Free     ${ACCOUNTS.demo.email}    / ${ACCOUNTS.demo.password}`);
console.log(`  Premium  ${ACCOUNTS.premium.email} / ${ACCOUNTS.premium.password}`);
console.log(`  Admin    ${ACCOUNTS.admin.email}   / ${ACCOUNTS.admin.password}   (opens /admin.html)`);

if (seedCodes.length) {
  console.log('\nAdmin access codes, single use each:');
  seedCodes.forEach((code, i) => console.log(`  ${String(i + 1).padStart(2, ' ')}. ${code}`));
}

console.log('\nChange these passwords before putting the app online.');