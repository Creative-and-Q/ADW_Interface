import http from 'http';

const tests = [
  {
    name: 'List all chains',
    messages: [{ role: 'user', content: 'Show me all existing chains' }]
  },
  {
    name: 'Get specific chain',
    messages: [{ role: 'user', content: 'Get chain 1' }]
  },
  {
    name: 'Delete chain',
    messages: [{ role: 'user', content: 'Delete chain 3' }]
  }
];

async function testOperation(test) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(test);

    const options = {
      hostname: 'localhost',
      port: 3035,
      path: '/ai/chat',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          const response = JSON.parse(body);
          resolve({ test: test.name, success: true, response: response.data?.content || response.content });
        } catch (e) {
          resolve({ test: test.name, success: false, error: body });
        }
      });
    });

    req.on('error', (e) => {
      resolve({ test: test.name, success: false, error: e.message });
    });

    req.write(data);
    req.end();
  });
}

async function runTests() {
  console.log('ðŸ§ª Testing AI Agent Direct Operations...\n');

  for (const test of tests) {
    console.log(`Testing: ${test.name}`);
    try {
      const result = await testOperation(test);
      if (result.success) {
        console.log('âœ… SUCCESS');
        console.log(result.response.substring(0, 200) + '...\n');
      } else {
        console.log('âŒ FAILED');
        console.log('Error:', result.error, '\n');
      }
    } catch (error) {
      console.log('âŒ ERROR:', error.message, '\n');
    }
  }
}

runTests();
