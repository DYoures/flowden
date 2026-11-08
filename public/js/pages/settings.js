// Flowden Settings Page

async function renderSettingsPage(container) {
  const user = window.Auth.getUser() || { display_name: '', email: '', role: 'user', theme_preference: 'dark' };
  const isAdmin = user.role === 'admin';
  const getIcon = window.FlowdenIcons ? window.FlowdenIcons.getIcon : () => '';

  container.innerHTML = `
    <div style="padding: var(--space-6); max-width: 900px; margin: 0 auto;">
      <!-- Settings Header -->
      <div style="margin-bottom: var(--space-6);">
        <h1 style="font-size: var(--text-xl); font-weight: var(--font-semibold); margin-bottom: var(--space-1);">Settings</h1>
        <p class="text-secondary text-sm">Manage your profile, visual appearance, security, and workspace preferences.</p>
      </div>

      <!-- Settings Navigation Tabs -->
      <div class="segmented-control" style="margin-bottom: var(--space-6);">
        <button class="segmented-btn segmented-btn--active tab-btn" data-tab="profile">Profile</button>
        <button class="segmented-btn tab-btn" data-tab="appearance">Appearance</button>
        <button class="segmented-btn tab-btn" data-tab="security">Security</button>
        <button class="segmented-btn tab-btn" data-tab="data">Data & Backup</button>
        ${isAdmin ? `<button class="segmented-btn tab-btn" data-tab="admin">Administration</button>` : ''}
      </div>

      <!-- Tab Content Area -->
      <div id="settings-tab-content"></div>
    </div>
  `;

  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      tabs.forEach(b => b.classList.remove('segmented-btn--active'));
      btn.classList.add('segmented-btn--active');
      switchTab(btn.getAttribute('data-tab'));
    });
  });

  function switchTab(tab) {
    const content = document.getElementById('settings-tab-content');
    if (tab === 'profile') renderProfileTab(content, user);
    else if (tab === 'appearance') renderAppearanceTab(content);
    else if (tab === 'security') renderSecurityTab(content);
    else if (tab === 'data') renderDataTab(content);
    else if (tab === 'admin') renderAdminTab(content);
  }

  // Initial tab
  switchTab('profile');
}

