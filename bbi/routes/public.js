/**
 * BBI — Public Routes
 * Homepage, rankings, business profiles, city/category pages, get-listed, claim.
 * Fixes: M-04 (no admin links), M-05 (dynamic homepage), M-07 (dynamic city links).
 */

const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { getTrendBadge, getMovement, getRankingExplanations } = require('../services/rankingService');
const { generateLocalBusinessSchema, generateItemListSchema, generateFaqSchema, generateBreadcrumbSchema, getSeoContent, getRelatedRankings } = require('../services/seoService');
const { BASE_URL } = require('../config/constants');

// ============================================
// HOMEPAGE — M-05: Dynamic, no Jaipur hardcoding
// ============================================
router.get('/', (req, res) => {
  const categories = db.prepare(`SELECT * FROM categories WHERE active=1 ORDER BY name`).all();
  const cities = db.prepare(`SELECT * FROM cities WHERE active=1 ORDER BY name`).all();

  // Dynamic featured rankings — get top 3 from the LATEST ranking across ALL cities
  const featured = db.prepare(`
    SELECT rh.rank_position, rh.final_score, rh.ranking_date,
           b.id, b.name, b.slug, b.verified, b.sponsored, b.description,
           b.google_rating, b.google_review_count,
           c.name as city_name, c.slug as city_slug,
           cat.name as cat_name, cat.slug as cat_slug
    FROM ranking_history rh
    JOIN businesses b ON b.id = rh.business_id AND b.active = 1
    JOIN cities c ON c.id = rh.city_id
    JOIN categories cat ON cat.id = rh.category_id
    WHERE rh.ranking_date = (
      SELECT MAX(rh2.ranking_date) FROM ranking_history rh2
      WHERE rh2.city_id = rh.city_id AND rh2.category_id = rh.category_id
    )
    AND rh.rank_position <= 3
    ORDER BY rh.final_score DESC
    LIMIT 6
  `).all();

  const enriched = featured.map(b => ({
    ...b,
    movement: getMovement(b.id, b.rank_position),
    badge: getTrendBadge(b.id, b.rank_position),
  }));

  // Group by city for display
  const featuredCity = enriched.length > 0 ? enriched[0].city_name : '';
  const featuredCat = enriched.length > 0 ? enriched[0].cat_name : '';

  // Get category business counts
  const catCounts = db.prepare(`
    SELECT category_id, COUNT(*) as count FROM businesses WHERE active=1 GROUP BY category_id
  `).all();
  const countMap = {};
  catCounts.forEach(c => countMap[c.category_id] = c.count);

  // SEO FAQ
  const seoContent = getSeoContent('homepage');
  let faqs = [];
  if (seoContent && seoContent.faq_json) {
    try { faqs = JSON.parse(seoContent.faq_json); } catch (e) {}
  }

  const faqSchema = faqs.length > 0 ? generateFaqSchema(faqs) : null;

  res.render('index', {
    categories, cities, featured: enriched, countMap,
    featuredCity, featuredCat,
    faqSchema, faqs,
    title: 'BBI — India\'s Trusted Business Rankings',
    metaDescription: 'Bharat Business Index — Independent, transparent business rankings across Indian cities. Updated monthly based on verified reviews.',
    canonicalUrl: BASE_URL,
  });
});

