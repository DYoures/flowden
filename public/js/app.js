// Flowden Main Application Orchestrator

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Check Authentication
  const user = await window.Auth.checkAuth();
  if (!user) {
    window.location.href = '/index.html';
    return;
  }

  // 2. Setup Theme
  initTheme(user.theme_preference);

  // 3. Setup Shell UI
  initSidebar();
  initTopbar(user);

  // 4. Initialize Command Palette
  if (window.CommandPalette) {
    window.CommandPalette.init();
  }

  // 5. Register Routes
  const mainContent = document.getElementById('main-content');

  window.Router
    .add('#/overview', () => {
      updateBreadcrumb(['Overview']);
      window.renderOverviewPage(mainContent);
    })
    .add('#/projects', () => {
      updateBreadcrumb(['Projects']);
      window.renderProjectsPage(mainContent);
    })
    .add('#/projects/:id', (params) => {
      updateBreadcrumb(['Projects', 'Dashboard']);
      window.renderProjectDashboard(mainContent, params);
    })
    .add('#/projects/:id/board', (params) => {
      updateBreadcrumb(['Projects', 'Spatial Board']);
      window.renderBoardPage(mainContent, params);
    })
    .add('#/vault', () => {
      updateBreadcrumb(['Knowledge Vault']);
      window.renderVaultPage(mainContent);
    })
    .add('#/vault/:noteId', (params) => {
      updateBreadcrumb(['Knowledge Vault', 'Note']);
      window.renderVaultPage(mainContent, params);
    })
    .add('#/graph', () => {
      updateBreadcrumb(['Knowledge Graph']);
      window.renderGraphPage(mainContent);
    })
    .add('#/research', () => {
      updateBreadcrumb(['Research Center']);
      window.renderResearchPage(mainContent);
    })
    .add('#/workflow', (params) => {
      updateBreadcrumb(['Workflow Tracker']);
      window.renderWorkflowPage(mainContent, params);
    })
    .add('#/capture', () => {
      updateBreadcrumb(['Quick Capture']);
      window.renderCapturePage(mainContent);
    })
    .add('#/assistant', () => {
      updateBreadcrumb(['AI Assistant & MCP']);
      window.renderAssistantPage(mainContent);
    })
    .add('#/guide', (params) => {
      updateBreadcrumb(['Flowden Guide']);
      window.renderGuidePage(mainContent, params);
    })
    .add('#/settings', () => {
      updateBreadcrumb(['Settings']);
      window.renderSettingsPage(mainContent);
    })
    .add('#/search', (params) => {
      updateBreadcrumb(['Search Results']);
      window.renderSearchPage(mainContent, params);
    });

  // Start Router
  window.Router.init();
});

// --------------------------------------------------------------------------
// Theme Management
// --------------------------------------------------------------------------
function initTheme(serverPref) {
  const saved = localStorage.getItem('flowden_theme') || serverPref || 'dark';
  setTheme(saved);

  const toggleBtn = document.getElementById('topbar-theme-toggle');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', toggleTheme);
  }
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('flowden_theme', theme);

  const toggleBtn = document.getElementById('topbar-theme-toggle');
  if (toggleBtn && window.FlowdenIcons) {
    toggleBtn.innerHTML = window.FlowdenIcons.getIcon(theme === 'dark' ? 'sun' : 'moon');
    toggleBtn.setAttribute('title', `Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`);
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  setTheme(next);
}

window.setTheme = setTheme;
window.toggleTheme = toggleTheme;

// --------------------------------------------------------------------------
// Sidebar Management
// --------------------------------------------------------------------------
function initSidebar() {
  const sidebar = document.getElementById('app-sidebar');
  const toggleBtn = document.getElementById('sidebar-toggle-btn');
  const topbarToggle = document.getElementById('topbar-sidebar-toggle');

  const savedState = localStorage.getItem('flowden_sidebar_collapsed');
  if (savedState === 'true') {
    sidebar.classList.add('sidebar--collapsed');
  }

  const toggle = () => {
    sidebar.classList.toggle('sidebar--collapsed');
    const isCollapsed = sidebar.classList.contains('sidebar--collapsed');
    localStorage.setItem('flowden_sidebar_collapsed', isCollapsed);
    hideSidebarTooltip();
  };

  if (toggleBtn) toggleBtn.addEventListener('click', toggle);
  if (topbarToggle) topbarToggle.addEventListener('click', toggle);

  // Keyboard shortcut Ctrl+B to toggle sidebar
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      toggle();
    }
  });

  initSidebarTooltip();
}

// --------------------------------------------------------------------------
// Collapsed Sidebar Smart Hover Tooltip (650ms delay, elegant purpose text)
// --------------------------------------------------------------------------
let hideSidebarTooltip = () => {};

