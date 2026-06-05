/**
 * BBI — SEO Service
 * Sitemap generation, structured data, SEO content management.
 */

const db = require('../config/db');
const { BASE_URL } = require('../config/constants');

/**
 * Get SEO content for a page.
 */
function getSeoContent(pageType, entityId = null) {
  try {
    if (entityId) {
      return db.prepare(`SELECT * FROM seo_content WHERE page_type = ? AND entity_id = ?`).get(pageType, entityId);
    }
    return db.prepare(`SELECT * FROM seo_content WHERE page_type = ? AND entity_id IS NULL`).get(pageType);
  } catch (e) {
    return null;
  }
}

/**
 * Save or update SEO content.
 */
function saveSeoContent(pageType, entityId, data) {
  const existing = getSeoContent(pageType, entityId);
  if (existing) {
    db.prepare(`
      UPDATE seo_content SET title=?, meta_description=?, editorial_content=?, ai_summary=?, faq_json=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(data.title, data.meta_description, data.editorial_content, data.ai_summary, data.faq_json, existing.id);
  } else {
    db.prepare(`
      INSERT INTO seo_content (page_type, entity_id, title, meta_description, editorial_content, ai_summary, faq_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(pageType, entityId, data.title, data.meta_description, data.editorial_content, data.ai_summary, data.faq_json);
  }
}

/**
 * Generate dynamic sitemap XML.
 */
function generateSitemap() {
  const urls = [];
  const baseUrl = BASE_URL;

  // Static pages
  urls.push({ loc: baseUrl + '/', priority: '1.0', changefreq: 'daily' });
  urls.push({ loc: baseUrl + '/methodology', priority: '0.7', changefreq: 'monthly' });
  urls.push({ loc: baseUrl + '/get-listed', priority: '0.6', changefreq: 'monthly' });

  // City pages
  const cities = db.prepare(`SELECT slug FROM cities WHERE active=1 AND slug IS NOT NULL`).all();
  cities.forEach(c => {
    urls.push({ loc: `${baseUrl}/city/${c.slug}`, priority: '0.8', changefreq: 'weekly' });
  });

  // Category pages
  const categories = db.prepare(`SELECT slug FROM categories WHERE active=1`).all();
  categories.forEach(cat => {
    urls.push({ loc: `${baseUrl}/category/${cat.slug}`, priority: '0.8', changefreq: 'weekly' });
  });

  // Ranking pages (city + category combos)
  const combos = db.prepare(`
    SELECT DISTINCT c.slug as city_slug, cat.slug as cat_slug
    FROM businesses b
    JOIN cities c ON c.id = b.city_id
    JOIN categories cat ON cat.id = b.category_id
    WHERE b.active = 1 AND c.active = 1 AND cat.active = 1 AND c.slug IS NOT NULL
  `).all();
  combos.forEach(({ city_slug, cat_slug }) => {
    urls.push({ loc: `${baseUrl}/rankings/${city_slug}/${cat_slug}`, priority: '0.9', changefreq: 'monthly' });
  });

  // Business pages
  const businesses = db.prepare(`SELECT slug FROM businesses WHERE active=1`).all();
  businesses.forEach(b => {
    urls.push({ loc: `${baseUrl}/business/${b.slug}`, priority: '0.7', changefreq: 'monthly' });
  });

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
`;

  urls.forEach(u => {
    xml += `  <url>
    <loc>${u.loc}</loc>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>
`;
  });

  xml += `</urlset>`;
  return xml;
}

/**
 * Generate robots.txt content.
 */
function generateRobotsTxt() {
  return `User-agent: *
Allow: /
Disallow: /admin/
Disallow: /api/

Sitemap: ${BASE_URL}/sitemap.xml
`;
}

/**
 * Generate LocalBusiness structured data.
 */
function generateLocalBusinessSchema(business) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: business.name,
    description: business.description || '',
    address: {
      '@type': 'PostalAddress',
      streetAddress: business.address || '',
      addressLocality: business.city_name || '',
      addressCountry: 'IN',
    },
  };

  if (business.phone) schema.telephone = business.phone;
  if (business.website) schema.url = business.website;
  if (business.google_rating) {
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: business.google_rating,
      reviewCount: business.google_review_count || 0,
      bestRating: 5,
    };
  }

  return schema;
}

/**
 * Generate ItemList structured data for rankings.
 */
function generateItemListSchema(rankings, city, category) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Top ${category.name} in ${city.name}`,
    description: `BBI ranked list of best ${category.name} in ${city.name}, India`,
    numberOfItems: rankings.length,
    itemListElement: rankings.map((b, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: b.name,
      url: `${BASE_URL}/business/${b.slug}`,
    })),
  };
}

/**
 * Generate FAQ structured data.
 */
function generateFaqSchema(faqs) {
  if (!faqs || !faqs.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(faq => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };
}

/**
 * Generate Breadcrumb structured data.
 */
function generateBreadcrumbSchema(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url ? `${BASE_URL}${item.url}` : undefined,
    })),
  };
}

/**
 * Get related rankings for a city+category combination.
 */
function getRelatedRankings(cityId, categoryId, limit = 6) {
  // Same category, different cities
  const sameCat = db.prepare(`
    SELECT DISTINCT c.name as city_name, c.slug as city_slug, cat.name as cat_name, cat.slug as cat_slug,
           COUNT(b.id) as biz_count
    FROM businesses b
    JOIN cities c ON c.id = b.city_id
    JOIN categories cat ON cat.id = b.category_id
    WHERE b.category_id = ? AND b.city_id != ? AND b.active = 1 AND c.active = 1
    GROUP BY c.id, cat.id
    ORDER BY biz_count DESC LIMIT ?
  `).all(categoryId, cityId, Math.ceil(limit / 2));

  // Same city, different categories
  const sameCity = db.prepare(`
    SELECT DISTINCT c.name as city_name, c.slug as city_slug, cat.name as cat_name, cat.slug as cat_slug,
           COUNT(b.id) as biz_count
    FROM businesses b
    JOIN cities c ON c.id = b.city_id
    JOIN categories cat ON cat.id = b.category_id
    WHERE b.city_id = ? AND b.category_id != ? AND b.active = 1 AND cat.active = 1
    GROUP BY c.id, cat.id
    ORDER BY biz_count DESC LIMIT ?
  `).all(cityId, categoryId, Math.ceil(limit / 2));

  return [...sameCat, ...sameCity].slice(0, limit);
}

module.exports = {
  getSeoContent,
  saveSeoContent,
  generateSitemap,
  generateRobotsTxt,
  generateLocalBusinessSchema,
  generateItemListSchema,
  generateFaqSchema,
  generateBreadcrumbSchema,
  getRelatedRankings,
};
