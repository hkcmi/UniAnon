function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function renderMagicLinkEmail({ magicLink, expiresInMinutes }) {
  const safeLink = escapeHtml(magicLink);
  const safeMinutes = escapeHtml(expiresInMinutes);

  return {
    subject: 'Your UniAnon magic link',
    text: [
      'Sign in to UniAnon',
      '',
      `Use this link to sign in. It expires in ${expiresInMinutes} minutes:`,
      '',
      magicLink,
      '',
      'If you did not request this email, you can ignore it.'
    ].join('\n'),
    html: [
      '<!doctype html>',
      '<html>',
      '<body style="margin:0;padding:0;background:#f7f7f4;font-family:Arial,sans-serif;color:#202522;">',
      '  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7f7f4;padding:24px 0;">',
      '    <tr>',
      '      <td align="center">',
      '        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #d8ddd2;border-radius:8px;padding:24px;">',
      '          <tr>',
      '            <td>',
      '              <h1 style="margin:0 0 12px;font-size:24px;line-height:1.2;color:#202522;">Sign in to UniAnon</h1>',
      `              <p style="margin:0 0 20px;color:#667067;">This magic link expires in ${safeMinutes} minutes.</p>`,
      `              <p style="margin:0 0 24px;"><a href="${safeLink}" style="display:inline-block;background:#12684f;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:6px;">Sign in</a></p>`,
      '              <p style="margin:0 0 8px;color:#667067;font-size:14px;">If the button does not work, copy this link:</p>',
      `              <p style="margin:0 0 20px;word-break:break-all;font-size:14px;"><a href="${safeLink}" style="color:#12684f;">${safeLink}</a></p>`,
      '              <p style="margin:0;color:#667067;font-size:14px;">If you did not request this email, you can ignore it.</p>',
      '            </td>',
      '          </tr>',
      '        </table>',
      '      </td>',
      '    </tr>',
      '  </table>',
      '</body>',
      '</html>'
    ].join('\n')
  };
}
