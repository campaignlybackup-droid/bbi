/**
 * BBI — Stub AI Provider
 * Template-based content generation that works without any API key.
 * Uses diversified templates to avoid duplicate content patterns.
 */

/**
 * Simple hash function to deterministically select template variation per business.
 */
function hashName(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash) + name.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * Get rating descriptor based on actual Google rating.
 */
function getRatingLabel(rating) {
  if (rating >= 4.8) return 'exceptional';
  if (rating >= 4.5) return 'excellent';
  if (rating >= 4.0) return 'very good';
  if (rating >= 3.5) return 'solid';
  return 'notable';
}

/**
 * Get review volume descriptor based on actual review count.
 */
function getVolumeLabel(count) {
  if (count >= 1000) return 'an extensive base of over a thousand';
  if (count >= 500) return 'a substantial number of';
  if (count >= 200) return 'a healthy volume of';
  if (count >= 100) return 'a growing collection of';
  if (count >= 50) return 'a developing set of';
  return 'customer';
}

async function generateListingContent(business) {
  const name = business.name || 'Business';
  const city = business.city_name || 'the city';
  const category = business.cat_name || 'local services';
  const catLower = category.toLowerCase();
  const rating = business.google_rating || 0;
  const reviews = business.google_review_count || 0;
  const ratingLabel = getRatingLabel(rating);
  const volumeLabel = getVolumeLabel(reviews);
  const idx = hashName(name) % 8;

  const summaryVariants = [
    `${name}, based in ${city}, is recognized on the Bharat Business Index for its ${ratingLabel} track record in ${catLower}. With ${volumeLabel} customer reviews${rating ? ` and a ${rating}-star Google rating` : ''}, the business has demonstrated consistent quality that resonates with local consumers. The BBI ranking methodology weighs six distinct factors — from review quality to profile completeness — and ${name} has performed well across multiple dimensions. Customers in ${city} seeking reliable ${catLower} can refer to the detailed score breakdown on this page to understand how ${name} compares within its category.`,

    `Operating in ${city}'s competitive ${catLower} landscape, ${name} has earned its position on the Bharat Business Index through verified customer satisfaction metrics. ${rating ? `The business holds a ${rating}-star rating` : 'The business is rated'}${reviews ? ` backed by ${reviews} independent reviews` : ''}, reflecting genuine consumer experiences. BBI's transparent scoring evaluates businesses on criteria including online presence, verification status, and editorial assessment — ensuring that rankings cannot be purchased. ${name} serves the ${city} community with a focus on professional ${catLower} delivery, and its BBI profile provides consumers with an objective, data-backed view of its standing.`,

    `Among ${catLower} providers in ${city}, ${name} stands out on the Bharat Business Index for its combination of customer feedback and business credibility. The BBI scoring system aggregates six weighted factors to produce a single, comparable score out of 100 — and ${name}'s position reflects its performance across these independent metrics. ${rating ? `With a ${rating}-star Google rating` : 'With its current rating'}${reviews ? ` from ${reviews} reviews` : ''}, the business demonstrates ${ratingLabel} service delivery. Local consumers can compare ${name} against other ranked providers in the same category to make informed decisions.`,

    `${name} is a ${city}-based ${catLower} provider featured in the Bharat Business Index rankings. The BBI platform evaluates local businesses using a methodology that combines customer review analysis, digital presence assessment, and editorial review — producing rankings that are updated on the first of every month. ${rating ? `Holding a ${rating}-star average` : 'The business is listed'}${reviews ? ` across ${reviews} Google reviews` : ''}, ${name} has established itself as a ${ratingLabel} option for consumers in ${city} and surrounding areas. This profile page provides a complete breakdown of how ${name}'s ranking score is calculated.`,

    `For consumers in ${city} searching for trusted ${catLower}, ${name} appears in the Bharat Business Index's independently compiled rankings. BBI rankings are distinctive because they are never influenced by payments — every position is earned through measurable quality indicators. ${name}'s standing is informed by ${volumeLabel} reviews${rating ? `, a ${rating}-star average rating` : ''}, and its overall business profile completeness. The monthly recalculation ensures that the ranking reflects the most current data available, giving consumers a reliable snapshot of ${name}'s reputation at any given time.`,

    `${name} serves the ${city} market as a provider of ${catLower}, and its presence on the Bharat Business Index reflects an independently assessed track record. The BBI scoring framework considers review quality as the most heavily weighted factor at 35%, followed by review volume at 25%, making authentic customer feedback the cornerstone of every ranking. ${rating ? `${name}'s ${rating}-star rating` : 'The business rating'}${reviews ? ` from ${reviews} reviews` : ''} contributes significantly to its overall score. Consumers reviewing this profile can see exactly which factors contribute to ${name}'s position and how it compares to category peers.`,

    `In the ${catLower} category across ${city}, ${name} has been independently evaluated and ranked by Bharat Business Index. BBI exists to provide consumers with objective, score-based comparisons that cut through marketing noise — every business is assessed using the same transparent criteria. ${name}'s evaluation incorporates ${volumeLabel} reviews${rating ? `, a ${rating}-star customer satisfaction score` : ''}, website presence, and profile depth. The ranking history section below tracks how ${name}'s position has evolved over time, offering insight into consistency and improvement trends.`,

    `Bharat Business Index has evaluated ${name} as part of its ongoing mission to rank ${catLower} providers in ${city} using fair, transparent methodology. Unlike directories that accept paid placements, BBI rankings are strictly data-driven — calculated from review metrics, online presence, and independent editorial analysis. ${name} currently ${rating ? `holds a ${rating}-star Google rating` : 'is listed'}${reviews ? ` with ${reviews} customer reviews` : ''}, contributing to its overall BBI score. Consumers can use the score breakdown displayed on this page to understand exactly why ${name} holds its current ranking position.`,
  ];

  const titleVariants = [
    `${name} — Top ${category} in ${city} | BBI Ranked`,
    `${name} in ${city} — ${category} Rankings | BBI`,
    `${name} — ${category} Provider in ${city} | BBI Score`,
    `${name}, ${city} — Independent ${category} Ranking | BBI`,
  ];

  const metaVariants = [
    `${name} is a BBI-ranked ${catLower} provider in ${city}. See independent ratings, score breakdown, and ranking history on Bharat Business Index.`,
    `View ${name}'s BBI ranking among top ${catLower} in ${city}. Independent scores based on reviews, quality metrics, and editorial assessment.`,
    `${name} — ranked among ${city}'s top ${catLower} by Bharat Business Index. ${rating ? rating + '-star rated. ' : ''}See full score details.`,
    `How does ${name} compare to other ${catLower} in ${city}? See BBI's independent ranking, score breakdown, and monthly history.`,
  ];

  return {
    seo_title: titleVariants[idx % titleVariants.length],
    meta_description: metaVariants[idx % metaVariants.length],
    summary: summaryVariants[idx],
    tags: `${category}, ${city}, ${name}, ${catLower} in ${city}, top ${catLower}, ${name} reviews, BBI ranking, business ranking`,
  };
}

