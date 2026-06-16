const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

// Read credentials securely from .env or a secure credentials file
function getAuthClient() {
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(__dirname, '../config/google-credentials.json');
  
  if (!fs.existsSync(credentialsPath)) {
    console.warn('⚠️ Google API Credentials not found. Skipping Google API integration.');
    return null;
  }

  return new google.auth.GoogleAuth({
    keyFile: credentialsPath,
    scopes: [
      'https://www.googleapis.com/auth/indexing',
      'https://www.googleapis.com/auth/webmasters.readonly'
    ],
  });
}

/**
 * Ping Google Indexing API
 * @param {string} url - The exact URL to index
 * @param {string} type - "URL_UPDATED" or "URL_DELETED"
 */
async function pingIndexingApi(url, type = 'URL_UPDATED') {
  const auth = getAuthClient();
  if (!auth) return false;

  try {
    const indexing = google.indexing({ version: 'v3', auth });
    const res = await indexing.urlNotifications.publish({
      requestBody: {
        url: url,
        type: type,
      },
    });
    console.log(`✅ Google Indexing API pinged for ${url}`);
    return res.data;
  } catch (error) {
    console.error(`❌ Google Indexing API Error for ${url}:`, error.message);
    return false;
  }
}

/**
 * Get Google Search Console Analytics
 * @param {string} siteUrl - The exact site URL registered in GSC (e.g. sc-domain:bharatbusinessindex.com)
 * @param {number} days - Number of days to fetch
 */
async function getSearchConsoleData(siteUrl, days = 30) {
  const auth = getAuthClient();
  if (!auth) return null;

  try {
    const webmasters = google.webmasters({ version: 'v3', auth });
    
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - days);

    const res = await webmasters.searchanalytics.query({
      siteUrl: siteUrl,
      requestBody: {
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        dimensions: ['date'],
      },
    });
    
    return res.data.rows || [];
  } catch (error) {
    console.error('❌ Google Search Console API Error:', error.message);
    return null;
  }
}

module.exports = {
  pingIndexingApi,
  getSearchConsoleData
};
