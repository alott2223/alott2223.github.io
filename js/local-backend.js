// ===== Local Storage Backend (No Firebase needed) =====
// This provides a localStorage-based backend so FreeME works without Firebase.

const LocalDB = {
  _data: {},

  init() {
    const saved = localStorage.getItem('freeme_db');
    if (saved) {
      try { LocalDB._data = JSON.parse(saved); } catch(e) { LocalDB._data = {}; }
    }
    // Initialize collections
    if (!LocalDB._data.users) LocalDB._data.users = {};
    if (!LocalDB._data.posts) LocalDB._data.posts = {};
    if (!LocalDB._data.notifications) LocalDB._data.notifications = {};
    if (!LocalDB._data.reports) LocalDB._data.reports = {};
    if (!LocalDB._data.config) LocalDB._data.config = {};
    if (!LocalDB._data.currentUser) LocalDB._data.currentUser = null;
  },

  _save() {
    localStorage.setItem('freeme_db', JSON.stringify(LocalDB._data));
  },

  _genId() {
    return Math.random().toString(36).substr(2, 12) + Date.now().toString(36);
  },

  _now() {
    return { toDate: () => new Date(), _ts: Date.now() };
  }
};

// ===== Mock Firestore Timestamp =====
const ServerTimestamp = { _isServerTimestamp: true };
const ArrayUnion = (val) => ({ _type: 'arrayUnion', value: val });
const ArrayRemove = (val) => ({ _type: 'arrayRemove', value: val });
const Increment = (val) => ({ _type: 'increment', value: val });

// ===== Mock Auth =====
const MockAuth = {
  _listeners: [],
  _currentUser: null,

  onAuthStateChanged(callback) {
    MockAuth._listeners.push(callback);
    // Check if already logged in
    const savedUid = localStorage.getItem('freeme_uid');
    if (savedUid && LocalDB._data.users[savedUid]) {
      MockAuth._currentUser = { uid: savedUid, email: LocalDB._data.users[savedUid].email, photoURL: LocalDB._data.users[savedUid].avatar, displayName: LocalDB._data.users[savedUid].displayName, delete: async () => { MockAuth.signOut(); } };
      setTimeout(() => callback(MockAuth._currentUser), 100);
    } else {
      setTimeout(() => callback(null), 100);
    }
  },

  async signInWithEmailAndPassword(email, password) {
    const users = Object.values(LocalDB._data.users);
    const user = users.find(u => u.email === email);
    if (!user) throw { code: 'auth/user-not-found' };
    if (user._password !== password) throw { code: 'auth/wrong-password' };
    if (user.banned) throw { code: 'auth/user-disabled' };

    MockAuth._currentUser = { uid: user.uid, email: user.email, photoURL: user.avatar, displayName: user.displayName, delete: async () => { MockAuth.signOut(); } };
    localStorage.setItem('freeme_uid', user.uid);
    MockAuth._listeners.forEach(cb => cb(MockAuth._currentUser));
    return { user: MockAuth._currentUser };
  },

  async createUserWithEmailAndPassword(email, password) {
    const users = Object.values(LocalDB._data.users);
    if (users.find(u => u.email === email)) throw { code: 'auth/email-already-in-use' };
    if (password.length < 6) throw { code: 'auth/weak-password' };

    const uid = LocalDB._genId();
    // Store password locally (only for local demo!)
    LocalDB._data.users[uid] = { uid, email, _password: password };
    LocalDB._save();

    MockAuth._currentUser = { uid, email, photoURL: null, displayName: null, delete: async () => { MockAuth.signOut(); } };
    localStorage.setItem('freeme_uid', uid);
    MockAuth._listeners.forEach(cb => cb(MockAuth._currentUser));
    return { user: MockAuth._currentUser };
  },

  async signInWithPopup(provider) {
    // Simulate Google login with a prompt
    const email = prompt('Simulated Google Sign-In\nEnter an email address:');
    if (!email) throw { code: 'auth/popup-closed-by-user' };

    const users = Object.values(LocalDB._data.users);
    const existing = users.find(u => u.email === email);

    if (existing) {
      MockAuth._currentUser = { uid: existing.uid, email: existing.email, photoURL: existing.avatar, displayName: existing.displayName, delete: async () => { MockAuth.signOut(); } };
      localStorage.setItem('freeme_uid', existing.uid);
      MockAuth._listeners.forEach(cb => cb(MockAuth._currentUser));
      return { user: MockAuth._currentUser, additionalUserInfo: { isNewUser: false } };
    } else {
      const uid = LocalDB._genId();
      const name = email.split('@')[0];
      LocalDB._data.users[uid] = { uid, email, _password: 'google_' + uid };
      LocalDB._save();
      MockAuth._currentUser = { uid, email, photoURL: null, displayName: name, delete: async () => { MockAuth.signOut(); } };
      localStorage.setItem('freeme_uid', uid);
      MockAuth._listeners.forEach(cb => cb(MockAuth._currentUser));
      return { user: MockAuth._currentUser, additionalUserInfo: { isNewUser: true } };
    }
  },

  signOut() {
    MockAuth._currentUser = null;
    localStorage.removeItem('freeme_uid');
    MockAuth._listeners.forEach(cb => cb(null));
  }
};

