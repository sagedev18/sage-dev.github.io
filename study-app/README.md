# StudyFlow

A study planner with real accounts and a real payment flow. Plan revision, run
focus sessions, keep notes, test yourself with flashcards, take quizzes, and
watch your exam countdown. Premium adds an AI study assistant and quizzes with
topic progression.

Built with Node.js, Express, SQLite and vanilla JavaScript. No frameworks, no
build step, no bundler.

---

## What's new

Everything below was added in this round. Each item lists where the code lives
so you can review it directly.

| Change | Where | Note |
|---|---|---|
| **Admin code gate** | `server/db.js`, `server/auth.js`, `server/routes/admin.js:166` | The console now needs a single-use code on top of admin rights. Verified that wrong codes are refused, codes burn on use, and the unlock cookie cannot be replayed against another account or tampered with. |
| **Access codes tab** | `public/admin.html`, `public/js/admin.js`, `public/css/admin.css` | Create codes in batches (up to 25), label them, set an expiry, revoke them, and see who used each one. New codes are displayed in full exactly once. |
| **Lock console** | `public/js/admin.js` | "Lock console" clears the unlock without logging out. |
| **Modal code prompt** | `public/dashboard.html`, `public/js/dashboard.js:215` | The sidebar Admin entry is now a button that prompts for a code, so a wrong code no longer reloads the page. |
| **Avatar library** | `server/routes/auth.js:29`, `public/js/api.js:145` | 24 built-in avatars (emoji on a colour pair). No upload, no file to host. Painted into the sidebar via `paintAvatar`. |
| **Settings reorganised** | `public/js/views/settings.js` | Now titled sections — Profile, Study preferences, Plan, Security, Your data, Session — instead of a loose grid of cards. |
| **Avatar picker** | `public/js/views/settings.js:7`, `public/css/styles.css` | Click a tile to save immediately. "Use my initials" reverts. |
| **Setup skip** | `server/routes/auth.js` (`POST /api/auth/skip-setup`), `users.setup_skipped` | Two Skip actions on the empty dashboard. Stored per account, so it follows you to another device, and restorable from Settings. |
| **Rotating encouragement** | `public/js/views/dashboard.js:6` | 15 encouragements and 7 study tips. A different line on every render, and never the same one twice in a row. |
| **Empty-state hero** | `public/js/views/dashboard.js:79`, `public/css/styles.css` | Gradient hero with floating icons and a direct "Start with a subject" action. |
| **"What you have done so far"** | `public/js/views/dashboard.js:147`, `server/routes/stats.js` | New bottom section backed by lifetime totals that never reset: focus time, sessions, active days, tasks finished, notes, flashcard reviews, topics covered, exams, quizzes, best score, current and best streak. |
| **Subject suggestions** | `public/data/subjects.json`, `server/routes/subjects.js`, `public/js/api.js:165` (`SubjectSuggest`) | 152 subjects across 7 curricula (WAEC/NECO, KCSE, US K-12/IB, GCSE/A Level, CBSE, Abitur/Bachillerato, plus study-skills terms). Labelled with the region each came from. |
| **"I have paid" redesign** | `public/premium.html`, `public/js/premium.js:122`, `public/css/styles.css` | Outlined confirm control with the consequence spelled out. Arms on the first press, submits on the second, and disarms if you edit a field. |
| **Service worker v3** | `public/sw.js:5` | Bumped so existing installs drop the old cached shell. |

Two things that were verified to be **unchanged and still correct**: the subject
field remains optional on tasks, exams, notes and syllabus topics, and premium
gating is still enforced on the server for `/quizzes/start`, `/quizzes/submit`,
`/quizzes/questions` and `/assistant/ask`.

### The 10 seeded admin codes

`npm run seed` prints these the first time it runs. Each works **once**.

