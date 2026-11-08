// Flowden Hash-Based Client Router

class Router {
  constructor() {
    this.routes = [];
    this.currentRoute = null;
    this.currentParams = {};
    this.activeCleanup = null;
    window.addEventListener('hashchange', () => this.handleRouting());
    window.addEventListener('popstate', () => this.handleRouting());
  }

  add(pattern, handler, metadata = {}) {
    // Convert pattern like '#/projects/:id' to regex
    const paramNames = [];
    const regexPath = pattern.replace(/:([a-zA-Z0-9_]+)/g, (_, name) => {
      paramNames.push(name);
      return '([^/]+)';
    });
    const regex = new RegExp(`^${regexPath}$`);

    this.routes.push({
      pattern,
      regex,
      paramNames,
      handler,
      metadata
    });
    return this;
  }

  navigate(path) {
    if (!path.startsWith('#')) path = `#${path}`;
    if (window.location.hash === path) {
      this.handleRouting();
    } else {
      window.location.hash = path;
    }
  }

  handleRouting() {
    let fullHash = window.location.hash || '#/overview';
    if (!fullHash.startsWith('#/')) fullHash = '#/overview';

    // Prevent immediate duplicate route invocations within 150ms (e.g. init() + browser initial hashchange)
    if (this.lastRenderedHash === fullHash && Date.now() - (this.lastRenderedTime || 0) < 150) {
      return;
    }
    this.lastRenderedHash = fullHash;
    this.lastRenderedTime = Date.now();

    const [hashPath, queryString] = fullHash.split('?');
    const queryParams = {};
    if (queryString) {
      const searchParams = new URLSearchParams(queryString);
      for (const [key, val] of searchParams.entries()) {
        queryParams[key] = val;
      }
    }

    for (const route of this.routes) {
      const match = hashPath.match(route.regex);
      if (match) {
        const params = { ...queryParams };
        route.paramNames.forEach((name, idx) => {
          params[name] = decodeURIComponent(match[idx + 1]);
        });

        this.currentRoute = route.pattern;
        this.currentParams = params;
        this.currentQuery = queryParams;

        // 1. Reset Contextual Inspector state on route change (prevents cross-page leakage)
        if (window.Inspector) {
          window.Inspector.resetOnNavigation(route.pattern);
        }

        // 2. Execute active cleanup from previous page if any
        if (typeof this.activeCleanup === 'function') {
          try {
            this.activeCleanup();
          } catch (cleanErr) {
            console.error('[Router] Page cleanup error:', cleanErr);
          }
          this.activeCleanup = null;
        }

        // Update active sidebar state
        this.updateSidebarActive(route.pattern, hashPath);

        // Smooth page transition animation
        const main = document.getElementById('main-content');
        if (main) {
          main.classList.remove('page-transition');
          void main.offsetWidth; // Force reflow
          main.classList.add('page-transition');
        }

        // Call registered handler and capture any returned cleanup function
        const maybeCleanup = route.handler(params, route.metadata);
        if (typeof maybeCleanup === 'function') {
          this.activeCleanup = maybeCleanup;
        }

        // Notify subscribers of completed route handling
        window.dispatchEvent(new CustomEvent('flowden:route-changed', {
          detail: { pattern: route.pattern, hash: fullHash, params }
        }));
        return;
      }
    }

    // Fallback default
    this.navigate('/overview');
  }

  updateSidebarActive(pattern, hash) {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
      const href = item.getAttribute('href');
      if (!href) return;
      if (href === hash || (pattern.startsWith(href) && href !== '#/overview')) {
        item.classList.add('nav-item--active');
      } else {
        item.classList.remove('nav-item--active');
      }
    });
  }

  init() {
    this.handleRouting();
  }
}

if (typeof window !== 'undefined') {
  window.Router = new Router();
}

