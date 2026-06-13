/**
 * BBI — OpenAI Provider
 * Production-ready OpenAI implementation matching the stubProvider signatures.
 * Includes fallback, caching, timeouts, cost tracking, and rate limiting.
 */

const { OpenAI } = require('openai');
const stubProvider = require('./stubProvider');

// Simple memory cache to prevent duplicate identical calls during the same runtime.
// The actual AI Job queue already persists the result in the DB once complete.
const memoryCache = new Map();

let openai;
try {
  openai = new OpenAI({
    apiKey: process.env.AI_API_KEY,
    timeout: 30000, // 30 second timeout
    maxRetries: 2,  // Auto-retry on rate limits
  });
  console.log('[AI] Provider Loaded: OpenAI');
} catch (e) {
  console.error('[AI] Failed to initialize OpenAI, will fallback to stub:', e.message);
}

// Cost estimation logic (gpt-4o-mini rates approx $0.150/1M input, $0.600/1M output tokens)
const COST_PER_1K_INPUT = 0.00015;
const COST_PER_1K_OUTPUT = 0.00060;

/**
 * Reusable helper for text generation with caching, cost tracking, and fallback.
 */
async function generateText(prompt, systemInstruction = `
You are Bharat Business Index (BBI), India's independent business ranking platform.

CRITICAL RULES:

- Always write in THIRD PERSON.
- Never use:
  we
  our
  us
  I
  my
  mine

- Never write from the business owner's perspective.
- Always write as an independent business directory.

- Refer to businesses as:
  - Business Name
  - The company
  - The business
  - They
  - Their

SEO RULES:

- Meta descriptions must naturally contain at least one:
  Best
  Top
  Leading
  Trusted

- Include:
  Business Name
  Service
  Location

- Meta descriptions should be 140-160 characters.

Before returning content:

1. Remove all first-person language.
2. Rewrite into third person.
3. Ensure content reads like an independent business review platform.
`) {
  if (!openai) {
    console.warn('[AI] Request Started - OpenAI not initialized. Fallback Activated.');
    throw new Error('OpenAI not initialized');
  }

  const cacheKey = JSON.stringify({ prompt, systemInstruction });
  if (memoryCache.has(cacheKey)) {
    console.log('[AI] Request Completed (from cache)');
    return memoryCache.get(cacheKey);
  }

  console.log('[AI] Request Started');
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: prompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    });

    const content = response.choices[0].message.content;
    const usage = response.usage;
    
    if (usage) {
      const estimatedCost = ((usage.prompt_tokens / 1000) * COST_PER_1K_INPUT) + 
                            ((usage.completion_tokens / 1000) * COST_PER_1K_OUTPUT);
      console.log(`[AI] Request Completed. Tokens: ${usage.total_tokens}. Est Cost: $${estimatedCost.toFixed(5)}`);
    } else {
      console.log('[AI] Request Completed.');
    }

    const parsedContent = JSON.parse(content);
    memoryCache.set(cacheKey, parsedContent);
    return parsedContent;

  } catch (error) {
    console.error(`[AI] OpenAI Request Failed: ${error.message}`);
    console.warn('[AI] Fallback Activated');
    throw error;
  }
}

async function generateListingContent(business) {
  const name = business.name || 'Business';
  const city = business.city_name || 'the city';
  const category = business.cat_name || 'local services';

  const prompt = `Generate a highly SEO-optimized business listing profile for:
Name: ${name}
City: ${city}
Category: ${category}

Requirements:
- Description (summary) must be 100-150 words, completely unique, avoiding keyword stuffing but naturally including the city and category.
- Must return EXACTLY a JSON object with this structure:
{
  "seo_title": "string",
  "meta_description": "string",
  "summary": "string",
  "tags": "comma, separated, list"
}`;

  try {
    return await generateText(prompt);
  } catch (e) {
    return stubProvider.generateListingContent(business);
  }
}

async function generateFaqContent(business) {
  const name = business.name || 'this business';
  const city = business.city_name || 'the city';
  const category = business.cat_name || 'services';

  const prompt = `Generate 5 Schema-friendly, SEO-optimized FAQs for the business ranking page of:
Name: ${name}
City: ${city}
Category: ${category}
Verified: ${business.verified ? 'Yes' : 'No'}

Return EXACTLY a JSON object containing an array under the key "faqs":
{
  "faqs": [
    { "question": "string", "answer": "string" }
  ]
}`;

  try {
    const result = await generateText(prompt);
    return result.faqs || result; // Safely handle if it returns the array directly or wrapped
  } catch (e) {
    return stubProvider.generateFaqContent(business);
  }
}

async function generateSeoContent(pageType, data) {
  const prompt = `Generate SEO content for a ${pageType} page.
Context data: ${JSON.stringify(data)}

Return EXACTLY a JSON object with this structure:
{
  "title": "string (optimized title tag)",
  "meta_description": "string (compelling meta description)",
  "editorial": "string (a professional editorial summary about this category or city ranking)"
}`;

  try {
    return await generateText(prompt);
  } catch (e) {
    return stubProvider.generateSeoContent(pageType, data);
  }
}

