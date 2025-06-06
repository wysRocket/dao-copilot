import {db} from './config';
import {doc, getDoc, setDoc} from 'firebase/firestore';
import {UserSettings} from '@/types/user-settings';

export async function getUserData(userId: string) {
  const userDoc = doc(db, 'users', userId);
  const snapshot = await getDoc(userDoc);
  return snapshot.exists() ? snapshot.data() : null;
}

export async function setUserData(
  userId: string,
  data: Record<string, unknown>,
) {
  const userDoc = doc(db, 'users', userId);
  await setDoc(userDoc, data, {merge: true});
}

export async function getUserSettings(
  userId: string,
): Promise<UserSettings | null> {
  const settingsDoc = doc(db, 'userSettings', userId);
  const snapshot = await getDoc(settingsDoc);
  return snapshot.exists() ? (snapshot.data() as UserSettings) : null;
}

export async function setUserSettings(
  userId: string,
  data: UserSettings,
): Promise<void> {
  const settingsDoc = doc(db, 'userSettings', userId);
  await setDoc(settingsDoc, data, {merge: true});
}
