import express from 'express';
import * as admin from 'firebase-admin';
import cors from 'cors';
import axios from 'axios';

// TODO: Replace with your service account key path
// const serviceAccount = require('./path/to/your/serviceAccountKey.json');

// TODO: Initialize Firebase Admin SDK if serviceAccount is available
// if (serviceAccount) {
//   admin.initializeApp({
//     credential: admin.credential.cert(serviceAccount)
//   });
//   console.log('Firebase Admin SDK initialized');
// } else {
//   console.warn('Firebase service account key not found. Skipping Firebase Admin SDK initialization.');
// }

const app = express();
const port = process.env.PORT || 4000;

app.use(express.json());
app.use(cors());

app.get('/', (req, res) => {
  res.send('Backend API running with Firebase integration (pending setup)');
});

// Регистрация пользователя (email/password)
app.post('/auth/register', async (req, res) => {
  const { email, password, name } = req.body;
  try {
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: name,
    });
    res.status(201).json({ uid: userRecord.uid, email: userRecord.email, name: userRecord.displayName });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Логин пользователя (email/password)
app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  // Firebase Admin SDK не поддерживает password login напрямую, используйте REST API Firebase Auth
  try {
    const apiKey = process.env.FIREBASE_API_KEY;
    const resp = await axios.post(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
      { email, password, returnSecureToken: true });
    res.json({ idToken: resp.data.idToken, refreshToken: resp.data.refreshToken, expiresIn: resp.data.expiresIn });
  } catch (error) {
    res.status(401).json({ error: error.response?.data?.error?.message || error.message });
  }
});

// Refresh token
app.post('/auth/refresh-token', async (req, res) => {
  const { refreshToken } = req.body;
  try {
    const apiKey = process.env.FIREBASE_API_KEY;
    const resp = await axios.post(`https://securetoken.googleapis.com/v1/token?key=${apiKey}`,
      `grant_type=refresh_token&refresh_token=${refreshToken}`,
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    res.json({ idToken: resp.data.id_token, refreshToken: resp.data.refresh_token, expiresIn: resp.data.expires_in });
  } catch (error) {
    res.status(400).json({ error: error.response?.data?.error?.message || error.message });
  }
});

// OAuth 2.0 Zoom
app.post('/auth/oauth/zoom', async (req, res) => {
  const { code, redirectUri } = req.body;
  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  try {
    const resp = await axios.post('https://zoom.us/oauth/token', null, {
      params: {
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      },
      headers: {
        Authorization: `Basic ${basicAuth}`,
      },
    });
    res.json(resp.data);
  } catch (error) {
    res.status(400).json({ error: error.response?.data || error.message });
  }
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
