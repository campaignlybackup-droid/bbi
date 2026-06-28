const blogService = require('../services/blogService');
try {
  blogService.publishPost(3); // Assuming ID 3 exists from my previous test
  console.log("Publish successful!");
} catch(e) {
  console.error("Publish failed:", e);
}
