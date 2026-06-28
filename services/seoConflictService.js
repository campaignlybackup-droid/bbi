/**
 * BBI - SEO Conflict Detection Service
 * Scans DB for slug combinations that produce duplicate or near-duplicate URLs.
 */

const db = require('../config/db');

/**
 * Scan all programmatic SEO URLs and find conflicts.
 * @returns {Array} List of conflicts with suggested resolutions.
 */
function detectConflicts() {
  const urlMap = new Map(); // url -> { type, entity_id, name }
  const conflicts = [];

  const addUrl = (url, type, name, id) => {
    if (urlMap.has(url)) {
      const existing = urlMap.get(url);
      conflicts.push({
        url,
        entities: [
          { type: existing.type, name: existing.name, id: existing.id },
          { type, name, id }
        ],
        resolution: suggestResolution(existing.type, type, url)
      });
    } else {
      urlMap.set(url, { type, name, id });
    }
  };

  // 1. States + Categories: /{state_slug}/{cat_slug}
  const stateCombos = db.prepare(`
    SELECT DISTINCT s.slug as state_slug, s.name as state_name, s.id as state_id, cat.slug as cat_slug, cat.name as cat_name
    FROM businesses b
    JOIN cities c ON c.id = b.city_id
    JOIN states s ON s.slug = c.state_slug
    JOIN categories cat ON cat.id = b.category_id
    WHERE b.active = 1 AND c.active = 1 AND cat.active = 1 AND s.active = 1
  `).all();
  stateCombos.forEach(row => {
    addUrl(`/${row.state_slug}/${row.cat_slug}`, 'State+Category', `${row.state_name} - ${row.cat_name}`, row.state_id);
  });

  // 2. Areas + Categories: /{area_slug}/{cat_slug}
  const areaCombos = db.prepare(`
    SELECT DISTINCT a.slug as area_slug, a.name as area_name, a.id as area_id, cat.slug as cat_slug, cat.name as cat_name
    FROM businesses b
    JOIN areas a ON a.id = b.area_id
    JOIN categories cat ON cat.id = b.category_id
    WHERE b.active = 1 AND a.active = 1 AND cat.active = 1
  `).all();
  areaCombos.forEach(row => {
    addUrl(`/${row.area_slug}/${row.cat_slug}`, 'Area+Category', `${row.area_name} - ${row.cat_name}`, row.area_id);
  });

  // 3. Use Cases: /best-{cat_slug}-for-{usecase_slug}-{city_slug}
  const usecaseCombos = db.prepare(`
    SELECT DISTINCT cat.slug as cat_slug, cat.name as cat_name, uc.slug as usecase_slug, uc.name as usecase_name, uc.id as usecase_id, c.slug as city_slug, c.name as city_name
    FROM use_case_businesses ucb
    JOIN businesses b ON b.id = ucb.business_id
    JOIN use_cases uc ON uc.id = ucb.use_case_id
    JOIN categories cat ON cat.id = uc.category_id
    JOIN cities c ON c.id = b.city_id
    WHERE b.active = 1 AND uc.active = 1 AND cat.active = 1 AND c.active = 1
  `).all();
  usecaseCombos.forEach(row => {
    addUrl(`/best-${row.cat_slug}-for-${row.usecase_slug}-${row.city_slug}`, 'UseCase', `${row.cat_name} for ${row.usecase_name} in ${row.city_name}`, row.usecase_id);
  });

  // 4. Independent Variations: /{variation_slug}
  const variations = db.prepare(`SELECT id, variation_slug, title FROM seo_variations WHERE active=1 AND mode='independent'`).all();
  variations.forEach(row => {
    addUrl(`/${row.variation_slug}`, 'Variation', row.title, row.id);
  });
  
  // 5. Standard Rankings: /rankings/{city_slug}/{cat_slug}
  const standardRankings = db.prepare(`
    SELECT DISTINCT c.slug as city_slug, c.name as city_name, c.id as city_id, cat.slug as cat_slug, cat.name as cat_name
    FROM businesses b
    JOIN cities c ON c.id = b.city_id
    JOIN categories cat ON cat.id = b.category_id
    WHERE b.active = 1 AND c.active = 1 AND cat.active = 1 AND c.slug IS NOT NULL
  `).all();
  standardRankings.forEach(row => {
    addUrl(`/rankings/${row.city_slug}/${row.cat_slug}`, 'City+Category', `${row.cat_name} in ${row.city_name}`, row.city_id);
  });

  return conflicts;
}

/**
 * Helper to suggest a resolution based on conflicting entity types.
 */
function suggestResolution(type1, type2, url) {
  if (type1 === 'State+Category' && type2 === 'Area+Category' || type1 === 'Area+Category' && type2 === 'State+Category') {
    return 'Change the area slug or state slug to avoid naming collision (e.g., prefix area with city name like "andheri-mumbai").';
  }
  if (type1 === 'Variation' || type2 === 'Variation') {
    return 'Change the custom slug of the Independent Variation to be unique.';
  }
  return 'Review the involved slugs and rename one to prevent canonical overlap.';
}

module.exports = {
  detectConflicts
};
