/**
 * BBI — Search Routes
 * Full-text search, suggestions API, trending searches.
 * Implements M-02.
 */

const express = require('express');
const router = express.Router();
const db = require('../config/db');
const searchService = require('../services/searchService');
const { BASE_URL } = require('../config/constants');

// Search results page
router.get('/search', (req, res) => {
  const q = (req.query.q || '').trim().slice(0, 200);
  const city_id = req.query.city || null;
  const category_id = req.query.category || null;

  const results = searchService.search(q, { city_id, category_id });
  const trending = searchService.getTrending(8);

  // Log search
  if (q.length > 0) {
    searchService.logSearch(q, results.total, req.ip);
  }

  const cities = db.prepare(`SELECT id, name, slug FROM cities WHERE active=1 ORDER BY name`).all();
  const categories = db.prepare(`SELECT id, name, slug FROM categories WHERE active=1 ORDER BY name`).all();

  res.render('search', {
    ...results,
    trending,
    cities,
    categories,
    selectedCity: city_id,
    selectedCategory: category_id,
    title: q ? `"${q}" — Search Results — BBI` : 'Search — BBI',
    metaDescription: q ? `Search results for "${q}" on Bharat Business Index.` : 'Search businesses, categories, and cities on Bharat Business Index.',
    canonicalUrl: `${BASE_URL}/search`,
  });
});

// API: Search suggestions (typeahead)
router.get('/api/search/suggest', (req, res) => {
  const q = (req.query.q || '').trim();
  const suggestions = searchService.getSuggestions(q);
  res.json(suggestions);
});

// API: Trending searches
router.get('/api/search/trending', (req, res) => {
  const trending = searchService.getTrending(10);
  res.json(trending);
});

module.exports = router;