```
SF-Y7AP-PVZD   SF-V5SJ-GX8F   SF-DUB3-8KLD   SF-5UY8-2MHQ   SF-CH4L-VZ39
SF-KMDF-A2TT   SF-PFXA-7QLH   SF-NWZQ-NL8R   SF-LLUT-W5RU   SF-MCVP-EQPJ
```

Running the seed again will not reissue codes if any already exist, so this list
cannot silently change underneath you.

---

## Running it

```bash
npm install
cp .env.example .env      # then edit it, at minimum JWT_SECRET
npm run seed              # optional: demo, premium and admin accounts
npm start
```

Then open **http://localhost:3000**

`npm run seed` is safe to run more than once. Anything that already exists is
left alone.

| Account | Email | Password | What it shows |
|---|---|---|---|
| Free | `demo@studyflow.app` | `demopassword` | The Free plan with sample study data |
| Premium | `premium@studyflow.app` | `premiumpassword` | Quizzes and the AI assistant unlocked |
| Admin | `admin@studyflow.app` | `adminpassword` | Opens the admin console at `/admin.html` |

The landing page has a **"Try the demo account"** button that fills in the free
login. **Change these passwords before putting the app online.**

> **Windows note:** if `npm` is blocked by PowerShell's execution policy, use
> `npm.cmd` instead of `npm`. That is a local PowerShell setting, not a problem
> with this project.

### Requirements

Node 22.5 or newer. The database uses Node's **built-in** `node:sqlite` module,
so there is no native dependency to compile and no build tools to install.

---

## How it fits together

```
Browser  ──HTTP/JSON──>  Express routes  ──SQL──>  SQLite file
   │                          │                       │
   │                    JWT auth check          data/studyflow.db
   │
   └── stores the login token in localStorage
```

The browser never talks to the database directly. Every piece of data goes
through the server, and the server checks who you are on every request.

