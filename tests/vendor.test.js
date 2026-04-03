const request = require('supertest');
const app = require('../src/server');

describe('Vendor API', () => {
  describe('GET /api/vendors — Search', () => {
    it('should require city parameter', async () => {
      const res = await request(app).get('/api/vendors');
      expect(res.statusCode).toBe(400);
    });

    it('should return vendors for a valid city', async () => {
      const res = await request(app).get('/api/vendors?city=Mumbai');
      expect(res.statusCode).toBe(200);
      expect(res.body.data).toHaveProperty('vendors');
      expect(res.body.data).toHaveProperty('pagination');
      expect(Array.isArray(res.body.data.vendors)).toBe(true);
    });

    it('should respect pagination limits', async () => {
      const res = await request(app).get('/api/vendors?city=Mumbai&limit=2&page=1');
      expect(res.statusCode).toBe(200);
      expect(res.body.data.pagination.limit).toBe(2);
    });
  });

  describe('GET /api/vendors/:vendorId — Profile View', () => {
    it('should return 404 for nonexistent vendor', async () => {
      const res = await request(app).get('/api/vendors/00000000-0000-0000-0000-000000000000');
      expect(res.statusCode).toBe(404);
    });
  });
});
