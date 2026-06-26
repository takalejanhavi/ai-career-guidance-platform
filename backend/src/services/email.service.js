'use strict';

const axios  = require('axios');
const env    = require('../config/env');
const logger = require('../config/logger');

// ─── Transport ────────────────────────────────────────────────────────────────

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';

async function send({ to, subject, html, text }) {
  logger.info('[EMAIL] Sending email', { to, subject });

  const payload = {
    sender: {
      name:  'MentorChain',
      email: env.EMAIL_FROM_ADDRESS,
    },
    to:          [{ email: to }],
    subject,
    htmlContent: html,
    textContent: text,
  };

  try {
    const { data } = await axios.post(BREVO_URL, payload, {
      headers: {
        'api-key':      env.BREVO_API_KEY,
        'Content-Type': 'application/json',
        Accept:         'application/json',
      },
    });

    logger.info('[EMAIL] Email sent', { messageId: data.messageId, to });
    return data;
  } catch (err) {
    logger.error('[EMAIL] Email send failed', {
      status:   err.response?.status,
      response: err.response?.data,
      error:    err.message,
      to,
    });
    throw err;
  }
}

// ─── Templates ────────────────────────────────────────────────────────────────

const BASE = (content) => `
<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;color:#333;max-width:600px;margin:0 auto;padding:20px">

<div style="background:#6C63FF;padding:20px;border-radius:8px 8px 0 0;text-align:center">
<h1 style="color:#fff;margin:0;font-size:22px">
MentorChain
</h1>
</div>

<div style="background:#f9f9f9;padding:30px;border-radius:0 0 8px 8px;border:1px solid #eee">
${content}
</div>

<p style="font-size:11px;color:#999;text-align:center;margin-top:20px">
You received this email because you have an account on MentorChain.
</p>

</body>
</html>
`;

async function sendVerificationEmail({ email, token, firstName }) {
  const url = `${env.FRONTEND_URL}/verify-email?token=${token}`;

  return send({
    to: email,
    subject: 'Verify your email — MentorChain',
    html: BASE(`
      <h2>Hi ${firstName},</h2>

      <p>Please verify your email address to activate your account.</p>

      <a href="${url}"
         style="display:inline-block;background:#6C63FF;color:white;
         padding:12px 24px;border-radius:6px;text-decoration:none">
        Verify Email
      </a>

      <p style="font-size:12px;color:#999">
        Link expires in 24 hours.
      </p>
    `),
    text: `Verify your email: ${url}`,
  });
}

async function sendPasswordResetEmail({ email, token, firstName }) {
  const url = `${env.FRONTEND_URL}/reset-password?token=${token}`;

  return send({
    to: email,
    subject: 'Reset your password — MentorChain',
    html: BASE(`
      <h2>Hi ${firstName},</h2>

      <p>We received a request to reset your password.</p>

      <a href="${url}"
         style="display:inline-block;background:#6C63FF;color:white;
         padding:12px 24px;border-radius:6px;text-decoration:none">
        Reset Password
      </a>
    `),
    text: `Reset password: ${url}`,
  });
}

async function sendPasswordChangedEmail({ email, firstName }) {
  return send({
    to: email,
    subject: 'Password Changed',
    html: BASE(`
      <h2>Hi ${firstName},</h2>

      <p>Your password has been changed successfully.</p>
    `),
    text: 'Your password has been changed.',
  });
}

async function sendReportSharedEmail({ granteeEmail, granteeName, ownerName, reportId, permissions }) {
  const url = `${env.FRONTEND_URL}/reports/${reportId}`;

  return send({
    to: granteeEmail,
    subject: `${ownerName} shared a report with you`,
    html: BASE(`
      <h2>Hi ${granteeName},</h2>

      <p><strong>${ownerName}</strong> shared a career report with you.</p>

      <p>
        Permissions:
        ${permissions.join(', ')}
      </p>

      <a href="${url}"
         style="display:inline-block;background:#6C63FF;color:white;
         padding:12px 24px;border-radius:6px;text-decoration:none">
        View Report
      </a>
    `),
    text: `${ownerName} shared a report with you: ${url}`,
  });
}

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendPasswordChangedEmail,
  sendReportSharedEmail,
};
