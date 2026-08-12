(async () => {
  process.env.NODE_ENV = 'test';
  process.env.AUTH_TOKEN_SECRET = 'test-secret-'.repeat(8);
  process.env.AUTH_TOKEN_TTL_HOURS = '8';
  process.env.AUTH_COOKIE_NAME = 'lawdesk_test_session';

  const argon2 = require('argon2');
  const request = require('supertest');
  const app = require('../app');
  const db = require('../config/db');

  const testPassword = 'GuvenliTestSifresi123!';
  const passwordHash = await argon2.hash(testPassword, { type: argon2.argon2id });

  db.query = async (text, params) => {
    const t = String(text || '').toLowerCase();
    if (t.includes('sifrehash')) {
      return { rows: [ { kullaniciid: 1, adsoyad: 'Test Admin', email: 'admin.test@sirket.com', sifrehash: passwordHash, rol: 'admin', aktifmi: true } ] };
    }
    return { rows: [] };
  };

  const res = await request(app).post('/api/auth/login').send({ email: 'admin.test@sirket.com', password: testPassword });
  console.log('status', res.status);
  console.log('body', res.body);
  console.log('headers', res.headers);
})();
