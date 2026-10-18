const request = require('supertest');
const app = require('../index');

describe('Basic API Test', () => {
  test('GET / should return service info JSON', async () => {
    const res = await request(app).get('/');

    expect(res.statusCode).toBe(200);
    expect(res.body.service).toBe('task-manager-backend');
    expect(res.body.status).toBe('ok');
    expect(res.body).toHaveProperty('version');
    expect(res.body).toHaveProperty('environment');
  });

  test('GET /health/live should return alive status', async () => {
    const res = await request(app).get('/health/live');

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('alive');
  });

  test('GET /health/ready should return ready status', async () => {
    const res = await request(app).get('/health/ready');

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ready');
    expect(res.body).toHaveProperty('uptime');
  });

  test('GET /metrics should return Prometheus text format', async () => {
    const res = await request(app).get('/metrics');

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    expect(res.text).toMatch(/http_requests_total/);
  });
});
