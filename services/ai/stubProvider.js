/**
 * BBI — Stub AI Provider
 * Template-based content generation that works without any API key.
 * Returns reasonable defaults for all AI operations.
 */

async function generateListingContent(business) {
  const name = business.name || 'Business';
  const city = business.city_name || 'the city';
  const category = business.cat_name || 'local services';

  return {
    seo_title: `${name} — Top ${category} in ${city} | BBI Ranked`,
    meta_description: `${name} is a BBI-ranked ${category} provider in ${city}. Find reviews, ratings, and ranking details on Bharat Business Index.`,
    summary: `${name} is a trusted provider of ${category} in ${city}, ranked by Bharat Business Index based on customer reviews, service quality, and business credibility.`,
    tags: category.toLowerCase().replace(/&/g, '').split(/\s+/).filter(w => w.length > 2).join(', '),
  };
}

async function generateFaqContent(business) {
  const name = business.name || 'this business';
  const city = business.city_name || 'the city';
  const category = business.cat_name || 'services';

  return [
    {
      question: `What is ${name}'s BBI ranking?`,
      answer: `${name} is ranked among the top ${category} providers in ${city} by Bharat Business Index, based on verified customer reviews, service quality metrics, and editorial assessment.`,
    },
    {
      question: `How does ${name} compare to other ${category} in ${city}?`,
      answer: `BBI ranks ${name} based on multiple factors including Google review ratings, review volume, online presence, profile completeness, and editorial quality assessment. Visit the ranking page for detailed comparisons.`,
    },
    {
      question: `Is ${name} verified by BBI?`,
      answer: business.verified
        ? `Yes, ${name} has been verified by Bharat Business Index. This means their business information has been independently confirmed.`
        : `${name} has not yet been verified by BBI. Businesses can apply for verification to increase their trust score.`,
    },
  ];
}

async function generateSeoContent(pageType, data) {
  switch (pageType) {
    case 'city':
      return {
        title: `Top Businesses in ${data.city_name} — BBI Rankings`,
        meta_description: `Discover the highest-ranked businesses in ${data.city_name}. Independent rankings by Bharat Business Index based on verified reviews and quality metrics.`,
        editorial: `${data.city_name} has a growing business sector. The BBI monthly rankings help consumers find trusted service providers across multiple categories.`,
      };
    case 'category':
      return {
        title: `Best ${data.cat_name} in India — BBI Rankings`,
        meta_description: `Find the top-ranked ${data.cat_name} across Indian cities. BBI rankings are based on customer reviews, quality metrics, and editorial assessment.`,
        editorial: `Bharat Business Index ranks ${data.cat_name} providers across Indian cities using the transparent BBI methodology.`,
      };
    case 'ranking':
      return {
        title: `Top ${data.cat_name} in ${data.city_name} — BBI Rankings ${new Date().getFullYear()}`,
        meta_description: `${new Date().getFullYear()} rankings for the best ${data.cat_name} in ${data.city_name}. Independent, transparent rankings by Bharat Business Index.`,
        editorial: `The ${data.city_name} ${data.cat_name} rankings are updated monthly. Businesses are scored on customer reviews, review volume, online presence, and editorial assessment.`,
      };
    default:
      return { title: 'BBI — Bharat Business Index', meta_description: 'India\'s independent business rankings.', editorial: '' };
  }
}

async function generateDigest(rankingData) {
  const totalBiz = rankingData.businesses || 0;
  const combos = rankingData.combos || 0;
  const month = new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  return {
    title: `BBI Monthly Ranking Digest — ${month}`,
    summary: `This month's BBI rankings cover ${totalBiz} businesses across ${combos} city-category combinations. Rankings were recalculated using the latest review data, online presence metrics, and editorial assessments.`,
    highlights: [
      `${totalBiz} businesses ranked across ${combos} categories`,
      'All rankings updated with latest Google review data',
      'New businesses added to the index',
    ],
  };
}

async function generateSocialContent(business, rankData) {
  const name = business.name || 'Business';
  const rank = rankData?.rank_position || '';
  const city = business.city_name || '';
  const category = business.cat_name || '';

  return {
    linkedin: `🏆 ${name} has been ranked #${rank} in ${category} in ${city} by Bharat Business Index (@BBI).\n\nBBI rankings are based on verified customer reviews, service quality, and independent editorial assessment.\n\n#BBI #BusinessRanking #${city.replace(/\s/g, '')} #${category.replace(/[\s&]/g, '')}`,
    instagram: `🏆 Congratulations to ${name} for achieving Rank #${rank} in ${category}, ${city}! 🎉\n\nBBI rankings are updated monthly based on real customer reviews.\n\n#BBI #BharatBusinessIndex #Ranked #${city.replace(/\s/g, '')}`,
    newsletter: `${name} ranked #${rank} in ${category} (${city}) — BBI's latest monthly rankings are now live. See the full list at bharatbusinessindex.com.`,
  };
}

