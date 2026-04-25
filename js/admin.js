// ===== Admin Module =====

const Admin = {
  currentTab: 'users',

  init() {
    document.querySelectorAll('.admin-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        Admin.currentTab = tab.dataset.tab;
        Admin.loadTab(tab.dataset.tab);
      });
    });
  },

  async loadDashboard() {
    if (!Auth.isAdmin()) return;
    await Admin.loadStats();
    Admin.loadTab('users');
  },

  async loadStats() {
    try {
      const usersSnap = await db.collection('users').get();
      const postsSnap = await db.collection('posts').get();
      const reportsSnap = await db.collection('reports').where('resolved', '==', false).get();

      document.getElementById('adminUserCount').textContent = usersSnap.size;
      document.getElementById('adminPostCount').textContent = postsSnap.size;
      document.getElementById('adminReportCount').textContent = reportsSnap.size;

      // Active today - users active in last 24h
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      let activeCount = 0;
      usersSnap.forEach(doc => {
        const la = doc.data().lastActive;
        if (la && la.toDate() > yesterday) activeCount++;
      });
      document.getElementById('adminActiveCount').textContent = activeCount;
    } catch (err) {
      console.error('Admin stats error:', err);
    }
  },

  async loadTab(tab) {
    const container = document.getElementById('adminContent');
    container.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div>';

    try {
      if (tab === 'users') {
        await Admin.loadUsers(container);
      } else if (tab === 'posts') {
        await Admin.loadPosts(container);
      } else if (tab === 'reports') {
        await Admin.loadReports(container);
      } else if (tab === 'settings') {
        Admin.loadSiteSettings(container);
      }
    } catch (err) {
      container.innerHTML = '<div class="loading-spinner">Error loading data</div>';
    }
  },

  async loadUsers(container) {
    const snap = await db.collection('users').orderBy('createdAt', 'desc').get();
    let html = `
      <table class="admin-table">
        <thead>
          <tr><th></th><th>Name</th><th>Username</th><th>Email</th><th>Role</th><th>Posts</th><th>Actions</th></tr>
        </thead>
        <tbody>
    `;

    snap.forEach(doc => {
      const u = doc.data();
      const badge = u.role === 'admin' ? 'badge-admin' : u.banned ? 'badge-banned' : 'badge-user';
      const roleLabel = u.role === 'admin' ? 'Admin' : u.banned ? 'Banned' : 'User';
      html += `
        <tr>
          <td><img src="${u.avatar || Utils.defaultAvatar}" alt=""></td>
          <td>${Utils.escapeHtml(u.displayName)}</td>
          <td>@${Utils.escapeHtml(u.username)}</td>
          <td>${Utils.escapeHtml(u.email)}</td>
          <td><span class="badge ${badge}">${roleLabel}</span></td>
          <td>${u.postCount || 0}</td>
          <td>
            ${u.uid !== Auth.currentUser.uid ? `
              <button class="btn btn-sm btn-ghost" onclick="Admin.toggleRole('${doc.id}', '${u.role}')" title="Toggle role">
                <i class="fas fa-shield-halved"></i>
              </button>
              <button class="btn btn-sm btn-ghost" onclick="Admin.toggleBan('${doc.id}', ${!!u.banned})" title="${u.banned ? 'Unban' : 'Ban'}">
                <i class="fas fa-${u.banned ? 'unlock' : 'ban'}"></i>
              </button>
              <button class="btn btn-sm btn-ghost" onclick="Admin.deleteUser('${doc.id}')" title="Delete" style="color:var(--danger)">
                <i class="fas fa-trash"></i>
              </button>
            ` : '<span style="color:var(--text-muted)">You</span>'}
          </td>
        </tr>
      `;
    });

    html += '</tbody></table>';
    container.innerHTML = html;
  },

  async loadPosts(container) {
    const snap = await db.collection('posts').orderBy('createdAt', 'desc').limit(100).get();
    let html = `
      <table class="admin-table">
        <thead>
          <tr><th>Author</th><th>Content</th><th>Likes</th><th>Reports</th><th>Date</th><th>Actions</th></tr>
        </thead>
        <tbody>
    `;

    snap.forEach(doc => {
      const p = doc.data();
      html += `
        <tr>
          <td>${Utils.escapeHtml(p.authorName || 'Unknown')}</td>
          <td>${Utils.truncate(p.text || '(media)', 60)}</td>
          <td>${p.likes ? p.likes.length : 0}</td>
          <td>${p.reported ? '<i class="fas fa-flag" style="color:var(--danger)"></i>' : '-'}</td>
          <td>${p.createdAt ? Utils.timeAgo(p.createdAt) : 'N/A'}</td>
          <td>
            <button class="btn btn-sm btn-ghost" onclick="Admin.deletePostAdmin('${doc.id}')" style="color:var(--danger)" title="Delete">
              <i class="fas fa-trash"></i>
            </button>
            ${p.pinned ? `
              <button class="btn btn-sm btn-ghost" onclick="Admin.togglePin('${doc.id}', true)" title="Unpin">
                <i class="fas fa-thumbtack" style="color:var(--warning)"></i>
              </button>
            ` : `
              <button class="btn btn-sm btn-ghost" onclick="Admin.togglePin('${doc.id}', false)" title="Pin">
                <i class="fas fa-thumbtack"></i>
              </button>
            `}
          </td>
        </tr>
      `;
    });

    html += '</tbody></table>';
    container.innerHTML = html;
  },

  async loadReports(container) {
    const snap = await db.collection('reports').orderBy('createdAt', 'desc').get();

    if (snap.empty) {
      container.innerHTML = '<div class="loading-spinner">No reports</div>';
      return;
    }

    let html = `
      <table class="admin-table">
        <thead>
          <tr><th>Post ID</th><th>Reason</th><th>Reported By</th><th>Status</th><th>Actions</th></tr>
        </thead>
        <tbody>
    `;

    snap.forEach(doc => {
      const r = doc.data();
      html += `
        <tr>
          <td style="font-family:monospace;font-size:12px">${r.postId}</td>
          <td>${Utils.escapeHtml(r.reason)}</td>
          <td>${r.reportedBy}</td>
          <td><span class="badge ${r.resolved ? 'badge-user' : 'badge-banned'}">${r.resolved ? 'Resolved' : 'Open'}</span></td>
          <td>
            ${!r.resolved ? `
              <button class="btn btn-sm btn-ghost" onclick="Admin.resolveReport('${doc.id}')" title="Resolve">
                <i class="fas fa-check"></i>
              </button>
              <button class="btn btn-sm btn-ghost" onclick="Admin.deletePostAdmin('${r.postId}'); Admin.resolveReport('${doc.id}')" style="color:var(--danger)" title="Delete post & resolve">
                <i class="fas fa-trash"></i>
              </button>
            ` : '<span style="color:var(--text-muted)">Done</span>'}
          </td>
        </tr>
      `;
    });

    html += '</tbody></table>';
    container.innerHTML = html;
  },

  loadSiteSettings(container) {
    container.innerHTML = `
      <div class="admin-site-settings">
        <h3 style="margin-bottom:16px">Site Configuration</h3>
        <div class="form-group">
          <label>Site Name</label>
          <input type="text" id="adminSiteName" value="FreeME" maxlength="30">
        </div>
        <div class="form-group">
          <label>Site Description</label>
          <textarea id="adminSiteDesc" rows="3" maxlength="200">Express yourself freely. Connect with the world.</textarea>
        </div>
        <div class="form-group">
          <label>Max Post Length</label>
          <input type="number" id="adminMaxPost" value="500" min="100" max="5000">
        </div>
        <div class="form-group">
          <label>Registration</label>
          <select id="adminRegOpen">
            <option value="open">Open</option>
            <option value="closed">Closed</option>
          </select>
        </div>
        <button class="btn btn-primary" onclick="Admin.saveSiteSettings()">Save Settings</button>
      </div>
    `;
  },

  async saveSiteSettings() {
    try {
      await db.collection('config').doc('site').set({
        name: document.getElementById('adminSiteName').value,
        description: document.getElementById('adminSiteDesc').value,
        maxPostLength: parseInt(document.getElementById('adminMaxPost').value),
        registration: document.getElementById('adminRegOpen').value
      }, { merge: true });
      Utils.toast('Settings saved!', 'success');
    } catch (err) {
      Utils.toast('Error saving settings', 'error');
    }
  },

  async toggleRole(userId, currentRole) {
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    if (!confirm(`Change this user to ${newRole}?`)) return;
    try {
      await db.collection('users').doc(userId).update({ role: newRole });
      Utils.toast(`User role changed to ${newRole}`, 'success');
      Admin.loadTab('users');
    } catch (err) { Utils.toast('Error', 'error'); }
  },

  async toggleBan(userId, isBanned) {
    if (!confirm(isBanned ? 'Unban this user?' : 'Ban this user?')) return;
    try {
      await db.collection('users').doc(userId).update({ banned: !isBanned });
      Utils.toast(isBanned ? 'User unbanned' : 'User banned', 'success');
      Admin.loadTab('users');
    } catch (err) { Utils.toast('Error', 'error'); }
  },

  async deleteUser(userId) {
    if (!confirm('Permanently delete this user and all their data?')) return;
    try {
      // Delete user's posts
      const postsSnap = await db.collection('posts').where('authorId', '==', userId).get();
      const batch = db.batch();
      postsSnap.forEach(doc => batch.delete(doc.ref));
      batch.delete(db.collection('users').doc(userId));
      await batch.commit();
      Utils.toast('User deleted', 'success');
      Admin.loadDashboard();
    } catch (err) { Utils.toast('Error deleting user', 'error'); }
  },

  async deletePostAdmin(postId) {
    try {
      const postDoc = await db.collection('posts').doc(postId).get();
      if (postDoc.exists) {
        const authorId = postDoc.data().authorId;
        await db.collection('posts').doc(postId).delete();
        await db.collection('users').doc(authorId).update({
          postCount: firebase.firestore.FieldValue.increment(-1)
        });
      }
      Utils.toast('Post deleted', 'success');
      if (Admin.currentTab === 'posts') Admin.loadTab('posts');
    } catch (err) { Utils.toast('Error', 'error'); }
  },

  async togglePin(postId, isPinned) {
    try {
      await db.collection('posts').doc(postId).update({ pinned: !isPinned });
      Utils.toast(isPinned ? 'Post unpinned' : 'Post pinned', 'success');
      Admin.loadTab('posts');
    } catch (err) { Utils.toast('Error', 'error'); }
  },

  async resolveReport(reportId) {
    try {
      await db.collection('reports').doc(reportId).update({ resolved: true });
      Utils.toast('Report resolved', 'success');
      Admin.loadTab('reports');
      Admin.loadStats();
    } catch (err) { Utils.toast('Error', 'error'); }
  }
};
