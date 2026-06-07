/**
 * BBI — Badge & Certificate Service
 * Generates BBI badges and ranking certificates as SVG (no canvas dependency).
 */

const db = require('../config/db');

/**
 * Generate BBI Badge SVG for a business.
 */
function generateBadgeSvg(business, rankPosition) {
  const name = escapeXml(business.name);
  const rank = rankPosition ? `#${rankPosition}` : 'Ranked';
  const year = new Date().getFullYear();

  return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="80" viewBox="0 0 200 80">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" style="stop-color:#0D2E5E"/>
      <stop offset="100%" style="stop-color:#1a4a8a"/>
    </linearGradient>
  </defs>
  <rect width="200" height="80" rx="8" fill="url(#bg)"/>
  <text x="12" y="24" fill="#E8A020" font-family="Arial,sans-serif" font-size="11" font-weight="700">BBI · RANKED</text>
  <text x="12" y="44" fill="#fff" font-family="Arial,sans-serif" font-size="13" font-weight="600">${name}</text>
  <text x="12" y="62" fill="rgba(255,255,255,0.6)" font-family="Arial,sans-serif" font-size="10">${rank} · Bharat Business Index ${year}</text>
  <circle cx="178" cy="40" r="16" fill="#E8A020"/>
  <text x="178" y="45" fill="#0D2E5E" font-family="Arial,sans-serif" font-size="14" font-weight="700" text-anchor="middle">${rank}</text>
</svg>`;
}

/**
 * Generate Ranking Certificate SVG.
 */
function generateCertificateSvg(business, rankData) {
  const name = escapeXml(business.name);
  const city = escapeXml(rankData.city_name || '');
  const category = escapeXml(rankData.cat_name || '');
  const rank = rankData.rank_position || '';
  const date = rankData.ranking_date || new Date().toISOString().slice(0, 10);
  const score = Math.round(rankData.final_score || 0);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">
  <defs>
    <linearGradient id="cbg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" style="stop-color:#f8f9fb"/>
      <stop offset="100%" style="stop-color:#fff"/>
    </linearGradient>
  </defs>
  <rect width="600" height="400" fill="url(#cbg)"/>
  <rect x="8" y="8" width="584" height="384" rx="4" fill="none" stroke="#0D2E5E" stroke-width="2"/>
  <rect x="12" y="12" width="576" height="376" rx="2" fill="none" stroke="#E8A020" stroke-width="1"/>

  <!-- Header -->
  <text x="300" y="55" fill="#0D2E5E" font-family="Arial,sans-serif" font-size="14" font-weight="700" text-anchor="middle" letter-spacing="3">BHARAT BUSINESS INDEX</text>
  <text x="300" y="75" fill="#E8A020" font-family="Arial,sans-serif" font-size="10" text-anchor="middle" letter-spacing="2">CERTIFICATE OF RANKING</text>
  <line x1="100" y1="90" x2="500" y2="90" stroke="#e2e6ea" stroke-width="1"/>

  <!-- Rank badge -->
  <circle cx="300" cy="140" r="32" fill="#0D2E5E"/>
  <text x="300" y="148" fill="#E8A020" font-family="Arial,sans-serif" font-size="24" font-weight="700" text-anchor="middle">#${rank}</text>

  <!-- Business name -->
  <text x="300" y="200" fill="#1A1A2E" font-family="Arial,sans-serif" font-size="20" font-weight="700" text-anchor="middle">${name}</text>

  <!-- Details -->
  <text x="300" y="230" fill="#4A5568" font-family="Arial,sans-serif" font-size="12" text-anchor="middle">Ranked #${rank} in ${category} · ${city}</text>
  <text x="300" y="252" fill="#4A5568" font-family="Arial,sans-serif" font-size="12" text-anchor="middle">Ranking Score: ${score}/100 · Period: ${date}</text>

  <!-- Divider -->
  <line x1="150" y1="275" x2="450" y2="275" stroke="#e2e6ea" stroke-width="1"/>

  <!-- Methodology note -->
  <text x="300" y="300" fill="#4A5568" font-family="Arial,sans-serif" font-size="9" text-anchor="middle">This ranking is based on BBI's transparent methodology including customer reviews,</text>
  <text x="300" y="315" fill="#4A5568" font-family="Arial,sans-serif" font-size="9" text-anchor="middle">review volume, online presence, profile completeness, and editorial assessment.</text>

  <!-- Footer -->
  <text x="300" y="355" fill="#0D2E5E" font-family="Arial,sans-serif" font-size="10" font-weight="600" text-anchor="middle">BBI · Bharat Business Index</text>
  <text x="300" y="372" fill="rgba(74,85,104,0.6)" font-family="Arial,sans-serif" font-size="8" text-anchor="middle">Independent · Transparent · Updated Monthly · bharatbusinessindex.com</text>
</svg>`;
}

function escapeXml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Get badge data for a business.
 */
function getBadgeForBusiness(businessId) {
  const business = db.prepare(`
    SELECT b.*, c.name as city_name, cat.name as cat_name
    FROM businesses b
    JOIN cities c ON c.id = b.city_id
    JOIN categories cat ON cat.id = b.category_id
    WHERE b.id = ? AND b.active = 1
  `).get(businessId);

  if (!business) return null;

  const latest = db.prepare(`
    SELECT rank_position, final_score, ranking_date FROM ranking_history
    WHERE business_id = ? ORDER BY ranking_date DESC LIMIT 1
  `).get(businessId);

  return {
    badge: generateBadgeSvg(business, latest?.rank_position),
    certificate: generateCertificateSvg(business, {
      ...latest,
      city_name: business.city_name,
      cat_name: business.cat_name,
    }),
    business,
    latest,
  };
}

module.exports = {
  generateBadgeSvg,
  generateCertificateSvg,
  getBadgeForBusiness,
};