async function generateDigest(rankingData) {
  const totalBiz = rankingData.businesses || 0;
  const combos = rankingData.combos || 0;
  const month = new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  const prompt = `Generate a monthly ranking digest for the Bharat Business Index for ${month}.
Data: ${totalBiz} businesses ranked across ${combos} categories.

Return EXACTLY a JSON object with this structure:
{
  "title": "string",
  "summary": "string (executive summary)",
  "highlights": ["string", "string", "string"] // exactly 3 bullet highlights
}`;

  try {
    return await generateText(prompt);
  } catch (e) {
    return stubProvider.generateDigest(rankingData);
  }
}

async function generateSocialContent(business, rankData) {
  const name = business.name || 'Business';
  const rank = rankData?.rank_position || 'Top';
  const city = business.city_name || 'their city';
  const category = business.cat_name || 'their category';

  const prompt = `Generate social media announcement posts for a business ranking on Bharat Business Index (BBI).
Name: ${name}
Rank: #${rank}
Category: ${category}
City: ${city}

Return EXACTLY a JSON object with this structure:
{
  "linkedin": "string (professional post with emojis and hashtags)",
  "instagram": "string (engaging post with emojis and hashtags)",
  "newsletter": "string (short blurb for an email newsletter)"
}`;

  try {
    return await generateText(prompt);
  } catch (e) {
    return stubProvider.generateSocialContent(business, rankData);
  }
}

async function moderateContent(text) {
  if (!text || text.trim() === '') {
    return { isClean: true, flags: [] };
  }

  console.log('[AI] Request Started (Moderation)');
  try {
    if (!openai) throw new Error('OpenAI not initialized');
    
    const response = await openai.moderations.create({
      model: 'omni-moderation-latest',
      input: text,
    });
    
    console.log('[AI] Request Completed (Moderation)');
    const result = response.results[0];
    
    const flags = [];
    if (result.flagged) {
      for (const [category, flagged] of Object.entries(result.categories)) {
        if (flagged) flags.push(`Violates policy: ${category}`);
      }
    }

    // Additional BBI specific checks (keyword stuffing, excessive caps)
    const lowerText = text.toLowerCase();
    const spamKeywords = ['buy now', 'click here', 'limited offer', 'free money', 'guaranteed'];
    const isSpam = spamKeywords.some(kw => lowerText.includes(kw));
    if (isSpam) flags.push('Potential spam detected');

    return {
      isClean: !result.flagged && !isSpam,
      flags: flags
    };
  } catch (error) {
    console.error(`[AI] OpenAI Moderation Failed: ${error.message}`);
    console.warn('[AI] Fallback Activated (Moderation)');
    return stubProvider.moderateContent(text);
  }
}

async function suggestRelated(businessId, db) {
  try {
    return await stubProvider.suggestRelated(businessId, db);
  } catch (e) {
    return { businesses: [], categories: [], rankings: [] };
  }
}

// ============================================
// NEW CMS AI METHODS
// ============================================

async function generateSeoTags(name, type) {
  const prompt = `Generate highly optimized SEO tags for a ${type} landing page named "${name}". Return EXACTLY a JSON object: {"title": "string (under 60 chars)", "meta_description": "string (under 155 chars)"}`;
  return await generateText(prompt);
}

async function generateSeoEditorial(name, type) {
  const prompt = `Write an engaging, SEO-optimized 100-word introduction paragraph for a directory page about "${name}" (${type}). Make it professional, persuasive, and authoritative. Return EXACTLY a JSON object: {"content": "string (HTML format)"}`;
  return await generateText(prompt);
}

async function generateBlogDraft(title) {
  const prompt = `Write a complete, structured 400-word blog post about "${title}". Use HTML headings (<h2>, <h3>), paragraphs, and bullet points if appropriate. Make it professional and highly readable. Return EXACTLY a JSON object: {"content": "string (HTML format)"}`;
  return await generateText(prompt);
}

async function generateBlogSummary(content) {
  const prompt = `Read this blog post content and generate a short excerpt and a meta description. 
Content: ${content.substring(0, 2000)}...

Return EXACTLY a JSON object: {"excerpt": "string (2-3 sentences)", "meta_description": "string (under 155 chars)"}`;
  return await generateText(prompt);
}

async function generateDigestSummary(month) {
  const prompt = `Write a highly engaging, 3-paragraph email newsletter summary for the Bharat Business Index (BBI) Monthly Digest for ${month}. Highlight that there are new movers, entrants, and cities added to our rankings. Write in a celebratory, professional tone. Return EXACTLY a JSON object: {"content": "string (plain text)"}`;
  return await generateText(prompt);
}

module.exports = {
  generateListingContent,
  generateFaqContent,
  generateSeoContent,
  generateDigest,
  generateSocialContent,
  moderateContent,
  suggestRelated,
  generateSeoTags,
  generateSeoEditorial,
  generateBlogDraft,
  generateBlogSummary,
  generateDigestSummary,
};
