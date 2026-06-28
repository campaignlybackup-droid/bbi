const newsService = require('../services/newsService');
try {
  newsService.toggleNews(1);
  console.log("News toggle ok");
} catch(e) {
  console.error("Test failed", e);
}
