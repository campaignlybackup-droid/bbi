const http = require('http');

const postData = 'title=Test+Title&content_encoded=VGVzdCBDb250ZW50&category=News';

const req = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/admin/blog',
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Content-Length': Buffer.byteLength(postData),
    'Cookie': 'connect.sid=fake' // Mocking session won't work easily if requireAuth blocks it
  }
}, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  res.setEncoding('utf8');
  res.on('data', (chunk) => {
    console.log(`BODY: ${chunk}`);
  });
});

req.on('error', (e) => {
  console.error(`problem with request: ${e.message}`);
});

req.write(postData);
req.end();
