/**
 * BBI — BBI Scoring Service
 * Formula-based scoring engine. Never uses AI for ranking.
 * Calculates BBI Score, category rank, and city rank.
 * Stores ranking history for trend analysis.
 */

const db = require('../config/db');
const { BBI_SCORE_WEIGHTS } = require('../config/constants');

/**
 * Calculate BBI Score using the weighted formula.
 * This is a pure mathematical calculation — no AI involved.
 *
 * Weights:
 *   Google Rating    = 35%
 *   Review Count     = 25%
 *   Website Presence = 10%
 *   Social Presence  = 10%
 *   Profile Complete = 10%
 *   Verification     = 10%
 *
 * @param {object} business - Business data object
 * @returns {number} BBI Score (0-100, 1 decimal place)
 */
function calculateBBIScore(business) {
  // Google Rating (35%) — Scale: 0-5 → 0-100
  const rating = parseFloat(business.google_rating) || 0;
  const ratingScore = (Math.min(Math.max(rating, 0), 5) / 5) * 100;

  // Review Count (25%) — Logarithmic scale, capped at 1000 reviews = 100%
  const reviewCount = parseInt(business.google_review_count || business.review_count) || 0;
  const reviewScore = reviewCount > 0
    ? Math.min((Math.log10(Math.max(reviewCount, 1)) / Math.log10(1000)) * 100, 100)
    : 0;

  // Website Presence (10%) — Has a valid website URL
  const websiteScore = (business.website && business.website.length > 5) ? 100 : 0;

  // Social Presence (10%) — Number of social profiles out of 3
  const socialProfiles = [
    business.facebook_url || business.facebook,
    business.instagram_url || business.instagram,
    business.linkedin_url || business.linkedin,
  ].filter(v => v && String(v).trim().length > 0);
  const socialScore = (socialProfiles.length / 3) * 100;

  // Profile Completeness (10%) — Key fields filled
  const completenessFields = [
    business.description,
    business.phone,
    business.address,
    business.email,
    business.services,
  ];
  const filledCount = completenessFields.filter(v => v && String(v).trim().length > 0).length;
  const completenessScore = (filledCount / completenessFields.length) * 100;

  // Verification Status (10%) — Is verified
  const verificationScore = business.verified ? 100 : 0;

  // Weighted final score
  const bbiScore = (
    ratingScore * BBI_SCORE_WEIGHTS.GOOGLE_RATING +
    reviewScore * BBI_SCORE_WEIGHTS.REVIEW_COUNT +
    websiteScore * BBI_SCORE_WEIGHTS.WEBSITE_PRESENCE +
    socialScore * BBI_SCORE_WEIGHTS.SOCIAL_PRESENCE +
    completenessScore * BBI_SCORE_WEIGHTS.PROFILE_COMPLETENESS +
    verificationScore * BBI_SCORE_WEIGHTS.VERIFICATION_STATUS
  );

  return Math.round(bbiScore * 10) / 10; // 1 decimal place
}

/**
 * Get score breakdown for display.
 */
function getScoreBreakdown(business) {
  const rating = parseFloat(business.google_rating) || 0;
  const reviewCount = parseInt(business.google_review_count || business.review_count) || 0;

  const ratingScore = (Math.min(Math.max(rating, 0), 5) / 5) * 100;
  const reviewScore = reviewCount > 0
    ? Math.min((Math.log10(Math.max(reviewCount, 1)) / Math.log10(1000)) * 100, 100)
    : 0;
  const websiteScore = (business.website && business.website.length > 5) ? 100 : 0;
  const socialProfiles = [
    business.facebook_url || business.facebook,
    business.instagram_url || business.instagram,
    business.linkedin_url || business.linkedin,
  ].filter(v => v && String(v).trim().length > 0);
  const socialScore = (socialProfiles.length / 3) * 100;
  const completenessFields = [business.description, business.phone, business.address, business.email, business.services];
  const completenessScore = (completenessFields.filter(v => v && String(v).trim().length > 0).length / completenessFields.length) * 100;
  const verificationScore = business.verified ? 100 : 0;

  return {
    google_rating: { raw: rating, score: Math.round(ratingScore * 10) / 10, weight: '35%' },
    review_count: { raw: reviewCount, score: Math.round(reviewScore * 10) / 10, weight: '25%' },
    website_presence: { raw: !!business.website, score: websiteScore, weight: '10%' },
    social_presence: { raw: socialProfiles.length + '/3', score: Math.round(socialScore * 10) / 10, weight: '10%' },
    profile_completeness: { raw: `${completenessFields.filter(Boolean).length}/5`, score: completenessScore, weight: '10%' },
    verification_status: { raw: !!business.verified, score: verificationScore, weight: '10%' },
    total: calculateBBIScore(business),
  };
}

/**
 * Calculate and store BBI score for a business.
 */
function calculateAndStore(businessId) {
  const business = db.prepare(`SELECT * FROM businesses WHERE id = ?`).get(businessId);
  if (!business) return null;

  const bbiScore = calculateBBIScore(business);

  db.prepare(`UPDATE businesses SET bbi_score = ? WHERE id = ?`).run(bbiScore, businessId);

  return bbiScore;
}

/**
 * Get category rank for a business.
 */
function getCategoryRank(businessId, categoryId) {
  const result = db.prepare(`
    SELECT COUNT(*) + 1 as rank_pos
    FROM businesses
    WHERE category_id = ? AND active = 1 AND bbi_score > (
      SELECT COALESCE(bbi_score, 0) FROM businesses WHERE id = ?
    )
  `).get(categoryId, businessId);
  return result ? result.rank_pos : null;
}

/**
 * Get city rank for a business.
 */
function getCityRank(businessId, cityId) {
  const result = db.prepare(`
    SELECT COUNT(*) + 1 as rank_pos
    FROM businesses
    WHERE city_id = ? AND active = 1 AND bbi_score > (
      SELECT COALESCE(bbi_score, 0) FROM businesses WHERE id = ?
    )
  `).get(cityId, businessId);
  return result ? result.rank_pos : null;
}

/**
 * Recalculate BBI scores for all active businesses.
 */
function recalculateAll() {
  const businesses = db.prepare(`SELECT * FROM businesses WHERE active = 1`).all();
  let updated = 0;

  const updateStmt = db.prepare(`UPDATE businesses SET bbi_score = ? WHERE id = ?`);

  const transaction = db.transaction(() => {
    businesses.forEach(b => {
      const score = calculateBBIScore(b);
      updateStmt.run(score, b.id);
      updated++;
    });
  });

  transaction();
  return updated;
}

module.exports = {
  calculateBBIScore,
  getScoreBreakdown,
  calculateAndStore,
  getCategoryRank,
  getCityRank,
  recalculateAll,
};
