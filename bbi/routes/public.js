const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { getTrendBadge, getMovement, getRankingExplanations } = require('../models/ranking');

// Homepage
router.get('/', (req, res) => {
  const categories = db.prepare(`SELECT * FROM categories WHERE active=1 ORDER BY name`).all();
  const cities = db.prepare(`SELECT * FROM cities WHERE active=1 ORDER BY name`).all();

  // Featured rankings - latest for each city/category combo
  const featured = db.prepare(`
    SELECT rh.rank_position, rh.final_score, rh.ranking_date,
           b.id, b.name, b.slug, b.verified, b.sponsored,
           c.name as city_name, cat.name as cat_name, cat.slug as cat_slug
    FROM ranking_history rh
    JOIN businesses b ON b.id = rh.business_id
    JOIN cities c ON c.id = rh.city_id
    JOIN categories cat ON cat.id = rh.category_id
    WHERE rh.ranking_date = (
      SELECT MAX(rh2.ranking_date) FROM ranking_history rh2
      WHERE rh2.city_id = rh.city_id AND rh2.category_id = rh.category_id
    )
    AND rh.rank_position <= 3
    AND rh.city_id = (SELECT id FROM cities WHERE name='Jaipur' LIMIT 1)
    ORDER BY rh.rank_position ASC
    LIMIT 3
  `).all();

  const enriched = featured.map(b => ({
    ...b,
    movement: getMovement(b.id, b.rank_position),
    badge: getTrendBadge(b.id, b.rank_position)
  }));

  res.render('index', { categories, cities, featured: enriched, title: 'India\'s Trusted Business Rankings' });
});

// Category + City rankings
router.get('/rankings/:citySlug/:catSlug', (req, res) => {
  const city = db.prepare(`SELECT * FROM cities WHERE LOWER(REPLACE(name,' ','-'))=?`).get(req.params.citySlug);
  const cat = db.prepare(`SELECT * FROM categories WHERE slug=?`).get(req.params.catSlug);
  if (!city || !cat) return res.render('404', { title: 'Not Found' });

  const latest_date = db.prepare(`
    SELECT MAX(ranking_date) as d FROM ranking_history WHERE city_id=? AND category_id=?
  `).get(city.id, cat.id)?.d;

  const rankings = db.prepare(`
    SELECT rh.rank_position, rh.final_score, rh.ranking_date,
           b.id, b.name, b.slug, b.verified, b.sponsored,
           b.google_rating, b.google_review_count, b.address
    FROM ranking_history rh
    JOIN businesses b ON b.id = rh.business_id
    WHERE rh.city_id=? AND rh.category_id=? AND rh.ranking_date=?
    ORDER BY rh.rank_position ASC
  `).all(city.id, cat.id, latest_date);

  const enriched = rankings.map(b => ({
    ...b,
    movement: getMovement(b.id, b.rank_position),
    badge: getTrendBadge(b.id, b.rank_position)
  }));

  // Intelligence
  const gainers = [...enriched].filter(b => b.movement.direction === 'up').sort((a,b) => b.movement.diff - a.movement.diff).slice(0,3);
  const decliners = [...enriched].filter(b => b.movement.direction === 'down').sort((a,b) => b.movement.diff - a.movement.diff).slice(0,3);

  res.render('rankings', { city, cat, rankings: enriched, gainers, decliners, latest_date, title: `Top ${cat.name} in ${city.name}` });
});

// Business profile
router.get('/business/:slug', (req, res) => {
  const business = db.prepare(`
    SELECT b.*, c.name as city_name, cat.name as cat_name, cat.slug as cat_slug
    FROM businesses b
    JOIN cities c ON c.id = b.city_id
    JOIN categories cat ON cat.id = b.category_id
    WHERE b.slug=? AND b.active=1
  `).get(req.params.slug);
  if (!business) return res.render('404', { title: 'Not Found' });

  const scores = db.prepare(`SELECT * FROM ranking_scores WHERE business_id=?`).get(business.id);
  const history = db.prepare(`
    SELECT * FROM ranking_history WHERE business_id=? ORDER BY ranking_date ASC
  `).all(business.id);
  const achievements = db.prepare(`SELECT * FROM achievements WHERE business_id=? ORDER BY rowid ASC`).all(business.id);
  const latest = history[history.length - 1];
  const reasons = getRankingExplanations(business, scores);

  res.render('business', {
    business, scores, history, achievements, latest,
    reasons,
    movement: latest ? getMovement(business.id, latest.rank_position) : null,
    badge: latest ? getTrendBadge(business.id, latest.rank_position) : null,
    title: business.name
  });
});

// Methodology
router.get('/methodology', (req, res) => {
  res.render('methodology', { title: 'How We Rank Businesses' });
});

module.exports = router;
