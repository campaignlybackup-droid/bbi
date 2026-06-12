/**
 * BBI — Email Service
 * Sends ranking update emails using Nodemailer + Hostinger SMTP.
 * Gracefully skips if SMTP is not configured.
 */

const { BASE_URL } = require('../config/constants');

let transporter = null;

/**
 * Initialize email transporter.
 * Returns false if SMTP is not configured.
 */
function initTransporter() {
  if (transporter) return true;

  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return false;
  }

  try {
    const nodemailer = require('nodemailer');
    transporter = nodemailer.createTransport({
      host,
      port: parseInt(port) || 465,
      secure: (parseInt(port) || 465) === 465,
      auth: { user, pass },
    });
    return true;
  } catch (e) {
    console.warn('⚠️  Email service unavailable:', e.message);
    return false;
  }
}

/**
 * Send a ranking update email to a business.
 */
async function sendRankingUpdate(business, rankData) {
  if (!initTransporter()) return false;

  const subject = getRankingSubject(business, rankData);
  const html = getRankingEmailHtml(business, rankData);

  try {
    await transporter.sendMail({
      from: `"BBI Rankings" <${process.env.SMTP_USER}>`,
      to: business.email,
      subject,
      html,
    });
    return true;
  } catch (e) {
    console.error('Email send failed:', e.message);
    return false;
  }
}

/**
 * Send achievement notification email.
 */
async function sendAchievement(business, achievement) {
  if (!initTransporter() || !business.email) return false;

  try {
    await transporter.sendMail({
      from: `"BBI Rankings" <${process.env.SMTP_USER}>`,
      to: business.email,
      subject: `🏆 ${achievement} — ${business.name} on BBI`,
      html: getAchievementEmailHtml(business, achievement),
    });
    return true;
  } catch (e) {
    console.error('Achievement email failed:', e.message);
    return false;
  }
}

/**
 * Determine email subject based on rank change.
 */
function getRankingSubject(business, rankData) {
  if (rankData.rank_position === 1) {
    return `🥇 ${business.name} is now #1 on BBI!`;
  }
  if (rankData.movement > 0) {
    return `📈 ${business.name} moved up to #${rankData.rank_position} on BBI`;
  }
  if (rankData.movement < 0) {
    return `📊 ${business.name} ranking update — now #${rankData.rank_position}`;
  }
  return `📊 ${business.name} — Monthly ranking update from BBI`;
}

/**
 * Generate ranking update email HTML.
 */
function getRankingEmailHtml(business, rankData) {
  const profileUrl = `${BASE_URL}/business/${business.slug}`;
  const certUrl = `${BASE_URL}/api/certificate/${business.id}`;

  let movementText = '';
  if (rankData.movement > 0) {
    movementText = `<p style="color:#16a34a;font-weight:700;">↑ Moved up ${rankData.movement} position${rankData.movement > 1 ? 's' : ''}</p>`;
  } else if (rankData.movement < 0) {
    movementText = `<p style="color:#dc2626;font-weight:700;">↓ Moved down ${Math.abs(rankData.movement)} position${Math.abs(rankData.movement) > 1 ? 's' : ''}</p>`;
  }

  return `
    <div style="max-width:600px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
      <div style="background:#0D2E5E;padding:24px 32px;border-radius:12px 12px 0 0;">
        <h1 style="color:#fff;margin:0;font-size:18px;">BBI <span style="color:#E8A020;">·</span> Bharat Business Index</h1>
      </div>
      <div style="background:#fff;padding:32px;border:1px solid #e2e6ea;border-top:none;">
        <h2 style="color:#1A1A2E;margin:0 0 8px;font-size:22px;">${business.name}</h2>
        <p style="color:#4A5568;margin:0 0 16px;font-size:14px;">${rankData.cat_name || ''} · ${rankData.city_name || ''}</p>

        <div style="background:#F5F6F8;border-radius:8px;padding:20px;text-align:center;margin-bottom:20px;">
          <div style="font-size:48px;font-weight:800;color:#0D2E5E;">#${rankData.rank_position}</div>
          <div style="font-size:13px;color:#4A5568;margin-top:4px;">Current Ranking</div>
          ${movementText}
        </div>

        <div style="font-size:14px;color:#4A5568;line-height:1.7;margin-bottom:24px;">
          Your monthly ranking on Bharat Business Index has been updated.
          Score: <strong>${Math.round(rankData.final_score || 0)}/100</strong>
        </div>

        <div style="display:flex;gap:12px;flex-wrap:wrap;">
          <a href="${profileUrl}" style="background:#0D2E5E;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">View Profile</a>
          <a href="${certUrl}" style="background:#E8A020;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">Download Certificate</a>
        </div>
      </div>
      <div style="background:#F5F6F8;padding:16px 32px;border-radius:0 0 12px 12px;border:1px solid #e2e6ea;border-top:none;">
        <p style="font-size:11px;color:#718096;margin:0;">This email was sent by Bharat Business Index. Rankings are independent and based on verified data.</p>
      </div>
    </div>
  `;
}

/**
 * Generate achievement email HTML.
 */
function getAchievementEmailHtml(business, achievement) {
  const profileUrl = `${BASE_URL}/business/${business.slug}`;

  return `
    <div style="max-width:600px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
      <div style="background:#0D2E5E;padding:24px 32px;border-radius:12px 12px 0 0;">
        <h1 style="color:#fff;margin:0;font-size:18px;">BBI <span style="color:#E8A020;">·</span> Bharat Business Index</h1>
      </div>
      <div style="background:#fff;padding:32px;border:1px solid #e2e6ea;border-top:none;">
        <div style="text-align:center;margin-bottom:24px;">
          <div style="font-size:48px;margin-bottom:8px;">🏆</div>
          <h2 style="color:#1A1A2E;margin:0 0 8px;font-size:22px;">${achievement}</h2>
          <p style="color:#4A5568;margin:0;font-size:14px;">Congratulations, ${business.name}!</p>
        </div>

        <div style="font-size:14px;color:#4A5568;line-height:1.7;margin-bottom:24px;">
          Your business has earned the <strong>${achievement}</strong> badge on Bharat Business Index.
          This achievement is displayed on your BBI profile.
        </div>

        <a href="${profileUrl}" style="display:block;text-align:center;background:#0D2E5E;color:#fff;padding:14px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">View Your Profile</a>
      </div>
      <div style="background:#F5F6F8;padding:16px 32px;border-radius:0 0 12px 12px;border:1px solid #e2e6ea;border-top:none;">
        <p style="font-size:11px;color:#718096;margin:0;">Bharat Business Index — Independent, transparent business rankings.</p>
      </div>
    </div>
  `;
}

module.exports = {
  sendRankingUpdate,
  sendAchievement,
  initTransporter,
};