// ===== Mock Firestore =====
const MockFirestore = {
  collection(name) {
    return new MockCollection(name);
  },
  batch() {
    return new MockBatch();
  },
  settings() {}
};

class MockBatch {
  constructor() { this._ops = []; }
  set(ref, data) { this._ops.push({ type: 'set', ref, data }); }
  update(ref, data) { this._ops.push({ type: 'update', ref, data }); }
  delete(ref) { this._ops.push({ type: 'delete', ref }); }
  async commit() {
    for (const op of this._ops) {
      if (op.type === 'set') {
        const col = op.ref._collection;
        const id = op.ref._id;
        LocalDB._data[col][id] = { ...op.data };
      } else if (op.type === 'update') {
        const col = op.ref._collection;
        const id = op.ref._id;
        if (LocalDB._data[col][id]) {
          MockCollection._applyUpdate(LocalDB._data[col][id], op.data);
        }
      } else if (op.type === 'delete') {
        const col = op.ref._collection;
        const id = op.ref._id;
        delete LocalDB._data[col][id];
      }
    }
    LocalDB._save();
  }
}

class MockDocRef {
  constructor(collection, id) {
    this._collection = collection;
    this._id = id;
    this.id = id;
  }
  async get() {
    const data = LocalDB._data[this._collection]?.[this._id];
    return {
      exists: !!data,
      id: this._id,
      data: () => data ? { ...data } : null,
      ref: this
    };
  }
  async set(data, options) {
    if (!LocalDB._data[this._collection]) LocalDB._data[this._collection] = {};
    if (options?.merge && LocalDB._data[this._collection][this._id]) {
      Object.assign(LocalDB._data[this._collection][this._id], MockCollection._resolveData(data));
    } else {
      LocalDB._data[this._collection][this._id] = MockCollection._resolveData(data);
    }
    LocalDB._save();
  }
  async update(data) {
    if (!LocalDB._data[this._collection]) LocalDB._data[this._collection] = {};
    if (!LocalDB._data[this._collection][this._id]) LocalDB._data[this._collection][this._id] = {};
    MockCollection._applyUpdate(LocalDB._data[this._collection][this._id], data);
    LocalDB._save();
  }
  async delete() {
    if (LocalDB._data[this._collection]) {
      delete LocalDB._data[this._collection][this._id];
      LocalDB._save();
    }
  }
  collection(subName) {
    const key = `${this._collection}/${this._id}/${subName}`;
    if (!LocalDB._data[key]) LocalDB._data[key] = {};
    return new MockCollection(key);
  }
}

class MockCollection {
  constructor(name) {
    this._name = name;
    this._filters = [];
    this._orderField = null;
    this._orderDir = 'asc';
    this._limitCount = null;
  }

  doc(id) {
    return new MockDocRef(this._name, id);
  }

  where(field, op, value) {
    const q = new MockCollection(this._name);
    q._filters = [...this._filters, { field, op, value }];
    q._orderField = this._orderField;
    q._orderDir = this._orderDir;
    q._limitCount = this._limitCount;
    return q;
  }

  orderBy(field, dir = 'asc') {
    const q = new MockCollection(this._name);
    q._filters = [...this._filters];
    q._orderField = field;
    q._orderDir = dir;
    q._limitCount = this._limitCount;
    return q;
  }

  limit(n) {
    const q = new MockCollection(this._name);
    q._filters = [...this._filters];
    q._orderField = this._orderField;
    q._orderDir = this._orderDir;
    q._limitCount = n;
    return q;
  }

  async add(data) {
    const id = LocalDB._genId();
    if (!LocalDB._data[this._name]) LocalDB._data[this._name] = {};
    LocalDB._data[this._name][id] = MockCollection._resolveData(data);
    LocalDB._save();
    return new MockDocRef(this._name, id);
  }

