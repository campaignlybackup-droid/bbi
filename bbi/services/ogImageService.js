/**
 * BBI — OG Image Service
 * Generates dynamic Open Graph images as SVG for social sharing.
 * No external dependencies — pure SVG rendering.
 */

const { BASE_URL } = require('../config/constants');

/**
 * Generate an OG image SVG for a ranking page.
 */
function generateRankingOg(category, city, date) {
  const title = escapeXml(`Top ${category} in ${city}`);
  const subtitle = escapeXml(date || new Date().toISOString().slice(0, 7));

  return createOgSvg(title, subtitle, 'Rankings');
}

/**
 * Generate an OG image SVG for a business profile.
 */
function generateBusinessOg(businessName, category, city, rank) {
  const title = escapeXml(businessName);
  const subtitle = escapeXml(`#${rank || '–'} in ${category} · ${city}`);

  return createOgSvg(title, subtitle, 'Business Profile');
}

/**
 * Generate an OG image SVG for a city page.
 */
function generateCityOg(cityName, state, bizCount) {
  const title = escapeXml(`Top Businesses in ${cityName}`);
  const subtitle = escapeXml(`${state} · ${bizCount} businesses ranked`);

  return createOgSvg(title, subtitle, 'City Rankings');
}

/**
 * Generate an OG image SVG for a blog post.
 */
function generateBlogOg(postTitle, category) {
  const title = escapeXml(postTitle);
  const subtitle = escapeXml(category || 'BBI Blog');

  return createOgSvg(title, subtitle, 'Article');
}

/**
 * Generate an OG image SVG for a digest page.
 */
function generateDigestOg(monthDisplay) {
  const title = escapeXml(`Monthly Digest — ${monthDisplay}`);
  const subtitle = 'Rankings recap & highlights';

  return createOgSvg(title, subtitle, 'Digest');
}

/**
 * Base SVG template for OG images.
 * Dimensions: 1200x630 (standard OG image size)
 */
function createOgSvg(title, subtitle, badge) {
  // Truncate title if too long for SVG display
  const displayTitle = title.length > 50 ? title.substring(0, 47) + '...' : title;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" style="stop-color:#0D2E5E"/>
      <stop offset="100%" style="stop-color:#091f42"/>
    </linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" style="stop-color:#E8A020"/>
      <stop offset="100%" style="stop-color:#f5c44a"/>
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="1200" height="630" fill="url(#bg)"/>

  <!-- Grid pattern -->
  <g opacity="0.03">
    ${Array.from({length: 20}, (_, i) => `<line x1="${i * 60}" y1="0" x2="${i * 60}" y2="630" stroke="#fff" stroke-width="1"/>`).join('\n    ')}
    ${Array.from({length: 11}, (_, i) => `<line x1="0" y1="${i * 60}" x2="1200" y2="${i * 60}" stroke="#fff" stroke-width="1"/>`).join('\n    ')}
  </g>

  <!-- Gold accent line -->
  <rect x="80" y="180" width="60" height="4" rx="2" fill="url(#gold)"/>

  <!-- Badge -->
  <text x="80" y="170" fill="#E8A020" font-family="Arial,Helvetica,sans-serif" font-size="16" font-weight="700" letter-spacing="2">${escapeXml(badge.toUpperCase())}</text>

  <!-- Title -->
  <text x="80" y="260" fill="#ffffff" font-family="Arial,Helvetica,sans-serif" font-size="48" font-weight="700">${displayTitle}</text>

  <!-- Subtitle -->
  <text x="80" y="310" fill="rgba(255,255,255,0.5)" font-family="Arial,Helvetica,sans-serif" font-size="22">${subtitle}</text>

  <!-- Bottom bar -->
  <rect x="0" y="550" width="1200" height="80" fill="rgba(0,0,0,0.2)"/>

  <!-- Logo -->
  <text x="80" y="600" fill="#ffffff" font-family="Arial,Helvetica,sans-serif" font-size="20" font-weight="700">BBI <tspan fill="#E8A020">·</tspan> Bharat Business Index</text>

  <!-- URL -->
  <text x="1120" y="600" fill="rgba(255,255,255,0.4)" font-family="Arial,Helvetica,sans-serif" font-size="16" text-anchor="end">bbi.in</text>
</svg>`;
}

/**
 * Get the OG image URL for a given page type.
 */
function getOgImageUrl(pageType, entityId) {
  return `${BASE_URL}/api/og/${pageType}/${entityId || 'default'}.svg`;
}

function escapeXml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

module.exports = {
  generateRankingOg,
  generateBusinessOg,
  generateCityOg,
  generateBlogOg,
  generateDigestOg,
  getOgImageUrl,
};