### Endpoints added in this round

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/auth/avatars` | The 24-item avatar library |
| `POST` | `/api/auth/skip-setup` | `{ skip: true \| false }`, stored on the account |
| `GET` | `/api/subjects/library` | Subject suggestions with region labels, read once at boot |
| `GET` | `/api/admin/access` | `{ unlocked, isAdmin, codesLeft }` |
| `POST` | `/api/admin/access` | `{ code }` — redeems a code and sets the pass cookie |
| `DELETE` | `/api/admin/access` | Clears the pass cookie (Lock console) |
| `GET` | `/api/admin/codes` | All codes, with who used each one |
| `POST` | `/api/admin/codes` | `{ count, label, days }` — creates up to 25 at once |
| `DELETE` | `/api/admin/codes/:id` | Revokes a code |

Everything under `/api/admin` still needs a valid JWT and `is_admin`. Everything
except `access` and `codes` additionally needs a redeemed code.

---

## What a student gets

### Accounts
Register with name, email, password. Passwords are **hashed with bcrypt**
(12 rounds) before they ever touch the database — the plain password is never
stored. Logging in returns a **JWT** which the browser keeps in `localStorage`
and sends back as `Authorization: Bearer <token>` on every request.

You can also pick an **avatar** from a built-in library of 24. Avatars are emoji
drawn on a colour pair, so there is no upload, nothing to host, and they work
with no connection. Leaving the choice blank falls back to your initials. The
selection is stored on the account and appears in the sidebar.

### Subjects
The foundation everything else hangs off. Each has a name and a colour. Subjects
show live counts: open tasks, notes, and total focus minutes.

The subject name field is a **suggestion box**, not a dropdown. As you type it
searches `public/data/subjects.json` and shows matches labelled with the region
they come from, so "Mathematics" matches the WAEC, KCSE, GCSE, AP and CBSE
versions of it at once. Prefix matches rank first, subjects you already have are
filtered out, and there is always a **"Use *your own*"** row — because some
subjects are local and no global list will contain them.

Everything else takes an **optional** subject. Tasks, exams, notes and syllabus
topics can all be created with no subject at all.

### Task planner
Tasks belong to a subject and have a due date and priority (low / medium / high).
The list auto-sorts so what needs doing today floats to the top — open before
done, then priority, then soonest due date. Overdue tasks turn red.

### Focus timer (Pomodoro)
25 minutes of focus, 5 minutes of break, with 50/10 and 15/3 presets. When a
focus block completes it is **logged to the database automatically** — you never
click "save". Break blocks aren't counted toward your stats. The timer keeps
running in the background when you switch views.

### Notes
A notepad per subject. Auto-saves shortly after you stop typing, so there's no
save button to forget.

### Flashcards
Group cards into decks. Study mode flips each card and you mark whether you
actually knew it. Results are stored per card, so a deck shows real progress
("4 of 6 known") that carries over between sessions.

### Exams & syllabus
Set an exam date and get a live day countdown (green → amber → red as it gets
closer). Alongside it, break each subject into syllabus topics and tick them off,
with a per-subject progress bar.

### Dashboard
Everything computed on the server and returned as one `/api/stats` call: today's
focus time against your goal, a 7-day bar chart, time per subject, tasks done,
flashcards known, syllabus progress, an exam banner, and a **daily streak**.

**On an empty account** it shows a hero strip and a five-step setup card instead
of a wall of zeroes, with a Skip action if you would rather just start. The skip
is saved to your account, not to the browser.

**At the bottom** there is a "What you have done so far" section. Its numbers are
**lifetime totals** — focus minutes, sessions, active days, tasks finished,
notes, flashcard reviews, topics covered, exams, quizzes, best quiz score, and
your current and best streak. These only ever go up, which is what makes them a
useful answer to "am I actually getting anywhere". The 7-day chart above answers
a different question and resets constantly.

### Settings
Six titled sections — **Profile, Study preferences, Your plan, Security, Your
data, Session** — rather than a loose grid.

- Pick your display name and an avatar (saved the moment you click a tile)
- Set a daily focus goal, with presets
- Choose light, dark or follow your device
- Show or hide the setup card on the dashboard
- Change your password
- Open the admin console, if you are an admin
- Download everything as a JSON backup

---

## Premium

Premium costs **₦3,500** (listed at ₦5,000) and is a **one-off payment, not a
subscription**. There is no automatic billing.

### What it unlocks

- **AI study assistant** — asks questions and answers from your own notes,
  syllabus and open tasks
- **Quizzes** — build a question bank per subject and test yourself
- **Topic progression** — score 70% on a subject to unlock the next one
- **Full data export** and priority support

The free plan keeps everything else: subjects, tasks, timer, notes, flashcards,
exams and syllabus.

### How payment works

There is no payment provider wired in, because that needs your merchant
account. Instead the flow is the one most small apps use:

1. The student opens `/premium.html` and sees your bank details.
2. They send the money, fill in the **transfer reference** and amount, then press
   **Yes, I have paid**. That button arms on the first press and submits on the
   second — it is the one action on the page that commits a claim to your queue,
   so it should not be one stray click away. Editing any field disarms it.
3. The submission lands in the **admin queue** as `pending`.
4. An administrator verifies it against their bank statement and clicks
   **Verify**. That is the moment `is_premium` flips to 1 on their account.
5. The student gets an email saying premium is active. Quizzes and the assistant
   unlock on their next request.

Two guards worth knowing:

- A **reference can only be used once**, so one payment cannot unlock several
  accounts. The check is case-insensitive.
- **Premium is read from the database on every request**, never from the token.
  Editing a token in the browser does nothing, and revoking premium in the admin
  area takes effect immediately.

Price, bank name, account name, account number and the extra instructions are
all editable in **Admin → Store settings**. Those values are stored in the
database and win over the `.env` defaults.

### The AI assistant

Without an API key the assistant still works: it answers from the student's own
notes, syllabus and tasks, and says plainly when it cannot find something. With a
key configured it calls a real model, grounded in that same context.

Set either of these and it switches over:

```bash
# Any OpenAI-compatible provider (OpenAI, Groq, Together, OpenRouter...)
AI_PROVIDER=openai
AI_API_KEY=sk-...
AI_MODEL=gpt-4o-mini