function initSidebarTooltip() {
  const sidebar = document.getElementById('app-sidebar');
  const tooltip = document.getElementById('sidebar-smart-tooltip');
  if (!sidebar || !tooltip) return;

  const titleEl = tooltip.querySelector('.tooltip-title');
  const descEl = tooltip.querySelector('.tooltip-desc');

  const tooltipCatalog = {
    '#/overview': {
      title: 'Overview',
      desc: 'Workspace snapshot, real-time metrics, and quick capture hub.'
    },
    '#/projects': {
      title: 'Projects',
      desc: 'Spatial workspace hubs connecting research, notes, and execution.'
    },
    '#/vault': {
      title: 'Knowledge Vault',
      desc: 'Store, organize, and connect your notes with wiki links.'
    },
    '#/graph': {
      title: 'Knowledge Graph',
      desc: 'Explore relationships between your notes and projects.'
    },
    '#/research': {
      title: 'Research Center',
      desc: 'Import and manage your research documents and literature.'
    },
    '#/workflow': {
      title: 'Workflow Tracker',
      desc: 'Organize tasks, priorities, and project progress.'
    },
    '#/capture': {
      title: 'Quick Capture',
      desc: 'Frictionless inbox for capturing ideas without breaking flow.'
    },
    '#/assistant': {
      title: 'AI Assistant',
      desc: 'Spatial context reasoning and knowledge synthesis.'
    },
    '#/guide': {
      title: 'Flowden Guide',
      desc: 'Value chain philosophy, workflows, and keyboard shortcuts.'
    },
    '#/settings': {
      title: 'Settings',
      desc: 'Manage your profile, visual appearance, and preferences.'
    }
  };

  let hoverTimer = null;

  function isSidebarRail() {
    return sidebar.classList.contains('sidebar--collapsed') || sidebar.offsetWidth <= 70 || window.innerWidth <= 1100;
  }

  function showTooltip(item) {
    if (!isSidebarRail()) return;
    const href = item.getAttribute('href');
    const info = tooltipCatalog[href];
    if (!info) return;

    titleEl.textContent = info.title;
    descEl.textContent = info.desc;

    const rect = item.getBoundingClientRect();
    const tooltipTop = Math.max(8, Math.min(window.innerHeight - 70, rect.top + (rect.height / 2) - 26));
    const tooltipLeft = rect.right + 12;

    tooltip.style.top = `${tooltipTop}px`;
    tooltip.style.left = `${tooltipLeft}px`;
    tooltip.classList.add('is-visible');
    tooltip.setAttribute('aria-hidden', 'false');
  }

  function hideTooltip() {
    if (hoverTimer) {
      clearTimeout(hoverTimer);
      hoverTimer = null;
    }
    tooltip.classList.remove('is-visible');
    tooltip.setAttribute('aria-hidden', 'true');
  }

  hideSidebarTooltip = hideTooltip;

  const navItems = sidebar.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    // Mouse hover (650ms threshold)
    item.addEventListener('mouseenter', () => {
      if (!isSidebarRail()) return;
      hideTooltip();
      hoverTimer = setTimeout(() => {
        showTooltip(item);
      }, 650);
    });

    item.addEventListener('mouseleave', () => {
      hideTooltip();
    });

    // Keyboard accessibility focus
    item.addEventListener('focus', () => {
      if (!isSidebarRail()) return;
      hideTooltip();
      hoverTimer = setTimeout(() => {
        showTooltip(item);
      }, 650);
    });

    item.addEventListener('blur', () => {
      hideTooltip();
    });
  });
}

// --------------------------------------------------------------------------
// Topbar & Breadcrumbs Management
// --------------------------------------------------------------------------
function initTopbar(user) {
  // Populate user button
  const avatarEl = document.querySelector('.user-avatar');
  const nameEl = document.querySelector('.user-name');
  const roleEl = document.querySelector('.user-role');

  if (avatarEl) avatarEl.textContent = (user.display_name || 'U').charAt(0).toUpperCase();
  if (nameEl) nameEl.textContent = user.display_name;
  if (roleEl) roleEl.textContent = user.role;

  // Search trigger opens Command Palette
  const searchTrigger = document.querySelector('.topbar-search-trigger');
  if (searchTrigger) {
    searchTrigger.addEventListener('click', () => {
      if (window.CommandPalette) window.CommandPalette.open();
    });
  }

  // User Profile Menu Dropdown
  const userBtn = document.querySelector('.user-profile-btn');
  if (userBtn) {
    userBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      window.Dropdown.open(userBtn, [
        { label: 'View Profile', icon: 'settings', onClick: () => window.Router.navigate('/settings') },
        { label: 'Flowden Guide', icon: 'help-circle', onClick: () => window.Router.navigate('/guide') },
        { type: 'divider' },
        { label: 'Log Out', icon: 'log-out', onClick: () => window.Auth.logout() }
      ]);
    });
  }
}

function updateBreadcrumb(items = []) {
  const container = document.getElementById('topbar-breadcrumb');
  if (!container) return;

  const getIcon = window.FlowdenIcons ? window.FlowdenIcons.getIcon : () => '';
  const chevron = getIcon('chevron-right');

  let html = `<a href="#/overview" class="breadcrumb-item" style="font-family: var(--font-brand); font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;">Flowden</a>`;

  items.forEach((item, index) => {
    html += `<span class="breadcrumb-separator">${chevron}</span>`;
    if (index === items.length - 1) {
      html += `<span class="breadcrumb-current">${item}</span>`;
    } else {
      html += `<span class="breadcrumb-item">${item}</span>`;
    }
  });

  container.innerHTML = html;
}

