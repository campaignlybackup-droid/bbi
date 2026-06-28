const http = require('http');

const postData = 'title=Test+Title+2&content_encoded=VGVzdCBDb250ZW50&category=News';

const req = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/admin/blog',
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Content-Length': Buffer.byteLength(postData),
    'Cookie': 'connect.sid=fake_session_will_bypass_auth_somehow_or_fail' // This will likely redirect to /admin/login
  }
}, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  res.on('data', (chunk) => {
    console.log(`BODY: ${chunk}`);
  });
});

req.write(postData);
req.end();
