const express = require('express');
const router = express.Router();
const blogService = require('../services/blogService');
const seoService = require('../services/seoService');
const { BASE_URL } = require('../config/constants');

// Blog listing page
router.get('/', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 10;
  const offset = (page - 1) * limit;
  const category = req.query.category || null;

  const { posts, total } = blogService.getPosts({ 
    publicOnly: true, 
    limit, 
    offset, 
    category 
  });
  
  const categories = blogService.getCategories();
  const totalPages = Math.ceil(total / limit);

  res.render('blog-index', {
    posts,
    categories,
    currentCategory: category,
    page,
    totalPages,
    title: category ? `${category} Blog — BBI` : 'BBI Blog — Insights & Updates',
    metaDescription: 'Read the latest insights, updates, and business tips on the Bharat Business Index blog.',
    canonicalUrl: `${BASE_URL}/blog${category ? '?category=' + encodeURIComponent(category) : ''}`,
  });
});

// Blog post detail page
router.get('/:slug', (req, res) => {
  const post = blogService.getPost(req.params.slug, true);
  
  if (!post) {
    return res.status(404).render('404', { title: 'Post Not Found' });
  }

  const relatedPosts = blogService.getRelatedPosts(post.id, 3);
  
  // Try to generate article schema if seoService has it
  let articleSchema = null;
  if (typeof seoService.generateArticleSchema === 'function') {
    articleSchema = seoService.generateArticleSchema(post);
  }

  const breadcrumbSchema = seoService.generateBreadcrumbSchema([
    { name: 'Home', url: '/' },
    { name: 'Blog', url: '/blog' },
    { name: post.title },
  ]);

  res.render('blog-post', {
    post,
    relatedPosts,
    articleSchema,
    breadcrumbSchema,
    title: `${post.title} — BBI Blog`,
    metaDescription: post.meta_description || post.excerpt || `Read ${post.title} on the Bharat Business Index blog.`,
    canonicalUrl: `${BASE_URL}/blog/${post.slug}`,
  });
});

module.exports = router;
