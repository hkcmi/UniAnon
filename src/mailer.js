import nodemailer from 'nodemailer';
import { config } from './config.js';
import { renderMagicLinkEmail } from './email-templates.js';

function createTransport() {
  if (config.emailDelivery !== 'smtp') {
    return null;
  }

  if (!config.smtp.host) {
    throw new Error('SMTP_HOST is required when EMAIL_DELIVERY=smtp');
  }

  const auth = config.smtp.user || config.smtp.pass
    ? { user: config.smtp.user, pass: config.smtp.pass }
    : undefined;

  return nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth
  });
}

export function createMailer(options = {}) {
  const transport = options.transport || createTransport();
  const delivery = options.delivery || config.emailDelivery;

  return {
    delivery,

    createMagicLink(token) {
      const url = new URL(config.appBaseUrl);
      url.searchParams.set('token', token);
      return url.toString();
    },

    async sendMagicLink(email, token) {
      const magicLink = this.createMagicLink(token);

      if (delivery === 'dev') {
        return {
          delivery: 'dev_response',
          token,
          magic_link: magicLink
        };
      }

      if (delivery !== 'smtp') {
        throw new Error(`Unsupported email delivery mode: ${delivery}`);
      }

      const emailBody = renderMagicLinkEmail({
        magicLink,
        expiresInMinutes: Math.max(Math.floor(config.tokenTtlMs / 60000), 1)
      });

      await transport.sendMail({
        from: config.emailFrom,
        to: email,
        subject: emailBody.subject,
        text: emailBody.text,
        html: emailBody.html
      });

      return {
        delivery: 'smtp'
      };
    }
  };
}
