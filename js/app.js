// ===== Main App Router =====

const App = {
  currentPage: 'auth',
  viewingProfileUid: null,

  init() {
    Auth.init();
    Posts.init();
    Admin.init();
    App.bindNav();
    App.bindLightbox();
    App.bindSettings();
    App.bindSearch();
    App.bindExplore();
    App.loadTheme();
  },

  showAuth() {
    document.getElementById('navbar').classList.add('hidden');
    document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
    document.getElementById('page-auth').classList.remove('hidden');
    App.currentPage = 'auth';
  },

  showApp() {
    document.getElementById('navbar').classList.remove('hidden');
    App.updateNav();
    App.updateSidebar();
    App.updateComposerAvatar();
    App.navigate('feed');
    Posts.checkUnreadNotifications();
    // Refresh notif badge periodically
    setInterval(() => Posts.checkUnreadNotifications(), 30000);
  },

  navigate(page, data) {
    document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
    document.getElementById(`page-${page}`).classList.remove('hidden');

    // Update active nav link
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    const navLink = document.querySelector(`.nav-link[data-page="${page}"]`);
    if (navLink) navLink.classList.add('active');

    App.currentPage = page;

    // Page-specific loading
    switch (page) {
      case 'feed':
        Posts.loadFeed('all');
        Posts.loadTrending();
        Posts.loadSuggested();
        Posts.loadPopularTags();
        break;
      case 'explore':
        Posts.loadExplore('posts');
        break;
      case 'notifications':
        Posts.loadNotifications();
        break;
      case 'profile':
        const uid = data || Auth.currentUser.uid;
        App.viewingProfileUid = uid;
        Posts.loadProfile(uid);
        break;
      case 'settings':
        App.loadSettings();
        break;
      case 'admin':
        if (Auth.isAdmin()) Admin.loadDashboard();
        break;
    }
  },

  viewProfile(uid) {
    App.navigate('profile', uid);
  },

  bindNav() {
    // Nav links
    document.querySelectorAll('[data-page]').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const page = link.dataset.page;
        if (page) App.navigate(page);
        // Close dropdown
        document.getElementById('userDropdown').classList.remove('show');
      });
    });

    // Avatar dropdown
    document.getElementById('navAvatarWrap').addEventListener('click', (e) => {
      e.stopPropagation();
      document.getElementById('userDropdown').classList.toggle('show');
    });

    document.addEventListener('click', () => {
      document.getElementById('userDropdown').classList.remove('show');
    });
  },

  bindLightbox() {
    document.getElementById('lightboxClose').addEventListener('click', () => {
      document.getElementById('lightbox').classList.add('hidden');
    });
    document.getElementById('lightbox').addEventListener('click', (e) => {
      if (e.target === document.getElementById('lightbox')) {
        document.getElementById('lightbox').classList.add('hidden');
      }
    });
  },

  bindSearch() {
    const searchInput = document.getElementById('searchInput');
    let debounce;
    searchInput.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        const q = searchInput.value.trim();
        if (q.length >= 2) {
          App.navigate('explore');
          document.getElementById('exploreSearch').value = q;
          Posts.loadExplore('posts', q);
        }
      }, 500);
    });
  },

  bindExplore() {
    document.querySelectorAll('.explore-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.explore-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const query = document.getElementById('exploreSearch').value.trim();
        Posts.loadExplore(tab.dataset.tab, query);
      });
    });

    document.getElementById('exploreSearch').addEventListener('input', () => {
      clearTimeout(App._exploreDebounce);
      App._exploreDebounce = setTimeout(() => {
        const activeTab = document.querySelector('.explore-tab.active');
        Posts.loadExplore(activeTab?.dataset.tab || 'posts', document.getElementById('exploreSearch').value.trim());
      }, 500);
    });
  },

  updateNav() {
    const profile = Auth.currentProfile;
    if (!profile) return;

    document.getElementById('navAvatar').src = profile.avatar || Utils.defaultAvatar;

    // Show admin link if admin
    const adminLink = document.querySelector('.admin-only');
    if (Auth.isAdmin()) {
      adminLink.classList.remove('hidden');
    } else {
      adminLink.classList.add('hidden');
    }
  },

  updateSidebar() {
    const profile = Auth.currentProfile;
    if (!profile) return;

    document.getElementById('sidebarAvatar').src = profile.avatar || Utils.defaultAvatar;
    document.getElementById('sidebarName').textContent = profile.displayName;
    document.getElementById('sidebarUsername').textContent = '@' + profile.username;
    document.getElementById('sidebarPosts').textContent = profile.postCount || 0;
    document.getElementById('sidebarFollowers').textContent = profile.followers ? profile.followers.length : 0;
    document.getElementById('sidebarFollowing').textContent = profile.following ? profile.following.length : 0;
  },

  updateComposerAvatar() {
    const avatar = Auth.currentProfile?.avatar || Utils.defaultAvatar;
    document.getElementById('composerAvatar').src = avatar;
  },

  // Settings
  bindSettings() {
    document.getElementById('settingsForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const updates = {
        displayName: document.getElementById('setName').value.trim(),
        bio: document.getElementById('setBio').value.trim(),
        location: document.getElementById('setLocation').value.trim()
      };

      try {
        const avatarFile = document.getElementById('setAvatar').files[0];
        if (avatarFile) {
          try {
            updates.avatar = await Utils.uploadImage(avatarFile, 'avatars');
          } catch (e) {
            updates.avatar = await Utils.fileToBase64(avatarFile);
          }
        }

        const bannerFile = document.getElementById('setBanner').files[0];
        if (bannerFile) {
          try {
            updates.banner = await Utils.uploadImage(bannerFile, 'banners');
          } catch (e) {
            updates.banner = await Utils.fileToBase64(bannerFile);
          }
        }

        await db.collection('users').doc(Auth.currentUser.uid).update(updates);

        // Update local profile
        Object.assign(Auth.currentProfile, updates);
        App.updateNav();
        App.updateSidebar();
        App.updateComposerAvatar();

        // Update author info on existing posts
        const batch = db.batch();
        const postsSnap = await db.collection('posts').where('authorId', '==', Auth.currentUser.uid).get();
        postsSnap.forEach(doc => {
          batch.update(doc.ref, {
            authorName: updates.displayName,
            authorAvatar: updates.avatar || Auth.currentProfile.avatar
          });
        });
        await batch.commit();

        Utils.toast('Profile updated!', 'success');
      } catch (err) {
        Utils.toast('Error saving: ' + err.message, 'error');
      }
    });

    // Theme
    document.getElementById('themeSelect').addEventListener('change', (e) => {
      App.setTheme(e.target.value);
    });

    // Delete account
    document.getElementById('deleteAccountBtn').addEventListener('click', async () => {
      if (!confirm('Are you sure you want to delete your account? This cannot be undone.')) return;
      if (!confirm('FINAL WARNING: All your data will be permanently deleted.')) return;

      try {
        const uid = Auth.currentUser.uid;
        // Delete posts
        const postsSnap = await db.collection('posts').where('authorId', '==', uid).get();
        const batch = db.batch();
        postsSnap.forEach(doc => batch.delete(doc.ref));
        batch.delete(db.collection('users').doc(uid));
        await batch.commit();
        await Auth.currentUser.delete();
        Utils.toast('Account deleted', 'info');
      } catch (err) {
        Utils.toast('Error: ' + err.message, 'error');
      }
    });
  },

  loadSettings() {
    const p = Auth.currentProfile;
    if (!p) return;
    document.getElementById('setName').value = p.displayName || '';
    document.getElementById('setBio').value = p.bio || '';
    document.getElementById('setLocation').value = p.location || '';
    document.getElementById('setEmail').value = p.email || '';
    document.getElementById('themeSelect').value = localStorage.getItem('freeme-theme') || 'light';
  },

  setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('freeme-theme', theme);
  },

  loadTheme() {
    const saved = localStorage.getItem('freeme-theme') || 'light';
    App.setTheme(saved);
  }
};

// Start the app
document.addEventListener('DOMContentLoaded', () => App.init());
