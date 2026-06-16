/**
 * BBI — SEO Routes
 * Sitemap, robots.txt, badge/certificate endpoints.
 */

const express = require('express');
const router = express.Router();
const seoService = require('../services/seoService');
const badgeService = require('../services/badgeService');
const ogImageService = require('../services/ogImageService');

// Dynamic sitemap
router.get('/sitemap.xml', (req, res) => {
  res.set('Content-Type', 'application/xml');
  res.set('Cache-Control', 'public, max-age=3600');
  res.send(seoService.generateSitemap());
});

// Robots.txt
router.get('/robots.txt', (req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send(seoService.generateRobotsTxt());
});

// llms.txt
router.get('/llms.txt', (req, res) => {
  res.set('Content-Type', 'text/plain');
  res.set('Cache-Control', 'public, max-age=86400');
  res.send(seoService.generateLlmsTxt());
});

// llms-rankings.txt
router.get('/llms-rankings.txt', (req, res) => {
  res.set('Content-Type', 'text/plain');
  res.set('Cache-Control', 'public, max-age=86400');
  res.send(seoService.generateRankingsLlmsTxt());
});

// Badge SVG
router.get('/api/badge/:businessId', (req, res) => {
  const data = badgeService.getBadgeForBusiness(parseInt(req.params.businessId));
  if (!data) return res.status(404).send('Not found');

  res.set('Content-Type', 'image/svg+xml');
  res.set('Cache-Control', 'public, max-age=86400');
  res.send(data.badge);
});

// Certificate SVG
router.get('/api/certificate/:businessId', (req, res) => {
  const data = badgeService.getBadgeForBusiness(parseInt(req.params.businessId));
  if (!data) return res.status(404).send('Not found');

  res.set('Content-Type', 'image/svg+xml');
  res.set('Cache-Control', 'public, max-age=86400');
  res.send(data.certificate);
});

// OG Image SVG
router.get('/api/og/:pageType/:entityId.svg', (req, res) => {
  const { pageType, entityId } = req.params;
  let svg = '';

  try {
    if (pageType === 'business') {
      const db = require('../config/db');
      const b = db.prepare(`
        SELECT b.name, c.name as city_name, cat.name as cat_name,
               (SELECT rank_position FROM ranking_history WHERE business_id=b.id ORDER BY ranking_date DESC LIMIT 1) as rank
        FROM businesses b
        JOIN cities c ON c.id=b.city_id
        JOIN categories cat ON cat.id=b.category_id
        WHERE b.id=? OR b.slug=?
      `).get(entityId, entityId);
      if (b) svg = ogImageService.generateBusinessOg(b.name, b.cat_name, b.city_name, b.rank);
    } else if (pageType === 'city') {
      const db = require('../config/db');
      const c = db.prepare(`
        SELECT name, state, (SELECT COUNT(*) FROM businesses WHERE city_id=cities.id AND active=1) as biz_count 
        FROM cities WHERE id=? OR slug=?
      `).get(entityId, entityId);
      if (c) svg = ogImageService.generateCityOg(c.name, c.state, c.biz_count);
    } else if (pageType === 'blog') {
      const db = require('../config/db');
      const bp = db.prepare(`SELECT title, category FROM blog_posts WHERE id=? OR slug=?`).get(entityId, entityId);
      if (bp) svg = ogImageService.generateBlogOg(bp.title, bp.category);
    } else if (pageType === 'digest') {
      // entityId is expected to be monthYear (e.g., 2026-06)
      const date = new Date(entityId + '-01');
      if (!isNaN(date.getTime())) {
        const monthDisplay = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        svg = ogImageService.generateDigestOg(monthDisplay);
      }
    }
  } catch (e) {
    console.error('OG Image generation error:', e);
  }

  if (!svg) {
    // Return a default SVG or 404
    svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="100%" height="100%" fill="#0D2E5E"/></svg>';
  }

  res.set('Content-Type', 'image/svg+xml');
  res.set('Cache-Control', 'public, max-age=86400');
  res.send(svg);
});

module.exports = router;
