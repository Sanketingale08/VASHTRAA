const http = require('http');

const API_BASE = 'http://localhost:5000/api';

function request(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(API_BASE + path);
    http.get(url, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          resolve(body);
        }
      });
    }).on('error', reject);
  });
}

async function inspect() {
  try {
    const res = await request('/products?limit=10');
    console.log('Sample products from API:');
    if (res.products) {
      res.products.forEach(p => {
        console.log(`- ID: ${p.id} | Name: "${p.name}" | price: ${p.price} | originalPrice: ${p.originalPrice} | basePrice: ${p.basePrice}`);
      });
    } else {
      console.log(res);
    }
  } catch (err) {
    console.error('Error inspecting products:', err.message);
  }
}

inspect();
