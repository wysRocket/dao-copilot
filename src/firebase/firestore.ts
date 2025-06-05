import { db } from './config';
import { doc, getDoc, setDoc, updateDoc, collection, getDocs } from 'firebase/firestore';

export async function getUserData(userId: string) {
  const userDoc = doc(db, 'users', userId);
  const snapshot = await getDoc(userDoc);
  return snapshot.exists() ? snapshot.data() : null;
}

export async function setUserData(userId: string, data: any) {
  const userDoc = doc(db, 'users', userId);
  await setDoc(userDoc, data, { merge: true });
}

export async function getUserSettings(userId: string) {
  const settingsDoc = doc(db, 'userSettings', userId);
  const snapshot = await getDoc(settingsDoc);
  return snapshot.exists() ? snapshot.data() : null;
}

export async function setUserSettings(userId: string, data: any) {
  const settingsDoc = doc(db, 'userSettings', userId);
  await setDoc(settingsDoc, data, { merge: true });
}
