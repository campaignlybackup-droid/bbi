/**
 * BBI — Ranking Service
 * Core ranking engine: scoring, recalculation, movement tracking, explanations.
 * Fixes M-03 (actual score components), M-06 (manual boost), M-10 (auto recalculate).
 */

const db = require('../config/db');
const {
  SCORE_WEIGHTS,
  REVIEW_QUALITY_THRESHOLDS,
  REVIEW_VOLUME_THRESHOLDS,
  AUTO_SCORE_MAX,
  TOTAL_SCORE_MAX,
} = require('../config/constants');

/**
 * Calculate individual score components and return all of them.
 * Fixes M-03: returns actual component values instead of zeros.
 */
function calculateScoreComponents(business) {
  const r = business.google_rating || 0;
  const v = business.google_review_count || 0;

  // Review quality (max 35)
  let reviewScore = 10;
  for (const t of REVIEW_QUALITY_THRESHOLDS) {
    if (r >= t.min) { reviewScore = t.score; break; }
  }

  // Review volume (max 25)
  let volumeScore = 5;
  for (const t of REVIEW_VOLUME_THRESHOLDS) {
    if (v >= t.min) { volumeScore = t.score; break; }
  }

  // Website & online presence (max 15)
  let websiteScore = 0;
  if (business.website && business.website.length > 5) websiteScore = 15;
  else if (business.social_url) websiteScore = 8;

  // Verification status (max 10)
  const verifiedScore = business.verified ? 10 : 0;

  // Profile completeness (max 10)
  let completenessScore = 0;
  if (business.description && business.description.length > 20) completenessScore += 5;
  if (business.phone) completenessScore += 3;
  if (business.address) completenessScore += 2;

  const autoScore = Math.min(
    reviewScore + volumeScore + websiteScore + verifiedScore + completenessScore,
    AUTO_SCORE_MAX
  );

  return {
    review_score: reviewScore,
    volume_score: volumeScore,
    website_score: websiteScore,
    verified_score: verifiedScore,
    completeness_score: completenessScore,
    auto_score: autoScore,
  };
}

/**
 * Get human-readable explanations for a business's ranking.
 */
function getRankingExplanations(business, scores) {
  const reasons = [];
  if (business.google_rating >= 4.8) reasons.push('Excellent customer satisfaction (4.8+ rating)');
  else if (business.google_rating >= 4.5) reasons.push('High customer review ratings');
  else if (business.google_rating >= 4.0) reasons.push('Good customer review ratings');

  if (business.google_review_count >= 1000) reasons.push('Strong review volume (1000+ reviews)');
  else if (business.google_review_count >= 500) reasons.push('Good volume of verified reviews');
  else if (business.google_review_count >= 200) reasons.push('Growing review base');

  if (business.website) reasons.push('Established online presence');
  if (business.verified) reasons.push('Verified business information');
  if (business.description && business.description.length > 20) reasons.push('Complete business profile');
  if (business.phone && business.address) reasons.push('Full contact information provided');

  if (scores && scores.editorial_score >= 10) reasons.push('Strong editorial quality assessment');
  else if (scores && scores.editorial_score >= 5) reasons.push('Positive editorial review');

  return reasons;
}

/**
 * Get trend badge for a business based on ranking history.
 */
function getTrendBadge(business_id, current_rank) {
  const history = db.prepare(`
    SELECT rank_position FROM ranking_history
    WHERE business_id = ? ORDER BY ranking_date DESC LIMIT 3
  `).all(business_id);

  if (history.length < 1) return null;

  if (current_rank === 1) return 'Market Leader';

  if (history.length >= 2) {
    const prev = history[1].rank_position;
    if (prev - current_rank >= 5) return 'Most Improved';
    if (prev - current_rank >= 2) return 'Fast Rising';
    if (current_rank <= 3 && history.every(h => h.rank_position <= 3)) return 'Consistently Top Rated';
  }

  if (current_rank <= 5) return 'Top Performer';
  return null;
}

/**
 * Get movement data comparing current rank to previous.
 */
