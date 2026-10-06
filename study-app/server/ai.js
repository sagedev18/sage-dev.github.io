/**
 * Optional AI provider integration for the study assistant.
 *
 * Nothing here calls out to the internet unless AI_API_KEY and AI_PROVIDER are
 * set. With no key configured the assistant falls back to a local helper built
 * from the user's own study data, so the feature still responds instead of
 * erroring.
 */
const db = require('./db');

const SYSTEM_PROMPT = `You are a patient study assistant helping a secondary school student.
Rules:
- Answer using plain language a student can follow.
- Keep responses focused and short. Use short paragraphs and bullet lists.
- If you do not know something, say so plainly instead of inventing facts.
- When explaining a formula, show the steps.
- Encouraging, never condescending.`;

function configured() {
  return Boolean(process.env.AI_API_KEY && process.env.AI_PROVIDER);
}

/** Pulls the student's own subjects, tasks, notes and syllabus to ground the answer. */
function buildContext(userId, subjectName) {
  const subjects = db
    .prepare('SELECT id, name FROM subjects WHERE user_id = ? ORDER BY created_at ASC')
    .all(userId);

  const subject = subjectName
    ? subjects.find((s) => s.name.toLowerCase() === String(subjectName).toLowerCase())
    : subjects[0];

  if (!subject) return null;

  const tasks = db
    .prepare(
      `SELECT title FROM tasks
        WHERE user_id = ? AND subject_id = ? AND completed = 0
        ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, due_date LIMIT 5`
    )
    .all(userId, subject.id);

  const notes = db
    .prepare(
      `SELECT title, substr(body, 1, 400) AS snippet FROM notes
        WHERE user_id = ? AND subject_id = ?
        ORDER BY updated_at DESC LIMIT 3`
    )
    .all(userId, subject.id);

  const topics = db
    .prepare('SELECT topic, done FROM syllabus WHERE user_id = ? AND subject_id = ? LIMIT 12')
    .all(userId, subject.id);

  return { subject, tasks, notes, topics };
}

