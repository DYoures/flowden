// Flowden API Client Wrapper

const API = {
  baseURL: '/api/v1',

  async request(endpoint, options = {}) {
    const url = endpoint.startsWith('http') ? endpoint : `${this.baseURL}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    const config = {
      ...options,
      headers,
      credentials: 'include'
    };

    if (config.body && typeof config.body === 'object' && !(config.body instanceof FormData)) {
      config.body = JSON.stringify(config.body);
    }

    try {
      const response = await fetch(url, config);
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (response.status === 401 && !url.includes('/auth/login') && !url.includes('/auth/register')) {
          // Redirect to login if unauthenticated
          if (window.location.pathname !== '/index.html' && !window.location.pathname.endsWith('/')) {
            window.location.href = '/index.html';
          }
        }
        const error = new Error(data.error || `Request failed with status ${response.status}`);
        error.status = response.status;
        error.data = data;
        throw error;
      }

      return data;
    } catch (err) {
      console.error(`[API Error] ${options.method || 'GET'} ${url}:`, err.message);
      throw err;
    }
  },

  get(endpoint, headers = {}) {
    return this.request(endpoint, { method: 'GET', headers });
  },

  post(endpoint, body = {}, headers = {}) {
    return this.request(endpoint, { method: 'POST', body, headers });
  },

  put(endpoint, body = {}, headers = {}) {
    return this.request(endpoint, { method: 'PUT', body, headers });
  },

  delete(endpoint, headers = {}) {
    return this.request(endpoint, { method: 'DELETE', headers });
  }
};

if (typeof window !== 'undefined') {
  window.API = API;
}

