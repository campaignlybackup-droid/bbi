/**
 * BBI — AI Service Index
 * Factory that returns the configured AI provider.
 */

const stubProvider = require('./stubProvider');

function getProvider() {
  const provider = process.env.AI_PROVIDER || 'stub';

  switch (provider) {
    case 'openai':
      try {
        return require('./openaiProvider');
      } catch (e) {
        console.warn('OpenAI provider not available, falling back to stub');
        return stubProvider;
      }
    case 'gemini':
      try {
        return require('./geminiProvider');
      } catch (e) {
        console.warn('Gemini provider not available, falling back to stub');
        return stubProvider;
      }
    case 'stub':
    default:
      return stubProvider;
  }
}

module.exports = { getProvider };