function contextPrompt(ctx) {
  if (!ctx) return 'The student has not set up any subjects yet.';

  return [
    `Current subject: ${ctx.subject.name}`,
    ctx.topics.length
      ? `Syllabus topics: ${ctx.topics.map((t) => `${t.topic}${t.done ? ' (done)' : ''}`).join(', ')}`
      : '',
    ctx.tasks.length ? `Open tasks: ${ctx.tasks.map((t) => t.title).join('; ')}` : '',
    ctx.notes.length ? `Recent notes:\n${ctx.notes.map((n) => `- ${n.title}: ${n.snippet}`).join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/** Local answer used when no AI provider is configured. */
function offlineAnswer(question, ctx) {
  const q = String(question).toLowerCase();

  if (!ctx) {
    return {
      text:
        'I cannot answer properly yet because no AI provider is configured on this server, and there are no subjects in your account to read from.\n\n' +
        'Two things will fix this:\n' +
        '1. Add subjects and a few notes in the Notes view so I have something to work from.\n' +
        '2. An administrator can set AI_PROVIDER and AI_API_KEY to switch me to a real language model.',
    };
  }

  if (/^(hi|hello|hey|good (morning|afternoon|evening))\b/.test(q)) {
    return {
      text: `Hello. You are working on ${ctx.subject.name}. Ask me about a topic, a formula, or what to revise next.`,
    };
  }

  if (/(next|what should i (study|revise|do)|where do i start|how do i (start|begin))/.test(q)) {
    const done = ctx.topics.filter((t) => t.done).length;
    const open = ctx.topics.filter((t) => !t.done).map((t) => t.topic);
    const lines = [`For ${ctx.subject.name} you have ${done} of ${ctx.topics.length} syllabus topics covered.`];

    if (open.length) {
      lines.push(`Still to cover: ${open.slice(0, 4).join(', ')}.`);
      lines.push(`Start with ${open[0]}. Take notes on it, run a 25 minute focus session, then test yourself with a quiz.`);
    } else if (ctx.topics.length) {
      lines.push('Every topic on your syllabus is ticked off. Take a quiz to check what has stuck, or move to another subject.');
    } else {
      lines.push('You have no syllabus topics for this subject yet. Add them in the Exams view so I can help you plan.');
    }

    if (ctx.tasks.length) {
      lines.push(
        `You also have ${ctx.tasks.length} open task${ctx.tasks.length === 1 ? '' : 's'}, the next being "${ctx.tasks[0].title}".`
      );
    }

    return { text: lines.join('\n\n') };
  }

  // Try to match the question against the student's own note titles.
  const words = String(question).toLowerCase().split(/\W+/).filter((w) => w.length > 4);

  const byTitle = ctx.notes.find((n) =>
    n.title
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 3)
      .some((w) => q.includes(w))
  );

  const topic = ctx.topics.find((t) =>
    t.topic
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 3)
      .some((w) => q.includes(w))
  );

  const parts = [];

  if (byTitle) {
    parts.push(`From your notes on "${byTitle.title}":\n\n${byTitle.snippet.trim()}`);
  }

  if (topic) {
    parts.push(
      `"${topic.topic}" is ${topic.done ? 'already ticked off' : 'still open'} on your ${ctx.subject.name} syllabus. ` +
        (topic.done
          ? 'A good next step is a quiz on it to check it has stuck.'
          : 'Cover it with notes and a focus session, then take the quiz for that subject.')
    );
  }

  if (!parts.length && words.length) {
    const loose = ctx.notes.find((n) => words.some((w) => n.title.toLowerCase().includes(w)));
    if (loose) parts.push(`Closest thing in your notes is "${loose.title}":\n\n${loose.snippet.trim()}`);
  }

  if (!parts.length) {
    parts.push(
      `I could not find anything about that in your ${ctx.subject.name} material.\n\n` +
        'This assistant answers from your own notes and syllabus, and no AI provider is configured on this server yet. ' +
        'Try rephrasing, or add a note on the topic so there is something to read.'
    );
  }

  return { text: parts.join('\n\n') };
}

async function callProvider(messages) {
  const provider = process.env.AI_PROVIDER;
  const apiKey = process.env.AI_API_KEY;
  const baseUrl = process.env.AI_BASE_URL;
  const model = process.env.AI_MODEL || 'gpt-4o-mini';

  if (provider === 'anthropic') {
    const system = messages.find((m) => m.role === 'system')?.content || '';
    const convo = messages.filter((m) => m.role !== 'system');

    const res = await fetch(baseUrl || 'https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model, max_tokens: 1200, system, messages: convo }),
    });

    if (!res.ok) throw new Error(`AI provider error ${res.status}`);
    const data = await res.json();
    return (data.content || []).map((b) => b.text || '').join('\n');
  }

  // OpenAI-compatible, which also covers most self-hosted providers.
  const res = await fetch(baseUrl || 'https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages, max_tokens: 1200 }),
  });

  if (!res.ok) throw new Error(`AI provider error ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

async function ask(userId, question, subjectName) {
  const ctx = buildContext(userId, subjectName);

  const history = db
    .prepare('SELECT role, content FROM assistant_threads WHERE user_id = ? ORDER BY id DESC LIMIT 8')
    .all(userId)
    .reverse();

  let text;
  let usedProvider = false;

  if (configured()) {
    try {
      const messages = [
        {
          role: 'system',
          content: `${SYSTEM_PROMPT}\n\nThe student's current study context:\n${contextPrompt(ctx)}`,
        },
        ...history.map((h) => ({ role: h.role, content: h.content })),
        { role: 'user', content: question },
      ];

      text = await callProvider(messages);
      usedProvider = true;
    } catch (err) {
      console.error('AI provider failed, using local fallback:', err.message);
      const local = offlineAnswer(question, ctx);
      text = `${local.text}\n\n(Automated answer: the AI provider could not be reached, so this came from your own study data.)`;
    }
  } else {
    text = offlineAnswer(question, ctx).text;
  }

  const save = db.prepare('INSERT INTO assistant_threads (user_id, role, content) VALUES (?, ?, ?)');
  save.run(userId, 'user', question);
  save.run(userId, 'assistant', text);

  // Keep the thread from growing without bound.
  db.prepare(
    `DELETE FROM assistant_threads
      WHERE user_id = ? AND id NOT IN (SELECT id FROM assistant_threads WHERE user_id = ? ORDER BY id DESC LIMIT 100)`
  ).run(userId, userId);

  return { answer: text, provider: usedProvider ? process.env.AI_PROVIDER : 'local' };
}

module.exports = { ask, configured, buildContext };