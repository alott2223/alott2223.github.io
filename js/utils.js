// ===== Utility Functions =====

const Utils = {
  // Default avatar
  defaultAvatar: 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="#6c5ce7" width="100" height="100"/><text x="50" y="55" text-anchor="middle" dy=".1em" fill="white" font-size="40" font-family="sans-serif">?</text></svg>'),

  defaultBanner: 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 200"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#6c5ce7"/><stop offset="100%" style="stop-color:#00cec9"/></linearGradient></defs><rect fill="url(#g)" width="800" height="200"/></svg>'),

  // Time ago
  timeAgo(date) {
    const now = new Date();
    let d;
    if (date instanceof Date) d = date;
    else if (date && date.toDate) d = date.toDate();
    else if (date && date._ts) d = new Date(date._ts);
    else d = new Date(date);
    const seconds = Math.floor((now - d) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  },

  // Format date
  formatDate(date) {
    let d;
    if (date instanceof Date) d = date;
    else if (date && date.toDate) d = date.toDate();
    else if (date && date._ts) d = new Date(date._ts);
    else d = new Date(date);
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  },

  // Escape HTML
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  // Parse text with hashtags and mentions
  parseText(text) {
    let parsed = Utils.escapeHtml(text);
    parsed = parsed.replace(/#(\w+)/g, '<span class="hashtag" data-tag="$1">#$1</span>');
    parsed = parsed.replace(/@(\w+)/g, '<span class="mention" data-user="$1">@$1</span>');
    return parsed;
  },

  // Toast notification
  toast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
  },

  // Upload image to Firebase Storage
  async uploadImage(file, path) {
    const ref = storage.ref(path + '/' + Date.now() + '_' + file.name);
    const snap = await ref.put(file);
    return await snap.ref.getDownloadURL();
  },

  // Convert image file to base64 (fallback if storage not set up)
  fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },

  // Get embed HTML for URLs
  getEmbedHtml(url) {
    // YouTube
    let match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
    if (match) {
      return `<iframe width="100%" height="315" src="https://www.youtube.com/embed/${match[1]}" allowfullscreen></iframe>`;
    }
    // Vimeo
    match = url.match(/vimeo\.com\/(\d+)/);
    if (match) {
      return `<iframe width="100%" height="315" src="https://player.vimeo.com/video/${match[1]}" allowfullscreen></iframe>`;
    }
    // Spotify
    match = url.match(/open\.spotify\.com\/(track|album|playlist)\/(\w+)/);
    if (match) {
      return `<iframe src="https://open.spotify.com/embed/${match[1]}/${match[2]}" width="100%" height="80" frameborder="0" allow="encrypted-media"></iframe>`;
    }
    // SoundCloud, Twitter, etc - fallback to link
    return `<a href="${Utils.escapeHtml(url)}" target="_blank" rel="noopener" class="link-embed"><i class="fas fa-external-link-alt"></i> ${Utils.escapeHtml(url)}</a>`;
  },

  // Generate avatar initial
  avatarFromName(name) {
    const initial = (name || '?').charAt(0).toUpperCase();
    const colors = ['#6c5ce7','#00cec9','#ff6b6b','#feca57','#00b894','#e17055','#0984e3','#d63031'];
    const color = colors[initial.charCodeAt(0) % colors.length];
    return 'data:image/svg+xml;base64,' + btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="${color}" width="100" height="100"/><text x="50" y="55" text-anchor="middle" dy=".1em" fill="white" font-size="45" font-family="sans-serif" font-weight="bold">${initial}</text></svg>`);
  },

  // Truncate text
  truncate(text, max = 100) {
    return text.length > max ? text.substring(0, max) + '...' : text;
  },

  // Simple ID generator
  genId() {
    return Math.random().toString(36).substr(2, 9);
  }
};