// ============================================
// RANKINGS — City + Category
// ============================================
router.get('/rankings/:citySlug/:catSlug', (req, res) => {
  const city = db.prepare(`SELECT * FROM cities WHERE slug=? OR LOWER(REPLACE(name,' ','-'))=?`)
    .get(req.params.citySlug, req.params.citySlug);
  const cat = db.prepare(`SELECT * FROM categories WHERE slug=?`).get(req.params.catSlug);
  if (!city || !cat) return res.status(404).render('404', { title: 'Not Found' });

  const latest_date = db.prepare(`
    SELECT MAX(ranking_date) as d FROM ranking_history WHERE city_id=? AND category_id=?
  `).get(city.id, cat.id)?.d;

  const rankings = db.prepare(`
    SELECT rh.rank_position, rh.final_score, rh.ranking_date,
           b.id, b.name, b.slug, b.verified, b.sponsored,
           b.google_rating, b.google_review_count, b.address, b.description
    FROM ranking_history rh
    JOIN businesses b ON b.id = rh.business_id
    WHERE rh.city_id=? AND rh.category_id=? AND rh.ranking_date=?
    ORDER BY rh.rank_position ASC
  `).all(city.id, cat.id, latest_date);

  const enriched = rankings.map(b => ({
    ...b,
    movement: getMovement(b.id, b.rank_position),
    badge: getTrendBadge(b.id, b.rank_position),
  }));

  const gainers = [...enriched].filter(b => b.movement.direction === 'up').sort((a, b) => b.movement.diff - a.movement.diff).slice(0, 3);
  const decliners = [...enriched].filter(b => b.movement.direction === 'down').sort((a, b) => b.movement.diff - a.movement.diff).slice(0, 3);

  // Structured data
  const itemListSchema = generateItemListSchema(enriched, city, cat);
  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: 'Home', url: '/' },
    { name: city.name, url: `/city/${city.slug || req.params.citySlug}` },
    { name: cat.name },
  ]);

  // Related rankings
  const relatedRankings = getRelatedRankings(city.id, cat.id);

  // SEO content
  const seoContent = getSeoContent('ranking', city.id);

  res.render('rankings', {
    city, cat, rankings: enriched, gainers, decliners, latest_date,
    itemListSchema, breadcrumbSchema, relatedRankings, seoContent,
    title: `Top ${cat.name} in ${city.name} — BBI Rankings`,
    metaDescription: `${new Date().getFullYear()} rankings for the best ${cat.name} in ${city.name}. Independent, transparent rankings by Bharat Business Index.`,
    canonicalUrl: `${BASE_URL}/rankings/${req.params.citySlug}/${req.params.catSlug}`,
  });
});

// ============================================
// BUSINESS PROFILE
// ============================================
router.get('/business/:slug', (req, res) => {
  const business = db.prepare(`
    SELECT b.*, c.name as city_name, c.slug as city_slug, cat.name as cat_name, cat.slug as cat_slug
    FROM businesses b
    JOIN cities c ON c.id = b.city_id
    JOIN categories cat ON cat.id = b.category_id
    WHERE b.slug=? AND b.active=1
  `).get(req.params.slug);
  if (!business) return res.status(404).render('404', { title: 'Not Found' });

  const scores = db.prepare(`SELECT * FROM ranking_scores WHERE business_id=?`).get(business.id);
  const history = db.prepare(`SELECT * FROM ranking_history WHERE business_id=? ORDER BY ranking_date ASC`).all(business.id);
  const achievements = db.prepare(`SELECT * FROM achievements WHERE business_id=? ORDER BY rowid ASC`).all(business.id);
  const latest = history[history.length - 1];
  const reasons = getRankingExplanations(business, scores);

  // Related businesses
  const relatedBusinesses = db.prepare(`
    SELECT b.name, b.slug, b.google_rating, b.google_review_count,
           (SELECT rank_position FROM ranking_history WHERE business_id=b.id ORDER BY ranking_date DESC LIMIT 1) as current_rank
    FROM businesses b
    WHERE b.category_id=? AND b.city_id=? AND b.id!=? AND b.active=1
    ORDER BY (SELECT final_score FROM ranking_scores WHERE business_id=b.id) DESC
    LIMIT 3
  `).all(business.category_id, business.city_id, business.id);

  // Structured data
  const localBusinessSchema = generateLocalBusinessSchema(business);
  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: 'Home', url: '/' },
    { name: business.cat_name, url: `/rankings/${business.city_slug || business.city_name.toLowerCase().replace(/ /g, '-')}/${business.cat_slug}` },
    { name: business.name },
  ]);

  // Check if claimed
  let pendingClaim = null;
  try {
    pendingClaim = db.prepare(`SELECT id FROM claim_requests WHERE business_id=? AND status='pending'`).get(business.id);
  } catch (e) {}

  // FAQ
  const seoContent = getSeoContent('business', business.id);
  let faqs = [];
  if (seoContent && seoContent.faq_json) {
    try { faqs = JSON.parse(seoContent.faq_json); } catch (e) {}
  }
  const faqSchema = faqs.length > 0 ? generateFaqSchema(faqs) : null;

  res.render('business', {
    business, scores, history, achievements, latest, reasons,
    relatedBusinesses, pendingClaim, faqs,
    localBusinessSchema, breadcrumbSchema, faqSchema,
    movement: latest ? getMovement(business.id, latest.rank_position) : null,
    badge: latest ? getTrendBadge(business.id, latest.rank_position) : null,
    title: `${business.name} — BBI Ranking & Reviews`,
    metaDescription: `${business.name} is ranked among top ${business.cat_name} in ${business.city_name}. See reviews, scores, and ranking history on Bharat Business Index.`,
    canonicalUrl: `${BASE_URL}/business/${business.slug}`,
  });
});

