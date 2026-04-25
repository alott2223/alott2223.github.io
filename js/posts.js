// ===== Posts Module =====

const Posts = {
  imageFile: null,
  embedUrl: null,
  feedUnsubscribe: null,

  init() {
    Posts.bindComposer();
    Posts.bindEmbedModal();
    Posts.bindFeedFilters();
  },

  bindComposer() {
    const textarea = document.getElementById('composerText');
    const charCount = document.getElementById('charCount');
    const imageInput = document.getElementById('composerImage');
    const preview = document.getElementById('composerPreview');

    textarea.addEventListener('input', () => {
      const len = textarea.value.length;
      charCount.textContent = `${len}/500`;
      charCount.classList.toggle('over', len > 500);
    });

    imageInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) {
        Utils.toast('Image must be under 5MB', 'error');
        return;
      }
      Posts.imageFile = file;
      Posts.embedUrl = null;
      const dataUrl = await Utils.fileToBase64(file);
      preview.innerHTML = `<img src="${dataUrl}" alt="preview"><button class="btn btn-sm btn-ghost" onclick="Posts.clearAttachment()"><i class="fas fa-times"></i> Remove</button>`;
      preview.classList.remove('hidden');
    });

    document.getElementById('postBtn').addEventListener('click', () => Posts.createPost());

    // Enter to post (Ctrl/Cmd + Enter)
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        Posts.createPost();
      }
    });
  },

  bindEmbedModal() {
    const modal = document.getElementById('embedModal');
    document.getElementById('embedBtn').addEventListener('click', () => {
      modal.classList.remove('hidden');
      document.getElementById('embedUrl').value = '';
      document.getElementById('embedUrl').focus();
    });
    document.getElementById('embedCancel').addEventListener('click', () => modal.classList.add('hidden'));
    document.getElementById('embedConfirm').addEventListener('click', () => {
      const url = document.getElementById('embedUrl').value.trim();
      if (!url) return;
      Posts.embedUrl = url;
      Posts.imageFile = null;
      const preview = document.getElementById('composerPreview');
      preview.innerHTML = `<div class="embed-preview"><i class="fas fa-link"></i> ${Utils.escapeHtml(url)}</div><button class="btn btn-sm btn-ghost" onclick="Posts.clearAttachment()"><i class="fas fa-times"></i> Remove</button>`;
      preview.classList.remove('hidden');
      modal.classList.add('hidden');
    });
  },

  clearAttachment() {
    Posts.imageFile = null;
    Posts.embedUrl = null;
    document.getElementById('composerPreview').classList.add('hidden');
    document.getElementById('composerPreview').innerHTML = '';
    document.getElementById('composerImage').value = '';
  },

  bindFeedFilters() {
    document.querySelectorAll('.feed-filter').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.feed-filter').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        Posts.loadFeed(btn.dataset.filter);
      });
    });
  },

  async createPost() {
    const textarea = document.getElementById('composerText');
    const text = textarea.value.trim();

    if (!text && !Posts.imageFile && !Posts.embedUrl) {
      Utils.toast('Write something or add media!', 'error');
      return;
    }
    if (text.length > 500) {
      Utils.toast('Post is too long (max 500 characters)', 'error');
      return;
    }

    const postBtn = document.getElementById('postBtn');
    postBtn.disabled = true;
    postBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

    try {
      let imageUrl = null;
      if (Posts.imageFile) {
        try {
          imageUrl = await Utils.uploadImage(Posts.imageFile, 'posts');
        } catch (e) {
          // Fallback to base64 if storage fails
          imageUrl = await Utils.fileToBase64(Posts.imageFile);
        }
      }

      const post = {
        authorId: Auth.currentUser.uid,
        authorName: Auth.currentProfile.displayName,
        authorUsername: Auth.currentProfile.username,
        authorAvatar: Auth.currentProfile.avatar,
        text: text,
        imageUrl: imageUrl,
        embedUrl: Posts.embedUrl,
        likes: [],
        commentCount: 0,
        shareCount: 0,
        tags: Posts.extractTags(text),
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        reported: false,
        pinned: false
      };

      await db.collection('posts').add(post);

      // Update post count
      db.collection('users').doc(Auth.currentUser.uid).update({
        postCount: firebase.firestore.FieldValue.increment(1)
      });
      if (Auth.currentProfile) Auth.currentProfile.postCount = (Auth.currentProfile.postCount || 0) + 1;
      App.updateSidebar();

      textarea.value = '';
      document.getElementById('charCount').textContent = '0/500';
      Posts.clearAttachment();
      Utils.toast('Post published!', 'success');
    } catch (err) {
      console.error(err);
      Utils.toast('Failed to post: ' + err.message, 'error');
    }
    postBtn.disabled = false;
    postBtn.innerHTML = 'Post';
  },

  extractTags(text) {
    const matches = text.match(/#(\w+)/g);
    return matches ? matches.map(t => t.substring(1).toLowerCase()) : [];
  },

  async loadFeed(filter = 'all') {
    const container = document.getElementById('feedContainer');
    container.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';

    // Unsubscribe previous listener
    if (Posts.feedUnsubscribe) Posts.feedUnsubscribe();

    let query = db.collection('posts').orderBy('createdAt', 'desc').limit(50);

    if (filter === 'following' && Auth.currentProfile.following && Auth.currentProfile.following.length > 0) {
      // Firestore 'in' supports max 10 items
      const followIds = Auth.currentProfile.following.slice(0, 10);
      query = db.collection('posts').where('authorId', 'in', followIds).orderBy('createdAt', 'desc').limit(50);
    } else if (filter === 'popular') {
      query = db.collection('posts').orderBy('createdAt', 'desc').limit(100);
    }

    Posts.feedUnsubscribe = query.onSnapshot((snapshot) => {
      let posts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      if (filter === 'popular') {
        posts.sort((a, b) => (b.likes?.length || 0) - (a.likes?.length || 0));
        posts = posts.slice(0, 50);
      }

      if (posts.length === 0) {
        container.innerHTML = '<div class="loading-spinner">No posts yet. Be the first to post!</div>';
        return;
      }

      container.innerHTML = posts.map(post => Posts.renderPost(post)).join('');
      Posts.bindPostEvents(container);
    }, (err) => {
      console.error(err);
      container.innerHTML = '<div class="loading-spinner">Error loading feed. Check Firebase config.</div>';
    });
  },

  renderPost(post) {
    const isOwner = Auth.currentUser && post.authorId === Auth.currentUser.uid;
    const isLiked = post.likes && post.likes.includes(Auth.currentUser?.uid);
    const likeCount = post.likes ? post.likes.length : 0;
    const timeStr = post.createdAt ? Utils.timeAgo(post.createdAt) : 'just now';
    const avatar = post.authorAvatar || Utils.defaultAvatar;

    let mediaHtml = '';
    if (post.imageUrl) {
      mediaHtml = `<div class="post-image" data-img="${Utils.escapeHtml(post.imageUrl)}"><img src="${Utils.escapeHtml(post.imageUrl)}" alt="post image" loading="lazy"></div>`;
    }
    if (post.embedUrl) {
      mediaHtml = `<div class="post-embed">${Utils.getEmbedHtml(post.embedUrl)}</div>`;
    }

    return `
      <div class="post-card" data-post-id="${post.id}">
        <div class="post-header">
          <img src="${avatar}" alt="" class="post-avatar" data-uid="${post.authorId}">
          <div class="post-user-info">
            <h4 data-uid="${post.authorId}">${Utils.escapeHtml(post.authorName || 'User')}</h4>
            <span>@${Utils.escapeHtml(post.authorUsername || 'user')} · ${timeStr}</span>
          </div>
          <div class="post-menu">
            <button class="post-menu-btn"><i class="fas fa-ellipsis-h"></i></button>
            <div class="post-dropdown">
              ${isOwner ? `<a href="#" class="post-delete" data-id="${post.id}"><i class="fas fa-trash"></i> Delete</a>` : ''}
              ${isOwner ? `<a href="#" class="post-edit" data-id="${post.id}"><i class="fas fa-pen"></i> Edit</a>` : ''}
              ${Auth.isAdmin() && !isOwner ? `<a href="#" class="post-admin-delete" data-id="${post.id}"><i class="fas fa-trash"></i> Remove (Admin)</a>` : ''}
              <a href="#" class="post-report" data-id="${post.id}"><i class="fas fa-flag"></i> Report</a>
              <a href="#" class="post-copy" data-id="${post.id}"><i class="fas fa-copy"></i> Copy Link</a>
            </div>
          </div>
        </div>
        <div class="post-body">
          <div class="post-text">${Posts.formatText(post.text || '')}</div>
          ${mediaHtml}
        </div>
        <div class="post-actions">
          <button class="post-action ${isLiked ? 'liked' : ''}" data-action="like" data-id="${post.id}">
            <i class="fas fa-heart"></i> <span>${likeCount}</span>
          </button>
          <button class="post-action" data-action="comment" data-id="${post.id}">
            <i class="fas fa-comment"></i> <span>${post.commentCount || 0}</span>
          </button>
          <button class="post-action" data-action="share" data-id="${post.id}">
            <i class="fas fa-share"></i> <span>${post.shareCount || 0}</span>
          </button>
        </div>
        <div class="comments-section hidden" id="comments-${post.id}"></div>
      </div>
    `;
  },

  formatText(text) {
    let formatted = Utils.escapeHtml(text);
    // Convert URLs to links
    formatted = formatted.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    // Hashtags
    formatted = formatted.replace(/#(\w+)/g, '<span class="hashtag" data-tag="$1">#$1</span>');
    // Mentions
    formatted = formatted.replace(/@(\w+)/g, '<span class="mention" data-user="$1">@$1</span>');
    return formatted;
  },

  bindPostEvents(container) {
    // Post menu toggles
    container.querySelectorAll('.post-menu-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const dropdown = btn.nextElementSibling;
        document.querySelectorAll('.post-dropdown.show').forEach(d => d.classList.remove('show'));
        dropdown.classList.toggle('show');
      });
    });

    // Like
    container.querySelectorAll('[data-action="like"]').forEach(btn => {
      btn.addEventListener('click', () => Posts.toggleLike(btn.dataset.id, btn));
    });

    // Comment toggle
    container.querySelectorAll('[data-action="comment"]').forEach(btn => {
      btn.addEventListener('click', () => Posts.toggleComments(btn.dataset.id));
    });

    // Share
    container.querySelectorAll('[data-action="share"]').forEach(btn => {
      btn.addEventListener('click', () => Posts.sharePost(btn.dataset.id));
    });

    // Delete
    container.querySelectorAll('.post-delete, .post-admin-delete').forEach(a => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        if (confirm('Delete this post?')) Posts.deletePost(a.dataset.id);
      });
    });

    // Report
    container.querySelectorAll('.post-report').forEach(a => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        Posts.reportPost(a.dataset.id);
      });
    });

    // Image lightbox
    container.querySelectorAll('.post-image').forEach(div => {
      div.addEventListener('click', () => {
        const src = div.dataset.img;
        document.getElementById('lightboxImg').src = src;
        document.getElementById('lightbox').classList.remove('hidden');
      });
    });

    // Navigate to profile
    container.querySelectorAll('.post-avatar, .post-user-info h4').forEach(el => {
      el.addEventListener('click', () => {
        App.viewProfile(el.dataset.uid);
      });
    });

    // Close all dropdowns on outside click
    document.addEventListener('click', () => {
      document.querySelectorAll('.post-dropdown.show').forEach(d => d.classList.remove('show'));
    });
  },

  async toggleLike(postId, btn) {
    const uid = Auth.currentUser.uid;
    const postRef = db.collection('posts').doc(postId);
    const isLiked = btn.classList.contains('liked');

    try {
      if (isLiked) {
        await postRef.update({ likes: firebase.firestore.FieldValue.arrayRemove(uid) });
      } else {
        await postRef.update({ likes: firebase.firestore.FieldValue.arrayUnion(uid) });
        // Create notification
        const postDoc = await postRef.get();
        if (postDoc.exists && postDoc.data().authorId !== uid) {
          Posts.createNotification(postDoc.data().authorId, 'like', postId);
        }
      }
    } catch (err) {
      Utils.toast('Error: ' + err.message, 'error');
    }
  },

  async toggleComments(postId) {
    const section = document.getElementById(`comments-${postId}`);
    if (!section.classList.contains('hidden')) {
      section.classList.add('hidden');
      return;
    }
    section.classList.remove('hidden');
    await Posts.loadComments(postId, section);
  },

  async loadComments(postId, section) {
    section.innerHTML = '<div class="loading-spinner" style="padding:10px"><i class="fas fa-spinner fa-spin"></i></div>';

    try {
      const snap = await db.collection('posts').doc(postId).collection('comments')
        .orderBy('createdAt', 'asc').limit(50).get();

      let html = '';
      snap.forEach(doc => {
        const c = doc.data();
        html += `
          <div class="comment">
            <img src="${c.authorAvatar || Utils.defaultAvatar}" alt="" class="comment-avatar">
            <div>
              <div class="comment-body">
                <h5>${Utils.escapeHtml(c.authorName)}</h5>
                <p>${Utils.escapeHtml(c.text)}</p>
              </div>
              <div class="comment-time">${c.createdAt ? Utils.timeAgo(c.createdAt) : 'just now'}</div>
            </div>
          </div>
        `;
      });

      html += `
        <div class="comment-input">
          <input type="text" placeholder="Write a comment..." id="commentInput-${postId}" maxlength="300">
          <button onclick="Posts.addComment('${postId}')"><i class="fas fa-paper-plane"></i></button>
        </div>
      `;

      section.innerHTML = html;

      // Enter to comment
      document.getElementById(`commentInput-${postId}`).addEventListener('keydown', (e) => {
        if (e.key === 'Enter') Posts.addComment(postId);
      });
    } catch (err) {
      section.innerHTML = '<p style="padding:10px;color:var(--text-muted)">Error loading comments</p>';
    }
  },

  async addComment(postId) {
    const input = document.getElementById(`commentInput-${postId}`);
    const text = input.value.trim();
    if (!text) return;

    try {
      await db.collection('posts').doc(postId).collection('comments').add({
        authorId: Auth.currentUser.uid,
        authorName: Auth.currentProfile.displayName,
        authorAvatar: Auth.currentProfile.avatar,
        text: text,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      await db.collection('posts').doc(postId).update({
        commentCount: firebase.firestore.FieldValue.increment(1)
      });

      // Notification
      const postDoc = await db.collection('posts').doc(postId).get();
      if (postDoc.exists && postDoc.data().authorId !== Auth.currentUser.uid) {
        Posts.createNotification(postDoc.data().authorId, 'comment', postId);
      }

      const section = document.getElementById(`comments-${postId}`);
      await Posts.loadComments(postId, section);
    } catch (err) {
      Utils.toast('Error posting comment', 'error');
    }
  },

  async deletePost(postId) {
    try {
      await db.collection('posts').doc(postId).delete();
      db.collection('users').doc(Auth.currentUser.uid).update({
        postCount: firebase.firestore.FieldValue.increment(-1)
      });
      Utils.toast('Post deleted', 'success');
    } catch (err) {
      Utils.toast('Error deleting post', 'error');
    }
  },

  async reportPost(postId) {
    try {
      await db.collection('reports').add({
        postId: postId,
        reportedBy: Auth.currentUser.uid,
        reason: 'Reported by user',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        resolved: false
      });
      await db.collection('posts').doc(postId).update({ reported: true });
      Utils.toast('Post reported. Thank you.', 'info');
    } catch (err) {
      Utils.toast('Error reporting', 'error');
    }
  },

  sharePost(postId) {
    const url = window.location.origin + window.location.pathname + `?post=${postId}`;
    navigator.clipboard.writeText(url).then(() => {
      Utils.toast('Link copied!', 'success');
    }).catch(() => {
      Utils.toast('Could not copy link', 'error');
    });
  },

  async createNotification(targetUid, type, postId) {
    try {
      await db.collection('notifications').add({
        targetUid: targetUid,
        fromUid: Auth.currentUser.uid,
        fromName: Auth.currentProfile.displayName,
        fromAvatar: Auth.currentProfile.avatar,
        type: type, // 'like', 'comment', 'follow'
        postId: postId || null,
        read: false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    } catch (err) {
      console.error('Notification error:', err);
    }
  },

  async loadNotifications() {
    const container = document.getElementById('notifContainer');
    container.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';

    try {
      const snap = await db.collection('notifications')
        .where('targetUid', '==', Auth.currentUser.uid)
        .orderBy('createdAt', 'desc')
        .limit(50).get();

      if (snap.empty) {
        container.innerHTML = '<div class="loading-spinner">No notifications yet.</div>';
        return;
      }

      let html = '';
      snap.forEach(doc => {
        const n = doc.data();
        const typeText = n.type === 'like' ? 'liked your post' :
                         n.type === 'comment' ? 'commented on your post' :
                         n.type === 'follow' ? 'started following you' : 'interacted with you';
        const icon = n.type === 'like' ? 'fa-heart' :
                     n.type === 'comment' ? 'fa-comment' : 'fa-user-plus';

        html += `
          <div class="notif-item ${n.read ? '' : 'unread'}" data-notif-id="${doc.id}">
            <img src="${n.fromAvatar || Utils.defaultAvatar}" alt="">
            <div class="notif-text"><strong>${Utils.escapeHtml(n.fromName)}</strong> ${typeText}</div>
            <div class="notif-time">${n.createdAt ? Utils.timeAgo(n.createdAt) : ''}</div>
          </div>
        `;

        // Mark as read
        if (!n.read) {
          db.collection('notifications').doc(doc.id).update({ read: true });
        }
      });

      container.innerHTML = html;
      document.getElementById('notifBadge').classList.add('hidden');
    } catch (err) {
      container.innerHTML = '<div class="loading-spinner">Error loading notifications</div>';
    }
  },

  async checkUnreadNotifications() {
    try {
      const snap = await db.collection('notifications')
        .where('targetUid', '==', Auth.currentUser.uid)
        .where('read', '==', false)
        .get();
      const count = snap.size;
      const badge = document.getElementById('notifBadge');
      if (count > 0) {
        badge.textContent = count > 99 ? '99+' : count;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    } catch (err) {
      console.error(err);
    }
  },

  // Explore page
  async loadExplore(tab = 'posts', searchQuery = '') {
    const container = document.getElementById('exploreContent');
    container.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';

    try {
      if (tab === 'posts') {
        let query = db.collection('posts').orderBy('createdAt', 'desc').limit(50);
        const snap = await query.get();
        let posts = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          posts = posts.filter(p =>
            (p.text && p.text.toLowerCase().includes(q)) ||
            (p.tags && p.tags.some(t => t.includes(q)))
          );
        }

        if (posts.length === 0) {
          container.innerHTML = '<div class="loading-spinner">No posts found</div>';
          return;
        }
        container.innerHTML = posts.map(p => Posts.renderPost(p)).join('');
        Posts.bindPostEvents(container);

      } else if (tab === 'people') {
        let query = db.collection('users').orderBy('displayName').limit(50);
        const snap = await query.get();
        let users = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          users = users.filter(u =>
            u.displayName.toLowerCase().includes(q) ||
            u.username.toLowerCase().includes(q)
          );
        }

        if (users.length === 0) {
          container.innerHTML = '<div class="loading-spinner">No people found</div>';
          return;
        }

        container.innerHTML = users.map(u => `
          <div class="post-card" style="cursor:pointer" onclick="App.viewProfile('${u.uid}')">
            <div class="post-header">
              <img src="${u.avatar || Utils.defaultAvatar}" alt="" class="post-avatar">
              <div class="post-user-info">
                <h4>${Utils.escapeHtml(u.displayName)}</h4>
                <span>@${Utils.escapeHtml(u.username)} · ${u.postCount || 0} posts</span>
              </div>
            </div>
            ${u.bio ? `<p style="font-size:14px;color:var(--text-secondary);margin-top:4px">${Utils.escapeHtml(u.bio)}</p>` : ''}
          </div>
        `).join('');

      } else if (tab === 'tags') {
        const snap = await db.collection('posts').orderBy('createdAt', 'desc').limit(200).get();
        const tagMap = {};
        snap.forEach(doc => {
          const tags = doc.data().tags || [];
          tags.forEach(t => { tagMap[t] = (tagMap[t] || 0) + 1; });
        });

        const sorted = Object.entries(tagMap).sort((a, b) => b[1] - a[1]);
        if (sorted.length === 0) {
          container.innerHTML = '<div class="loading-spinner">No tags found</div>';
          return;
        }

        container.innerHTML = '<div style="padding:20px;display:flex;flex-wrap:wrap;gap:8px">' +
          sorted.map(([tag, count]) => `
            <div class="tag-cloud"><span class="tag" style="font-size:${Math.min(12 + count * 2, 24)}px">#${tag} <small>(${count})</small></span></div>
          `).join('') + '</div>';
      }
    } catch (err) {
      container.innerHTML = '<div class="loading-spinner">Error loading content</div>';
    }
  },

  // Profile page
  async loadProfile(uid) {
    try {
      const userDoc = await db.collection('users').doc(uid).get();
      if (!userDoc.exists) {
        Utils.toast('User not found', 'error');
        return;
      }
      const user = userDoc.data();
      const isOwn = uid === Auth.currentUser.uid;

      document.getElementById('profileAvatar').src = user.avatar || Utils.defaultAvatar;
      document.getElementById('profileName').textContent = user.displayName;
      document.getElementById('profileHandle').textContent = '@' + user.username;
      document.getElementById('profileBio').textContent = user.bio || '';
      document.getElementById('profileJoined').textContent = user.createdAt ? Utils.formatDate(user.createdAt) : '';
      document.getElementById('profileLocation').textContent = user.location || 'Earth';
      document.getElementById('profilePostCount').textContent = user.postCount || 0;
      document.getElementById('profileFollowerCount').textContent = user.followers ? user.followers.length : 0;
      document.getElementById('profileFollowingCount').textContent = user.following ? user.following.length : 0;

      if (user.banner) {
        document.getElementById('profileBanner').style.backgroundImage = `url(${user.banner})`;
        document.getElementById('profileBanner').style.backgroundSize = 'cover';
      }

      // Action buttons
      const actionsEl = document.getElementById('profileActions');
      if (isOwn) {
        actionsEl.innerHTML = `<button class="btn btn-outline btn-sm" onclick="App.navigate('settings')"><i class="fas fa-pen"></i> Edit Profile</button>`;
      } else {
        const isFollowing = Auth.currentProfile.following && Auth.currentProfile.following.includes(uid);
        actionsEl.innerHTML = `<button class="btn ${isFollowing ? 'btn-following' : 'btn-follow'} btn-sm" onclick="Posts.toggleFollow('${uid}')">${isFollowing ? 'Following' : 'Follow'}</button>`;
      }

      // Load user posts
      const postsSnap = await db.collection('posts')
        .where('authorId', '==', uid)
        .orderBy('createdAt', 'desc').limit(50).get();

      const container = document.getElementById('profileFeed');
      if (postsSnap.empty) {
        container.innerHTML = '<div class="loading-spinner">No posts yet</div>';
      } else {
        const posts = postsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        container.innerHTML = posts.map(p => Posts.renderPost(p)).join('');
        Posts.bindPostEvents(container);
      }
    } catch (err) {
      console.error(err);
      Utils.toast('Error loading profile', 'error');
    }
  },

  async toggleFollow(targetUid) {
    const myUid = Auth.currentUser.uid;
    const isFollowing = Auth.currentProfile.following && Auth.currentProfile.following.includes(targetUid);

    try {
      if (isFollowing) {
        await db.collection('users').doc(myUid).update({ following: firebase.firestore.FieldValue.arrayRemove(targetUid) });
        await db.collection('users').doc(targetUid).update({ followers: firebase.firestore.FieldValue.arrayRemove(myUid) });
        Auth.currentProfile.following = Auth.currentProfile.following.filter(id => id !== targetUid);
      } else {
        await db.collection('users').doc(myUid).update({ following: firebase.firestore.FieldValue.arrayUnion(targetUid) });
        await db.collection('users').doc(targetUid).update({ followers: firebase.firestore.FieldValue.arrayUnion(myUid) });
        if (!Auth.currentProfile.following) Auth.currentProfile.following = [];
        Auth.currentProfile.following.push(targetUid);
        Posts.createNotification(targetUid, 'follow', null);
      }
      App.updateSidebar();
      Posts.loadProfile(targetUid); // Refresh
    } catch (err) {
      Utils.toast('Error: ' + err.message, 'error');
    }
  },

  // Load sidebar data
  async loadTrending() {
    try {
      const snap = await db.collection('posts').orderBy('createdAt', 'desc').limit(100).get();
      const tagMap = {};
      snap.forEach(doc => {
        const tags = doc.data().tags || [];
        tags.forEach(t => { tagMap[t] = (tagMap[t] || 0) + 1; });
      });
      const sorted = Object.entries(tagMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
      const el = document.getElementById('trendingList');
      el.innerHTML = sorted.length > 0
        ? sorted.map(([tag, count]) => `<a href="#"><strong>#${tag}</strong> <span class="trend-count">${count} posts</span></a>`).join('')
        : '<p style="font-size:13px;color:var(--text-muted)">Nothing trending yet</p>';
    } catch (err) { console.error(err); }
  },

  async loadSuggested() {
    try {
      const snap = await db.collection('users').limit(10).get();
      const users = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(u => u.uid !== Auth.currentUser.uid);

      const el = document.getElementById('suggestedUsers');
      el.innerHTML = users.slice(0, 5).map(u => `
        <div class="suggested-user" style="cursor:pointer" onclick="App.viewProfile('${u.uid}')">
          <img src="${u.avatar || Utils.defaultAvatar}" alt="">
          <div class="user-info">
            <h5>${Utils.escapeHtml(u.displayName)}</h5>
            <p>@${Utils.escapeHtml(u.username)}</p>
          </div>
        </div>
      `).join('') || '<p style="font-size:13px;color:var(--text-muted)">No suggestions</p>';
    } catch (err) { console.error(err); }
  },

  async loadPopularTags() {
    try {
      const snap = await db.collection('posts').orderBy('createdAt', 'desc').limit(100).get();
      const tagMap = {};
      snap.forEach(doc => {
        (doc.data().tags || []).forEach(t => { tagMap[t] = (tagMap[t] || 0) + 1; });
      });
      const sorted = Object.entries(tagMap).sort((a, b) => b[1] - a[1]).slice(0, 10);
      const el = document.getElementById('popularTags');
      el.innerHTML = sorted.map(([tag]) => `<span class="tag">#${tag}</span>`).join('') || '<p style="font-size:12px;color:var(--text-muted)">No tags yet</p>';
    } catch (err) { console.error(err); }
  }
};
