/**
 * BBI - Internal Linking Engine
 * Queries related pages (same category, nearby localities) for contextual links.
 * Uses node-cache for 24h caching.
 */

const db = require('../config/db');
const NodeCache = require('node-cache');
// Cache for 24 hours (86400 seconds)
const cache = new NodeCache({ stdTTL: 86400 });

/**
 * Get internal links for a specific area and category.
 * @param {number} cityId 
 * @param {number} areaId 
 * @param {number} categoryId 
 * @param {string} categoryName 
 * @param {string} categorySlug 
 * @returns {Array} Array of { text, url }
 */
function getRelatedInternalLinks(cityId, areaId, categoryId, categoryName, categorySlug) {
  const cacheKey = `internal_links_${cityId}_${areaId}_${categoryId}`;
  
  const cachedLinks = cache.get(cacheKey);
  if (cachedLinks) {
    return cachedLinks;
  }

  // Find other areas in the same city that have businesses in the same category
  const relatedAreas = db.prepare(`
    SELECT DISTINCT a.id, a.name, a.slug
    FROM businesses b
    JOIN areas a ON a.id = b.area_id
    WHERE b.city_id = ? 
      AND b.category_id = ? 
      AND b.area_id IS NOT NULL
      AND b.area_id != ?
      AND b.active = 1
      AND a.active = 1
    LIMIT 5
  `).all(cityId, categoryId, areaId);

  const links = relatedAreas.map(area => ({
    text: `${categoryName} in ${area.name}`,
    url: `/${area.slug}/${categorySlug}`
  }));

  cache.set(cacheKey, links);
  return links;
}

module.exports = {
  getRelatedInternalLinks
};
