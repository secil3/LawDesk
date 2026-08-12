(async () => {
  process.env.NODE_ENV = 'test';
  process.env.AUTH_TOKEN_SECRET = 'test-secret-'.repeat(8);
  process.env.AUTH_TOKEN_TTL_HOURS = '8';
  process.env.AUTH_COOKIE_NAME = 'lawdesk_test_session';

  const jwt = require('jsonwebtoken');
  const request = require('supertest');
  const app = require('../app');
  const db = require('../config/db');

  // stub db.query to handle queries used by PATCH
  db.query = async (text, params) => {
    const t = String(text || '').toLowerCase();
    console.log('DB QUERY:', text, params);
    if (t.includes('select kullaniciid') || t.includes('where kullaniciid = $1')) {
      return { rows: [ { kullaniciid: 1, adsoyad: 'Test Admin', email: 'admin.test@sirket.com', rol: 'admin', aktifmi: true } ] };
    }
    if (t.includes('update kullanicilar')) {
      return { rowCount: 1, rows: [ { id: params[1], email: 'zayn@gmail.com', aktifmi: params[0] } ] };
    }
    if (t.includes('delete from grupuyelikleri')) return { rows: [] };
    if (t.includes('delete from kullanicilar')) return { rowCount: 1, rows: [ { id: params[0], email: 'zayn@gmail.com' } ] };
    return { rows: [] };
  };

  const token = jwt.sign({}, process.env.AUTH_TOKEN_SECRET, {
    subject: String(1),
    issuer: 'lawdesk-backend',
    audience: 'lawdesk-web',
    expiresIn: '1h',
    algorithm: 'HS256',
  });

  const res = await request(app)
    .patch('/api/admin/users/2')
    .set('Cookie', `${process.env.AUTH_COOKIE_NAME}=${token}`)
    .send({ aktifMi: false });

  console.log('status', res.status);
  console.log('body', res.body);
})();