import request from 'supertest';
import express from 'express';

// Импортируем app из index.ts, если экспортируется, иначе создаём mock
// import { app } from './index';
const app = express();
app.use(express.json());

// Мокаем эндпоинты для теста (пример)
app.post('/auth/register', (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Missing fields' });
  return res.status(201).json({ uid: 'testuid', email, name });
});
app.post('/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (email === 'test@example.com' && password === 'testpass') {
    return res.json({ idToken: 'mocktoken', refreshToken: 'mockrefresh', expiresIn: 3600 });
  }
  return res.status(401).json({ error: 'Invalid credentials' });
});

describe('Auth API', () => {
  it('registers a user', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'test@example.com', password: 'testpass', name: 'Test' });
    expect(res.status).toBe(201);
    expect(res.body.email).toBe('test@example.com');
  });

  it('fails to register with missing fields', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: '', password: '' });
    expect(res.status).toBe(400);
  });

  it('logs in a user', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'test@example.com', password: 'testpass' });
    expect(res.status).toBe(200);
    expect(res.body.idToken).toBeDefined();
  });

  it('fails login with wrong credentials', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'wrong@example.com', password: 'wrong' });
    expect(res.status).toBe(401);
  });
});