function getMovement(business_id, current_rank) {
  const prev = db.prepare(`
    SELECT rank_position FROM ranking_history
    WHERE business_id = ? ORDER BY ranking_date DESC LIMIT 2
  `).all(business_id);

  if (prev.length < 2) return { direction: 'new', diff: 0, label: 'New entry' };
  const old = prev[1].rank_position;
  const diff = old - current_rank;
  if (diff > 0) return { direction: 'up', diff, label: `↑ Moved up ${diff} position${diff > 1 ? 's' : ''}` };
  if (diff < 0) return { direction: 'down', diff: Math.abs(diff), label: `↓ Moved down ${Math.abs(diff)} position${Math.abs(diff) > 1 ? 's' : ''}` };
  return { direction: 'same', diff: 0, label: '→ No change' };
}

/**
 * Recalculate rankings for a specific city + category combo.
 * Fixes M-06: properly retrieves and applies manual_boost.
 * Fixes M-03: saves actual score components.
 */
function recalculateRankings(city_id, category_id) {
  const businesses = db.prepare(`
    SELECT b.*, rs.editorial_score, rs.manual_boost, rs.strict_rank
    FROM businesses b
    LEFT JOIN ranking_scores rs ON rs.business_id = b.id
    WHERE b.city_id = ? AND b.category_id = ? AND b.active = 1
  `).all(city_id, category_id);

  const scored = businesses.map(b => {
    const components = calculateScoreComponents(b);
    const editorial = b.editorial_score || 0;
    const boost = b.manual_boost || 0;
    const finalScore = Math.min(components.auto_score + editorial + boost, TOTAL_SCORE_MAX);

    return {
      ...b,
      ...components,
      editorial_score: editorial,
      manual_boost: boost,
      strict_rank: b.strict_rank || null,
      final_score: finalScore,
    };
  });

  const rankedBusinesses = scored.filter(b => b.is_ranked !== 0);

  rankedBusinesses.sort((a, b) => {
    if (a.strict_rank !== null && b.strict_rank !== null) return a.strict_rank - b.strict_rank;
    if (a.strict_rank !== null) return -1;
    if (b.strict_rank !== null) return 1;
    return b.final_score - a.final_score;
  });

  const today = new Date().toISOString().slice(0, 10);

  const insertHistory = db.prepare(`
    INSERT INTO ranking_history (business_id,city_id,category_id,rank_position,final_score,auto_score,manual_boost,ranking_date)
    VALUES (?,?,?,?,?,?,?,?)
  `);

  const updateScore = db.prepare(`
    INSERT INTO ranking_scores (business_id,review_score,volume_score,website_score,completeness_score,verified_score,editorial_score,auto_score,manual_boost,final_score)
    VALUES (?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(business_id) DO UPDATE SET
      review_score=excluded.review_score,
      volume_score=excluded.volume_score,
      website_score=excluded.website_score,
      completeness_score=excluded.completeness_score,
      verified_score=excluded.verified_score,
      editorial_score=excluded.editorial_score,
      auto_score=excluded.auto_score,
      manual_boost=excluded.manual_boost,
      final_score=excluded.final_score,
      last_calculated=CURRENT_TIMESTAMP
  `);

  const transaction = db.transaction(() => {
    // Clear any existing history for this exact date and combo to prevent duplicates
    db.prepare(`
      DELETE FROM ranking_history 
      WHERE city_id=? AND category_id=? AND ranking_date=?
    `).run(city_id, category_id, today);

    // Only insert into history for ranked businesses
    rankedBusinesses.forEach((b, i) => {
      insertHistory.run(b.id, city_id, category_id, i + 1, b.final_score, b.auto_score, b.manual_boost, today);
    });

    // Update scores for ALL businesses (both ranked and unranked)
    scored.forEach(b => {
      updateScore.run(
        b.id, b.review_score, b.volume_score, b.website_score,
        b.completeness_score, b.verified_score, b.editorial_score,
        b.auto_score, b.manual_boost, b.final_score
      );
    });
  });

  transaction();
  return rankedBusinesses;
}

/**
 * Recalculate ALL rankings across all city/category combinations.
 * Used by the monthly cron job (M-10).
 */
function recalculateAllRankings() {
  const combos = db.prepare(`
    SELECT DISTINCT city_id, category_id FROM businesses WHERE active = 1
  `).all();

  let totalRecalculated = 0;
  combos.forEach(({ city_id, category_id }) => {
    const results = recalculateRankings(city_id, category_id);
    totalRecalculated += results.length;
  });

  return { combos: combos.length, businesses: totalRecalculated };
}

module.exports = {
  calculateScoreComponents,
  getRankingExplanations,
  getTrendBadge,
  getMovement,
  recalculateRankings,
  recalculateAllRankings,
};
