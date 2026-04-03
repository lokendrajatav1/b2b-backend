const request = require('supertest');
const app = require('../src/server');

describe('Lead API', () => {
  describe('POST /api/leads — Inquiry Lead', () => {
    it('should reject missing fields', async () => {
      const res = await request(app)
        .post('/api/leads')
        .send({});

      expect(res.statusCode).toBe(400);
    });

    it('should reject invalid categoryId', async () => {
      const res = await request(app)
        .post('/api/leads')
        .send({
          buyerName: 'Test',
          phone: '9876543210',
          city: 'Mumbai',
          categoryId: 'not-a-uuid'
        });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('POST /api/leads/direct — Direct Lead', () => {
    it('should reject missing vendorId', async () => {
      const res = await request(app)
        .post('/api/leads/direct')
        .send({ actionType: 'CALL' });

      expect(res.statusCode).toBe(400);
    });

    it('should reject invalid actionType', async () => {
      const res = await request(app)
        .post('/api/leads/direct')
        .send({
          vendorId: '00000000-0000-0000-0000-000000000000',
          actionType: 'INVALID'
        });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('PATCH /api/leads/:leadId/status — Lead Status', () => {
    it('should reject without authentication', async () => {
      const res = await request(app)
        .patch('/api/leads/some-id/status')
        .send({ status: 'CLOSED' });

      expect(res.statusCode).toBe(401);
    });
  });
});