  async get() {
    return this._query();
  }

  onSnapshot(callback, errCallback) {
    // Run immediately and then poll every 2 seconds for changes
    const run = () => {
      try {
        const result = this._query();
        callback(result);
      } catch(e) {
        if (errCallback) errCallback(e);
      }
    };
    run();
    const interval = setInterval(run, 2000);
    // Return unsubscribe function
    return () => clearInterval(interval);
  }

  _query() {
    if (!LocalDB._data[this._name]) LocalDB._data[this._name] = {};
    let items = Object.entries(LocalDB._data[this._name]).map(([id, data]) => ({
      id,
      data: () => ({ ...data }),
      ref: new MockDocRef(this._name, id),
      ...data
    }));

    // Apply filters
    for (const f of this._filters) {
      items = items.filter(item => {
        const val = item.data()[f.field];
        switch (f.op) {
          case '==': return val === f.value;
          case '!=': return val !== f.value;
          case '>': return val > f.value;
          case '<': return val < f.value;
          case '>=': return val >= f.value;
          case '<=': return val <= f.value;
          case 'in': return Array.isArray(f.value) && f.value.includes(val);
          case 'array-contains': return Array.isArray(val) && val.includes(f.value);
          default: return true;
        }
      });
    }

    // Apply ordering
    if (this._orderField) {
      items.sort((a, b) => {
        let va = a.data()[this._orderField];
        let vb = b.data()[this._orderField];
        // Handle timestamp objects
        if (va && va._ts) va = va._ts;
        if (vb && vb._ts) vb = vb._ts;
        if (va < vb) return this._orderDir === 'asc' ? -1 : 1;
        if (va > vb) return this._orderDir === 'asc' ? 1 : -1;
        return 0;
      });
    }

    // Apply limit
    if (this._limitCount) {
      items = items.slice(0, this._limitCount);
    }

    return {
      docs: items,
      empty: items.length === 0,
      size: items.length,
      forEach: (cb) => items.forEach(cb)
    };
  }

  static _resolveData(data) {
    const resolved = {};
    for (const [key, val] of Object.entries(data)) {
      if (val && val._isServerTimestamp) {
        resolved[key] = { _ts: Date.now(), toDate: undefined };
        // Store as plain object with _ts for JSON serialization
      } else if (val && val._type === 'arrayUnion') {
        resolved[key] = val; // handled in _applyUpdate
      } else if (val && val._type === 'arrayRemove') {
        resolved[key] = val;
      } else if (val && val._type === 'increment') {
        resolved[key] = val;
      } else {
        resolved[key] = val;
      }
    }
    return resolved;
  }

  static _applyUpdate(target, data) {
    for (const [key, val] of Object.entries(data)) {
      if (val && val._isServerTimestamp) {
        target[key] = { _ts: Date.now() };
      } else if (val && val._type === 'arrayUnion') {
        if (!Array.isArray(target[key])) target[key] = [];
        if (!target[key].includes(val.value)) target[key].push(val.value);
      } else if (val && val._type === 'arrayRemove') {
        if (Array.isArray(target[key])) {
          target[key] = target[key].filter(v => v !== val.value);
        }
      } else if (val && val._type === 'increment') {
        target[key] = (target[key] || 0) + val.value;
      } else {
        target[key] = val;
      }
    }
  }
}

// ===== Mock Storage =====
const MockStorage = {
  ref(path) {
    return {
      put: async (file) => {
        // Store as base64
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        return {
          ref: {
            getDownloadURL: async () => dataUrl
          }
        };
      }
    };
  }
};

// ===== Wire everything up =====
LocalDB.init();

// Override the global Firebase objects
var auth = MockAuth;
var db = MockFirestore;
var storage = MockStorage;
var googleProvider = {};

// Mock firebase.firestore.FieldValue
var firebase = {
  firestore: {
    FieldValue: {
      serverTimestamp: () => ({ _isServerTimestamp: true, _ts: Date.now() }),
      arrayUnion: (val) => ({ _type: 'arrayUnion', value: val }),
      arrayRemove: (val) => ({ _type: 'arrayRemove', value: val }),
      increment: (val) => ({ _type: 'increment', value: val })
    }
  },
  auth: {
    GoogleAuthProvider: function() {}
  }
};

console.log('📦 FreeME running in LOCAL MODE (localStorage backend)');
