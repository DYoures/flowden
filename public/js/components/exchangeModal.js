// Flowden Knowledge Exchange — Shared Interactive Package Importer Modal (FKF v1.0.0)
// Supports:
// 1. Destination Selection (Create New Project vs. Merge into Existing Authorized Project)
// 2. Drag & Drop / File Picker for .flowden.zip packages with client validation aid
// 3. Secure in-memory server-side inspection via POST /api/v1/exchange/inspect
// 4. Detailed Package Preview (Manifest metadata, entity counts, notes, sources, excerpts, relationships, assets, optional modules)
// 5. Explicit User Approval checkbox & double-click protection
// 6. Transactional Commit via POST /api/v1/exchange/commit using server-staged archive & browser-generated idempotency key
// 7. Success state with summary counts & direct navigation to the imported project

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ExchangeModal = factory();
    root.openExchangeImportModal = root.ExchangeModal.open;
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MAX_COMPRESSED_BYTES = 100 * 1024 * 1024; // 100 MB matches backend MAX_COMPRESSED_ARCHIVE_BYTES

  function getIcon(name, customClass = '') {
    if (typeof window !== 'undefined' && window.FlowdenIcons && typeof window.FlowdenIcons.getIcon === 'function') {
      return window.FlowdenIcons.getIcon(name, customClass);
    }
    return '';
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatBytes(bytes) {
    if (typeof bytes !== 'number' || isNaN(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const val = (bytes / Math.pow(1024, idx)).toFixed(idx === 0 ? 0 : 1);
    return `${val} ${units[idx]}`;
  }

  function generateIdempotencyKey() {
    if (typeof window !== 'undefined' && window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    const cryptoObj = (typeof window !== 'undefined' && (window.crypto || window.msCrypto));
    if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
      const bytes = new Uint8Array(16);
      cryptoObj.getRandomValues(bytes);
      return 'fkp_idem_' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    return 'fkp_idem_' + Date.now() + '_' + Math.random().toString(36).substring(2, 12);
  }

  // Component Singleton & In-Memory Private State
  let activeOverlay = null;
  let keydownHandler = null;

  // Private closure state (NEVER exposed to DOM, browser storage, or global variables)
  let privateSession = {
    step: 'select', // 'select' | 'inspecting' | 'preview' | 'committing' | 'success' | 'error'
    file: null,
    destinationMode: 'new', // 'new' | 'existing'
    destinationProjectId: null,
    projects: [],
    inspectionToken: null, // Opaque token kept strictly in memory
    inspectionData: null,
    packageSha256: null,
    idempotencyKey: null,
    approvalChecked: false,
    commitResult: null,
    activeTab: 'notes',
    errorMessage: null,
    errorDetails: [],
    warnings: [],
    onImportComplete: null
  };

  function resetSession() {
    privateSession = {
      step: 'select',
      file: null,
      destinationMode: 'new',
      destinationProjectId: null,
      projects: [],
      inspectionToken: null,
      inspectionData: null,
      packageSha256: null,
      idempotencyKey: null,
      approvalChecked: false,
      commitResult: null,
      activeTab: 'notes',
      errorMessage: null,
      errorDetails: [],
      warnings: [],
      onImportComplete: null
    };
  }

  async function loadUserProjects() {
    try {
      if (typeof window !== 'undefined' && window.API && typeof window.API.get === 'function') {
        const res = await window.API.get('/projects');
        privateSession.projects = (res && Array.isArray(res.projects)) ? res.projects : [];
      } else {
        const res = await fetch('/api/v1/projects', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          privateSession.projects = data.projects || [];
        }
      }
    } catch (_) {
      privateSession.projects = [];
    }
  }

  function renderModal() {
    if (!activeOverlay) return;
    const bodyEl = activeOverlay.querySelector('.exchange-modal-body');
    const footerEl = activeOverlay.querySelector('.exchange-modal-footer');
    const titleEl = activeOverlay.querySelector('.exchange-modal-title');
    if (!bodyEl || !footerEl) return;

    if (titleEl) {
      titleEl.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="color: var(--brand-teal); display: inline-flex;">${getIcon('share-2')}</span>
          <span>Import a Research Package</span>
          <span class="badge" style="font-size: 10px; font-family: var(--font-mono); background: rgba(120, 200, 178, 0.12); color: var(--brand-teal); border: 1px solid rgba(120, 200, 178, 0.3);">Markdown (.md) / ZIP</span>
        </div>
      `;
    }

    // Render Steps Indicator Bar
    const stepNumber = privateSession.step === 'select' ? 1
      : (privateSession.step === 'inspecting' ? 2
      : (privateSession.step === 'preview' ? 3
      : (privateSession.step === 'committing' ? 3
      : (privateSession.step === 'success' ? 4 : 2))));

    const stepsHtml = `
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-4); padding-bottom: var(--space-3); border-bottom: 1px solid var(--border-primary); font-size: var(--text-xs);">
        <div style="display: flex; align-items: center; gap: 6px; color: ${stepNumber >= 1 ? 'var(--text-primary)' : 'var(--text-tertiary)'}; font-weight: ${stepNumber === 1 ? '600' : '400'};">
          <span style="width: 20px; height: 20px; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; font-size: 10px; background: ${stepNumber >= 1 ? 'var(--accent-primary)' : 'var(--bg-tertiary)'}; color: ${stepNumber >= 1 ? '#fff' : 'var(--text-secondary)'};">1</span>
          <span>Package & Destination</span>
        </div>
        <span style="color: var(--text-tertiary);">&rarr;</span>
        <div style="display: flex; align-items: center; gap: 6px; color: ${stepNumber >= 2 ? 'var(--text-primary)' : 'var(--text-tertiary)'}; font-weight: ${stepNumber === 2 ? '600' : '400'};">
          <span style="width: 20px; height: 20px; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; font-size: 10px; background: ${stepNumber >= 2 ? 'var(--accent-primary)' : 'var(--bg-tertiary)'}; color: ${stepNumber >= 2 ? '#fff' : 'var(--text-secondary)'};">2</span>
          <span>Check Package</span>
        </div>
        <span style="color: var(--text-tertiary);">&rarr;</span>
        <div style="display: flex; align-items: center; gap: 6px; color: ${stepNumber >= 3 ? 'var(--text-primary)' : 'var(--text-tertiary)'}; font-weight: ${stepNumber === 3 ? '600' : '400'};">
          <span style="width: 20px; height: 20px; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; font-size: 10px; background: ${stepNumber >= 3 ? 'var(--accent-primary)' : 'var(--bg-tertiary)'}; color: ${stepNumber >= 3 ? '#fff' : 'var(--text-secondary)'};">3</span>
          <span>Review & Import</span>
        </div>
        <span style="color: var(--text-tertiary);">&rarr;</span>
        <div style="display: flex; align-items: center; gap: 6px; color: ${stepNumber === 4 ? 'var(--status-success)' : 'var(--text-tertiary)'}; font-weight: ${stepNumber === 4 ? '600' : '400'};">
          <span style="width: 20px; height: 20px; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; font-size: 10px; background: ${stepNumber === 4 ? 'var(--status-success)' : 'var(--bg-tertiary)'}; color: ${stepNumber === 4 ? '#fff' : 'var(--text-secondary)'};">4</span>
          <span>Done</span>
        </div>
      </div>
    `;

    // -------------------------------------------------------------------------
    // STEP 1: SELECT PACKAGE & DESTINATION
    // -------------------------------------------------------------------------
    if (privateSession.step === 'select') {
      const hasFile = Boolean(privateSession.file);
      const isFileSizeValid = hasFile ? privateSession.file.size <= MAX_COMPRESSED_BYTES : true;
      const isExtValid = hasFile ? (
        privateSession.file.name.toLowerCase().endsWith('.md') ||
        privateSession.file.name.toLowerCase().endsWith('.markdown') ||
        privateSession.file.name.toLowerCase().endsWith('.flowden.zip') ||
        privateSession.file.name.toLowerCase().endsWith('.zip') ||
        privateSession.file.name.toLowerCase().endsWith('.fkf') ||
        privateSession.file.name.toLowerCase().endsWith('.json')
      ) : true;

      bodyEl.innerHTML = `
        ${stepsHtml}

        <p class="text-xs text-secondary" style="margin: 0 0 var(--space-4) 0; line-height: 1.55;">
          Select your research file and choose where it should go in Flowden.
        </p>

        <!-- Destination Selection -->
        <div style="margin-bottom: var(--space-4); padding: var(--space-4); background-color: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary);">
          <label style="display: block; font-size: var(--text-xs); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-primary); margin-bottom: 8px;">
            Destination Selection
          </label>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <label style="display: flex; align-items: flex-start; gap: 8px; font-size: var(--text-xs); color: var(--text-primary); cursor: pointer;">
              <input type="radio" name="exchange-dest-mode" value="new" ${privateSession.destinationMode === 'new' ? 'checked' : ''} style="margin-top: 2px;" />
              <div>
                <strong style="color: var(--text-primary);">Create a New Project</strong>
                <div class="text-secondary" style="font-size: 11px; margin-top: 2px; line-height: 1.5;">
                  Start a fresh Project using the title and structure from your package.
                </div>
              </div>
            </label>

            <label style="display: flex; align-items: flex-start; gap: 8px; font-size: var(--text-xs); color: var(--text-primary); cursor: pointer;">
              <input type="radio" name="exchange-dest-mode" value="existing" ${privateSession.destinationMode === 'existing' ? 'checked' : ''} style="margin-top: 2px;" />
              <div style="flex: 1;">
                <strong style="color: var(--text-primary);">Merge into an Existing Project</strong>
                <div class="text-secondary" style="font-size: 11px; margin-top: 2px; margin-bottom: 6px; line-height: 1.5;">
                  Add this research to a Project you already have. Existing notes will not be overwritten. New notes are added alongside them, and the Spatial Board will be updated with the new content.
                </div>
                ${privateSession.destinationMode === 'existing' ? `
                  <select id="exchange-destination-project-select" class="select" style="font-size: 12px; width: 100%; max-width: 400px;">
                    ${privateSession.projects.length === 0 ? '<option value="">No authorized projects available</option>' : `
                      <option value="" ${!privateSession.destinationProjectId ? 'selected' : ''} disabled>Select an existing project...</option>
                      ${privateSession.projects.map(p => `
                        <option value="${p.id}" ${String(privateSession.destinationProjectId) === String(p.id) ? 'selected' : ''}>
                          ${escapeHtml(p.title)} (${p.role || 'owner'})
                        </option>
                      `).join('')}
                    `}
                  </select>
                ` : ''}
              </div>
            </label>
          </div>
        </div>

        <!-- File Upload Dropzone -->
        <div style="margin-bottom: var(--space-4);">
          <label style="display: block; font-size: var(--text-xs); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-primary); margin-bottom: 8px;">
            File Selection
          </label>
          
          ${!hasFile ? `
            <div id="exchange-dropzone" style="border: 2px dashed var(--border-primary); border-radius: var(--radius-sm); padding: var(--space-6) var(--space-4); text-align: center; background-color: var(--bg-secondary); cursor: pointer; transition: all 0.15s ease;">
              <input type="file" id="exchange-file-input" accept=".md,.markdown,.flowden.zip,.zip,.fkf,.json" style="display: none;" />
              <div style="width: 40px; height: 40px; border-radius: var(--radius-sm); background-color: var(--bg-tertiary); border: 1px solid var(--border-primary); display: inline-flex; align-items: center; justify-content: center; color: var(--accent-primary); margin-bottom: 8px;">
                ${getIcon('download')}
              </div>
              <div style="font-size: var(--text-sm); font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">
                Choose a file or drag it here
              </div>
              <div class="text-secondary" style="font-size: 11px; line-height: 1.6; max-width: 460px; margin: 0 auto;">
                <code style="color: var(--brand-teal);">.md</code> — Structured Markdown document containing multiple Notes.<br/>
                <code style="color: var(--accent-primary);">.flowden.zip</code> — Complete knowledge package.<br/>
                Maximum file size: <strong>100 MB</strong>.
              </div>
            </div>
          ` : `
            <div style="padding: var(--space-3) var(--space-4); background-color: var(--bg-secondary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary); display: flex; align-items: center; justify-content: space-between; gap: var(--space-3);">
              <div style="display: flex; align-items: center; gap: var(--space-3); min-width: 0;">
                <div style="width: 36px; height: 36px; border-radius: var(--radius-sm); background-color: var(--bg-tertiary); border: 1px solid var(--border-primary); display: flex; align-items: center; justify-content: center; color: var(--brand-teal); flex-shrink: 0;">
                  ${getIcon('file-text')}
                </div>
                <div style="min-width: 0;">
                  <div style="font-size: var(--text-xs); font-weight: 600; color: var(--text-primary);" class="text-truncate">${escapeHtml(privateSession.file.name)}</div>
                  <div class="text-secondary" style="font-size: 11px;">
                    ${formatBytes(privateSession.file.size)} &bull; ${privateSession.file.type || 'application/zip'}
                  </div>
                </div>
              </div>
              <button type="button" class="btn btn--secondary btn--sm" id="btn-exchange-remove-file" title="Select different package">
                ${getIcon('x')} <span>Replace</span>
              </button>
            </div>
          `}

          ${(!isExtValid || !isFileSizeValid) ? `
            <div style="margin-top: 8px; padding: 8px 12px; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: var(--radius-sm); font-size: 11px; color: var(--status-error); display: flex; align-items: center; gap: 6px;">
              <span>${getIcon('x')}</span>
              <span>${!isExtValid ? 'Invalid file extension. Please select a .md or .flowden.zip package.' : 'File exceeds 100 MB limit.'}</span>
            </div>
          ` : ''}
        </div>
      `;

      footerEl.innerHTML = `
        <button type="button" class="btn btn--secondary btn--md" id="btn-exchange-cancel">Cancel</button>
        <button type="button" class="btn btn--primary btn--md" id="btn-exchange-start-inspect" ${(!hasFile || !isExtValid || !isFileSizeValid) ? 'disabled' : ''}>
          ${getIcon('shield-check')} <span>Check Package</span>
        </button>
      `;

      // Wire Destination Toggle
      bodyEl.querySelectorAll('input[name="exchange-dest-mode"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
          privateSession.destinationMode = e.target.value;
          if (privateSession.destinationMode === 'existing') {
            if (!privateSession.destinationProjectId && privateSession.projects.length > 0) {
              privateSession.destinationProjectId = privateSession.projects[0].id;
            }
          } else {
            privateSession.destinationProjectId = null;
          }
          // Changing destination invalidates any existing inspection session
          privateSession.inspectionToken = null;
          renderModal();
        });
      });

      const projSelect = bodyEl.querySelector('#exchange-destination-project-select');
      if (projSelect) {
        projSelect.addEventListener('change', (e) => {
          privateSession.destinationProjectId = e.target.value ? parseInt(e.target.value, 10) : null;
          privateSession.inspectionToken = null;
        });
      }

      // Wire Dropzone & File Input
      const dropzone = bodyEl.querySelector('#exchange-dropzone');
      const fileInput = bodyEl.querySelector('#exchange-file-input');
      if (dropzone && fileInput) {
        dropzone.addEventListener('click', () => fileInput.click());
        dropzone.addEventListener('dragover', (e) => {
          e.preventDefault();
          dropzone.style.borderColor = 'var(--accent-primary)';
          dropzone.style.backgroundColor = 'var(--bg-tertiary)';
        });
        dropzone.addEventListener('dragleave', () => {
          dropzone.style.borderColor = 'var(--border-primary)';
          dropzone.style.backgroundColor = 'var(--bg-secondary)';
        });
        dropzone.addEventListener('drop', (e) => {
          e.preventDefault();
          dropzone.style.borderColor = 'var(--border-primary)';
          dropzone.style.backgroundColor = 'var(--bg-secondary)';
          if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFileSelection(e.dataTransfer.files[0]);
          }
        });
        fileInput.addEventListener('change', (e) => {
          if (e.target.files && e.target.files.length > 0) {
            handleFileSelection(e.target.files[0]);
          }
        });
      }

      const removeFileBtn = bodyEl.querySelector('#btn-exchange-remove-file');
      if (removeFileBtn) {
        removeFileBtn.addEventListener('click', () => {
          privateSession.file = null;
          privateSession.inspectionToken = null;
          renderModal();
        });
      }

      footerEl.querySelector('#btn-exchange-cancel')?.addEventListener('click', closeModal);
      footerEl.querySelector('#btn-exchange-start-inspect')?.addEventListener('click', executeInspect);
      return;
    }

    // -------------------------------------------------------------------------
    // STEP 2: INSPECTING (LOADING STATE)
    // -------------------------------------------------------------------------
    if (privateSession.step === 'inspecting') {
      bodyEl.innerHTML = `
        ${stepsHtml}
        <div style="padding: var(--space-8) var(--space-4); text-align: center;">
          <div class="spinner" style="width: 32px; height: 32px; border-width: 3px; margin: 0 auto var(--space-4) auto; border-top-color: var(--accent-primary);"></div>
          <h3 style="font-size: var(--text-base); font-weight: 600; color: var(--text-primary); margin: 0 0 6px 0;">Checking Your Package</h3>
          <p class="text-secondary" style="font-size: var(--text-xs); line-height: 1.6; max-width: 480px; margin: 0 auto;">
            Flowden is checking the package structure and preparing a preview. This does not import anything into your Project yet.
          </p>
        </div>
      `;
      footerEl.innerHTML = `
        <button type="button" class="btn btn--secondary btn--md" disabled>Cancel</button>
        <button type="button" class="btn btn--primary btn--md" disabled>
          <span class="spinner" style="width: 12px; height: 12px; border-width: 2px;"></span>
          <span>Checking...</span>
        </button>
      `;
      return;
    }

    // -------------------------------------------------------------------------
    // STEP 2B: INSPECTION ERROR STATE
    // -------------------------------------------------------------------------
    if (privateSession.step === 'error') {
      bodyEl.innerHTML = `
        ${stepsHtml}
        <div style="margin-bottom: var(--space-4); padding: var(--space-4); background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: var(--radius-sm);">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px; color: var(--status-error); font-weight: 600; font-size: var(--text-sm);">
            <span>${getIcon('x')}</span>
            <span>Unable to Check Package: ${escapeHtml(privateSession.errorMessage || 'Archive validation error')}</span>
          </div>
          <p class="text-secondary" style="font-size: var(--text-xs); margin: 0 0 var(--space-3) 0;">
            Flowden couldn't read or validate this package. Check that you selected a supported file and that it follows the required format.
          </p>
          <div style="display: flex; flex-direction: column; gap: 6px; max-height: 220px; overflow-y: auto;">
            ${(privateSession.errorDetails || []).map(err => `
              <div style="padding: 6px 10px; background-color: var(--bg-tertiary); border-radius: 4px; border: 1px solid var(--border-primary); font-size: 11px;">
                <code style="color: var(--status-error); font-weight: 600;">${escapeHtml(err.code || 'VALIDATION_ERROR')}</code>
                ${err.file ? `<span class="badge" style="font-size: 9px; margin-left: 4px;">${escapeHtml(err.file)}</span>` : ''}
                <div style="color: var(--text-secondary); margin-top: 2px;">${escapeHtml(err.message || 'Validation error')}</div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
      footerEl.innerHTML = `
        <button type="button" class="btn btn--secondary btn--md" id="btn-exchange-error-back">Choose Another File</button>
        <button type="button" class="btn btn--secondary btn--md" id="btn-exchange-error-close">Close</button>
      `;
      footerEl.querySelector('#btn-exchange-error-back')?.addEventListener('click', () => {
        privateSession.step = 'select';
        privateSession.inspectionToken = null;
        renderModal();
      });
      footerEl.querySelector('#btn-exchange-error-close')?.addEventListener('click', closeModal);
      return;
    }

    // -------------------------------------------------------------------------
    // STEP 3: PREVIEW & EXPLICIT APPROVAL
    // -------------------------------------------------------------------------
    if (privateSession.step === 'preview' || privateSession.step === 'committing') {
      const data = privateSession.inspectionData || {};
      const counts = data.counts || {};
      const proj = data.project || {};
      const pkg = data.package || {};
      const preview = data.preview || {};
      const warnings = data.warnings || [];
      const isCommitting = privateSession.step === 'committing';

      const destProjectTitle = privateSession.destinationMode === 'existing' && privateSession.destinationProjectId
        ? ((privateSession.projects.find(p => String(p.id) === String(privateSession.destinationProjectId)) || {}).title || 'Selected Project')
        : (proj.title || 'Untitled Project');

      const destinationLabel = privateSession.destinationMode === 'existing' && privateSession.destinationProjectId
        ? `Existing Project: ${escapeHtml(destProjectTitle)}`
        : `New Project: "${escapeHtml(destProjectTitle)}"`;

      bodyEl.innerHTML = `
        ${stepsHtml}

        <!-- Section Title & Subtitle -->
        <div style="margin-bottom: var(--space-4);">
          <h3 style="font-size: var(--text-base); font-weight: 600; color: var(--text-primary); margin: 0 0 4px 0;">Review Your Package</h3>
          <p class="text-secondary" style="font-size: var(--text-xs); margin: 0 0 8px 0;">
            Check the package contents before adding them to your Project.
          </p>
          <div class="text-secondary" style="font-size: 11px; line-height: 1.5; padding: 8px 12px; background-color: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary);">
            Review the available Notes, Sources, Relationships, Folders, and Assets. Any warnings should be checked before continuing.
          </div>
        </div>

        <!-- Package Overview Banner -->
        <div style="padding: var(--space-4); background-color: var(--bg-secondary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary); margin-bottom: var(--space-4);">
          <div style="display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: var(--space-2); margin-bottom: 6px;">
            <div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <h4 style="font-size: var(--text-base); font-weight: 600; color: var(--text-primary); margin: 0;">${escapeHtml(proj.title || 'Research Project')}</h4>
                <span class="badge" style="font-size: 10px; background: rgba(16, 185, 129, 0.12); color: var(--status-success); border: 1px solid rgba(16, 185, 129, 0.3);">
                  ${getIcon('check')} Valid ${escapeHtml(pkg.fkf_version ? 'FKF v' + pkg.fkf_version : (data.fkf_version ? 'FKF v' + data.fkf_version : 'FKF 2.0'))}
                </span>
              </div>
              <div class="text-secondary" style="font-size: 11px; margin-top: 2px;">
                Package: <code>${escapeHtml(data.package_name || 'package.flowden.zip')}</code> &bull; Destination: <strong>${destinationLabel}</strong>
              </div>
            </div>
            ${pkg.generator && pkg.generator.system_name ? `
              <span class="badge" style="font-size: 10px; font-family: var(--font-mono);">By ${escapeHtml(pkg.generator.system_name)}</span>
            ` : ''}
          </div>
          ${proj.summary ? `
            <p class="text-secondary" style="font-size: var(--text-xs); line-height: 1.55; margin: 4px 0 0 0;">
              ${escapeHtml(proj.summary)}
            </p>
          ` : ''}
        </div>

        <!-- Entity Summary Metric Chips -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 8px; margin-bottom: var(--space-4);">
          <div style="padding: 8px 10px; background-color: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary); text-align: center;">
            <div style="font-size: var(--text-md); font-weight: 700; color: var(--accent-primary);">${counts.folders || 0}</div>
            <div style="font-size: 10px; color: var(--text-secondary); text-transform: uppercase;">Folders</div>
          </div>
          <div style="padding: 8px 10px; background-color: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary); text-align: center;">
            <div style="font-size: var(--text-md); font-weight: 700; color: var(--project-violet, #8b5cf6);">${counts.notes || 0}</div>
            <div style="font-size: 10px; color: var(--text-secondary); text-transform: uppercase;">Notes</div>
          </div>
          <div style="padding: 8px 10px; background-color: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary); text-align: center;">
            <div style="font-size: var(--text-md); font-weight: 700; color: var(--status-warning);">${counts.sources || 0}</div>
            <div style="font-size: 10px; color: var(--text-secondary); text-transform: uppercase;">Sources</div>
          </div>
          <div style="padding: 8px 10px; background-color: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary); text-align: center;">
            <div style="font-size: var(--text-md); font-weight: 700; color: var(--brand-teal);">${counts.excerpts || 0}</div>
            <div style="font-size: 10px; color: var(--text-secondary); text-transform: uppercase;">Excerpts</div>
          </div>
          <div style="padding: 8px 10px; background-color: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary); text-align: center;">
            <div style="font-size: var(--text-md); font-weight: 700; color: var(--status-success);">${counts.relationships || 0}</div>
            <div style="font-size: 10px; color: var(--text-secondary); text-transform: uppercase;">Relationships</div>
          </div>
          <div style="padding: 8px 10px; background-color: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary); text-align: center;">
            <div style="font-size: var(--text-md); font-weight: 700; color: var(--text-primary);">${counts.assets || 0}</div>
            <div style="font-size: 10px; color: var(--text-secondary); text-transform: uppercase;">Assets</div>
          </div>
          ${counts.tasks ? `
            <div style="padding: 8px 10px; background-color: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary); text-align: center;">
              <div style="font-size: var(--text-md); font-weight: 700; color: var(--status-success);">${counts.tasks}</div>
              <div style="font-size: 10px; color: var(--text-secondary); text-transform: uppercase;">Tasks</div>
            </div>
          ` : ''}
          ${counts.board_items ? `
            <div style="padding: 8px 10px; background-color: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary); text-align: center;">
              <div style="font-size: var(--text-md); font-weight: 700; color: var(--brand-teal);">${counts.board_items}</div>
              <div style="font-size: 10px; color: var(--text-secondary); text-transform: uppercase;">Board Items</div>
            </div>
          ` : ''}
        </div>

        <!-- Non-Blocking Warnings Banner (if any) -->
        ${warnings.length > 0 ? `
          <div style="margin-bottom: var(--space-4); padding: 8px 12px; background: rgba(224, 160, 64, 0.08); border: 1px solid rgba(224, 160, 64, 0.3); border-radius: var(--radius-sm); font-size: 11px;">
            <div style="font-weight: 600; color: var(--status-warning); margin-bottom: 4px; display: flex; align-items: center; gap: 4px;">
              <span>${getIcon('help-circle')}</span>
              <span>Validation Warnings (${warnings.length}):</span>
            </div>
            <ul style="margin: 0; padding-left: 18px; color: var(--text-secondary); line-height: 1.5;">
              ${warnings.map(w => `<li><strong>${escapeHtml(w.code || 'NOTICE')}</strong>: ${escapeHtml(w.message)}</li>`).join('')}
            </ul>
          </div>
        ` : ''}

        <!-- Workspace Projections & Optional Modules Clarity -->
        <div style="margin-bottom: var(--space-4); padding: var(--space-3) var(--space-4); background-color: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary); font-size: 11px;">
          <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 4px;">
            <div style="font-weight: 600; color: var(--text-primary); display: flex; align-items: center; gap: 6px;">
              <span style="color: var(--brand-teal);">${getIcon('layers')}</span>
              <span>Workspace Projections & Optional Modules</span>
            </div>
            <span class="badge" style="font-size: 9px; background: rgba(120, 200, 178, 0.12); color: var(--brand-teal); border: 1px solid rgba(120, 200, 178, 0.3);">Atomic Synthesis</span>
          </div>
          <div style="color: var(--text-secondary); line-height: 1.55;">
            Flowden imports declared modules directly into real workspace systems. When present, <strong>Tasks</strong> (${counts.tasks || 0}) map to the project Kanban and <strong>Spatial Board</strong> (${counts.board_items || 0} items) projects onto the 2D canvas. Declared modules are committed together in the atomic transaction without selective omission.<br/>
            ${(data.optional_modules && data.optional_modules.research_report_pdf) ? '<span style="color: var(--brand-teal);"><strong>Companion Report:</strong> <code>exports/research-report.pdf</code> included and staged for document access.</span>' : '<span style="color: var(--text-tertiary);"><strong>Companion Report:</strong> No companion PDF export included in this package.</span>'}
          </div>
        </div>

        <!-- Expandable Structured Preview Tabs -->
        <div style="margin-bottom: var(--space-4); border: 1px solid var(--border-primary); border-radius: var(--radius-sm); overflow: hidden;">
          <div style="display: flex; align-items: center; background-color: var(--bg-tertiary); border-bottom: 1px solid var(--border-primary); padding: 2px 4px; overflow-x: auto;">
            <button type="button" class="btn btn--ghost btn--sm preview-tab-btn ${privateSession.activeTab === 'notes' ? 'active' : ''}" data-tab="notes" style="font-size: 11px; padding: 4px 10px; ${privateSession.activeTab === 'notes' ? 'background: var(--bg-secondary); color: var(--text-primary);' : ''}">
              Notes (${(preview.notes || []).length})
            </button>
            <button type="button" class="btn btn--ghost btn--sm preview-tab-btn ${privateSession.activeTab === 'sources' ? 'active' : ''}" data-tab="sources" style="font-size: 11px; padding: 4px 10px; ${privateSession.activeTab === 'sources' ? 'background: var(--bg-secondary); color: var(--text-primary);' : ''}">
              Sources (${(preview.sources || []).length})
            </button>
            <button type="button" class="btn btn--ghost btn--sm preview-tab-btn ${privateSession.activeTab === 'relationships' ? 'active' : ''}" data-tab="relationships" style="font-size: 11px; padding: 4px 10px; ${privateSession.activeTab === 'relationships' ? 'background: var(--bg-secondary); color: var(--text-primary);' : ''}">
              Relationships (${(preview.relationships || []).length})
            </button>
            <button type="button" class="btn btn--ghost btn--sm preview-tab-btn ${privateSession.activeTab === 'folders' ? 'active' : ''}" data-tab="folders" style="font-size: 11px; padding: 4px 10px; ${privateSession.activeTab === 'folders' ? 'background: var(--bg-secondary); color: var(--text-primary);' : ''}">
              Folders (${(preview.folders || []).length})
            </button>
            <button type="button" class="btn btn--ghost btn--sm preview-tab-btn ${privateSession.activeTab === 'assets' ? 'active' : ''}" data-tab="assets" style="font-size: 11px; padding: 4px 10px; ${privateSession.activeTab === 'assets' ? 'background: var(--bg-secondary); color: var(--text-primary);' : ''}">
              Assets (${(preview.assets || []).length})
            </button>
          </div>

          <div style="max-height: 200px; overflow-y: auto; padding: var(--space-3); background-color: var(--bg-secondary);">
            ${privateSession.activeTab === 'notes' ? `
              <div style="display: flex; flex-direction: column; gap: 6px;">
                ${(preview.notes || []).map(n => `
                  <div style="padding: 6px 8px; background-color: var(--bg-tertiary); border-radius: 4px; border: 1px solid var(--border-primary); display: flex; align-items: center; justify-content: space-between;">
                    <div>
                      <strong style="font-size: 11px; color: var(--text-primary);">${escapeHtml(n.title)}</strong>
                      ${n.disambiguation_hint ? `<span class="badge" style="font-size: 9px; margin-left: 4px;">${escapeHtml(n.disambiguation_hint)}</span>` : ''}
                      <div class="text-secondary" style="font-size: 10px;">ID: <code>${escapeHtml(n.id)}</code> ${n.tags ? '&bull; ' + escapeHtml(n.tags.join(', ')) : ''}</div>
                    </div>
                    <span class="badge" style="font-size: 9px;">${n.word_count ? n.word_count + ' words' : 'markdown'}</span>
                  </div>
                `).join('')}
              </div>
            ` : ''}

            ${privateSession.activeTab === 'sources' ? `
              <div style="display: flex; flex-direction: column; gap: 6px;">
                ${(preview.sources || []).map(s => `
                  <div style="padding: 6px 8px; background-color: var(--bg-tertiary); border-radius: 4px; border: 1px solid var(--border-primary); font-size: 11px;">
                    <div style="display: flex; align-items: center; justify-content: space-between;">
                      <strong style="font-size: 11px; color: var(--text-primary);">${escapeHtml(s.title)}</strong>
                      <span class="badge" style="font-size: 9px;">${escapeHtml(s.source_type || 'source')}</span>
                    </div>
                    <div class="text-secondary" style="font-size: 10px; margin-top: 2px;">
                      ${s.source_url ? `<a href="${escapeHtml(s.source_url)}" target="_blank" rel="noopener noreferrer" style="color: var(--accent-primary); text-decoration: underline;">${escapeHtml(s.source_url)}</a> &bull; ` : ''}${s.authors && s.authors.length ? escapeHtml(s.authors.join(', ')) + ' &bull; ' : ''}${s.publication_date ? escapeHtml(s.publication_date) + ' &bull; ' : ''}${s.excerpt_count || 0} excerpts
                    </div>
                  </div>
                `).join('')}
              </div>
            ` : ''}

            ${privateSession.activeTab === 'relationships' ? `
              <div style="display: flex; flex-direction: column; gap: 6px;">
                ${(preview.relationships || []).map(r => `
                  <div style="padding: 6px 8px; background-color: var(--bg-tertiary); border-radius: 4px; border: 1px solid var(--border-primary); font-size: 11px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                    <code>${escapeHtml(r.source_id)}</code>
                    <span class="badge badge--primary" style="font-size: 9px;">${escapeHtml(r.link_type)}</span>
                    <span>&rarr;</span>
                    <code>${escapeHtml(r.target_id)}</code>
                    ${r.confidence ? `<span class="text-secondary" style="font-size: 10px;">(confidence: ${Math.round(r.confidence * 100)}%)</span>` : ''}
                  </div>
                `).join('')}
              </div>
            ` : ''}

            ${privateSession.activeTab === 'folders' ? `
              <div style="display: flex; flex-direction: column; gap: 6px;">
                ${(preview.folders || []).map(f => `
                  <div style="padding: 6px 8px; background-color: var(--bg-tertiary); border-radius: 4px; border: 1px solid var(--border-primary); font-size: 11px; display: flex; align-items: center; gap: 6px;">
                    <span style="color: var(--accent-primary);">${getIcon('folder')}</span>
                    <strong>${escapeHtml(f.name)}</strong>
                    <span class="text-secondary" style="font-size: 10px;">(ID: <code>${escapeHtml(f.id)}</code>)</span>
                  </div>
                `).join('')}
              </div>
            ` : ''}

            ${privateSession.activeTab === 'assets' ? `
              <div style="display: flex; flex-direction: column; gap: 6px;">
                ${(preview.assets || []).length === 0 ? '<div class="text-secondary" style="font-size: 11px;">No assets declared in package.</div>' : (preview.assets || []).map(a => `
                  <div style="padding: 6px 8px; background-color: var(--bg-tertiary); border-radius: 4px; border: 1px solid var(--border-primary); font-size: 11px; display: flex; align-items: center; justify-content: space-between;">
                    <div>
                      <strong>${escapeHtml(a.filename)}</strong>
                      <span class="text-secondary" style="font-size: 10px;"> &bull; ${escapeHtml(a.path)}</span>
                    </div>
                    <span class="badge" style="font-size: 9px;">${escapeHtml(a.mime_type || 'binary')}</span>
                  </div>
                `).join('')}
              </div>
            ` : ''}
          </div>
        </div>

        <!-- Explicit Approval Checkbox -->
        <div style="padding: var(--space-3) var(--space-4); background-color: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary); margin-bottom: var(--space-4);">
          <label style="display: flex; align-items: flex-start; gap: 8px; font-size: var(--text-xs); color: var(--text-primary); cursor: pointer;">
            <input type="checkbox" id="exchange-approval-checkbox" ${privateSession.approvalChecked ? 'checked' : ''} ${isCommitting ? 'disabled' : ''} style="margin-top: 2px;" />
            <div>
              <strong style="color: var(--text-primary);">I have reviewed this package and approve importing it into ${escapeHtml(destProjectTitle)}.</strong>
              <div class="text-secondary" style="font-size: 11px; margin-top: 2px; line-height: 1.5;">
                All entities will be committed inside an isolated database transaction. Zero partial writes will occur if an error arises.
              </div>
            </div>
          </label>
        </div>

        ${privateSession.errorMessage ? `
          <div style="margin-bottom: var(--space-4); padding: 8px 12px; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: var(--radius-sm); font-size: 11px; color: var(--status-error); display: flex; align-items: center; gap: 6px;">
            <span>${getIcon('x')}</span>
            <span>${escapeHtml(privateSession.errorMessage)}</span>
          </div>
        ` : ''}
      `;

      footerEl.innerHTML = `
        <button type="button" class="btn btn--secondary btn--md" id="btn-exchange-preview-back" ${isCommitting ? 'disabled' : ''}>Cancel</button>
        <button type="button" class="btn btn--primary btn--md" id="btn-exchange-approve-commit" ${(!privateSession.approvalChecked || isCommitting) ? 'disabled' : ''}>
          ${isCommitting ? `
            <span class="spinner" style="width: 12px; height: 12px; border-width: 2px;"></span>
            <span>Importing...</span>
          ` : `
            ${getIcon('check')} <span>Import into Project</span>
          `}
        </button>
      `;

      // Wire Tab Clicks
      bodyEl.querySelectorAll('.preview-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          privateSession.activeTab = btn.getAttribute('data-tab');
          renderModal();
        });
      });

      // Wire Approval Checkbox
      const approvalCb = bodyEl.querySelector('#exchange-approval-checkbox');
      if (approvalCb) {
        approvalCb.addEventListener('change', (e) => {
          privateSession.approvalChecked = e.target.checked;
          const commitBtn = footerEl.querySelector('#btn-exchange-approve-commit');
          if (commitBtn) commitBtn.disabled = !privateSession.approvalChecked || isCommitting;
        });
      }

      footerEl.querySelector('#btn-exchange-preview-back')?.addEventListener('click', () => {
        privateSession.step = 'select';
        privateSession.inspectionToken = null;
        renderModal();
      });

      footerEl.querySelector('#btn-exchange-approve-commit')?.addEventListener('click', executeCommit);
      return;
    }

    // -------------------------------------------------------------------------
    // STEP 4: IMPORT COMPLETED (SUCCESS VIEW)
    // -------------------------------------------------------------------------
    if (privateSession.step === 'success') {
      const res = privateSession.commitResult || {};
      const counts = res.counts || res.imported_counts || (privateSession.inspectionData && privateSession.inspectionData.counts) || {};
      const projectId = res.created_project_id || privateSession.destinationProjectId;
      const projectTitle = (privateSession.inspectionData && privateSession.inspectionData.project && privateSession.inspectionData.project.title) || 'Workspace Project';

      bodyEl.innerHTML = `
        ${stepsHtml}
        <div style="padding: var(--space-6) var(--space-4); text-align: center;">
          <div style="width: 48px; height: 48px; border-radius: 999px; background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.35); color: var(--status-success); display: inline-flex; align-items: center; justify-content: center; margin-bottom: var(--space-3);">
            ${getIcon('check')}
          </div>
          <h3 style="font-size: var(--text-lg); font-weight: 600; color: var(--text-primary); margin: 0 0 4px 0;">Import Complete</h3>
          <p class="text-secondary" style="font-size: var(--text-xs); line-height: 1.6; max-width: 500px; margin: 0 auto var(--space-4) auto;">
            Your knowledge package has been imported successfully. Your imported content is now available in the selected Project.
          </p>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px; max-width: 600px; margin: 0 auto var(--space-4) auto; text-align: left;">
            <div style="padding: 8px 12px; background-color: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary);">
              <span class="text-secondary" style="font-size: 10px; text-transform: uppercase;">Project</span>
              <div style="font-size: 12px; font-weight: 600; color: var(--text-primary);" class="text-truncate">${escapeHtml(projectTitle)}</div>
            </div>
            <div style="padding: 8px 12px; background-color: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary);">
              <span class="text-secondary" style="font-size: 10px; text-transform: uppercase;">Vault Notes</span>
              <div style="font-size: 12px; font-weight: 600; color: var(--project-violet, #8b5cf6);">${counts.notes || 0} Created</div>
            </div>
            <div style="padding: 8px 12px; background-color: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary);">
              <span class="text-secondary" style="font-size: 10px; text-transform: uppercase;">Sources & Excerpts</span>
              <div style="font-size: 12px; font-weight: 600; color: var(--status-warning);">${counts.sources || 0} / ${counts.excerpts || 0}</div>
            </div>
            <div style="padding: 8px 12px; background-color: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary);">
              <span class="text-secondary" style="font-size: 10px; text-transform: uppercase;">Graph Edges</span>
              <div style="font-size: 12px; font-weight: 600; color: var(--status-success);">${counts.relationships || 0} Linked</div>
            </div>
          </div>

          ${res.idempotent_replay ? `
            <div style="font-size: 11px; color: var(--status-warning); margin-bottom: var(--space-3);">
              Note: This import was idempotently served from a previously committed operation.
            </div>
          ` : ''}
        </div>
      `;

      footerEl.innerHTML = `
        <button type="button" class="btn btn--secondary btn--md" id="btn-exchange-success-close">Close</button>
        <button type="button" class="btn btn--primary btn--md" id="btn-exchange-open-project">
          ${getIcon('share-2')} <span>Open Project</span>
        </button>
      `;

      footerEl.querySelector('#btn-exchange-success-close')?.addEventListener('click', () => {
        if (typeof privateSession.onImportComplete === 'function') {
          privateSession.onImportComplete(res);
        }
        closeModal();
      });

      footerEl.querySelector('#btn-exchange-open-project')?.addEventListener('click', () => {
        if (typeof privateSession.onImportComplete === 'function') {
          privateSession.onImportComplete(res);
        }
        closeModal();
        if (projectId) {
          if (typeof window !== 'undefined' && window.Router && typeof window.Router.navigate === 'function') {
            window.Router.navigate(`/projects/${projectId}`);
          } else {
            window.location.hash = `#/projects/${projectId}`;
          }
        }
      });
    }
  }

  function handleFileSelection(file) {
    if (!file) return;
    privateSession.file = file;
    // Invalidate old token when a new file is chosen
    privateSession.inspectionToken = null;
    privateSession.inspectionData = null;
    renderModal();
  }

  async function executeInspect() {
    if (!privateSession.file) return;

    privateSession.step = 'inspecting';
    privateSession.errorMessage = null;
    privateSession.errorDetails = [];
    renderModal();

    const formData = new FormData();
    formData.append('file', privateSession.file);
    if (privateSession.destinationMode === 'existing' && privateSession.destinationProjectId) {
      formData.append('destination_project_id', privateSession.destinationProjectId);
    }

    try {
      const res = await fetch('/api/v1/exchange/inspect', {
        method: 'POST',
        credentials: 'include',
        body: formData
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.valid === false) {
        privateSession.step = 'error';
        const errList = (data.errors && data.errors.length)
          ? data.errors
          : (data.validation && data.validation.errors && data.validation.errors.length)
            ? data.validation.errors
            : [];
        const topErrorMsg = data.error || (errList.length ? errList[0].message : null);
        privateSession.errorMessage = topErrorMsg || (res.status === 404 ? 'Inspection endpoint returned HTTP 404. Ensure Flowden is reachable on this port.' : `Inspection failed (HTTP ${res.status}).`);
        privateSession.errorDetails = errList.length ? errList : [{ code: data.code || `HTTP_${res.status}`, message: privateSession.errorMessage }];
        privateSession.inspectionToken = null;
        renderModal();
        return;
      }

      // Successful Inspection: Store Token In-Memory
      privateSession.inspectionToken = data.inspection_token;
      privateSession.inspectionData = data;
      privateSession.packageSha256 = data.package_sha256;
      privateSession.warnings = data.warnings || [];
      privateSession.approvalChecked = false;
      privateSession.idempotencyKey = generateIdempotencyKey();
      privateSession.step = 'preview';
      renderModal();
    } catch (err) {
      privateSession.step = 'error';
      privateSession.errorMessage = err.message || 'Network error while contacting inspection service.';
      privateSession.errorDetails = [{ code: 'NETWORK_ERROR', message: err.message }];
      privateSession.inspectionToken = null;
      renderModal();
    }
  }

  async function executeCommit() {
    if (!privateSession.approvalChecked) return;
    if (!privateSession.inspectionToken) {
      privateSession.errorMessage = 'Inspection session has expired. Please inspect the package again.';
      privateSession.step = 'preview';
      renderModal();
      return;
    }

    privateSession.step = 'committing';
    privateSession.errorMessage = null;
    renderModal();

    const formData = new FormData();
    formData.append('approved', 'true');
    formData.append('inspection_token', privateSession.inspectionToken);
    formData.append('idempotency_key', privateSession.idempotencyKey || generateIdempotencyKey());
    formData.append('conflict_resolution', 'disambiguate');
    if (privateSession.destinationMode === 'existing' && privateSession.destinationProjectId) {
      formData.append('destination_project_id', privateSession.destinationProjectId);
    }
    if (privateSession.packageSha256) {
      formData.append('package_sha256', privateSession.packageSha256);
    }

    try {
      const res = await fetch('/api/v1/exchange/commit', {
        method: 'POST',
        credentials: 'include',
        body: formData
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.success === false) {
        privateSession.step = 'preview';
        if (data.code === 'INSPECTION_TOKEN_EXPIRED') {
          privateSession.errorMessage = 'Inspection token has expired (15-minute TTL). Please return and re-inspect your package.';
          privateSession.inspectionToken = null;
        } else if (data.code === 'INSPECTION_TOKEN_ALREADY_CONSUMED') {
          privateSession.errorMessage = 'Inspection token was already consumed. Please re-inspect if you need another import.';
          privateSession.inspectionToken = null;
        } else {
          privateSession.errorMessage = data.error || 'Failed to commit package import.';
        }
        renderModal();
        return;
      }

      // Success! Token is consumed
      privateSession.inspectionToken = null;
      privateSession.commitResult = data;
      privateSession.step = 'success';
      renderModal();

      if (typeof window !== 'undefined' && window.showToast) {
        window.showToast('Knowledge package imported successfully!', 'success');
      }
    } catch (err) {
      privateSession.step = 'preview';
      privateSession.errorMessage = err.message || 'Network error while committing package.';
      renderModal();
    }
  }

  function open(options = {}) {
    closeModal();
    resetSession();

    if (options.defaultProjectId) {
      privateSession.destinationMode = 'existing';
      privateSession.destinationProjectId = parseInt(options.defaultProjectId, 10);
    }
    if (typeof options.onImportComplete === 'function') {
      privateSession.onImportComplete = options.onImportComplete;
    }

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay exchange-modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Flowden Knowledge Package Importer');

    overlay.innerHTML = `
      <div class="modal exchange-modal" style="max-width: 820px; width: 92vw; max-height: 88vh; display: flex; flex-direction: column; background-color: var(--bg-secondary); border: 1px solid var(--border-primary); border-radius: var(--radius-md); box-shadow: 0 20px 45px rgba(0,0,0,0.4); overflow: hidden;">
        <div class="modal-header" style="display: flex; align-items: center; justify-content: space-between; padding: var(--space-4) var(--space-5); border-bottom: 1px solid var(--border-primary); background-color: var(--bg-tertiary);">
          <div class="exchange-modal-title" style="font-weight: 600; font-size: var(--text-md); color: var(--text-primary);"></div>
          <button type="button" class="btn btn--ghost btn--icon btn--sm exchange-modal-close" aria-label="Close dialog" style="color: var(--text-secondary); cursor: pointer;">
            ${getIcon('x')}
          </button>
        </div>
        <div class="modal-body exchange-modal-body" style="padding: var(--space-5); overflow-y: auto; flex: 1;"></div>
        <div class="modal-footer exchange-modal-footer" style="display: flex; align-items: center; justify-content: flex-end; gap: var(--space-2); padding: var(--space-3) var(--space-5); border-top: 1px solid var(--border-primary); background-color: var(--bg-tertiary);"></div>
      </div>
    `;

    document.body.appendChild(overlay);
    activeOverlay = overlay;

    overlay.querySelector('.exchange-modal-close')?.addEventListener('click', closeModal);

    // Close on click outside modal container
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });

    // Keyboard Escape Listener
    keydownHandler = (e) => {
      if (e.key === 'Escape') {
        closeModal();
      }
    };
    window.addEventListener('keydown', keydownHandler);

    // Initial load of user's projects and render
    loadUserProjects().then(() => {
      renderModal();
    });
  }

  function closeModal() {
    if (activeOverlay && activeOverlay.parentNode) {
      activeOverlay.parentNode.removeChild(activeOverlay);
    }
    activeOverlay = null;
    if (keydownHandler) {
      window.removeEventListener('keydown', keydownHandler);
      keydownHandler = null;
    }
    resetSession();
  }

  return {
    open,
    close: closeModal,
    // Expose helpers for testing
    _getPrivateSession: () => ({
      step: privateSession.step,
      hasToken: Boolean(privateSession.inspectionToken),
      idempotencyKey: privateSession.idempotencyKey,
      file: privateSession.file ? privateSession.file.name : null,
      destinationMode: privateSession.destinationMode,
      destinationProjectId: privateSession.destinationProjectId
    })
  };
}));
