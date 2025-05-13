import express from 'express';
import * as admin from 'firebase-admin';

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

app.get('/', (req, res) => {
  res.send('Backend API running with Firebase integration (pending setup)');
});

// Example Firestore usage (requires initialization):
// app.get('/users', async (req, res) => {
//   if (!admin.apps.length) {
//     return res.status(500).send('Firebase not initialized');
//   }
//   try {
//     const usersSnapshot = await admin.firestore().collection('users').get();
//     const users = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
//     res.json(users);
//   } catch (error) {
//     console.error('Error fetching users:', error);
//     res.status(500).send('Error fetching users');
//   }
// });

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
