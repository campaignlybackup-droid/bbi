/**
 * BBI — Central Constants
 * All score weights, thresholds, and configuration in one place.
 */

const SCORE_WEIGHTS = {
  REVIEW_QUALITY: { max: 35, label: 'Customer Reviews' },
  REVIEW_VOLUME:  { max: 25, label: 'Review Volume' },
  WEBSITE:        { max: 15, label: 'Website & Online Presence' },
  VERIFIED:       { max: 10, label: 'Verification Status' },
  COMPLETENESS:   { max: 10, label: 'Profile Completeness' },
  EDITORIAL:      { max: 15, label: 'Editorial Assessment' },
};

const REVIEW_QUALITY_THRESHOLDS = [
  { min: 4.9, score: 35 },
  { min: 4.7, score: 30 },
  { min: 4.5, score: 25 },
  { min: 4.0, score: 18 },
  { min: 0,   score: 10 },
];

const REVIEW_VOLUME_THRESHOLDS = [
  { min: 1000, score: 25 },
  { min: 500,  score: 20 },
  { min: 200,  score: 15 },
  { min: 100,  score: 10 },
  { min: 0,    score: 5 },
];

const AUTO_SCORE_MAX = 85;
const EDITORIAL_MAX = 15;
const MANUAL_BOOST_MAX = 10;
const TOTAL_SCORE_MAX = 100;

const BADGE_DEFINITIONS = {
  MARKET_LEADER:        { label: 'Market Leader',         minRank: 1, minHistory: 1 },
  MOST_IMPROVED:        { label: 'Most Improved',         improvementThreshold: 5 },
  FAST_RISING:          { label: 'Fast Rising',           improvementThreshold: 2 },
  CONSISTENTLY_TOP:     { label: 'Consistently Top Rated', maxRank: 3, minHistory: 3 },
  TOP_PERFORMER:        { label: 'Top Performer',         maxRank: 5 },
};

const PAGINATION = {
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
  SEARCH_RESULTS: 20,
  ADMIN_TABLE: 25,
  RANKING_HISTORY: 100,
};

const INQUIRY_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
};

const CLAIM_STATUS = {
  PENDING: 'pending',
  VERIFIED: 'verified',
  REJECTED: 'rejected',
};

const AI_JOB_STATUS = {
  QUEUED: 'queued',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
};

const AI_JOB_TYPES = {
  LISTING_GENERATE: 'listing_generate',
  FAQ_GENERATE: 'faq_generate',
  SEO_GENERATE: 'seo_generate',
  DIGEST_GENERATE: 'digest_generate',
  SOCIAL_GENERATE: 'social_generate',
  MODERATION_CHECK: 'moderation_check',
  LINKING_SUGGEST: 'linking_suggest',
};

const STRUCTURED_DATA_TYPES = {
  LOCAL_BUSINESS: 'LocalBusiness',
  ITEM_LIST: 'ItemList',
  FAQ_PAGE: 'FAQPage',
  BREADCRUMB: 'BreadcrumbList',
};

const BASE_URL = process.env.BASE_URL || 'https://bbi.in';

module.exports = {
  SCORE_WEIGHTS,
  REVIEW_QUALITY_THRESHOLDS,
  REVIEW_VOLUME_THRESHOLDS,
  AUTO_SCORE_MAX,
  EDITORIAL_MAX,
  MANUAL_BOOST_MAX,
  TOTAL_SCORE_MAX,
  BADGE_DEFINITIONS,
  PAGINATION,
  INQUIRY_STATUS,
  CLAIM_STATUS,
  AI_JOB_STATUS,
  AI_JOB_TYPES,
  STRUCTURED_DATA_TYPES,
  BASE_URL,
};
