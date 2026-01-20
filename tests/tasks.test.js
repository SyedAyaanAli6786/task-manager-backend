const request = require('supertest');
const app = require('../index');

describe('Task API (Dummy Data)', () => {

    test('GET /tasks', async () => {
        const res = await request(app).get('/tasks');
        expect(res.statusCode).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });

    test('POST /tasks', async () => {
        const res = await request(app)
            .post('/tasks')
            .send({ title: 'New Task' });

        expect(res.statusCode).toBe(201);
        expect(res.body.title).toBe('New Task');
    });

});
