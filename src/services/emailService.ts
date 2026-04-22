import nodemailer, { Transporter } from "nodemailer";
import { env } from "../config/env";
import { logger } from "../utils/logger";
import { fileLogger } from "./fileLogger";

let transporter: Transporter | null = null;

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
}

function getTransporter(): Transporter {
  if (!transporter) {
    if (!env.SMTP_USER || !env.SMTP_PASS) {
      logger.warn("SMTP credentials not set – emails will be logged only");
    }

    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER
        ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
        : undefined,
    });
  }
  return transporter;
}

function logDevEmail(opts: EmailOptions): void {
  if (env.NODE_ENV !== "development") return;

  const to = Array.isArray(opts.to) ? opts.to.join(", ") : opts.to;
  const from = opts.from ?? env.SMTP_FROM;
  const resetUrlMatch = opts.html.match(/https?:\/\/[^\s"']*\/reset-password\?token=[^\s"']+/);
  const resetUrl = resetUrlMatch?.[0];

  logger.info("[DEV EMAIL]", {
    to,
    from,
    subject: opts.subject,
    resetUrl,
  });

  if (resetUrl) {
    // This is the most useful thing to copy during local testing
    // and avoids dumping the whole HTML template into the console.
    // eslint-disable-next-line no-console
    console.log(`[DEV EMAIL] Password reset link: ${resetUrl}`);
  }
}

export async function sendEmail(opts: EmailOptions): Promise<boolean> {
  const { to, subject, html, text, from = env.SMTP_FROM } = opts;

  logDevEmail(opts);

  if (!env.SMTP_USER || !env.SMTP_PASS) {
    fileLogger.info("system", "Email would be sent (SMTP not configured)", {
      to,
      subject,
      from,
    });
    logger.info("Email (SMTP not configured):", { to, subject });
    return true;
  }

  try {
    const info = await getTransporter().sendMail({
      from,
      to,
      subject,
      html,
      text,
    });
    logger.info("Email sent", { messageId: info.messageId, to, subject });
    fileLogger.info("system", "Email sent", {
      messageId: info.messageId,
      to,
      subject,
    });
    return true;
  } catch (error) {
    logger.error("Email send failed", {
      error: (error as Error).message,
      to,
      subject,
    });
    fileLogger.error("system", "Email send failed", {
      error: (error as Error).message,
      to,
      subject,
    });
    return false;
  }
}

export function buildPasswordResetEmail(
  resetUrl: string,
  userName: string,
): EmailOptions["html"] {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #1e3a5f 0%, #2d6a4f 100%); padding: 30px; border-radius: 8px 8px 0 0; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 24px;">Lako Admin</h1>
        <p style="color: rgba(255,255,255,0.8); margin: 8px 0 0;">Password Reset Request</p>
      </div>
      <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none;">
        <p style="color: #374151; font-size: 16px;">Hello ${userName},</p>
        <p style="color: #6b7280;">We received a request to reset your password for your Lako Admin account.</p>
        <p style="color: #6b7280;">Click the button below to reset your password. This link will expire in <strong>1 hour</strong>.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" style="background: #1e3a5f; color: white; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">
            Reset Password
          </a>
        </div>
        <p style="color: #9ca3af; font-size: 14px;">If you can't click the button, copy this link: <a href="${resetUrl}" style="color: #1e3a5f;">${resetUrl}</a></p>
        <p style="color: #9ca3af; font-size: 14px; margin-top: 20px;">If you did not request a password reset, please ignore this email or contact support.</p>
      </div>
      <div style="background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; text-align: center;">
        <p style="color: #9ca3af; font-size: 13px; margin: 0;">© ${new Date().getFullYear()} Innovasure Limited. All rights reserved.</p>
      </div>
    </div>
  `;
}
