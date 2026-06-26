'use strict';

const nodemailer = require('nodemailer');
const env    = require('../config/env');
const logger = require('../config/logger');

// ─── Transport ────────────────────────────────────────────────────────────────

const transport = nodemailer.createTransport({
  host   : env.SMTP_HOST,
  port   : env.SMTP_PORT,
  secure : env.SMTP_PORT === 465,
  auth   : { user: env.SMTP_USER, pass: env.SMTP_PASS },
});

// Verify connection on startup (non-blocking)
transport
  .verify()
  .then(() => {
    logger.info("SMTP connection verified");
  })
  .catch((err) => {
    logger.warn("SMTP verify failed", {
      message: err.message,
      code: err.code,
      command: err.command,
      response: err.response,
    });
  });
// ─── Send helper ──────────────────────────────────────────────────────────────

async function send({ to, subject, html, text }) {
  try {
    const info = await transport.sendMail({ from: env.EMAIL_FROM, to, subject, html, text });
    logger.info('Email sent', { to, subject, messageId: info.messageId });
    return info;
  } catch (err) {
    logger.error('Email send failed', { to, subject, error: err.message });
    throw err;
  }
}

// ─── Templates ────────────────────────────────────────────────────────────────

const BASE = (content) => `
<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#333;max-width:600px;margin:0 auto;padding:20px">
  <div style="background:#6C63FF;padding:20px;border-radius:8px 8px 0 0;text-align:center">
    <h1 style="color:#fff;margin:0;font-size:22px">Career Guidance Platform</h1>
  </div>
  <div style="background:#f9f9f9;padding:30px;border-radius:0 0 8px 8px;border:1px solid #eee">
    ${content}
  </div>
  <p style="font-size:11px;color:#999;text-align:center;margin-top:20px">
    You received this email because you have an account on Career Guidance Platform.
  </p>
</body></html>`;

async function sendVerificationEmail({ email, token, firstName }) {
  const url = `${env.FRONTEND_URL}/verify-email?token=${token}`;
  await send({
    to      : email,
    subject : 'Verify your email — Career Guidance',
    html    : BASE(`
      <h2>Hi ${firstName},</h2>
      <p>Please verify your email address to activate your account.</p>
      <a href="${url}" style="display:inline-block;background:#6C63FF;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;margin:16px 0">Verify Email</a>
      <p style="color:#999;font-size:12px">Link expires in 24 hours. If you didn't create an account, ignore this email.</p>
    `),
    text: `Verify your email: ${url}`,
  });
}

async function sendPasswordResetEmail({ email, token, firstName }) {
  const url = `${env.FRONTEND_URL}/reset-password?token=${token}`;
  await send({
    to      : email,
    subject : 'Reset your password — Career Guidance',
    html    : BASE(`
      <h2>Hi ${firstName},</h2>
      <p>We received a request to reset your password.</p>
      <a href="${url}" style="display:inline-block;background:#6C63FF;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;margin:16px 0">Reset Password</a>
      <p style="color:#999;font-size:12px">Link expires in 1 hour. If you didn't request this, ignore this email.</p>
    `),
    text: `Reset your password: ${url}`,
  });
}

async function sendPasswordChangedEmail({ email, firstName }) {
  await send({
    to      : email,
    subject : 'Your password has been changed',
    html    : BASE(`
      <h2>Hi ${firstName},</h2>
      <p>Your password was successfully changed. If you did not make this change, please contact support immediately.</p>
    `),
    text: `Your password was changed. Contact support if this wasn't you.`,
  });
}

async function sendReportSharedEmail({ granteeEmail, granteeName, ownerName, reportId, permissions }) {
  const url = `${env.FRONTEND_URL}/reports/${reportId}`;
  await send({
    to      : granteeEmail,
    subject : `${ownerName} shared a career report with you`,
    html    : BASE(`
      <h2>Hi ${granteeName},</h2>
      <p><strong>${ownerName}</strong> has shared their career guidance report with you.</p>
      <p>Access: ${permissions.join(', ')}</p>
      <a href="${url}" style="display:inline-block;background:#6C63FF;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;margin:16px 0">View Report</a>
    `),
    text: `${ownerName} shared a report with you: ${url}`,
  });
}

module.exports = { sendVerificationEmail, sendPasswordResetEmail, sendPasswordChangedEmail, sendReportSharedEmail };