async function generateFaqContent(business) {
  const name = business.name || 'this business';
  const city = business.city_name || 'the city';
  const category = business.cat_name || 'services';
  const rating = business.google_rating || 0;
  const reviews = business.google_review_count || 0;

  const faqs = [
    {
      question: `What is ${name}'s BBI ranking in ${city}?`,
      answer: `${name} is ranked among the top ${category} providers in ${city} by Bharat Business Index. The ranking is based on a 100-point scoring system that evaluates customer reviews (35%), review volume (25%), online presence (15%), verification status (10%), profile completeness (10%), and editorial assessment (15%). Rankings are recalculated on the 1st of every month.`,
    },
    {
      question: `How does ${name} compare to other ${category} in ${city}?`,
      answer: `BBI provides a transparent score breakdown for each business, allowing direct comparison. ${name}${rating ? ` holds a ${rating}-star Google rating` : ' is evaluated'}${reviews ? ` with ${reviews} reviews` : ''}. You can compare ${name}'s individual factor scores — such as review quality, volume, and profile completeness — against other ${category} providers on the ranking page.`,
    },
    {
      question: `Is ${name} verified by BBI?`,
      answer: business.verified
        ? `Yes, ${name} has been verified by Bharat Business Index. BBI Verified status means that the business information — including name, address, and contact details — has been independently confirmed by our editorial team. Verification contributes 10 points toward the overall ranking score.`
        : `${name} has not yet been verified by BBI. Verification is a free, optional process where BBI's editorial team independently confirms business details. Verified businesses receive a trust badge and earn up to 10 additional ranking points. Business owners can request verification through the "Claim This Business" feature.`,
    },
    {
      question: `How often is ${name}'s ranking updated?`,
      answer: `All BBI rankings, including ${name}'s position, are fully recalculated on the 1st of every month. The recalculation uses the latest available Google review data, current online presence metrics, and any editorial updates. Historical rankings are preserved so you can track how ${name}'s position has changed over time.`,
    },
    {
      question: `Can ${name} pay to improve its BBI ranking?`,
      answer: `No. BBI rankings are strictly independent and cannot be purchased or influenced through payments of any kind. While BBI offers clearly-labeled "Sponsored" placements, these never affect ranking positions. ${name}'s ranking is determined solely by its performance on the six weighted scoring factors published in our methodology.`,
    },
  ];

  return faqs;
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
    description: `${name} is a leading ${category} provider based in ${city}, listed on the Bharat Business Index. The business has been thoroughly evaluated using BBI's transparent scoring methodology, which considers customer reviews, online presence, profile completeness, and verification status. ${name} serves customers in ${city} and surrounding areas, offering professional ${category.toLowerCase()} services. The business maintains a strong focus on service quality and customer satisfaction, which is reflected in its local reputation. The Bharat Business Index provides independent, monthly-updated rankings to help consumers make informed decisions when selecting local services. Businesses listed on BBI are assessed purely on measurable quality indicators — rankings cannot be purchased or influenced. This ensures that only the most reliable and highly-rated providers are highlighted. For the most current ranking position, score details, and customer feedback, visit the full business profile on BBI.`,
    summary: `${name} is a ${category} provider in ${city}, ranked by Bharat Business Index based on customer reviews, service quality, and business credibility. The listing is independently maintained and updated monthly.`,
    faqs: [
      {
        question: `What is ${name}'s BBI ranking in ${city}?`,
        answer: `${name} is ranked among the top ${category} providers in ${city} by Bharat Business Index. Rankings are calculated using the BBI scoring system and updated monthly.`,
      },
      {
        question: `How does BBI evaluate ${name}?`,
        answer: `BBI evaluates ${name} using six weighted factors: Google rating (35%), review count (25%), website presence (10%), social media presence (10%), profile completeness (10%), and verification status (10%).`,
      },
      {
        question: `Is ${name} verified by BBI?`,
        answer: business.verified
          ? `Yes, ${name} has been independently verified by Bharat Business Index, confirming the accuracy of the listed business information.`
          : `${name} has not yet been verified by BBI. Verification is an optional process that confirms the accuracy of business information listed on the platform.`,
      },
      {
        question: `How can ${name}'s ranking change?`,
        answer: `Rankings on BBI are recalculated monthly based on the latest available data. The position of ${name} may change based on updated customer reviews, online presence changes, and profile completeness improvements.`,
      },
      {
        question: `Where is ${name} located?`,
        answer: `${name} operates in ${city}, providing ${category.toLowerCase()} services to local customers. For full address and contact details, visit the business profile on Bharat Business Index.`,
      },
    ],
    keywords: `${name}, ${category}, ${city}, BBI ranking, business reviews, ${category.toLowerCase()} ${city.toLowerCase()}, top ${category.toLowerCase()}, best ${category.toLowerCase()} ${city.toLowerCase()}, reliable ${category.toLowerCase()}, local ${category.toLowerCase()}`,
    tags: `${category}, ${city}, best ${category.toLowerCase()}, top ${category.toLowerCase()}, ${name}, ${name} reviews, ${name} ranking, BBI ranked, business directory, top rated, verified business, ${city} services, local ${category.toLowerCase()}, affordable ${category.toLowerCase()}, reliable ${category.toLowerCase()}, ${category.toLowerCase()} expert, ${category.toLowerCase()} specialist, professional ${category.toLowerCase()}, trusted ${category.toLowerCase()}`,
  };
}

