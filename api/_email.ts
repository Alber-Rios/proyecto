// Correos transaccionales de Spotly (código de verificación y recuperación de
// contraseña). Se envían con la API de Resend cuando RESEND_API_KEY está
// configurada; si no, api/auth.ts deja que Supabase Auth envíe sus plantillas.
//
// Archivo con "_" inicial: Vercel no lo publica como función.

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

export const emailSenderConfigured = () => Boolean(process.env.RESEND_API_KEY);

function layout(title: string, body: string): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#f5f5f4;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f4;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e7e5e4">
<tr><td style="padding:28px 32px 8px;font-size:26px;font-weight:700;letter-spacing:-1px;color:#0f172a">sp<span style="color:#e11d48">&#9673;</span>tly</td></tr>
<tr><td style="padding:8px 32px 32px;font-size:15px;line-height:1.6">${body}</td></tr>
<tr><td style="padding:18px 32px;background:#fafaf9;border-top:1px solid #e7e5e4;font-size:12px;color:#78716c;line-height:1.5">
Recibiste este correo porque alguien usó esta dirección en Spotly. Si no fuiste tú, puedes ignorarlo: nadie podrá entrar a tu cuenta sin este mensaje.<br>Spotly nunca te pedirá tu contraseña por correo.
</td></tr></table></td></tr></table></body></html>`;
}

export function verificationEmail(name: string, code: string, minutes: number) {
  const digits = code.split('').map((d) => `<span style="display:inline-block;min-width:34px;padding:10px 0;margin:0 3px;border-radius:10px;background:#fff1f2;border:1px solid #fecdd3;font-size:26px;font-weight:700;color:#be123c;text-align:center">${escapeHtml(d)}</span>`).join('');
  const html = layout('Tu código de verificación de Spotly', `
<h1 style="margin:0 0 8px;font-size:21px">Confirma tu correo</h1>
<p style="margin:0 0 20px">Hola${name ? ` ${escapeHtml(name)}` : ''}, escribe este código en Spotly para terminar de crear tu cuenta:</p>
<p style="margin:0 0 20px;text-align:center;white-space:nowrap">${digits}</p>
<p style="margin:0;color:#57534e;font-size:13px">El código vence en ${minutes} minutos y solo se puede usar una vez.</p>`);
  const text = `Tu código de verificación de Spotly es ${code}. Vence en ${minutes} minutos. Si no fuiste tú, ignora este correo.`;
  return { subject: `${code} es tu código de verificación de Spotly`, html, text };
}

export function resetEmail(link: string, minutes: number) {
  const safe = escapeHtml(link);
  const html = layout('Restablece tu contraseña de Spotly', `
<h1 style="margin:0 0 8px;font-size:21px">Restablece tu contraseña</h1>
<p style="margin:0 0 22px">Recibimos una solicitud para cambiar la contraseña de tu cuenta. Presiona el botón para elegir una nueva:</p>
<p style="margin:0 0 22px;text-align:center"><a href="${safe}" style="display:inline-block;background:#e11d48;color:#ffffff;text-decoration:none;font-weight:700;padding:13px 26px;border-radius:12px">Crear nueva contraseña</a></p>
<p style="margin:0 0 6px;color:#57534e;font-size:13px">El enlace vence en ${minutes} minutos y solo funciona una vez. Si el botón no abre, copia esta dirección en tu navegador:</p>
<p style="margin:0;word-break:break-all;font-size:12px;color:#be123c">${safe}</p>`);
  const text = `Para crear una nueva contraseña de Spotly abre este enlace (vence en ${minutes} minutos): ${link}\nSi no lo pediste, ignora este correo.`;
  return { subject: 'Restablece tu contraseña de Spotly', html, text };
}

export async function sendEmail(to: string, msg: { subject: string; html: string; text: string }): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  const from = process.env.EMAIL_FROM || 'Spotly <onboarding@resend.dev>';
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject: msg.subject, html: msg.html, text: msg.text }),
  });
  if (!r.ok) {
    console.error('Resend rechazó el correo', r.status, (await r.text().catch(() => '')).slice(0, 300));
    return false;
  }
  return true;
}
