/**
 * BBI - Schema Builder Utility
 * Helper to generate JSON-LD schema for SEO pages.
 */

const { BASE_URL } = require('../config/constants');

/**
 * Generates LocalBusiness Schema.org JSON-LD
 * Used primarily for Area + Category pages or individual business pages.
 * @param {Object} data - Business or aggregate data
 * @returns {Object} JSON-LD Schema
 */
function buildLocalBusinessSchema(data) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: data.name,
    description: data.description || '',
    address: {
      '@type': 'PostalAddress',
      streetAddress: data.address || '',
      addressLocality: data.city_name || data.locality_name || '',
      addressCountry: 'IN',
    },
  };

  if (data.phone) schema.telephone = data.phone;
  if (data.url || data.website) schema.url = data.url || data.website;

  if (data.aggregateRating || data.google_rating) {
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: data.aggregateRating?.ratingValue || data.google_rating,
      reviewCount: data.aggregateRating?.reviewCount || data.google_review_count || 1,
      bestRating: 5,
    };
  }

  schema.priceRange = data.priceRange || '$$';

  if (data.latitude && data.longitude) {
    schema.geo = {
      '@type': 'GeoCoordinates',
      latitude: data.latitude,
      longitude: data.longitude,
    };
  }

  return schema;
}

/**
 * Generates FAQPage Schema.org JSON-LD
 * @param {Array|string} faqs - Array of FAQ objects { question, answer } or JSON string
 * @returns {Object|null} JSON-LD Schema
 */
function buildFaqSchema(faqs) {
  let parsedFaqs = faqs;
  if (typeof faqs === 'string') {
    try {
      parsedFaqs = JSON.parse(faqs);
    } catch (e) {
      return null;
    }
  }

  if (!parsedFaqs || !parsedFaqs.length) return null;

  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: parsedFaqs.map((faq) => ({
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
 * Generates BreadcrumbList Schema.org JSON-LD
 * @param {Array} segments - Array of { name, url } objects representing the path
 * @returns {Object} JSON-LD Schema
 */
function buildBreadcrumbSchema(segments) {
  if (!segments || !segments.length) return null;

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: segments.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url ? `${BASE_URL}${item.url}` : undefined,
    })),
  };
}

/**
 * Helper to combine multiple schemas into a single array for script tag injection.
 * @param {...Object} schemas - Schema objects to combine
 * @returns {string} Stringified JSON-LD suitable for injection
 */
function stringifySchemas(...schemas) {
  const validSchemas = schemas.filter(Boolean);
  if (validSchemas.length === 0) return '';
  if (validSchemas.length === 1) return JSON.stringify(validSchemas[0]);
  return JSON.stringify(validSchemas);
}

module.exports = {
  buildLocalBusinessSchema,
  buildFaqSchema,
  buildBreadcrumbSchema,
  stringifySchemas
};
