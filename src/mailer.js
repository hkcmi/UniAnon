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

function parseEmailFrom(value) {
  const trimmed = String(value || '').trim();
  const match = trimmed.match(/^(.*)<([^>]+)>$/);
  if (!match) {
    return { email: trimmed };
  }

  const name = match[1].trim().replace(/^"|"$/g, '');
  return {
    email: match[2].trim(),
    ...(name ? { name } : {})
  };
}

export function createMailer(options = {}) {
  const transport = options.transport || createTransport();
  const delivery = options.delivery || config.emailDelivery;
  const fetchClient = options.fetch || globalThis.fetch;
  const sendgridConfig = options.sendgrid || config.sendgrid;

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

      const emailBody = renderMagicLinkEmail({
        magicLink,
        expiresInMinutes: Math.max(Math.floor(config.tokenTtlMs / 60000), 1)
      });

      if (delivery === 'sendgrid') {
        if (!sendgridConfig.apiKey) {
          throw new Error('SENDGRID_API_KEY is required when EMAIL_DELIVERY=sendgrid');
        }
        if (typeof fetchClient !== 'function') {
          throw new Error('fetch is required for EMAIL_DELIVERY=sendgrid');
        }

        const response = await fetchClient(sendgridConfig.apiUrl, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${sendgridConfig.apiKey}`,
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            personalizations: [{
              to: [{ email }]
            }],
            from: parseEmailFrom(config.emailFrom),
            subject: emailBody.subject,
            content: [
              { type: 'text/plain', value: emailBody.text },
              { type: 'text/html', value: emailBody.html }
            ]
          })
        });

        if (!response.ok) {
          throw new Error(`SendGrid delivery failed with status ${response.status}`);
        }

        return {
          delivery: 'sendgrid'
        };
      }

      if (delivery !== 'smtp') {
        throw new Error(`Unsupported email delivery mode: ${delivery}`);
      }

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
