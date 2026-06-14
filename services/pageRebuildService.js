/**
 * BBI — Page Rebuild Service
 * After bulk import, triggers rebuilds for affected city pages,
 * category pages, and ranking pages.
 * Reuses existing rankingService and seoService.
 */

const db = require('../config/db');
const { recalculateRankings } = require('./rankingService');
const jobQueue = require('./ai/jobQueue');

/**
 * Rebuild all pages affected by a set of business IDs.
 * @param {number[]} businessIds - Array of business IDs that were imported
 * @returns {object} Summary of rebuild actions
 */
function rebuildForBusinesses(businessIds) {
  if (!businessIds || businessIds.length === 0) return { combos: 0, rankings: 0 };

  // Get unique city+category combos affected
  const placeholders = businessIds.map(() => '?').join(',');
  const combos = db.prepare(`
    SELECT DISTINCT city_id, category_id
    FROM businesses
    WHERE id IN (${placeholders}) AND city_id IS NOT NULL AND category_id IS NOT NULL
  `).all(...businessIds);

  let totalRanked = 0;

  // Recalculate rankings for each affected combo
  combos.forEach(({ city_id, category_id }) => {
    try {
      const results = recalculateRankings(city_id, category_id);
      totalRanked += results.length;
    } catch (e) {
      console.error(`Ranking recalculation failed for city=${city_id}, cat=${category_id}:`, e.message);
    }
  });

  // Enqueue SEO content generation for affected combos
  const affectedCities = [...new Set(combos.map(c => c.city_id))];
  const affectedCategories = [...new Set(combos.map(c => c.category_id))];

  affectedCities.forEach(cityId => {
    const city = db.prepare(`SELECT name FROM cities WHERE id = ?`).get(cityId);
    if (city) {
      jobQueue.enqueue('seo_generate', {
        pageType: 'city',
        city_name: city.name,
        entityId: cityId,
      });
    }
  });

  affectedCategories.forEach(catId => {
    const cat = db.prepare(`SELECT name FROM categories WHERE id = ?`).get(catId);
    if (cat) {
      jobQueue.enqueue('seo_generate', {
        pageType: 'category',
        cat_name: cat.name,
        entityId: catId,
      });
    }
  });

  // Enqueue ranking page SEO for each combo
  combos.forEach(({ city_id, category_id }) => {
    const city = db.prepare(`SELECT name FROM cities WHERE id = ?`).get(city_id);
    const cat = db.prepare(`SELECT name FROM categories WHERE id = ?`).get(category_id);
    if (city && cat) {
      jobQueue.enqueue('seo_generate', {
        pageType: 'ranking',
        city_name: city.name,
        cat_name: cat.name,
        entityId: city_id,
        secondaryEntityId: category_id,
      });
    }
  });

  console.log(`✅ Page rebuild complete: ${combos.length} combos, ${totalRanked} businesses ranked.`);
  console.log(`   SEO jobs queued: ${affectedCities.length} cities, ${affectedCategories.length} categories, ${combos.length} ranking pages.`);

  return {
    combos: combos.length,
    rankings: totalRanked,
    citiesRebuilt: affectedCities.length,
    categoriesRebuilt: affectedCategories.length,
  };
}

/**
 * Rebuild pages for a specific import by looking up its businesses.
 * @param {number} importId - The csv_imports.id
 */
function rebuildForImport(importId) {
  const rows = db.prepare(`
    SELECT business_id FROM csv_import_rows
    WHERE import_id = ? AND business_id IS NOT NULL AND status = 'imported'
  `).all(importId);

  const businessIds = rows.map(r => r.business_id);
  return rebuildForBusinesses(businessIds);
}

module.exports = {
  rebuildForBusinesses,
  rebuildForImport,
};