# Or Anthropic
AI_PROVIDER=anthropic
AI_API_KEY=sk-ant-...
AI_MODEL=claude-sonnet-5
```

If the provider call fails, the answer falls back to the local response rather
than showing an error.

---

## The admin console

`/admin.html`, reachable from the sidebar for accounts with `is_admin` set, and
straight after login for admins.

### The code gate

An admin account is **not enough on its own**. Opening the console also needs a
valid **admin code**, because a stolen admin password should not hand over the
whole user database on its own.

How it works:

1. You sign in normally. The page checks `/api/admin/access` first, before
   rendering anything, so the console never flashes its contents and then hides.
2. Without a valid code, the console is covered by a full-screen prompt. Every
   other admin route answers `403` with `code: "ADMIN_CODE_REQUIRED"`.
3. Entering a valid code marks it **used** immediately, sets a signed
   `sf_admin_pass` cookie, and opens the console.
4. **Lock console** clears that cookie without logging you out. Logging out
   clears it too.
5. Every attempt, successful or not, is written to `admin_log`.

Codes are single use and can expire. The cookie is signed with the user id and
HMAC, so it cannot be reused with a different account's token, and any edit to
it is rejected.

The enforcement lives in `requireAdminGate`, applied in `server/routes/admin.js`
*after* `requireAuth` and `requireAdmin` but *before* every data route. The
`/access` and `/codes` endpoints sit above the gate on purpose — they are how
someone gets through it.

### Tabs

| Tab | What it does |
|---|---|
| **Overview** | User counts, premium conversion, revenue over 14 days, newest accounts, most studied subjects, activity log |
| **Users** | Search, filter, grant or revoke premium, promote to admin, email a weekly report, delete |
| **Payments** | Approve or reject submissions. Approving unlocks premium |
| **Store settings** | Price, bank details, support email, whether premium is on sale |
| **Access codes** | Create codes in batches, label them, set an expiry, revoke them, see who used each |

Safety rails: an admin **cannot remove their own admin access** or delete their
own account from here, and every action is written to `admin_log`.

Who becomes an admin is set by `ADMIN_EMAILS` in `.env` (comma separated) when
they sign up. Anyone already in the database keeps the access they have.

---

## Email

With nothing configured, emails are **printed to the server console** instead of
being sent. Nothing breaks, which makes local development easy, but nobody
receives them. Emails are used for password reset, payment approval and
rejection, and the weekly report.

```bash
# Option A: Resend (simplest)
npm i resend
RESEND_API_KEY=re_xxx
MAIL_FROM="StudyFlow <you@yourdomain.com>"

# Option B: any SMTP host
npm i nodemailer
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASS=your-app-password
```

While developing with no provider, set `EXPOSE_RESET_TOKEN=true` and the reset
link is returned in the API response instead of being emailed.
**Never set that in production** — it hands out password reset links.

---

## Password reset

`/index.html#forgot` requests a link; `/reset.html?token=...` sets the new
password.

- The token is 32 random bytes, shown to the user, and **only its SHA-256 hash is
  stored**, so a database leak cannot be replayed
- It works **once** and **expires after 30 minutes**
- Requesting a new link **invalidates the previous one**
- The response is the same whether or not the email is registered, so it cannot
  be used to discover which students have accounts

Changing your password also kills any outstanding reset links.

---

## Progressive Web App

StudyFlow installs to the home screen and opens in its own window.

- `manifest.webmanifest` with generated icons and shortcuts to the focus timer,
  planner and quizzes
- `sw.js` caches the shell so the app opens offline, with an `offline.html`
  fallback. Currently at `studyflow-v3` — bumping `VERSION` is how you push out
  a new shell to installed copies.
- **Navigations are network-first**, so you always get fresh data when online
- **`/api/` is never cached.** Study data must not go stale or leak between
  accounts on a shared device
