const request = require('supertest');
const app = require('../index');

describe('Basic API Test', () => {
    test('GET / should return hello message', async () => {
        const res = await request(app).get('/');

        expect(res.statusCode).toBe(200);
        expect(res.text).toBe('Hello from the server');
    });
});
