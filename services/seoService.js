/**
 * BBI — SEO Service
 * Sitemap generation, structured data, SEO content management.
 */

const db = require('../config/db');
const { BASE_URL } = require('../config/constants');

/**
 * Get SEO content for a page.
 */
function getSeoContent(pageType, entityId = null, secondaryEntityId = null) {
  try {
    if (secondaryEntityId) {
      return db.prepare(`SELECT * FROM seo_content WHERE page_type = ? AND entity_id = ? AND secondary_entity_id = ?`).get(pageType, entityId, secondaryEntityId);
    }
    if (entityId) {
      return db.prepare(`SELECT * FROM seo_content WHERE page_type = ? AND entity_id = ? AND secondary_entity_id IS NULL`).get(pageType, entityId);
    }
    return db.prepare(`SELECT * FROM seo_content WHERE page_type = ? AND entity_id IS NULL AND secondary_entity_id IS NULL`).get(pageType);
  } catch (e) {
    return null;
  }
}

/**
 * Save or update SEO content.
 */
function saveSeoContent(pageType, entityId, data, secondaryEntityId = null) {
  const existing = getSeoContent(pageType, entityId, secondaryEntityId);
  if (existing) {
    db.prepare(`
      UPDATE seo_content SET title=?, meta_description=?, editorial_content=?, ai_summary=?, faq_json=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(data.title, data.meta_description, data.editorial_content, data.ai_summary, data.faq_json, existing.id);
  } else {
    db.prepare(`
      INSERT INTO seo_content (page_type, entity_id, secondary_entity_id, title, meta_description, editorial_content, ai_summary, faq_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(pageType, entityId, secondaryEntityId, data.title, data.meta_description, data.editorial_content, data.ai_summary, data.faq_json);
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

  // PROGRAMMATIC SEO SITEMAP APPENDS
  try {
    // 1. States
    const stateCombos = db.prepare(`
      SELECT DISTINCT s.slug as state_slug, cat.slug as cat_slug
      FROM businesses b
      JOIN cities c ON c.id = b.city_id
      JOIN states s ON s.slug = c.state_slug
      JOIN categories cat ON cat.id = b.category_id
      WHERE b.active = 1 AND c.active = 1 AND cat.active = 1 AND s.active = 1
    `).all();
    stateCombos.forEach(({ state_slug, cat_slug }) => {
      urls.push({ loc: `${baseUrl}/${state_slug}/${cat_slug}`, priority: '0.8', changefreq: 'monthly' });
    });

    // 2. Areas
    const areaCombos = db.prepare(`
      SELECT DISTINCT a.slug as area_slug, cat.slug as cat_slug
      FROM businesses b
      JOIN areas a ON a.id = b.area_id
      JOIN categories cat ON cat.id = b.category_id
      WHERE b.active = 1 AND a.active = 1 AND cat.active = 1
    `).all();
    areaCombos.forEach(({ area_slug, cat_slug }) => {
      urls.push({ loc: `${baseUrl}/${area_slug}/${cat_slug}`, priority: '0.8', changefreq: 'monthly' });
    });

    // 3. Use Cases
    const usecaseCombos = db.prepare(`
      SELECT DISTINCT cat.slug as cat_slug, uc.slug as usecase_slug, c.slug as city_slug
      FROM use_case_businesses ucb
      JOIN businesses b ON b.id = ucb.business_id
      JOIN use_cases uc ON uc.id = ucb.use_case_id
      JOIN categories cat ON cat.id = uc.category_id
      JOIN cities c ON c.id = b.city_id
      WHERE b.active = 1 AND uc.active = 1 AND cat.active = 1 AND c.active = 1
    `).all();
    usecaseCombos.forEach(({ cat_slug, usecase_slug, city_slug }) => {
      urls.push({ loc: `${baseUrl}/best-${cat_slug}-for-${usecase_slug}-${city_slug}`, priority: '0.9', changefreq: 'monthly' });
    });

    // 4. Independent Variations
    const variations = db.prepare(`SELECT variation_slug FROM seo_variations WHERE active=1 AND mode='independent'`).all();
    variations.forEach(({ variation_slug }) => {
      urls.push({ loc: `${baseUrl}/${variation_slug}`, priority: '0.8', changefreq: 'monthly' });
    });
  } catch(e) { console.error('Sitemap programmatic error:', e); }

  // Custom Ranking Pages
  const customPages = db.prepare(`SELECT slug FROM custom_ranking_pages WHERE active=1`).all();
  customPages.forEach(p => {
    urls.push({ loc: `${baseUrl}/best/${p.slug}`, priority: '0.9', changefreq: 'monthly' });
  });

  // Business pages
  const businesses = db.prepare(`SELECT slug FROM businesses WHERE active=1`).all();
  businesses.forEach(b => {
    urls.push({ loc: `${baseUrl}/business/${b.slug}`, priority: '0.7', changefreq: 'monthly' });
  });

  // Blog pages
  const blogPosts = db.prepare(`SELECT slug FROM blog_posts WHERE status='published'`).all();
  urls.push({ loc: `${baseUrl}/blog`, priority: '0.8', changefreq: 'weekly' });
  blogPosts.forEach(bp => {
    urls.push({ loc: `${baseUrl}/blog/${bp.slug}`, priority: '0.7', changefreq: 'monthly' });
  });

  // Digest pages
  urls.push({ loc: `${baseUrl}/digest`, priority: '0.8', changefreq: 'monthly' });
  try {
    const digests = db.prepare(`SELECT DISTINCT month FROM digest_entries`).all();
    digests.forEach(d => {
      urls.push({ loc: `${baseUrl}/digest/${d.month}`, priority: '0.7', changefreq: 'yearly' });
    });
  } catch (e) {
    console.error('Sitemap digest error:', e);
  }

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
LLMs-txt: ${BASE_URL}/llms.txt
`;
}

/**
 * Generate llms.txt content.
 */
function generateLlmsTxt() {
  return `# Bharat Business Index (BBI)

> India's trusted, independent business ranking platform. BBI provides objective, score-based rankings for businesses across Indian cities, updated monthly using transparent methodology.

## About

Bharat Business Index (BBI) is an independent platform that ranks businesses across India using a transparent, data-driven scoring system. Rankings are never influenced by payments. Our mission is to help consumers make informed decisions by providing reliable, unbiased business ratings.

- Website: ${BASE_URL}
- Contact: contact@bharatbusinessindex.com

## Scoring Methodology

BBI scores are calculated from 6 weighted factors:

1. Google Rating (weighted)
2. Review Volume (weighted)
3. Business Completeness (website, phone, address)
4. Years of Operation
5. Category Competitiveness
6. Monthly Trend Analysis

Full methodology: ${BASE_URL}/methodology

## Site Structure

- [Homepage](${BASE_URL}/) — Overview, featured rankings, top categories and cities
- [Rankings](${BASE_URL}/rankings) — All city × category ranking pages
- [Rankings Detail](${BASE_URL}/rankings/{city-slug}/{category-slug}) — Top businesses in a category for a specific city
- [City Portal](${BASE_URL}/city/{slug}) — All businesses and categories in a city
- [Category Portal](${BASE_URL}/category/{slug}) — All businesses in a category across cities
- [Business Profile](${BASE_URL}/business/{slug}) — Detailed profile, scores, ranking history
- [Blog](${BASE_URL}/blog) — Articles, guides, and industry insights
- [Monthly Digest](${BASE_URL}/digest) — Monthly summary of ranking movements
- [Search](${BASE_URL}/search) — Full-text search across businesses, cities, and categories
- [Get Listed](${BASE_URL}/get-listed) — Business submission form
- [Methodology](${BASE_URL}/methodology) — Scoring and ranking methodology

## Machine-Readable Resources

- Sitemap: ${BASE_URL}/sitemap.xml
- Robots: ${BASE_URL}/robots.txt
- Rankings Data (LLM-optimized): ${BASE_URL}/llms-rankings.txt

## Usage Guidelines

- You may reference BBI rankings with attribution to "Bharat Business Index" and a link to the source page.
- Rankings data is updated on the 1st of every month.
- Sponsored listings are always clearly labeled and never affect ranking positions.
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
  
  // Adding requested fields with generic fallbacks if not in DB
  schema.priceRange = '$$';
  schema.openingHours = 'Mo-Su 09:00-18:00';
  
  if (business.latitude && business.longitude) {
    schema.geo = { 
      '@type': 'GeoCoordinates', 
      latitude: business.latitude, 
      longitude: business.longitude 
    };
  }

  return schema;
}

/**
 * Generate Article structured data for blog posts.
 */
function generateArticleSchema(post) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.meta_description || post.excerpt,
    image: post.featured_image ? [post.featured_image] : [],
    datePublished: post.published_at || post.created_at,
    dateModified: post.updated_at,
    author: [{
      '@type': 'Person',
      name: post.author_name || 'BBI Team'
    }],
    publisher: {
      '@type': 'Organization',
      name: 'Bharat Business Index',
      logo: {
        '@type': 'ImageObject',
        url: `${BASE_URL}/images/logo.png`
      }
    },
    speakable: {
      '@type': 'SpeakableSpecification',
      xpath: [
        "/html/head/title",
        "/html/head/meta[@name='description']/@content"
      ]
    }
  };
}

/**
 * Generate ItemList structured data for rankings.
 */
function generateItemListSchema(rankings, city, category) {
  const schema = {
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

  // Add AggregateRating to get Gold Stars for the ranking page!
  const validRatings = rankings.filter(b => b.google_rating > 0 && b.google_review_count > 0);
  if (validRatings.length > 0) {
    const totalRating = validRatings.reduce((sum, b) => sum + b.google_rating, 0);
    const totalReviews = validRatings.reduce((sum, b) => sum + b.google_review_count, 0);
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: (totalRating / validRatings.length).toFixed(1),
      reviewCount: totalReviews,
      bestRating: 5
    };
  }

  schema.speakable = {
    '@type': 'SpeakableSpecification',
    xpath: [
      "/html/head/title",
      "/html/head/meta[@name='description']/@content"
    ]
  };

  return schema;
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

/**
 * Generate Organization structured data.
 */
function generateOrganizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Bharat Business Index',
    url: BASE_URL,
    logo: `${BASE_URL}/images/logo.png`,
    sameAs: [
      'https://www.facebook.com/bharatbusinessindex',
      'https://www.twitter.com/bharatbusinessindex',
      'https://www.linkedin.com/company/bharatbusinessindex'
    ]
  };
}