- The install button uses the browser's own prompt where one exists, and falls
  back to platform-specific instructions where it does not (iOS, for example)

Deep links work: `/dashboard.html#focus` opens straight into the timer.

---

## The streak

A day counts toward your streak if you log any focus session on it. The count
runs backwards from today — and if today has no session *yet*, it counts from
yesterday, so an unfinished day doesn't wipe out a streak you built yesterday.

---

## Database

SQLite, stored at `data/studyflow.db`. It's a single file — copy it to back up
everything, delete it to reset.

Tables:

| Group | Tables |
|---|---|
| Study data | `subjects`, `tasks`, `notes`, `sessions`, `decks`, `cards`, `card_progress`, `exams`, `syllabus` |
| Accounts | `users`, `sessions_auth`, `reset_tokens` |
| Premium | `payments`, `quiz_questions`, `quiz_attempts`, `quiz_answers`, `topic_progress`, `assistant_threads` |
| Admin | `app_settings`, `admin_log`, `admin_codes` |

`admin_codes` holds one row per issued code: the code itself, an optional label,
who created it, an optional expiry, who used it and when, and a `revoked` flag.
Codes are compared case-insensitively, so `sf-y7ap-pvzd` and `SF-Y7AP-PVZD` are
the same code.

Columns added to `users` in this round:

| Column | Purpose |
|---|---|
| `avatar` | Chosen avatar id, blank for initials |
| `setup_skipped` | Whether the dashboard setup card is hidden for this account |

Every table holding user content carries a `user_id` column with a foreign key
and `ON DELETE CASCADE`, so deleting an account removes its data, and deleting a
subject cleans up what is attached to it.

The schema is created on boot, and older databases are upgraded in place by
`ensureColumn` in `server/db.js`, so upgrading the code never needs a migration
script.

---

## Security

Worth knowing, because it's the part that separates a real app from a demo:

- **Passwords are hashed**, never stored in plain text
- **Every query is scoped to the logged-in user.** Two people using the app
  cannot see or touch each other's data — this is enforced in the SQL, not just
  in the interface
- **Other users' records return 404, not 403**, so the API never reveals that
  an id exists
- **All SQL uses bound parameters**, so input can't be used to inject queries
- **Tokens are signed**, and premium/admin access is re-read from the database
  on every request rather than trusted from the token
- **The admin console needs a single-use code**, not just an admin account. The
  gate is enforced in middleware before any data route, the unlock cookie is
  signed per user, and every attempt is logged
- **Login doesn't leak which emails exist** — failed logins take the same time
  whether or not the account exists
- **Input is validated and length-capped** at the server, not just the browser
- **A basic rate limit** caps a single client at 300 requests a minute
- **Payment references are single-use**, so one transfer cannot unlock many
  accounts

### Known trade-offs

Honest limitations, so you don't overclaim it:

- The token sits in `localStorage`, which is readable by any JavaScript on the
  page. For a study planner this is fine; for anything handling money, use
  `httpOnly` cookies with CSRF protection instead.
- `JWT_SECRET` is randomly generated on restart in development, which logs
  everyone out when the server restarts. **Set a real `JWT_SECRET` in `.env`
  before deploying** — the server refuses to boot in production without one.
- Payment verification is manual. Wiring a provider such as Paystack or Flutterwave
  would make it automatic.
- Quizzes are multiple choice, and the questions come from the student's own
  bank. Generating them with the AI model is the natural next step.
- The rate limit is per process, so it resets on restart and does not work
  across multiple instances.

---

## File map

