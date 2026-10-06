/**
 * Sends email when a provider is configured, otherwise logs the message.
 *
 * Resend (recommended for a first deployment):
 *   npm i resend
 *   RESEND_API_KEY=re_xxx  MAIL_FROM="StudyFlow <you@yourdomain.com>"
 *
 * Any SMTP host also works:
 *   npm i nodemailer
 *   SMTP_HOST=smtp.gmail.com SMTP_PORT=587 SMTP_USER=... SMTP_PASS=...
 */
function getTransporter() {
  if (process.env.RESEND_API_KEY) {
    // Loaded lazily so the app still runs when the optional dep is absent.
    const { Resend } = require('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    return {
      send: async ({ to, subject, html }) => {
        const { error } = await resend.emails.send({
          from: process.env.MAIL_FROM || 'StudyFlow <onboarding@resend.dev>',
          to,
          subject,
          html,
        });
        if (error) throw new Error(error.message);
      },
    };
  }

  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    let nodemailer;
    try {
      nodemailer = require('nodemailer');
    } catch (err) {
      throw new Error('SMTP is configured but nodemailer is not installed. Run: npm i nodemailer');
    }

    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    return {
      send: ({ to, subject, html }) =>
        transport.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to, subject, html }),
    };
  }

  return null;
}

function configured() {
  return Boolean(process.env.RESEND_API_KEY || (process.env.SMTP_HOST && process.env.SMTP_USER));
}

async function send({ to, subject, html }) {
  const transporter = getTransporter();

  if (!transporter) {
    if (process.env.NODE_ENV !== 'test') {
      console.log('\n--- EMAIL (no provider configured) ---');
      console.log(`To: ${to}`);
      console.log(`Subject: ${subject}`);
      console.log(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
      console.log('---\n');
    }
    return { delivered: false, reason: 'no_email_provider' };
  }

  await transporter.send({ to, subject, html });
  return { delivered: true };
}

function layout(title, body) {
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:24px;background:#f6f8fc;font-family:Poppins,Segoe UI,Arial,sans-serif;color:#1a1a1a">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e6e8f0">
    <div style="background:linear-gradient(135deg,#4f46e5,#be185d);padding:24px;text-align:center">
      <span style="color:#fff;font-size:20px;font-weight:600">StudyFlow</span>
    </div>
    <div style="padding:28px">
      <h1 style="font-size:20px;margin:0 0 14px">${title}</h1>
      ${body}
    </div>
    <div style="padding:16px 28px;background:#f9fafc;color:#6b7280;font-size:12px">
      You are receiving this because your StudyFlow account is registered with this address.
    </div>
  </div>
</body></html>`;
}

module.exports = { send, layout, configured };