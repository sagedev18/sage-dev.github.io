require('dotenv').config();

const path = require('path');
const fs = require('fs');
const express = require('express');

const { errorHandler, notFound } = require('./helpers');

const app = express();
const PORT = process.env.PORT || 3000;

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

// Baseline protection against a flood of requests from one script.
const buckets = new Map();

app.use((req, res, next) => {
  const key = req.ip || 'unknown';
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.start > 60_000) {
    buckets.set(key, { start: now, count: 1 });
    return next();
  }

  bucket.count += 1;
  if (bucket.count > 300) {
    return res.status(429).json({ error: 'Too many requests. Please slow down.' });
  }
  next();
});

if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    const started = Date.now();
    res.on('finish', () => {
      console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - started}ms`);
    });
    next();
  });
}

// Core study tools
app.use('/api/auth', require('./routes/auth'));
app.use('/api/subjects', require('./routes/subjects'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/notes', require('./routes/notes'));
app.use('/api/sessions', require('./routes/sessions'));
app.use('/api/decks', require('./routes/flashcards'));
app.use('/api/stats', require('./routes/stats'));

// Premium, quizzes and the AI assistant
app.use('/api/payments', require('./routes/payments'));
app.use('/api/quizzes', require('./routes/quizzes'));
app.use('/api/assistant', require('./routes/assistant'));

// This router defines /exams and /syllabus itself, so it mounts at /api.
app.use('/api', require('./routes/exams'));

// Admin area
app.use('/api/admin', require('./routes/admin'));

app.get('/api/health', (req, res) =>
  res.json({
    ok: true,
    ai: Boolean(process.env.AI_API_KEY && process.env.AI_PROVIDER),
    email: Boolean(process.env.RESEND_API_KEY || process.env.SMTP_HOST),
  })
);

app.use('/api', notFound);

// The service worker must be served from the site root to control the scope.
app.get('/sw.js', (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.sendFile(path.join(__dirname, '..', 'public', 'sw.js'));
});

app.use(
  express.static(path.join(__dirname, '..', 'public'), {
    setHeaders(res, filePath) {
      // The service worker and the manifest must never be cached, or an
      // update can never reach the browser.
      if (filePath.endsWith('sw.js') || filePath.endsWith('manifest.webmanifest')) {
        res.set('Cache-Control', 'no-cache');
      }
    },
  })
);

app.use(errorHandler);

/* The showcase lives in its own folder beside this project, so it can be shown,
   edited or deleted without touching the app. It is mounted here only so both
   share one origin and one address. Missing folder means the showcase was
   moved or removed, which must not stop the app from starting. */
const SHOWCASE_DIR = path.join(__dirname, '..', '..', 'studyflow-showcase');

if (fs.existsSync(SHOWCASE_DIR)) {
  app.use('/showcase', express.static(SHOWCASE_DIR, { extensions: ['html'] }));

  app.get('/showcase', (req, res) => res.sendFile(path.join(SHOWCASE_DIR, 'index.html')));
}

app.listen(PORT, () => {
  console.log(`\n  StudyFlow running at http://localhost:${PORT}`);
  console.log(`  Mode: ${process.env.NODE_ENV || 'development'}`);
  console.log(`  AI assistant: ${process.env.AI_API_KEY && process.env.AI_PROVIDER ? process.env.AI_PROVIDER : 'local fallback only'}`);
  console.log(`  Email: ${process.env.RESEND_API_KEY || process.env.SMTP_HOST ? 'configured' : 'not configured (logged to console)'}`);
  if (fs.existsSync(SHOWCASE_DIR)) console.log(`  Showcase: http://localhost:${PORT}/showcase`);
  console.log('');
});