/**
 * BBI — Achievement Service
 * Auto-generates achievements based on ranking history.
 * Types: Reached #1, Most Improved, Top 3 Consistent, Fastest Rising
 */

const db = require('../config/db');

/**
 * Generate achievements for a single business.
 * Checks ranking history and awards appropriate achievements.
 */
function generateAchievements(businessId) {
  const history = db.prepare(`
    SELECT rank_position, ranking_date, city_id, category_id
    FROM ranking_history
    WHERE business_id = ?
    ORDER BY ranking_date ASC
  `).all(businessId);

  if (history.length === 0) return [];

  const awarded = [];
  const existing = db.prepare(`SELECT title, achieved_at FROM achievements WHERE business_id = ?`).all(businessId);
  const existingSet = new Set(existing.map(a => `${a.title}|${a.achieved_at}`));

  const latest = history[history.length - 1];
  const latestDate = formatDate(latest.ranking_date);

  // 1. Reached #1 — first time at rank 1
  if (latest.rank_position === 1) {
    const key = `Reached #1 Position|${latestDate}`;
    const alreadyHasReached1 = existing.some(a => a.title === 'Reached #1 Position');
    if (!alreadyHasReached1 && !existingSet.has(key)) {
      insertAchievement(businessId, 'Reached #1 Position', latestDate);
      awarded.push('Reached #1 Position');
    }
  }

  // 2. Most Improved — 5+ position improvement in a single period
  if (history.length >= 2) {
    const prev = history[history.length - 2];
    const improvement = prev.rank_position - latest.rank_position;
    if (improvement >= 5) {
      const key = `Most Improved|${latestDate}`;
      if (!existingSet.has(key)) {
        insertAchievement(businessId, 'Most Improved', latestDate);
        awarded.push('Most Improved');
      }
    }
  }

  // 3. Top 3 Consistent — 3+ consecutive months in top 3
  if (history.length >= 3) {
    const lastThree = history.slice(-3);
    const allTop3 = lastThree.every(h => h.rank_position <= 3);
    if (allTop3) {
      const key = `Top 3 Consistent Performer|${latestDate}`;
      const alreadyHas = existing.some(a => a.title === 'Top 3 Consistent Performer');
      if (!alreadyHas && !existingSet.has(key)) {
        insertAchievement(businessId, 'Top 3 Consistent Performer', latestDate);
        awarded.push('Top 3 Consistent Performer');
      }
    }
  }

  // 4. Fastest Rising — 2+ position improvement in single month
  if (history.length >= 2) {
    const prev = history[history.length - 2];
    const improvement = prev.rank_position - latest.rank_position;
    if (improvement >= 2 && improvement < 5) {
      const key = `Fastest Rising|${latestDate}`;
      if (!existingSet.has(key)) {
        insertAchievement(businessId, 'Fastest Rising', latestDate);
        awarded.push('Fastest Rising');
      }
    }
  }

  return awarded;
}

/**
 * Generate achievements for ALL businesses.
 * Used by the monthly cron job.
 */
function generateAllAchievements() {
  const businesses = db.prepare(`
    SELECT DISTINCT business_id FROM ranking_history
    WHERE ranking_date = (SELECT MAX(ranking_date) FROM ranking_history)
  `).all();

  let totalAwarded = 0;
  businesses.forEach(({ business_id }) => {
    const awards = generateAchievements(business_id);
    totalAwarded += awards.length;
  });

  return { businesses: businesses.length, achievements: totalAwarded };
}

/**
 * Get achievements for a business.
 */
function getAchievements(businessId) {
  return db.prepare(`
    SELECT * FROM achievements WHERE business_id = ? ORDER BY created_at DESC
  `).all(businessId);
}

/**
 * Insert an achievement record.
 */
function insertAchievement(businessId, title, achievedAt) {
  try {
    db.prepare(`
      INSERT INTO achievements (business_id, title, achieved_at) VALUES (?, ?, ?)
    `).run(businessId, title, achievedAt);
  } catch (e) {
    // Duplicate or constraint error — silently ignore
  }
}

/**
 * Format ranking date to human-readable.
 * '2026-06-01' → 'June 2026'
 */
function formatDate(dateStr) {
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const d = new Date(dateStr);
  return `${months[d.getMonth()]} ${d.getFullYear()}`;
}

module.exports = {
  generateAchievements,
  generateAllAchievements,
  getAchievements,
};