function renderProfileTab(container, user) {
  container.innerHTML = `
    <div class="card" style="padding: var(--space-5);">
      <h2 style="font-size: var(--text-md); font-weight: var(--font-semibold); margin-bottom: var(--space-4);">Personal Profile</h2>
      
      <form id="form-profile">
        <div class="form-group">
          <label class="form-label">Email Address</label>
          <input type="email" class="input" value="${user.email}" disabled style="opacity: 0.7;" />
          <span class="form-hint">Email address cannot be changed directly.</span>
        </div>

        <div class="form-group">
          <label class="form-label">Display Name</label>
          <input type="text" id="profile-display-name" class="input" value="${user.display_name || ''}" required />
        </div>

        <div class="form-group">
          <label class="form-label">Assigned Role</label>
          <div>
            <span class="badge badge--role-${user.role}">${user.role.toUpperCase()}</span>
          </div>
        </div>

        <div style="display: flex; justify-content: flex-end; margin-top: var(--space-4);">
          <button type="submit" class="btn btn--primary btn--md" id="btn-save-profile">Save Changes</button>
        </div>
      </form>
    </div>
  `;

  document.getElementById('form-profile').addEventListener('submit', async (e) => {
    e.preventDefault();
    const displayName = document.getElementById('profile-display-name').value.trim();
    if (!displayName) return;

    try {
      const res = await window.API.put('/users/me', { display_name: displayName });
      window.Auth.currentUser = res.user;
      localStorage.setItem('flowden_user', JSON.stringify(res.user));
      window.showToast('Profile updated successfully.', 'success');
      // Update topbar display name
      const nameEl = document.querySelector('.user-name');
      if (nameEl) nameEl.textContent = res.user.display_name;
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  });
}

function renderAppearanceTab(container) {
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';

  container.innerHTML = `
    <div class="card" style="padding: var(--space-5);">
      <h2 style="font-size: var(--text-md); font-weight: var(--font-semibold); margin-bottom: var(--space-4);">Visual Theme</h2>
      
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: var(--space-4); margin-bottom: var(--space-6);">
        <!-- Deep Charcoal Swatch -->
        <div class="card card--interactive" id="theme-card-dark" style="padding: var(--space-4); border: 2px solid ${currentTheme === 'dark' ? 'var(--accent-primary)' : 'var(--border-primary)'}; background-color: #090B0D; color: #E9EDF1;">
          <div style="font-weight: 600; font-size: var(--text-sm); margin-bottom: 4px;">Deep Charcoal (Default)</div>
          <p style="font-size: var(--text-xs); color: #929CA6; margin-bottom: var(--space-3);">Genuine neutral dark environment with muted steel-blue accents.</p>
          <div style="display: flex; gap: 6px;">
            <span style="width: 14px; height: 14px; border-radius: var(--radius-sm); background: #090B0D; border: 1px solid #252B32;" title="#090B0D"></span>
            <span style="width: 14px; height: 14px; border-radius: var(--radius-sm); background: #12161A; border: 1px solid #252B32;" title="#12161A"></span>
            <span style="width: 14px; height: 14px; border-radius: var(--radius-sm); background: #6B8AFD;" title="#6B8AFD"></span>
          </div>
        </div>

        <!-- Light Mode Swatch -->
        <div class="card card--interactive" id="theme-card-light" style="padding: var(--space-4); border: 2px solid ${currentTheme === 'light' ? 'var(--accent-primary)' : 'var(--border-primary)'}; background-color: #FBFAF7; color: #20211F;">
          <div style="font-weight: 600; font-size: var(--text-sm); margin-bottom: 4px;">Ivory White & Champagne Gold</div>
          <p style="font-size: var(--text-xs); color: #68706D; margin-bottom: var(--space-3);">Warm ivory daylight palette with champagne gold accents and charcoal typography.</p>
          <div style="display: flex; gap: 6px;">
            <span style="width: 14px; height: 14px; border-radius: var(--radius-sm); background: #FBFAF7; border: 1px solid #E7E0D2;" title="Ivory Canvas (#FBFAF7)"></span>
            <span style="width: 14px; height: 14px; border-radius: var(--radius-sm); background: #FFFFFF; border: 1px solid #E7E0D2;" title="White Card Surface (#FFFFFF)"></span>
            <span style="width: 14px; height: 14px; border-radius: var(--radius-sm); background: #C5A15B;" title="Champagne Gold (#C5A15B)"></span>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('theme-card-dark').addEventListener('click', () => {
    window.setTheme('dark');
    renderAppearanceTab(container);
  });

  document.getElementById('theme-card-light').addEventListener('click', () => {
    window.setTheme('light');
    renderAppearanceTab(container);
  });
}

function renderSecurityTab(container) {
  container.innerHTML = `
    <div class="card" style="padding: var(--space-5); margin-bottom: var(--space-6);">
      <h2 style="font-size: var(--text-md); font-weight: var(--font-semibold); margin-bottom: var(--space-4);">Change Password</h2>
      
      <form id="form-change-password">
        <div class="form-group">
          <label class="form-label">Current Password</label>
          <input type="password" id="input-current-pass" class="input" required />
        </div>

        <div class="form-group">
          <label class="form-label">New Password (at least 8 characters)</label>
          <input type="password" id="input-new-pass" class="input" minlength="8" required />
        </div>

        <div class="form-group">
          <label class="form-label">Confirm New Password</label>
          <input type="password" id="input-confirm-pass" class="input" minlength="8" required />
        </div>

        <div id="pass-error" class="form-error" style="display: none; margin-bottom: var(--space-3);"></div>

        <div style="display: flex; justify-content: flex-end;">
          <button type="submit" class="btn btn--primary btn--md">Update Password</button>
        </div>
      </form>
    </div>

    <!-- Active Session Card -->
    <div class="card" style="padding: var(--space-5);">
      <h2 style="font-size: var(--text-md); font-weight: var(--font-semibold); margin-bottom: var(--space-2);">Session Security</h2>
      <p class="text-secondary text-sm" style="margin-bottom: var(--space-4);">
        Authenticated sessions use secure httpOnly cookies containing encrypted JWT tokens with role verification.
      </p>
      <button class="btn btn--danger btn--md" id="btn-settings-logout">Log Out of Flowden</button>
    </div>
  `;

  document.getElementById('btn-settings-logout')?.addEventListener('click', () => {
    window.Auth.logout();
  });

  document.getElementById('form-change-password').addEventListener('submit', async (e) => {
    e.preventDefault();
    const curr = document.getElementById('input-current-pass').value;
    const next = document.getElementById('input-new-pass').value;
    const confirm = document.getElementById('input-confirm-pass').value;
    const errEl = document.getElementById('pass-error');

    if (next !== confirm) {
      errEl.textContent = 'New passwords do not match.';
      errEl.style.display = 'block';
      return;
    }

    try {
      await window.API.put('/users/me/password', {
        current_password: curr,
        new_password: next
      });
      errEl.style.display = 'none';
      document.getElementById('form-change-password').reset();
      window.showToast('Password successfully changed.', 'success');
    } catch (err) {
      errEl.textContent = err.message || 'Failed to update password.';
      errEl.style.display = 'block';
    }
  });
}

async function renderDataTab(container) {
  const getIcon = window.FlowdenIcons ? window.FlowdenIcons.getIcon : () => '';

  container.innerHTML = `
    <div class="card" style="padding: var(--space-5); margin-bottom: var(--space-6);">
      <h2 style="font-size: var(--text-md); font-weight: var(--font-semibold); margin-bottom: var(--space-2);">Full Workspace Export</h2>
      <p class="text-xs text-secondary" style="line-height: 1.5; margin-bottom: var(--space-4);">
        Download a comprehensive, portable JSON archive of your entire Flowden workspace, including projects, spatial boards, board items, notes, tasks, research literature metadata, and architectural decision records.
      </p>

      <div style="display: flex; align-items: center; justify-content: space-between; padding: var(--space-3); background-color: var(--bg-tertiary); border: 1px solid var(--border-primary); border-radius: var(--radius-sm); margin-bottom: var(--space-4);">
        <div>
          <div style="font-size: var(--text-xs); font-weight: 600; color: var(--text-primary);">Flowden Standard Data Bundle (.json)</div>
          <div class="text-xs text-secondary">Structured for migration, offline backup, or external tooling.</div>
        </div>
        <button class="btn btn--primary btn--sm" id="btn-export-workspace-bundle">
          ${getIcon('download')} Export Workspace
        </button>
      </div>
    </div>

    <div class="card" style="padding: var(--space-5); margin-bottom: var(--space-6); border-left: 3px solid var(--status-warning);">
      <h2 style="font-size: var(--text-md); font-weight: var(--font-semibold); margin-bottom: var(--space-2);">Data Portability & Backup Policy</h2>
      <p class="text-xs text-secondary" style="line-height: 1.6;">
        Flowden treats your research and workspace data as your exclusive intellectual property. Exports contain full raw text without proprietary lock-in. Regular exports are recommended before executing major migrations.
      </p>
    </div>

    <div class="card" style="padding: var(--space-5);">
      <h2 style="font-size: var(--text-md); font-weight: var(--font-semibold); margin-bottom: var(--space-2);">Legal & Platform Policies</h2>
      <p class="text-xs text-secondary" style="line-height: 1.5; margin-bottom: var(--space-4);">
        Review Flowden's operational terms and data privacy standards.
      </p>
      <div style="display: flex; gap: var(--space-3); flex-wrap: wrap;">
        <a href="/privacy.html" target="_blank" rel="noopener noreferrer" class="btn btn--secondary btn--sm" style="text-decoration: none;">
          ${getIcon('file-text')} Privacy Policy
        </a>
        <a href="/terms.html" target="_blank" rel="noopener noreferrer" class="btn btn--secondary btn--sm" style="text-decoration: none;">
          ${getIcon('shield-check')} Terms and Conditions
        </a>
      </div>
    </div>
  `;

  document.getElementById('btn-export-workspace-bundle').addEventListener('click', () => {
    window.open('/api/v1/users/me/export', '_blank');
    window.showToast('Workspace export initiated.', 'info');
  });
}

async function renderAdminTab(container) {
  container.innerHTML = `
    <div class="card" style="padding: var(--space-5); margin-bottom: var(--space-6);">
      <h2 style="font-size: var(--text-md); font-weight: var(--font-semibold); margin-bottom: var(--space-2);">System Status & Database</h2>
      <div id="admin-db-status" class="text-sm text-secondary">Checking database connection...</div>
    </div>

    <div class="card" style="padding: var(--space-5);">
      <h2 style="font-size: var(--text-md); font-weight: var(--font-semibold); margin-bottom: var(--space-4);">User Accounts & Role-Based Access</h2>
      
      <table style="width: 100%; border-collapse: collapse; font-size: var(--text-sm);">
        <thead>
          <tr style="border-bottom: 1px solid var(--border-primary); text-align: left; color: var(--text-tertiary);">
            <th style="padding: var(--space-2) 0;">User</th>
            <th style="padding: var(--space-2) 0;">Email</th>
            <th style="padding: var(--space-2) 0;">Role</th>
            <th style="padding: var(--space-2) 0; text-align: right;">Action</th>
          </tr>
        </thead>
        <tbody id="admin-users-table">
          <tr><td colspan="4" style="padding: var(--space-4) 0; text-align: center;" class="text-tertiary">Loading accounts...</td></tr>
        </tbody>
      </table>
    </div>
  `;

  try {
    const statsData = await window.API.get('/admin/stats');
    const dbInfo = statsData.stats.database;
    document.getElementById('admin-db-status').innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
        <span style="width: 8px; height: 8px; border-radius: 50%; background: ${dbInfo.isMySQL ? 'var(--status-success)' : 'var(--status-warning)'};"></span>
        <strong>${dbInfo.type}</strong>: ${dbInfo.message}
      </div>
      <div class="text-xs text-tertiary">
        Total Projects: ${statsData.stats.projects} · Total Users: ${statsData.stats.users} · Notes: ${statsData.stats.notes}
      </div>
    `;

    const usersData = await window.API.get('/admin/users');
    const tbody = document.getElementById('admin-users-table');
    tbody.innerHTML = usersData.users.map(u => `
      <tr style="border-bottom: 1px solid var(--border-primary);">
        <td style="padding: var(--space-3) 0; font-weight: 500;">${u.display_name}</td>
        <td style="padding: var(--space-3) 0; color: var(--text-secondary);">${u.email}</td>
        <td style="padding: var(--space-3) 0;">
          <span class="badge badge--role-${u.role}">${u.role.toUpperCase()}</span>
        </td>
        <td style="padding: var(--space-3) 0; text-align: right;">
          <button class="btn btn--ghost btn--sm btn-toggle-role" data-id="${u.id}" data-role="${u.role}">
            Toggle Role
          </button>
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('.btn-toggle-role').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const currRole = btn.getAttribute('data-role');
        const nextRole = currRole === 'admin' ? 'user' : 'admin';

        try {
          await window.API.put(`/admin/users/${id}/role`, { role: nextRole });
          window.showToast(`Updated user role to ${nextRole}.`, 'success');
          renderAdminTab(container);
        } catch (err) {
          window.showToast(err.message, 'error');
        }
      });
    });
  } catch (err) {
    document.getElementById('admin-users-table').innerHTML = `<tr><td colspan="4" class="form-error">${err.message}</td></tr>`;
  }
}

if (typeof window !== 'undefined') {
  window.renderSettingsPage = renderSettingsPage;
}

