import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyDBE3Ae1iU9K3Vdzaqq-d5DAc8gzZbIZ5k",
  authDomain: "alert-system-e4703.firebaseapp.com",
  databaseURL: "https://alert-system-e4703-default-rtdb.firebaseio.com",
  projectId: "alert-system-e4703",
  storageBucket: "alert-system-e4703.firebasestorage.app",
  messagingSenderId: "429714297696",
  appId: "1:429714297696:web:29f9869174d84f2faa4405",
  measurementId: "G-LVCVVNY0P3"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const auth = getAuth(app);

// Exposed so a secondary app instance can be spun up for admin-side account
// provisioning (creating Police/Ambulance accounts without disturbing the
// admin's own signed-in session) — see createResponderAccount() in lib/responders.js.
export { firebaseConfig };
