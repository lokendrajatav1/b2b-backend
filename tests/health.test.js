const request = require('supertest');
const app = require('../src/server');

describe('Health & Root Endpoints', () => {
  it('GET / — should return API running message', async () => {
    const res = await request(app).get('/');
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('B2B Marketplace API Running');
  });

  it('GET /health — should return ok status', async () => {
    const res = await request(app).get('/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.timestamp).toBeDefined();
  });

  it('GET /nonexistent — should return 404', async () => {
    const res = await request(app).get('/api/nonexistent-route');
    expect(res.statusCode).toBe(404);
  });
});
