/**
 * BBI — Digest Service
 * Auto-generates monthly digests from ranking history.
 * Shows biggest movers, new entrants, new cities, new categories.
 */

const db = require('../config/db');

/**
 * Generate digest entries for a given month.
 * @param {string} month - Format: YYYY-MM (e.g., '2026-06')
 */
function generateDigest(month) {
  // Clear existing entries for this month
  db.prepare(`DELETE FROM digest_entries WHERE month = ?`).run(month);

  const prevMonth = getPrevMonth(month);

  // 1. Biggest movers — biggest rank improvements
  try {
    const movers = db.prepare(`
      SELECT 
        rh_curr.business_id,
        b.name as biz_name,
        rh_curr.rank_position as current_rank,
        rh_prev.rank_position as prev_rank,
        (rh_prev.rank_position - rh_curr.rank_position) as improvement,
        c.name as city_name, c.id as city_id,
        cat.name as cat_name, cat.id as category_id
      FROM ranking_history rh_curr
      JOIN ranking_history rh_prev ON rh_prev.business_id = rh_curr.business_id
        AND rh_prev.city_id = rh_curr.city_id
        AND rh_prev.category_id = rh_curr.category_id
        AND rh_prev.ranking_date LIKE ?
      JOIN businesses b ON b.id = rh_curr.business_id
      JOIN cities c ON c.id = rh_curr.city_id
      JOIN categories cat ON cat.id = rh_curr.category_id
      WHERE rh_curr.ranking_date LIKE ?
        AND (rh_prev.rank_position - rh_curr.rank_position) > 0
      ORDER BY improvement DESC
      LIMIT 10
    `).all(prevMonth + '%', month + '%');

    movers.forEach(m => {
      db.prepare(`
        INSERT INTO digest_entries (month, entry_type, title, description, business_id, city_id, category_id, movement_value)
        VALUES (?, 'biggest_mover', ?, ?, ?, ?, ?, ?)
      `).run(
        month, 
        `${m.biz_name} moved up ${m.improvement} positions`,
        `${m.biz_name} improved from #${m.prev_rank} to #${m.current_rank} in ${m.cat_name}, ${m.city_name}`,
        m.business_id, m.city_id, m.category_id, m.improvement
      );
    });
  } catch (e) {
    // Silent — rankings may not have previous month data
  }

  // 2. New entrants — businesses with rankings this month but not last
  try {
    const newEntrants = db.prepare(`
      SELECT DISTINCT rh.business_id, b.name, c.name as city_name, c.id as city_id,
             cat.name as cat_name, cat.id as category_id, rh.rank_position
      FROM ranking_history rh
      JOIN businesses b ON b.id = rh.business_id
      JOIN cities c ON c.id = rh.city_id
      JOIN categories cat ON cat.id = rh.category_id
      WHERE rh.ranking_date LIKE ?
        AND rh.business_id NOT IN (
          SELECT DISTINCT business_id FROM ranking_history WHERE ranking_date LIKE ?
        )
      ORDER BY rh.rank_position ASC
      LIMIT 10
    `).all(month + '%', prevMonth + '%');

    newEntrants.forEach(n => {
      db.prepare(`
        INSERT INTO digest_entries (month, entry_type, title, description, business_id, city_id, category_id)
        VALUES (?, 'new_entrant', ?, ?, ?, ?, ?)
      `).run(
        month,
        `${n.name} entered rankings at #${n.rank_position}`,
        `New in ${n.cat_name}, ${n.city_name}`,
        n.business_id, n.city_id, n.category_id
      );
    });
  } catch (e) {}

  // 3. New cities — cities added this month
  try {
    const newCities = db.prepare(`
      SELECT id, name, state FROM cities
      WHERE created_at LIKE ? AND active = 1
    `).all(month + '%');

    newCities.forEach(c => {
      db.prepare(`
        INSERT INTO digest_entries (month, entry_type, title, description, city_id)
        VALUES (?, 'new_city', ?, ?, ?)
      `).run(month, `${c.name}, ${c.state} added to BBI`, `New city coverage`, c.id);
    });
  } catch (e) {}

  // 4. New categories — categories added this month
  try {
    const newCats = db.prepare(`
      SELECT id, name FROM categories
      WHERE created_at LIKE ? AND active = 1
    `).all(month + '%');

    newCats.forEach(cat => {
      db.prepare(`
        INSERT INTO digest_entries (month, entry_type, title, description, category_id)
        VALUES (?, 'new_category', ?, ?, ?)
      `).run(month, `${cat.name} category launched`, `New category now being ranked`, cat.id);
    });
  } catch (e) {}

  return getDigest(month);
}

/**
 * Get digest entries for a month.
 */
function getDigest(month) {
  try {
    return db.prepare(`
      SELECT de.*, b.name as biz_name, b.slug as biz_slug,
             c.name as city_name, c.slug as city_slug,
             cat.name as cat_name, cat.slug as cat_slug
      FROM digest_entries de
      LEFT JOIN businesses b ON b.id = de.business_id
      LEFT JOIN cities c ON c.id = de.city_id
      LEFT JOIN categories cat ON cat.id = de.category_id
      WHERE de.month = ?
      ORDER BY de.entry_type, de.movement_value DESC, de.id ASC
    `).all(month);
  } catch (e) {
    return [];
  }
}

/**
 * Get list of available digest months.
 */
function getDigestMonths() {
  try {
    return db.prepare(`
      SELECT DISTINCT month, COUNT(*) as entry_count
      FROM digest_entries
      GROUP BY month
      ORDER BY month DESC
    `).all();
  } catch (e) {
    return [];
  }
}

/**
 * Get all digests formatted for the index page.
 */
function getAllDigests() {
  const months = getDigestMonths();
  return months.map(m => {
    return {
      month_year: toMonthSlug(m.month),
      month_display: formatMonth(m.month),
      summary: `Review the top business ranking changes, biggest movers, and new entrants for ${formatMonth(m.month)}.`
    };
  });
}

/**
 * Get the previous month in YYYY-MM format.
 */
function getPrevMonth(month) {
  const [year, mon] = month.split('-').map(Number);
  const d = new Date(year, mon - 2, 1); // month - 2 because Date months are 0-indexed
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Convert month string to display format.
 * '2026-06' → 'June 2026'
 */
function formatMonth(month) {
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const [year, mon] = month.split('-').map(Number);
  return `${months[mon - 1]} ${year}`;
}

/**
 * Convert display slug to month format.
 * 'june-2026' → '2026-06'
 */
function parseMonthSlug(slug) {
  const months = {
    'january':'01','february':'02','march':'03','april':'04','may':'05','june':'06',
    'july':'07','august':'08','september':'09','october':'10','november':'11','december':'12'
  };
  const parts = slug.toLowerCase().split('-');
  if (parts.length !== 2) return null;
  const mon = months[parts[0]];
  const year = parts[1];
  if (!mon || !year || isNaN(Number(year))) return null;
  return `${year}-${mon}`;
}

/**
 * Convert month format to display slug.
 * '2026-06' → 'june-2026'
 */
function toMonthSlug(month) {
  const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
  const [year, mon] = month.split('-').map(Number);
  return `${months[mon - 1]}-${year}`;
}

module.exports = {
  generateDigest,
  getDigest,
  getDigestMonths,
  getAllDigests,
  formatMonth,
  parseMonthSlug,
  toMonthSlug,
};
