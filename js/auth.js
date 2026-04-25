// ===== Authentication Module =====

const Auth = {
  currentUser: null,
  currentProfile: null,

  init() {
    // Auth state listener
    auth.onAuthStateChanged(async (user) => {
      if (user) {
        Auth.currentUser = user;
        await Auth.loadProfile(user.uid);
        App.showApp();
      } else {
        Auth.currentUser = null;
        Auth.currentProfile = null;
        App.showAuth();
      }
    });
    Auth.bindEvents();
  },

  bindEvents() {
    // Tab switching
    document.querySelectorAll('.auth-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const isLogin = tab.dataset.tab === 'login';
        document.getElementById('loginForm').classList.toggle('hidden', !isLogin);
        document.getElementById('registerForm').classList.toggle('hidden', isLogin);
      });
    });

    // Login
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('loginEmail').value;
      const password = document.getElementById('loginPassword').value;
      const errEl = document.getElementById('loginError');
      errEl.classList.add('hidden');
      try {
        await auth.signInWithEmailAndPassword(email, password);
        Utils.toast('Welcome back!', 'success');
      } catch (err) {
        errEl.textContent = Auth.friendlyError(err.code);
        errEl.classList.remove('hidden');
      }
    });

    // Register
    document.getElementById('registerForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('regName').value.trim();
      const username = document.getElementById('regUsername').value.trim().toLowerCase();
      const email = document.getElementById('regEmail').value;
      const password = document.getElementById('regPassword').value;
      const errEl = document.getElementById('regError');
      errEl.classList.add('hidden');

      try {
        // Check if username is taken
        const existing = await db.collection('users').where('username', '==', username).get();
        if (!existing.empty) {
          errEl.textContent = 'Username is already taken.';
          errEl.classList.remove('hidden');
          return;
        }
        const cred = await auth.createUserWithEmailAndPassword(email, password);
        await Auth.createProfile(cred.user, name, username);
        Utils.toast('Welcome to FreeME!', 'success');
      } catch (err) {
        errEl.textContent = Auth.friendlyError(err.code);
        errEl.classList.remove('hidden');
      }
    });

    // Google sign in
    document.getElementById('googleLoginBtn').addEventListener('click', () => Auth.googleAuth());
    document.getElementById('googleRegBtn').addEventListener('click', () => Auth.googleAuth());

    // Logout
    document.getElementById('logoutBtn').addEventListener('click', (e) => {
      e.preventDefault();
      auth.signOut();
      Utils.toast('Logged out', 'info');
    });
  },

  async googleAuth() {
    try {
      const result = await auth.signInWithPopup(googleProvider);
      if (result.additionalUserInfo.isNewUser) {
        const username = result.user.email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '').substring(0, 20);
        await Auth.createProfile(result.user, result.user.displayName || username, username);
      }
      Utils.toast('Welcome!', 'success');
    } catch (err) {
      Utils.toast('Google sign-in failed: ' + err.message, 'error');
    }
  },

  async createProfile(user, displayName, username) {
    const profile = {
      uid: user.uid,
      displayName: displayName,
      username: username,
      email: user.email,
      avatar: user.photoURL || Utils.avatarFromName(displayName),
      banner: '',
      bio: '',
      location: '',
      role: 'user', // 'user' or 'admin'
      followers: [],
      following: [],
      postCount: 0,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastActive: firebase.firestore.FieldValue.serverTimestamp()
    };

    // First user becomes admin
    const usersSnap = await db.collection('users').limit(1).get();
    if (usersSnap.empty) {
      profile.role = 'admin';
    }

    await db.collection('users').doc(user.uid).set(profile);
    Auth.currentProfile = profile;
  },

  async loadProfile(uid) {
    const doc = await db.collection('users').doc(uid).get();
    if (doc.exists) {
      Auth.currentProfile = { id: doc.id, ...doc.data() };
      // Update last active
      db.collection('users').doc(uid).update({
        lastActive: firebase.firestore.FieldValue.serverTimestamp()
      });
    }
  },

  isAdmin() {
    return Auth.currentProfile && Auth.currentProfile.role === 'admin';
  },

  friendlyError(code) {
    const map = {
      'auth/email-already-in-use': 'Email is already registered.',
      'auth/invalid-email': 'Invalid email address.',
      'auth/weak-password': 'Password must be at least 6 characters.',
      'auth/user-not-found': 'No account found with this email.',
      'auth/wrong-password': 'Incorrect password.',
      'auth/too-many-requests': 'Too many attempts. Try again later.',
      'auth/popup-closed-by-user': 'Sign-in popup was closed.'
    };
    return map[code] || 'An error occurred. Please try again.';
  }
};
