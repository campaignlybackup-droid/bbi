const express = require('express');
const router = express.Router();
const digestService = require('../services/digestService');
const seoService = require('../services/seoService');
const { BASE_URL } = require('../config/constants');

// Digest listing page
router.get('/', (req, res) => {
  const digests = digestService.getAllDigests();

  res.render('digest-index', {
    digests,
    title: 'Monthly Rankings Digest — BBI',
    metaDescription: 'Read our monthly recap of business ranking changes, biggest movers, and new entrants across Indian cities.',
    canonicalUrl: `${BASE_URL}/digest`,
  });
});

// Digest detail page
router.get('/:monthYear', (req, res) => {
  const digest = digestService.getDigest(req.params.monthYear);
  
  if (!digest) {
    return res.status(404).render('404', { title: 'Digest Not Found' });
  }

  const breadcrumbSchema = seoService.generateBreadcrumbSchema([
    { name: 'Home', url: '/' },
    { name: 'Monthly Digests', url: '/digest' },
    { name: digest.month_display },
  ]);

  res.render('digest-detail', {
    digest,
    breadcrumbSchema,
    title: `BBI Monthly Digest — ${digest.month_display}`,
    metaDescription: `Review the top business ranking changes, biggest movers, and new entrants for ${digest.month_display}.`,
    canonicalUrl: `${BASE_URL}/digest/${digest.month_year}`,
  });
});

module.exports = router;
