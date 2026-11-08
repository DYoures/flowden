// Flowden Authentication State Manager

const Auth = {
  currentUser: null,

  async checkAuth() {
    try {
      const data = await window.API.get('/auth/me');
      this.currentUser = data.user;
      localStorage.setItem('flowden_user', JSON.stringify(data.user));
      return data.user;
    } catch (err) {
      this.currentUser = null;
      localStorage.removeItem('flowden_user');
      return null;
    }
  },

  getUser() {
    if (this.currentUser) return this.currentUser;
    try {
      const cached = localStorage.getItem('flowden_user');
      if (cached) {
        this.currentUser = JSON.parse(cached);
        return this.currentUser;
      }
    } catch (e) {}
    return null;
  },

  async login(email, password) {
    const data = await window.API.post('/auth/login', { email, password });
    this.currentUser = data.user;
    localStorage.setItem('flowden_user', JSON.stringify(data.user));
    return data.user;
  },

  async register(email, password, display_name) {
    const data = await window.API.post('/auth/register', { email, password, display_name });
    return data;
  },

  async logout() {
    try {
      await window.API.post('/auth/logout');
    } catch (e) {}
    this.currentUser = null;
    localStorage.removeItem('flowden_user');
    window.location.href = '/index.html';
  }
};

if (typeof window !== 'undefined') {
  window.Auth = Auth;
}

