// ===== Firebase Configuration =====
// INSTRUCTIONS: Replace these with your own Firebase project credentials.
// 1. Go to https://console.firebase.google.com
// 2. Create a new project (or use existing)
// 3. Enable Authentication (Email/Password + Google)
// 4. Create a Firestore Database
// 5. Enable Storage
// 6. Go to Project Settings > General > Your apps > Add web app
// 7. Copy your config values below

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// Google Auth Provider
const googleProvider = new firebase.auth.GoogleAuthProvider();

// Firestore settings
db.settings({ experimentalForceLongPolling: true });

console.log('🔥 Firebase initialized');