// ============================================
// CITY LANDING PAGE
// ============================================
router.get('/city/:citySlug', (req, res) => {
  const city = db.prepare(`SELECT * FROM cities WHERE slug=? OR LOWER(REPLACE(name,' ','-'))=?`)
    .get(req.params.citySlug, req.params.citySlug);
  if (!city) return res.status(404).render('404', { title: 'Not Found' });

  // Get categories with businesses in this city
  const categoryRankings = db.prepare(`
    SELECT cat.id, cat.name, cat.slug, cat.icon, COUNT(b.id) as biz_count
    FROM categories cat
    JOIN businesses b ON b.category_id = cat.id AND b.city_id = ? AND b.active = 1
    WHERE cat.active = 1
    GROUP BY cat.id
    ORDER BY biz_count DESC
  `).all(city.id);

  // Top businesses in this city
  const topBusinesses = db.prepare(`
    SELECT b.name, b.slug, b.google_rating, b.google_review_count,
           cat.name as cat_name, cat.slug as cat_slug,
           (SELECT rank_position FROM ranking_history WHERE business_id=b.id ORDER BY ranking_date DESC LIMIT 1) as current_rank,
           (SELECT final_score FROM ranking_scores WHERE business_id=b.id) as final_score
    FROM businesses b
    JOIN categories cat ON cat.id = b.category_id
    WHERE b.city_id = ? AND b.active = 1
    ORDER BY final_score DESC
    LIMIT 10
  `).all(city.id);

  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: 'Home', url: '/' },
    { name: city.name },
  ]);

  res.render('city', {
    city, categoryRankings, topBusinesses, breadcrumbSchema,
    title: `Top Businesses in ${city.name} — BBI Rankings`,
    metaDescription: `Discover the highest-ranked businesses in ${city.name}, ${city.state}. Independent rankings by Bharat Business Index.`,
    canonicalUrl: `${BASE_URL}/city/${req.params.citySlug}`,
  });
});

// ============================================
// CATEGORY LANDING PAGE
// ============================================
router.get('/category/:catSlug', (req, res) => {
  const cat = db.prepare(`SELECT * FROM categories WHERE slug=?`).get(req.params.catSlug);
  if (!cat) return res.status(404).render('404', { title: 'Not Found' });

  // Get cities with businesses in this category
  const cityRankings = db.prepare(`
    SELECT c.id, c.name, c.slug, c.state, COUNT(b.id) as biz_count
    FROM cities c
    JOIN businesses b ON b.city_id = c.id AND b.category_id = ? AND b.active = 1
    WHERE c.active = 1
    GROUP BY c.id
    ORDER BY biz_count DESC
  `).all(cat.id);

  // Top businesses in this category (all cities)
  const topBusinesses = db.prepare(`
    SELECT b.name, b.slug, b.google_rating, b.google_review_count,
           c.name as city_name, c.slug as city_slug,
           (SELECT rank_position FROM ranking_history WHERE business_id=b.id ORDER BY ranking_date DESC LIMIT 1) as current_rank,
           (SELECT final_score FROM ranking_scores WHERE business_id=b.id) as final_score
    FROM businesses b
    JOIN cities c ON c.id = b.city_id
    WHERE b.category_id = ? AND b.active = 1
    ORDER BY final_score DESC
    LIMIT 10
  `).all(cat.id);

  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: 'Home', url: '/' },
    { name: cat.name },
  ]);

  res.render('category', {
    cat, cityRankings, topBusinesses, breadcrumbSchema,
    title: `Best ${cat.name} in India — BBI Rankings`,
    metaDescription: `Find the top-ranked ${cat.name} across Indian cities. Independent rankings by Bharat Business Index.`,
    canonicalUrl: `${BASE_URL}/category/${req.params.catSlug}`,
  });
});