async function moderateContent(text) {
  const lowerText = (text || '').toLowerCase();
  
  // Rule checks
  const spamKeywords = ['buy now', 'click here', 'limited offer', 'act fast', 'free money', 'guaranteed'];
  const marketingKeywords = ['world-class', 'industry-leading', 'revolutionary', 'unmatched', 'premium quality', 'best-in-class'];
  const firstPersonWords = ['\\bi\\b', '\\bme\\b', '\\bmy\\b', '\\bmine\\b', '\\bwe\\b', '\\bus\\b', '\\bour\\b', '\\bours\\b'];
  const secondPersonWords = ['\\byou\\b', '\\byour\\b', '\\byours\\b'];
  const opinionPhrases = ['we believe', 'we think', 'in our opinion', 'we recommend', 'best choice', 'perfect option'];

  const isSpam = spamKeywords.some(kw => lowerText.includes(kw));
  const hasMarketing = marketingKeywords.some(kw => lowerText.includes(kw));
  const hasOpinions = opinionPhrases.some(phrase => lowerText.includes(phrase));
  
  const hasFirstPerson = new RegExp(`(${firstPersonWords.join('|')})`, 'i').test(text);
  const hasSecondPerson = new RegExp(`(${secondPersonWords.join('|')})`, 'i').test(text);

  const hasExcessiveCaps = text && (text.replace(/[^A-Z]/g, '').length / text.length) > 0.5;
  const hasKeywordStuffing = text && new Set(lowerText.split(/\s+/)).size < text.split(/\s+/).length * 0.3;

  const flags = [];
  if (isSpam) flags.push('Potential spam detected');
  if (hasMarketing) flags.push('Contains promotional marketing language');
  if (hasOpinions) flags.push('Contains opinion-based statements');
  if (hasFirstPerson) flags.push('Contains first-person language');
  if (hasSecondPerson) flags.push('Contains second-person language');
  if (hasExcessiveCaps) flags.push('Excessive capitalization');
  if (hasKeywordStuffing) flags.push('Possible keyword stuffing');

  return {
    isClean: flags.length === 0,
    flags: flags,
  };
}

async function suggestRelated(businessId, db) {
  // Simple category/city-based suggestions
  try {
    const business = db.prepare(`SELECT category_id, city_id FROM businesses WHERE id=?`).get(businessId);
    if (!business) return { businesses: [], categories: [], rankings: [] };

    const related = db.prepare(`
      SELECT id, name, slug FROM businesses
      WHERE category_id=? AND city_id=? AND id!=? AND active=1
      ORDER BY RANDOM() LIMIT 3
    `).all(business.category_id, business.city_id, businessId);

    return { businesses: related, categories: [], rankings: [] };
  } catch (e) {
    return { businesses: [], categories: [], rankings: [] };
  }
}

/**
 * Generate comprehensive import content (stub fallback).
 * Matches the editorial voice: third person, independent platform.
 */
async function generateImportContent(business) {
  const name = business.name || 'Business';
  const city = business.city_name || 'the city';
  const category = business.cat_name || 'local services';

  return {
    seo_title: `${name} — Top ${category} in ${city} | BBI Ranked`,
    meta_description: `${name} is a BBI-ranked ${category} provider in ${city}. View independent ratings, ranking history, and business details on Bharat Business Index.`,
    description: `${name} is a ${category} provider based in ${city}, listed on the Bharat Business Index. The business has been evaluated using BBI's transparent scoring methodology, which considers customer reviews, online presence, profile completeness, and verification status. ${name} serves customers in ${city} and surrounding areas, offering professional ${category.toLowerCase()} services. The Bharat Business Index provides independent, monthly-updated rankings to help consumers make informed decisions. Businesses listed on BBI are assessed purely on measurable quality indicators — rankings cannot be purchased or influenced. For the most current ranking position and score details, visit the full business profile on BBI.`,
    summary: `${name} is a ${category} provider in ${city}, ranked by Bharat Business Index based on customer reviews, service quality, and business credibility. The listing is independently maintained and updated monthly.`,
    faqs: [
      {
        question: `What is ${name}'s BBI ranking in ${city}?`,
        answer: `${name} is ranked among the top ${category} providers in ${city} by Bharat Business Index. Rankings are calculated using BBI's transparent scoring system and updated monthly.`,
      },
      {
        question: `How does BBI evaluate ${name}?`,
        answer: `BBI evaluates ${name} using six weighted factors: Google rating (35%), review count (25%), website presence (10%), social media presence (10%), profile completeness (10%), and verification status (10%).`,
      },
      {
        question: `Is ${name} verified by BBI?`,
        answer: business.verified
          ? `Yes, ${name} has been independently verified by Bharat Business Index, confirming the accuracy of its listed business information.`
          : `${name} has not yet been verified by BBI. Verification is an optional process that confirms the accuracy of business information listed on the platform.`,
      },
      {
        question: `How can ${name}'s ranking change?`,
        answer: `Rankings on BBI are recalculated monthly based on the latest available data. ${name}'s position may change based on updated customer reviews, online presence changes, and profile completeness improvements.`,
      },
      {
        question: `Where is ${name} located?`,
        answer: `${name} operates in ${city}, providing ${category.toLowerCase()} services to local customers. For full address and contact details, visit the business profile on Bharat Business Index.`,
      },
    ],
    keywords: `${name}, ${category}, ${city}, BBI ranking, business reviews, ${category.toLowerCase()} ${city.toLowerCase()}, top ${category.toLowerCase()}, best ${category.toLowerCase()} ${city.toLowerCase()}`,
    tags: category.toLowerCase().replace(/&/g, '').split(/\s+/).filter(w => w.length > 2).join(', '),
  };
}

module.exports = {
  generateListingContent,
  generateFaqContent,
  generateSeoContent,
  generateDigest,
  generateSocialContent,
  moderateContent,
  suggestRelated,
  generateImportContent,
};

