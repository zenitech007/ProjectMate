
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBMmX56dXmj05_jPM2B6OHkek8aW871vU0",
  authDomain: "projectmate-485110.firebaseapp.com",
  projectId: "projectmate-485110",
  storageBucket: "projectmate-485110.firebasestorage.app",
  messagingSenderId: "369127916461",
  appId: "1:369127916461:web:00a24815ec4076e2a49724",
  measurementId: "G-16XEV03HMB"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
