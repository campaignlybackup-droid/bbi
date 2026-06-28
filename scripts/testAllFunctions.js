const db = require('../config/db');
const blogService = require('../services/blogService');
const newsService = require('../services/newsService');

try {
  let b = blogService.createPost({ title: 'Test', content: undefined });
  console.log("Blog create ok", b.slug);
  blogService.updatePost(b.id, { title: 'Test 2' });
  console.log("Blog update ok");
  
  let n = newsService.createNews({ title: 'News Test' });
  console.log("News create ok", n);
  newsService.updateNews(n, { title: 'News Test 2' });
  console.log("News update ok");
} catch(e) {
  console.error("Test failed", e);
}
