import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBKqb6aY-sLGEK-L3nnu_ZHqpeN02hXBIg",
  authDomain: "taelim-mtmg.firebaseapp.com",
  projectId: "taelim-mtmg",
  storageBucket: "taelim-mtmg.firebasestorage.app",
  messagingSenderId: "451227397390",
  appId: "1:451227397390:web:4e1ca2b96179d08746bb5f"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