// ============================================
// METHODOLOGY
// ============================================
router.get('/methodology', (req, res) => {
  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: 'Home', url: '/' },
    { name: 'Methodology' },
  ]);

  const faqSchema = generateFaqSchema([
    { question: 'How does BBI rank businesses?', answer: 'BBI uses a transparent scoring system based on customer reviews (35%), review volume (25%), online presence (15%), verification status (10%), profile completeness (10%), and editorial assessment (15%). Rankings are updated monthly.' },
    { question: 'Can businesses pay to improve their ranking?', answer: 'No. BBI rankings are strictly independent. Sponsored listings are clearly labeled and never affect ranking positions.' },
    { question: 'How often are rankings updated?', answer: 'Rankings are recalculated on the 1st of every month using the latest available data.' },
    { question: 'What does BBI Verified mean?', answer: 'BBI Verified businesses have had their information independently confirmed by our team. Verification adds to the trust score but does not guarantee a top ranking.' },
  ]);

  res.render('methodology', {
    breadcrumbSchema, faqSchema,
    title: 'How We Rank Businesses — BBI Methodology',
    metaDescription: 'Learn how Bharat Business Index ranks businesses. Our transparent methodology is based on customer reviews, online presence, and editorial assessment.',
    canonicalUrl: `${BASE_URL}/methodology`,
  });
});

// ============================================
// GET LISTED (M-08)
// ============================================
router.get('/get-listed', (req, res) => {
  const cities = db.prepare(`SELECT * FROM cities WHERE active=1 ORDER BY name`).all();
  const categories = db.prepare(`SELECT * FROM categories WHERE active=1 ORDER BY name`).all();

  res.render('get-listed', {
    cities, categories,
    title: 'Get Your Business Listed — BBI',
    metaDescription: 'Submit your business for inclusion in Bharat Business Index rankings. Free listing, independent rankings.',
    canonicalUrl: `${BASE_URL}/get-listed`,
    success: req.flash('success'),
    error: req.flash('error'),
  });
});

router.post('/get-listed', (req, res) => {
  const { validateInquiry } = require('../middleware/validation');
  // Inline validation
  const { business_name, contact_name, contact_email, contact_phone, city_id, category_id, website, description } = req.body;
  const errors = [];
  if (!business_name || business_name.trim().length < 2) errors.push('Business name is required.');
  if (!contact_name || contact_name.trim().length < 2) errors.push('Contact name is required.');
  if (!contact_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact_email)) errors.push('Valid email is required.');
  if (!contact_phone || contact_phone.trim().length < 10) errors.push('Valid phone number is required.');

  if (errors.length) {
    req.flash('error', errors.join(' '));
    return res.redirect('/get-listed');
  }

  try {
    const inquiryService = require('../services/inquiryService');
    inquiryService.submitInquiry(req.body);
    req.flash('success', 'Thank you! Your business has been submitted for review. We\'ll be in touch soon.');
  } catch (e) {
    req.flash('error', 'Something went wrong. Please try again.');
  }
  res.redirect('/get-listed');
});

// ============================================
// CLAIM BUSINESS
// ============================================
router.get('/business/:slug/claim', (req, res) => {
  const business = db.prepare(`
    SELECT b.*, c.name as city_name, cat.name as cat_name
    FROM businesses b
    JOIN cities c ON c.id = b.city_id
    JOIN categories cat ON cat.id = b.category_id
    WHERE b.slug=? AND b.active=1
  `).get(req.params.slug);
  if (!business) return res.status(404).render('404', { title: 'Not Found' });

  res.render('claim', {
    business,
    title: `Claim ${business.name} — BBI`,
    metaDescription: `Claim ownership of ${business.name} on Bharat Business Index.`,
    success: req.flash('success'),
    error: req.flash('error'),
  });
});

router.post('/business/:slug/claim', (req, res) => {
  const business = db.prepare(`SELECT id FROM businesses WHERE slug=? AND active=1`).get(req.params.slug);
  if (!business) return res.status(404).render('404', { title: 'Not Found' });

  const { contact_name, contact_email, contact_phone, verification_details } = req.body;
  const errors = [];
  if (!contact_name || contact_name.trim().length < 2) errors.push('Your name is required.');
  if (!contact_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact_email)) errors.push('Valid email is required.');
  if (!contact_phone || contact_phone.trim().length < 10) errors.push('Valid phone is required.');

  if (errors.length) {
    req.flash('error', errors.join(' '));
    return res.redirect(`/business/${req.params.slug}/claim`);
  }

  try {
    const claimService = require('../services/claimService');
    claimService.submitClaim(business.id, req.body);
    req.flash('success', 'Your claim has been submitted. Our team will verify and get back to you.');
  } catch (e) {
    req.flash('error', e.message || 'Something went wrong.');
  }
  res.redirect(`/business/${req.params.slug}/claim`);
});

module.exports = router;