/**
 * Generate LLM-optimized rankings in Markdown format.
 */
function generateRankingsLlmsTxt() {
  const combos = db.prepare(`
    SELECT DISTINCT c.id as city_id, c.name as city_name, cat.id as cat_id, cat.name as cat_name
    FROM businesses b
    JOIN cities c ON c.id = b.city_id
    JOIN categories cat ON cat.id = b.category_id
    WHERE b.active = 1 AND c.active = 1 AND cat.active = 1
  `).all();

  let md = `# Bharat Business Index - Top Rankings\n\n`;
  md += `This document provides a machine-readable summary of the top-ranked businesses across India, curated by Bharat Business Index.\n\n`;

  for (const combo of combos) {
    // Get latest ranking date for this combo
    const latestDateRow = db.prepare(`
      SELECT ranking_date FROM ranking_history 
      WHERE city_id = ? AND category_id = ? 
      ORDER BY ranking_date DESC LIMIT 1
    `).get(combo.city_id, combo.cat_id);

    if (latestDateRow) {
      const topBiz = db.prepare(`
        SELECT b.name, b.address, b.phone, b.website, b.google_rating, rh.rank_position
        FROM ranking_history rh
        JOIN businesses b ON b.id = rh.business_id
        WHERE rh.city_id = ? AND rh.category_id = ? AND rh.ranking_date = ?
        ORDER BY rh.rank_position ASC
        LIMIT 5
      `).all(combo.city_id, combo.cat_id, latestDateRow.ranking_date);

      if (topBiz.length > 0) {
        md += `## Top ${combo.cat_name} in ${combo.city_name}\n`;
        for (const b of topBiz) {
          md += `${b.rank_position}. **${b.name}**\n`;
          if (b.google_rating) md += `   - Rating: ${b.google_rating} Stars\n`;
          if (b.address) md += `   - Address: ${b.address}\n`;
          if (b.phone) md += `   - Phone: ${b.phone}\n`;
          if (b.website) md += `   - Website: ${b.website}\n`;
        }
        md += `\n`;
      }
    }
  }

  return md;
}

module.exports = {
  getSeoContent,
  saveSeoContent,
  generateSitemap,
  generateRobotsTxt,
  generateLlmsTxt,
  generateLocalBusinessSchema,
  generateArticleSchema,
  generateItemListSchema,
  generateFaqSchema,
  generateBreadcrumbSchema,
  getRelatedRankings,
  generateOrganizationSchema,
  generateRankingsLlmsTxt,
};
