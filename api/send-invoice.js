// Vercel Serverless Function — 청구서 이메일 일괄 발송
// 환경변수: GMAIL_USER, GMAIL_APP_PASSWORD
import nodemailer from 'nodemailer';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'POST only' });
  }
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    return res.status(500).json({ ok: false, error: 'GMAIL_USER / GMAIL_APP_PASSWORD 환경변수가 설정되지 않았습니다.' });
  }

  const { messages, bcc, subject, fromName } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ ok: false, error: 'messages 배열이 필요합니다.' });
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });

  const results = [];
  for (const m of messages) {
    if (!m?.to || !m?.html) {
      results.push({ to: m?.to||'(누락)', ok: false, error: '수신자 또는 본문 누락' });
      continue;
    }
    try {
      const info = await transporter.sendMail({
        from: fromName ? `"${fromName}" <${user}>` : user,
        to: m.to,
        bcc: bcc || undefined,
        subject: m.subject || subject || '관리비 청구서 안내',
        html: m.html,
      });
      results.push({ to: m.to, ok: true, messageId: info.messageId });
    } catch (e) {
      results.push({ to: m.to, ok: false, error: e?.message || '발송 실패' });
    }
  }

  const okCount = results.filter(r => r.ok).length;
  res.status(200).json({ ok: okCount === results.length, sent: okCount, total: results.length, results });
}