async function generateSentiment(reviewText, businessName) {
  return "Customers have left various reviews for this business, noting positive aspects of the service and occasional areas for improvement. Overall feedback reflects the diverse experiences of recent patrons.";
}

async function generateComboSeoContent(city, category) {
  return {
    title: `Best ${category.name} in ${city.name} — Top BBI Rankings`,
    meta_description: `Find the top-rated ${category.name} in ${city.name}. Bharat Business Index ranks the best local providers based on reviews and verified quality metrics.`,
    editorial_content: `${city.name} is home to excellent ${category.name} providers. Our monthly BBI rankings help you identify the most trusted businesses in this category, evaluated through customer feedback and objective quality indicators.`,
    faq_json: JSON.stringify([
      {
        question: `How does BBI rank ${category.name} in ${city.name}?`,
        answer: `We use a transparent scoring system based on Google reviews, online presence, and profile completeness to rank ${category.name} in ${city.name}.`
      },
      {
        question: `Are these ${city.name} ${category.name} rankings updated?`,
        answer: `Yes, our rankings for ${category.name} in ${city.name} are recalculated on the 1st of every month.`
      }
    ]),
    ai_summary: `Top ranked ${category.name} providers serving the ${city.name} area.`
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
  generateComboSeoContent,
  generateSentiment,
};
