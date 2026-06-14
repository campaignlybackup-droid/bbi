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
const defaultSystemInstruction = `You are a professional business directory content generator for Bharat Business Index (BBI).
STRICT EDITORIAL RULES:
1. NEVER use first-person words (I, me, my, mine, we, us, our, ours).
2. NEVER use second-person words (you, your, yours).
3. DO NOT write opinions (e.g., "We believe", "Best choice", "Perfect option"). Write only based on available data and facts.
4. Use simple and clear language understood by business owners, customers, and non-technical users.
5. Keep sentences short and direct. Avoid complex words.
6. Use only these names for the platform: "Bharat Business Index", "BBI", "BBI rankings", "The BBI methodology".
7. DO NOT use marketing language (e.g., "World-class", "Industry-leading", "Revolutionary", "Unmatched", "Premium").
8. Content must sound like an independent business directory, research report, or ranking platform, NOT an advertisement.`;

async function generateText(prompt, systemInstruction = defaultSystemInstruction) {
  if (!openai) {
    console.warn('[AI] Request Started - OpenAI not initialized. Fallback Activated.');
    throw new Error('OpenAI not initialized');
  }

  const safePrompt = prompt.substring(0, 3000);
  const cacheKey = JSON.stringify({ prompt: safePrompt, systemInstruction });
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
        { role: 'user', content: safePrompt }
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
- Description (summary) must be 300-500 words, completely unique, fully SEO-optimized, factual, and strictly in the third person.
- Avoid keyword stuffing, but naturally include the city and category.
- Do not use promotional language or opinions. Never use 1st/2nd person.
- Must return EXACTLY a JSON object with this structure:
{
  "seo_title": "string",
  "meta_description": "string",
  "summary": "string (300-500 words)",
  "tags": "string (comma-separated list of up to 50 search-term related keywords/tags)"
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

Requirements:
- Keep answers factual, direct, and written in simple English.
- Do not use "we", "our", "you", or "your".
- Return EXACTLY a JSON object containing an array under the key "faqs":
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

Requirements:
- Ensure the editorial summary is factual, objective, and simple.
- Refer to the platform as "Bharat Business Index" or "BBI". Do not use "our".
- Return EXACTLY a JSON object with this structure:
{
  "title": "string (optimized title tag)",
  "meta_description": "string (compelling meta description)",
  "editorial": "string (a professional, objective summary about this category or city ranking)"
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

Requirements:
- Keep the tone factual, professional, and celebratory but not overly promotional.
- Do not use 1st/2nd person pronouns.
- Return EXACTLY a JSON object with this structure:
{
  "linkedin": "string (professional post with emojis and hashtags)",
  "instagram": "string (engaging post with emojis and hashtags)",
  "newsletter": "string (short, objective blurb for an email newsletter)"
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

    // Additional BBI specific checks (keyword stuffing, excessive caps, restricted language)
    const lowerText = text.toLowerCase();
    
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

    if (isSpam) flags.push('Potential spam detected');
    if (hasMarketing) flags.push('Contains promotional marketing language');
    if (hasOpinions) flags.push('Contains opinion-based statements');
    if (hasFirstPerson) flags.push('Contains first-person language');
    if (hasSecondPerson) flags.push('Contains second-person language');

    return {
      isClean: !result.flagged && flags.length === 0,
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
  const prompt = `Generate highly optimized SEO tags for a ${type} landing page named "${name}". Keep it factual and objective. Return EXACTLY a JSON object: {"title": "string (under 60 chars)", "meta_description": "string (under 155 chars)"}`;
  return await generateText(prompt);
}

async function generateSeoEditorial(name, type) {
  const prompt = `Write an engaging, SEO-optimized 100-word introduction paragraph for a directory page about "${name}" (${type}). Make it professional, factual, and objective. Do not use opinions or marketing fluff. Return EXACTLY a JSON object: {"content": "string (HTML format)"}`;
  return await generateText(prompt);
}

async function generateBlogDraft(title) {
  const prompt = `Write a complete, structured 400-word blog post about "${title}". Use HTML headings (<h2>, <h3>), paragraphs, and bullet points if appropriate. Write in simple English, keeping sentences short. Maintain a third-person, factual tone. Return EXACTLY a JSON object: {"content": "string (HTML format)"}`;
  return await generateText(prompt);
}

async function generateBlogSummary(content) {
  const prompt = `Read this blog post content and generate a short excerpt and a meta description. Ensure the output is completely objective.
Content: ${content.substring(0, 2000)}...

Return EXACTLY a JSON object: {"excerpt": "string (2-3 sentences)", "meta_description": "string (under 155 chars)"}`;
  return await generateText(prompt);
}

async function generateDigestSummary(month) {
  const prompt = `Write a 3-paragraph email newsletter summary for the Bharat Business Index (BBI) Monthly Digest for ${month}. Highlight new movers, entrants, and cities. Write in a professional, third-person, and objective tone. Do not use "our rankings". Use "BBI rankings". Return EXACTLY a JSON object: {"content": "string (plain text)"}`;
  return await generateText(prompt);
}

/**
 * Generate comprehensive import content for a newly imported business.
 * Enforces BBI editorial voice: third person, never "we/our/us", independent platform tone.
 */
async function generateImportContent(business) {
  const name = business.name || 'Business';
  const city = business.city_name || 'the city';
  const category = business.cat_name || 'local services';

  const prompt = `You are writing content for the Bharat Business Index (BBI), India's independent business ranking platform.

Generate fully SEO-optimized, comprehensive listing content for this business:
Name: ${name}
City: ${city}
Category: ${category}
Verified: ${business.verified ? 'Yes' : 'No'}

STRICT RULES:
- Always write in THIRD PERSON about the business
- NEVER use "we", "our", "us", "your" — always refer to the business by name or "the business"
- Use an editorial, independent platform voice — BBI is observing and reporting, not endorsing
- Content must feel like it comes from an independent ranking platform, NOT from the business itself
- Be factual and measured, not promotional
- Maximize SEO potential with relevant, related terms

Return EXACTLY a JSON object with this structure:
{
  "seo_title": "string (under 60 chars, fully optimized for search)",
  "meta_description": "string (under 155 chars, compelling for SERP click)",
  "description": "string (400-600 words, highly detailed, fully SEO-optimized third-person editorial description)",
  "summary": "string (2-3 sentences, concise overview for cards/previews)",
  "faqs": [
    {"question": "string", "answer": "string"},
    {"question": "string", "answer": "string"},
    {"question": "string", "answer": "string"},
    {"question": "string", "answer": "string"},
    {"question": "string", "answer": "string"}
  ],
  "keywords": "string (comma-separated list of up to 50 search-term related keywords)",
  "tags": "string (comma-separated list of up to 50 search-term related keywords/tags)"
}`;

  try {
    return await generateText(prompt);
  } catch (e) {
    // Fallback to stub
    const stubProvider = require('./stubProvider');
    return stubProvider.generateImportContent(business);
  }
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
  generateImportContent,
};

