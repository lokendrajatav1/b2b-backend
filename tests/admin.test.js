const request = require('supertest');
const app = require('../src/server');

describe('Admin API — Access Control', () => {
  it('should reject unauthenticated access to admin routes', async () => {
    const routes = [
      { method: 'get', url: '/api/admin/users' },
      { method: 'get', url: '/api/admin/transactions' },
      { method: 'get', url: '/api/admin/analytics' },
      { method: 'get', url: '/api/admin/analytics/locations' },
      { method: 'get', url: '/api/admin/analytics/keywords' },
      { method: 'get', url: '/api/admin/analytics/performance' },
      { method: 'get', url: '/api/admin/leads' },
      { method: 'get', url: '/api/admin/packages' },
    ];

    for (const route of routes) {
      const res = await request(app)[route.method](route.url);
      expect(res.statusCode).toBe(401);
    }
  });

  it('should reject non-admin users', async () => {
    // Register and login as a normal buyer
    const email = `buyer_admin_test_${Date.now()}@test.com`;
    await request(app)
      .post('/api/auth/register')
      .send({ name: 'Buyer', email, password: 'Test@12345' });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'Test@12345' });

    const token = loginRes.body.data.token;

    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(403);
  });
});