```
study-app/
├── server/
│   ├── server.js        Entry point. Static files + API mounting + rate limiting
│   ├── db.js            Database connection, schema and column migrations
│   ├── auth.js          Password hashing, token signing, auth/admin/premium guards,
│   │                    plus the signed admin-code pass cookie
│   ├── ai.js            Assistant: provider calls plus the local grounded fallback
│   ├── mailer.js        Resend / SMTP delivery, or console logging
│   ├── helpers.js       Input validation and error handling
│   ├── seed.js          Demo, premium and admin accounts, sample data, starter codes
│   └── routes/          auth, subjects, tasks, notes, sessions, flashcards, exams,
│                       stats, payments, quizzes, assistant, admin
├── public/
│   ├── index.html       Landing page, login / register
│   ├── dashboard.html   The app shell with sidebar navigation
│   ├── premium.html     Upgrade and payment submission
│   ├── admin.html       Admin console, including the code gate
│   ├── reset.html       Set a new password from an emailed link
│   ├── offline.html     Shown when the app is opened with no connection
│   ├── manifest.webmanifest
│   ├── sw.js            Network-first service worker
│   ├── data/subjects.json   152 subject names across 7 international curricula
│   ├── css/styles.css   All app styling
│   ├── css/admin.css    Admin console and code-gate styling
│   └── js/
│       ├── api.js       Fetch wrapper, token storage, toasts, avatars,
│       │                subject suggestions
│       ├── theme.js     Light / dark / auto
│       ├── pwa.js       Install prompt and service worker registration
│       ├── dashboard.js Shared state, navigation, premium gating, admin prompt
│       ├── auth-page.js Landing page behaviour
│       ├── premium.js   Upgrade page behaviour
│       ├── admin.js     Admin console behaviour, code gate, code management
│       └── views/       One file per module
├── scripts/generate-icons.js   Regenerates the PWA icons
└── data/studyflow.db    Your database (created automatically, git-ignored)
```

### The separate showcase

The marketing page is **not** part of this project and is not served by this
server. It lives one level up, at `../studyflow-showcase/`, with its own README.

```
studyflow-showcase/
├── index.html       Hero, six-part tour, free vs premium, privacy, call to action
├── css/showcase.css All styling, including the app window drawn in CSS
└── README.md
```

No dependencies, no build step, and no image files — everything visual is drawn in
CSS, so nothing can 404. Open `index.html` directly, or serve the folder with any
static server. The `#start` links point nowhere yet and need pointing at wherever
the real signup page lives before you show it to anyone.

---

## Deploying

1. **Set the environment variables.** At minimum `JWT_SECRET` (a long random
   string) and `NODE_ENV=production`.
2. **Add an email provider** so password reset actually reaches people.
3. **Set `ADMIN_EMAILS`** to your own address before creating your account.
4. **Seed, then change the seeded passwords** or delete those accounts. Keep the
   admin codes it prints, or create fresh ones from **Access codes** once you are
   in — you will need one every time you open the console on a new device, and
   each one is consumed on use.
5. **Set the bank details in the admin console** rather than in code.
6. **Point `APP_URL`** at your real address so reset links work.

It runs on Render or Railway as-is — set `JWT_SECRET`, `NODE_ENV=production` and
`PORT`. Put it behind HTTPS. Back up `data/studyflow.db` on a schedule; it is
the whole app, `admin_codes` and all.

If you ever lock yourself out, the only way back in is the database:

```bash
node -e "const db=require('./server/db.js');
  db.prepare('INSERT INTO admin_codes (code,label) VALUES (?,?)').run('SF-RECOV-VERY','emergency');"
```

That prints an emergency code. It uses the same single-use rules as every other
code, so redeem it once and then delete the row.

---

## Where to take it next

1. **Wire a real payment provider** (Paystack or Flutterwave) so verification is
   automatic instead of a person clicking Verify.
2. **Generate quiz questions with the AI model** from the student's notes,
   instead of only using the bank they wrote by hand.
3. **Spaced repetition** — currently "known" is a flat flag. Scheduling cards on
   the forgetting curve would make this genuinely competitive.
4. **Push and email reminders** for tasks due today, using the mailer that is
   already there.
5. **Multi-device sync** — data is already server-side, so this is mostly a
   matter of a better session story than the current single token.