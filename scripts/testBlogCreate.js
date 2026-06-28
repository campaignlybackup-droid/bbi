const blogService = require('../services/blogService');
try {
  const result = blogService.createPost({
    title: 'Test Blog Post',
    content: 'This is a test blog post.',
    category: 'Technology',
    tags: 'test, blog'
  }, 1);
  console.log("Success:", result);
} catch (e) {
  console.error("Error creating post:", e);
}
