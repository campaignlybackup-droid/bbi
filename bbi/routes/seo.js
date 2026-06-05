/**
 * BBI — SEO Routes
 * Sitemap, robots.txt, badge/certificate endpoints.
 */

const express = require('express');
const router = express.Router();
const seoService = require('../services/seoService');
const badgeService = require('../services/badgeService');

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

module.exports = router;
