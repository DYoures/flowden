// Flowden Research Center (Research Bridge) Engine v2.0 - Segment 4
// Multi-format literature ingestion (.pdf, .docx, .md, .txt), full-text extraction, and knowledge bridging

async function renderResearchPage(container) {
  const getIcon = window.FlowdenIcons ? window.FlowdenIcons.getIcon : () => '';

  let currentDocuments = [];
  let currentProjects = [];
  let filterType = 'all';
  let filterProject = 'all';
  let searchQuery = '';

  container.innerHTML = `
    <div style="padding: var(--space-6); max-width: 1200px; margin: 0 auto;">
      <!-- Page Header -->
      <div style="display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: var(--space-4); margin-bottom: var(--space-6);">
        <div>
          <div style="display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-1);">
            <h1 style="font-size: var(--text-xl); font-weight: var(--font-semibold);">Research Center</h1>
            <span class="badge badge--primary" style="font-size: 11px;">Research Bridge Active</span>
          </div>
          <p class="text-secondary text-sm">
            Ingest, extract, and bridge research literature directly into your spatial workspace and Knowledge Vault.
          </p>
        </div>

        <div style="display: flex; align-items: center; gap: var(--space-3);">
          <input type="file" id="research-file-input" multiple accept=".md,.txt,.pdf,.docx" style="display: none;" />
          <button class="btn btn--secondary btn--md" id="btn-import-flowden-package" style="border-color: var(--accent-border, rgba(120, 200, 178, 0.45)); color: var(--accent-deep, var(--brand-teal));">
            ${getIcon('share-2')}
            <span>Import Flowden Package</span>
          </button>
          <button class="btn btn--primary btn--md" id="btn-import-research-file">
            ${getIcon('plus')}
            <span>Import Document</span>
          </button>
        </div>
      </div>

      <!-- Drag & Drop Zone -->
      <div class="research-dropzone" id="research-dropzone" style="margin-bottom: var(--space-6);">
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--space-2);">
          <div style="width: 44px; height: 44px; border-radius: var(--radius-md); background-color: var(--accent-soft, var(--bg-tertiary)); display: flex; align-items: center; justify-content: center; color: var(--accent-deep, var(--accent-primary)); margin-bottom: var(--space-1); border: 1px solid var(--accent-border, var(--border-primary));">
            ${getIcon('file-search')}
          </div>
          <div style="font-size: var(--text-sm); font-weight: 600; color: var(--text-primary);">
            Drag & drop research literature here, or click to browse
          </div>
          <div class="text-xs text-secondary" style="max-width: 520px; line-height: 1.5;">
            Supported formats: <strong style="color: var(--text-primary);">.PDF</strong> (papers, reports), <strong style="color: var(--text-primary);">.DOCX</strong> (manuscripts), <strong style="color: var(--text-primary);">.MD</strong> & <strong style="color: var(--text-primary);">.TXT</strong> (notes, web clips). Max 10MB per file.
          </div>
          <div style="display: flex; gap: var(--space-2); margin-top: var(--space-2);">
            <span class="tag tag--violet">.PDF Text Extraction</span>
            <span class="tag tag--blue">.DOCX Parsing</span>
            <span class="tag tag--teal">.MD Markdown</span>
            <span class="tag tag--amber">.TXT Raw</span>
          </div>
        </div>
      </div>

      <!-- Filter and Search Toolbar -->
      <div class="card" style="padding: var(--space-3) var(--space-4); margin-bottom: var(--space-6); background-color: var(--bg-secondary); border: 1px solid var(--border-primary);">
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--space-3);">
          <div style="display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap;">
            <input type="text" id="research-search-input" class="input" placeholder="Search by title or text..." style="height: 32px; width: 220px; font-size: var(--text-xs);" />
            
            <select id="research-filter-type" class="select" style="height: 32px; font-size: var(--text-xs); padding: 0 var(--space-2);">
              <option value="all">All Formats</option>
              <option value="pdf">PDF Documents</option>
              <option value="docx">DOCX Documents</option>
              <option value="md">Markdown (.md)</option>
              <option value="txt">Plain Text (.txt)</option>
            </select>

            <select id="research-filter-project" class="select" style="height: 32px; font-size: var(--text-xs); padding: 0 var(--space-2);">
              <option value="all">All Projects</option>
            </select>
          </div>

          <div class="text-xs text-secondary" id="research-count-label">0 documents indexed</div>
        </div>
      </div>

      <!-- Document Grid -->
      <div id="research-documents-container" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: var(--space-4);">
        <!-- Injected via renderDocuments() -->
      </div>
    </div>
  `;

  // Fetch projects
  async function loadProjects() {
    try {
      const res = await window.API.get('/projects');
      currentProjects = res.projects || [];
      const sel = document.getElementById('research-filter-project');
      if (sel) {
        sel.innerHTML = '<option value="all">All Projects</option>' + 
          currentProjects.map(p => `<option value="${p.id}">${p.title}</option>`).join('');
      }
    } catch (e) {
      console.error(e);
    }
  }

  // Fetch documents
  async function loadDocuments() {
    try {
      const res = await window.API.get('/research');
      currentDocuments = res.documents || [];
      renderDocuments();
    } catch (e) {
      console.error(e);
      window.showToast('Failed to load research documents', 'error');
    }
  }

  function getFilteredDocuments() {
    return currentDocuments.filter(d => {
      if (filterType !== 'all' && d.file_type.toLowerCase() !== filterType.toLowerCase()) return false;
      if (filterProject !== 'all' && String(d.project_id) !== String(filterProject)) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const mTitle = d.title && d.title.toLowerCase().includes(q);
        const mSumm = d.summary && d.summary.toLowerCase().includes(q);
        const mTxt = d.content_text && d.content_text.toLowerCase().includes(q);
        if (!mTitle && !mSumm && !mTxt) return false;
      }
      return true;
    });
  }

  function formatBytes(bytes) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function renderDocuments() {
    const listEl = document.getElementById('research-documents-container');
    const countEl = document.getElementById('research-count-label');
    const filtered = getFilteredDocuments();

    if (countEl) countEl.textContent = `${filtered.length} document${filtered.length === 1 ? '' : 's'} indexed`;

    if (filtered.length === 0) {
      listEl.innerHTML = `
        <div style="grid-column: 1 / -1; padding: var(--space-12) var(--space-4); text-align: center;" class="card">
          <div class="empty-state">
            <div class="empty-state-icon" style="color: var(--accent-deep, var(--accent-primary));">${getIcon('file-search')}</div>
            <div class="empty-state-title">No matching research literature</div>
            <div class="empty-state-description">Import papers or select a different filter above to explore indexed citations.</div>
          </div>
        </div>
      `;
      return;
    }

    listEl.innerHTML = filtered.map(doc => {
      const proj = currentProjects.find(p => p.id === doc.project_id);
      const extTag = (doc.file_type || 'txt').toUpperCase();
      const badgeClass = extTag === 'PDF' ? 'tag--violet' : (extTag === 'DOCX' ? 'tag--blue' : (extTag === 'MD' ? 'tag--teal' : 'tag--amber'));
      const dateStr = new Date(doc.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

      return `
        <div class="research-doc-card" data-doc-id="${doc.id}">
          <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-3); margin-bottom: var(--space-2);">
            <div style="font-size: var(--text-sm); font-weight: 600; color: var(--text-primary); line-height: 1.3;" class="text-truncate">
              ${doc.title}
            </div>
            <span class="tag ${badgeClass}" style="flex-shrink: 0; font-size: 10px;">${extTag}</span>
          </div>

          <p class="text-xs text-secondary" style="line-height: 1.5; margin-bottom: var(--space-3); flex: 1; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;">
            ${doc.summary ? (window.SmartLinkHandler ? window.SmartLinkHandler.renderMarkdownLinks(doc.summary) : doc.summary) : (doc.content_text ? doc.content_text.slice(0, 180) : 'No summary available.')}
          </p>

          <div style="display: flex; align-items: center; justify-content: space-between; font-size: 11px; color: var(--text-tertiary); padding-top: var(--space-2); border-top: 1px solid var(--border-primary); margin-top: auto;">
            <span>${formatBytes(doc.file_size)} · ${dateStr}</span>
            ${proj ? `<span class="badge" style="background: var(--bg-tertiary); font-size: 10px;">${proj.title}</span>` : '<span></span>'}
          </div>

          <div style="display: flex; align-items: center; justify-content: flex-end; gap: var(--space-2); margin-top: var(--space-3);">
            <button class="btn btn--secondary btn--sm btn-inspect-doc" data-doc-id="${doc.id}">
              ${getIcon('eye')} Inspect
            </button>
            <button class="btn btn--ghost btn--sm btn-edit-doc" data-doc-id="${doc.id}">
              ${getIcon('edit')}
            </button>
            <button class="btn btn--danger btn--sm btn-delete-doc" data-doc-id="${doc.id}" title="Delete document">
              ${getIcon('trash')}
            </button>
          </div>
        </div>
      `;
    }).join('');

    attachDocumentCardEvents();
  }

  function attachDocumentCardEvents() {
    container.querySelectorAll('.btn-inspect-doc').forEach(btn => {
      btn.addEventListener('click', () => {
        const docId = parseInt(btn.getAttribute('data-doc-id'), 10);
        const doc = currentDocuments.find(d => d.id === docId);
        if (doc) openDocumentPreviewModal(doc);
      });
    });

    container.querySelectorAll('.btn-edit-doc').forEach(btn => {
      btn.addEventListener('click', () => {
        const docId = parseInt(btn.getAttribute('data-doc-id'), 10);
        const doc = currentDocuments.find(d => d.id === docId);
        if (doc) openEditMetadataModal(doc);
      });
    });

    container.querySelectorAll('.btn-delete-doc').forEach(btn => {
      btn.addEventListener('click', async () => {
        const docId = parseInt(btn.getAttribute('data-doc-id'), 10);
        if (!confirm('Are you sure you want to delete this research document and its extracted index?')) return;
        try {
          await window.API.delete(`/research/${docId}`);
          window.showToast('Document deleted.', 'success');
          loadDocuments();
        } catch (err) {
          window.showToast('Failed to delete document', 'error');
        }
      });
    });
  }

  // Upload file pipeline
  async function handleFileUpload(files) {
    if (!files || files.length === 0) return;

    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i]);
    }

    const projSelect = document.getElementById('research-filter-project');
    if (projSelect && projSelect.value !== 'all') {
      formData.append('project_id', projSelect.value);
    }

    window.showToast(`Extracting & indexing ${files.length} document(s)...`, 'info', 3000);

    try {
      const res = await fetch('/api/v1/research/import', {
        method: 'POST',
        credentials: 'include',
        body: formData
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Upload failed');
      }

      const data = await res.json();
      window.showToast(data.message || 'Import completed successfully', 'success');
      loadDocuments();
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  }

  // Drag and drop event listeners
  const dropzone = container.querySelector('#research-dropzone');
  const fileInput = container.querySelector('#research-file-input');

  dropzone.addEventListener('click', () => fileInput.click());
  container.querySelector('#btn-import-research-file').addEventListener('click', () => fileInput.click());

  container.querySelector('#btn-import-flowden-package')?.addEventListener('click', () => {
    const projSelect = document.getElementById('research-filter-project');
    const defaultProjId = (projSelect && projSelect.value !== 'all' && projSelect.value) ? projSelect.value : null;
    if (typeof window.openExchangeImportModal === 'function') {
      window.openExchangeImportModal({
        defaultProjectId: defaultProjId,
        onImportComplete: () => {
          loadProjects();
          loadDocuments();
        }
      });
    } else {
      window.showToast('Flowden Package Importer modal is loading...', 'info');
    }
  });

  fileInput.addEventListener('change', (e) => {
    handleFileUpload(e.target.files);
    fileInput.value = '';
  });

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('is-dragover');
  });

  dropzone.addEventListener('dragleave', (e) => {
    if (!dropzone.contains(e.relatedTarget)) {
      dropzone.classList.remove('is-dragover');
    }
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('is-dragover');
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files);
    }
  });

  // Search and filter listeners
  document.getElementById('research-search-input').addEventListener('input', (e) => {
    searchQuery = e.target.value.trim();
    renderDocuments();
  });

  document.getElementById('research-filter-type').addEventListener('change', (e) => {
    filterType = e.target.value;
    renderDocuments();
  });

  document.getElementById('research-filter-project').addEventListener('change', (e) => {
    filterProject = e.target.value;
    renderDocuments();
  });

  // Document Preview / Inspection Modal
  function openDocumentPreviewModal(doc) {
    const proj = currentProjects.find(p => p.id === doc.project_id);

    window.Modal.open({
      title: `${doc.title} (${doc.file_type.toUpperCase()})`,
      size: 'lg',
      content: `
        <div style="display: flex; flex-direction: column; gap: var(--space-4);">
          <!-- Top metadata bar -->
          <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--space-2); padding: var(--space-3); background-color: var(--bg-tertiary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary);">
            <div style="font-size: var(--text-xs); color: var(--text-secondary);">
              <span>File: <strong style="color: var(--text-primary);">${doc.file_name}</strong></span> · 
              <span>Size: ${formatBytes(doc.file_size)}</span> · 
              <span>Project: ${proj ? proj.title : 'Unassigned'}</span>
            </div>
            ${doc.source_url ? `<a href="${doc.source_url}" target="_blank" rel="noopener noreferrer" class="text-xs" style="color: var(--accent-primary);">Source Citation ↗</a>` : ''}
          </div>

          <!-- Summary Box -->
          <div style="padding: var(--space-3); background-color: var(--bg-secondary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary);">
            <div style="font-size: var(--text-xs); font-weight: 600; text-transform: uppercase; color: var(--text-tertiary); margin-bottom: 4px;">Executive Summary / Abstract</div>
            <div style="font-size: var(--text-sm); color: var(--text-primary); line-height: 1.5;">${doc.summary ? (window.SmartLinkHandler ? window.SmartLinkHandler.renderMarkdownLinks(doc.summary) : doc.summary) : 'No summary available.'}</div>
          </div>

          <!-- Extracted Text Area -->
          <div>
            <div style="font-size: var(--text-xs); font-weight: 600; text-transform: uppercase; color: var(--text-tertiary); margin-bottom: 6px;">Extracted Full Text (${(doc.content_text || '').length} characters)</div>
            <div style="font-family: var(--font-mono); font-size: var(--text-xs); line-height: 1.6; background-color: var(--bg-primary); border: 1px solid var(--border-primary); border-radius: var(--radius-sm); padding: var(--space-4); max-height: 340px; overflow-y: auto; white-space: pre-wrap; color: var(--text-primary);">
              ${doc.content_text || 'No text extracted.'}
            </div>
          </div>
        </div>
      `,
      buttons: [
        {
          text: 'Bridge to Vault Note',
          variant: 'secondary',
          onClick: async (m, inst) => {
            try {
              // Create a note in Knowledge Vault seeded with this research
              const res = await window.API.post('/notes', {
                title: `Research: ${doc.title}`,
                content: `# ${doc.title}\n\n> Source Document: ${doc.file_name}\n\n## Abstract\n${doc.summary}\n\n## Notes & Synthesis\n\n- Key finding:\n- Reference citation: ${doc.source_url || 'Internal Library'}\n`,
                project_id: doc.project_id
              });
              window.showToast('Note created in Knowledge Vault!', 'success');
              inst.close();
              window.Router.navigate(`/vault?note=${res.note.id}`);
            } catch (err) {
              window.showToast('Failed to bridge note: ' + err.message, 'error');
            }
          }
        },
        { text: 'Close', variant: 'ghost', onClick: (m, inst) => inst.close() }
      ]
    });
  }

  // Edit Metadata Modal
  function openEditMetadataModal(doc) {
    window.Modal.open({
      title: 'Edit Research Metadata',
      size: 'md',
      content: `
        <form id="form-edit-research-meta">
          <div class="form-group">
            <label class="form-label" for="meta-title">Document Title *</label>
            <input type="text" id="meta-title" class="input" value="${doc.title || ''}" required />
          </div>

          <div class="form-group">
            <label class="form-label" for="meta-summary">Summary / Key Insight</label>
            <textarea id="meta-summary" class="textarea" rows="3">${doc.summary || ''}</textarea>
          </div>

          <div class="form-group">
            <label class="form-label" for="meta-source-url">Source Citation URL</label>
            <input type="url" id="meta-source-url" class="input" value="${doc.source_url || ''}" placeholder="https://arxiv.org/abs/..." />
          </div>

          <div class="form-group">
            <label class="form-label" for="meta-project-select">Associated Project</label>
            <select id="meta-project-select" class="select">
              <option value="">(No Project)</option>
              ${currentProjects.map(p => `<option value="${p.id}" ${String(doc.project_id) === String(p.id) ? 'selected' : ''}>${p.title}</option>`).join('')}
            </select>
          </div>
        </form>
      `,
      buttons: [
        { text: 'Cancel', variant: 'ghost', onClick: (m, inst) => inst.close() },
        {
          text: 'Save Metadata',
          variant: 'primary',
          onClick: async (m, inst) => {
            const titleVal = document.getElementById('meta-title').value.trim();
            const summaryVal = document.getElementById('meta-summary').value.trim();
            const sourceUrlVal = document.getElementById('meta-source-url').value.trim();
            const projIdVal = document.getElementById('meta-project-select').value;

            if (!titleVal) {
              window.showToast('Title is required', 'error');
              return;
            }

            try {
              await window.API.put(`/research/${doc.id}`, {
                title: titleVal,
                summary: summaryVal,
                source_url: sourceUrlVal || null,
                project_id: projIdVal ? parseInt(projIdVal, 10) : null
              });
              inst.close();
              window.showToast('Metadata updated.', 'success');
              loadDocuments();
            } catch (err) {
              window.showToast('Update failed: ' + err.message, 'error');
            }
          }
        }
      ]
    });

    setTimeout(() => {
      const sumEl = document.getElementById('meta-summary');
      if (sumEl && window.SmartLinkHandler) {
        window.SmartLinkHandler.attachToTextarea(sumEl);
      }
    }, 20);
  }

  // Initialize
  await loadProjects();
  await loadDocuments();
}

if (typeof window !== 'undefined') {
  window.renderResearchPage = renderResearchPage;
}
