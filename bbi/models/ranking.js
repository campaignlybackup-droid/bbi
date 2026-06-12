const db = require('../config/db');

function calculateAutoScore(business) {
  let score = 0;
  const r = business.google_rating || 0;
  const v = business.google_review_count || 0;

  // Review quality (35 pts)
  if (r >= 4.9) score += 35;
  else if (r >= 4.7) score += 30;
  else if (r >= 4.5) score += 25;
  else if (r >= 4.0) score += 18;
  else score += 10;

  // Review volume (25 pts)
  if (v >= 1000) score += 25;
  else if (v >= 500) score += 20;
  else if (v >= 200) score += 15;
  else if (v >= 100) score += 10;
  else score += 5;

  // Website (15 pts)
  if (business.website && business.website.length > 5) score += 15;

  // Verified (10 pts)
  if (business.verified) score += 10;

  // Description completeness (5 pts)
  if (business.description && business.description.length > 20) score += 5;

  // Phone listed (5 pts)
  if (business.phone) score += 5;

  return Math.min(score, 85); // auto max 85, remaining 15 for editorial
}

function getRankingExplanations(business, scores) {
  const reasons = [];
  if (business.google_rating >= 4.8) reasons.push('Excellent customer satisfaction (4.8+ rating)');
  else if (business.google_rating >= 4.5) reasons.push('High customer review ratings');
  if (business.google_review_count >= 1000) reasons.push('Strong review volume (1000+ reviews)');
  else if (business.google_review_count >= 500) reasons.push('Good volume of verified reviews');
  if (business.website) reasons.push('Established online presence');
  if (business.verified) reasons.push('Verified business information');
  if (business.description) reasons.push('Complete business profile');
  if (scores && scores.editorial_score >= 10) reasons.push('Strong editorial quality assessment');
  return reasons;
}

function getTrendBadge(business_id, current_rank) {
  const history = db.prepare(`
    SELECT rank_position FROM ranking_history
    WHERE business_id = ? ORDER BY ranking_date DESC LIMIT 3
  `).all(business_id);

  if (history.length < 2) return null;
  const prev = history[1].rank_position;

  if (current_rank === 1) return 'Market Leader';
  if (prev - current_rank >= 5) return 'Most Improved';
  if (prev - current_rank >= 2) return 'Fast Rising';
  if (current_rank <= 3 && history.every(h => h.rank_position <= 3)) return 'Consistently Top Rated';
  if (current_rank <= 5) return 'Top Performer';
  return null;
}

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

function recalculateRankings(city_id, category_id) {
  const businesses = db.prepare(`
    SELECT b.*, rs.editorial_score, rs.manual_boost
    FROM businesses b
    LEFT JOIN ranking_scores rs ON rs.business_id = b.id
    WHERE b.city_id = ? AND b.category_id = ? AND b.active = 1
  `).all(city_id, category_id);

  const scored = businesses.map(b => {
    const auto = calculateAutoScore(b);
    const editorial = b.editorial_score || 0;
    const boost = b.manual_boost || 0;
    const final = Math.min(auto + editorial + boost, 100);
    return { ...b, auto_score: auto, final_score: final };
  });

  scored.sort((a, b) => b.final_score - a.final_score);

  const today = new Date().toISOString().slice(0, 10);
  const insertHistory = db.prepare(`
    INSERT INTO ranking_history (business_id,city_id,category_id,rank_position,final_score,auto_score,manual_boost,ranking_date)
    VALUES (?,?,?,?,?,?,?,?)
  `);
  const updateScore = db.prepare(`
    INSERT INTO ranking_scores (business_id,review_score,volume_score,website_score,social_score,years_score,editorial_score,final_score)
    VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(business_id) DO UPDATE SET final_score=excluded.final_score, last_calculated=CURRENT_TIMESTAMP
  `);

  scored.forEach((b, i) => {
    insertHistory.run(b.id, city_id, category_id, i + 1, b.final_score, b.auto_score, b.manual_boost || 0, today);
    updateScore.run(b.id, 0, 0, 0, 0, 0, b.editorial_score || 0, b.final_score);
  });

  return scored;
}

module.exports = { calculateAutoScore, getRankingExplanations, getTrendBadge, getMovement, recalculateRankings };
