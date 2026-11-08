// public/js/components/vaultHelp.js
// Flowden Knowledge Vault 2.0 - Unified Help Architecture & Feature Catalog
// Reusable metadata for tooltips, contextual feature explainers, tour, and documentation

(function () {
  'use strict';

  const getIcon = (name) => {
    return (window.FlowdenIcons && window.FlowdenIcons.getIcon) ? window.FlowdenIcons.getIcon(name) : '';
  };

  const featureCatalog = [
    {
      id: 'note-list-folders',
      name: 'Note List and Folders',
      icon: 'folder',
      category: 'Organization',
      shortDescription: 'Hierarchical folders and tag filters for organizing knowledge notes.',
      detailedExplanation: 'Create custom folders to group related notes by domain, sprint, or topic. Filter by folders or active tags in the sidebar tree to rapidly narrow down your workspace notes.',
      whenToUse: 'Use when your vault grows beyond a handful of notes and requires clean taxonomy or tag-based categorization.',
      practicalExample: 'Organize notes into "Architecture", "Meeting Notes", and "Research", then tag entries with #adr or #core.',
      shortcut: null,
      selector: '#vault-folder-tree, #vault-notes-list',
      relatedFeatureIds: ['connect-note', 'connected-notes-backlinks'],
      status: 'implemented'
    },
    {
      id: 'editor-modes',
      name: 'Edit, Split, and Read Modes',
      icon: 'eye',
      category: 'Writing',
      shortDescription: 'Switch between distraction-free raw markdown editing, split live preview, and reading view.',
      detailedExplanation: 'Flowden provides three tailored viewing layouts. Edit mode maximizes writing speed in raw Markdown. Split mode displays code and rendered HTML side-by-side. Read mode delivers a distraction-free presentation layout.',
      whenToUse: 'Use Edit for rapid drafting, Split when formatting tables or equations, and Read when reviewing documents.',
      practicalExample: 'Switch to Split mode to verify complex markdown tables, quotes, and wiki link formatting while typing.',
      shortcut: 'Toolbar toggle (Edit / Split / Read)',
      selector: '.mode-btn',
      relatedFeatureIds: ['formatting-tools'],
      status: 'implemented'
    },
    {
      id: 'formatting-tools',
      name: 'Formatting Tools',
      icon: 'edit',
      category: 'Writing',
      shortDescription: 'One-click Markdown styling for headings, bold, italic, code blocks, checklists, and quotes.',
      detailedExplanation: 'The top editor toolbar provides instant markdown syntax insertion at your current cursor position, supporting bold, italics, H1/H2 headers, bullet lists, checkboxes, and inline code blocks.',
      whenToUse: 'Use when you want fast formatting without manually typing markdown punctuation symbols.',
      practicalExample: 'Select text and press Bold (or Ctrl+B) to emphasize key concepts, or click Checkbox to make action items.',
      shortcut: 'Ctrl + B (Bold), Ctrl + I (Italic)',
      selector: '.fmt-btn',
      relatedFeatureIds: ['editor-modes'],
      status: 'implemented'
    },
    {
      id: 'connect-note',
      name: 'Connect Note',
      icon: 'share-2',
      category: 'Connections',
      shortDescription: 'Establish explicit bidirectional semantic relationships between notes.',
      detailedExplanation: 'Create canonical semantic relationships between notes with typed links such as Relates To, Supports, Contradicts, Inspired By, Depends On, and References. Connected notes appear in both notes bottom tray and form visible edges in the Knowledge Graph.',
      whenToUse: 'Use to connect conceptual ideas, map architectural trade-offs, or relate research findings to product specs.',
      practicalExample: 'Connect "Distributed Consensus Note" to "Raft Implementation" with relationship "Supports".',
      shortcut: 'Connect Note button in toolbar and tray',
      selector: '#btn-vault-connect-note, #btn-tray-connect-note, #vault-connected-notes-list',
      relatedFeatureIds: ['connected-notes-backlinks', 'knowledge-graph'],
      status: 'implemented'
    },
    {
      id: 'connected-notes-backlinks',
      name: 'Connected Notes and Backlinks',
      icon: 'book-open',
      category: 'Connections',
      shortDescription: 'Track bi-directional wiki links and typed semantic relationships referencing this note.',
      detailedExplanation: 'The contextual bottom tray surfaces all active connections. Bi-directional backlinks show every note referencing this note through [[wikilinks]], while Connected Notes displays typed relationships with direct click-through navigation.',
      whenToUse: 'Use to navigate between related architectural notes and understand what other documents cite this concept.',
      practicalExample: 'Writing [[System Architecture]] in Note A instantly lists Note A under Bi-directional Backlinks in Note B.',
      shortcut: 'Type [[Note Title]] in editor',
      selector: '#vault-connected-notes-list, #backlinks-list, #vault-backlinks-tray',
      relatedFeatureIds: ['connect-note', 'unlinked-mentions', 'knowledge-graph'],
      status: 'implemented'
    },
    {
      id: 'unlinked-mentions',
      name: 'Unlinked Mentions',
      icon: 'file-search',
      category: 'Connections',
      shortDescription: 'Discover notes across your vault that mention this note title without explicit hyperlinks.',
      detailedExplanation: 'Unlinked Mentions continuously scans your entire Knowledge Vault for plain-text occurrences of your active note title. Each mention provides a one-click action to convert the reference into an active [[wikilink]].',
      whenToUse: 'Use to uncover serendipitous connections across your vault and weave isolated thoughts into a coherent knowledge web.',
      practicalExample: 'If another note mentions "Raft Protocol" in prose, Unlinked Mentions highlights it with a Link button.',
      shortcut: 'Inspected in the contextual bottom tray',
      selector: '#unlinked-list, #vault-backlinks-tray',
      relatedFeatureIds: ['connected-notes-backlinks', 'connect-note'],
      status: 'implemented'
    },
    {
      id: 'knowledge-graph',
      name: 'Knowledge Graph',
      icon: 'share-2',
      category: 'Visualization',
      shortDescription: 'Force-directed visual map of notes, projects, tasks, and semantic connection wires.',
      detailedExplanation: 'The Knowledge Graph renders every note as a node and every semantic relationship or wiki link as a connection wire. Nodes are colored by entity type and double-clicking any note node directly opens it in Knowledge Vault.',
      whenToUse: 'Use to visualize high-level knowledge clusters, detect isolated notes, and trace relationship pathways.',
      practicalExample: 'Open the Knowledge Graph from the sidebar to inspect clusters of connected architecture notes.',
      shortcut: 'Sidebar Knowledge Graph or G G in palette',
      selector: 'a[href="#/graph"]',
      relatedFeatureIds: ['connect-note', 'connected-notes-backlinks'],
      status: 'implemented'
    },
    {
      id: 'connected-tasks',
      name: 'Connected Tasks',
      icon: 'check-square',
      category: 'Execution',
      shortDescription: 'Bridge knowledge synthesis directly into actionable Workflow Tracker milestones.',
      detailedExplanation: 'Connect existing project tasks to your note or spawn new deliverables directly from your writing workflow. Tasks linked to notes are synchronized in the canonical entity ledger and can be opened in the Workflow Tracker.',
      whenToUse: 'Use when decisions in your notes require real-world execution, sprint planning, or team follow-up.',
      practicalExample: 'Click + Task in the bottom tray to attach "Implement Auth Middleware" directly to your security note.',
      shortcut: '+ Task button in bottom tray',
      selector: '#vault-connected-tasks-list, #btn-vault-add-task',
      relatedFeatureIds: ['connect-note'],
      status: 'implemented'
    }
  ];

  const VaultHelpCatalog = {
    getAllFeatures() {
      return [...featureCatalog];
    },

    getImplementedFeatures() {
      return featureCatalog.filter(f => f.status === 'implemented');
    },

    getCategories() {
      return ['Organization', 'Writing', 'Connections', 'Visualization', 'Execution'];
    },

    getFeaturesByCategory(category) {
      return featureCatalog.filter(f => f.category === category);
    },

    getFeature(id) {
      return featureCatalog.find(f => f.id === id) || null;
    },

    registerFeature(entry) {
      if (!entry || !entry.id) return;
      const idx = featureCatalog.findIndex(f => f.id === entry.id);
      if (idx >= 0) {
        featureCatalog[idx] = { ...featureCatalog[idx], ...entry };
      } else {
        featureCatalog.push(entry);
      }
    },

    showFeatureExplainer(featureId) {
      const feat = this.getFeature(featureId);
      if (!feat) return;

      const bodyHtml = `
        <div style="display: flex; flex-direction: column; gap: var(--space-4); font-size: var(--text-sm);">
          <div style="display: flex; align-items: center; gap: var(--space-3); padding-bottom: var(--space-3); border-bottom: 1px solid var(--border-primary);">
            <div style="width: 36px; height: 36px; border-radius: var(--radius-sm); background-color: var(--bg-tertiary); display: flex; align-items: center; justify-content: center; color: var(--accent-primary);">
              ${getIcon(feat.icon)}
            </div>
            <div>
              <div style="font-weight: 600; font-size: var(--text-md); color: var(--text-primary);">${feat.name}</div>
              <div class="text-xs text-secondary">${feat.category} &bull; <span class="badge badge--primary" style="font-size: 10px;">${feat.status}</span></div>
            </div>
          </div>

          <div>
            <div style="font-weight: 600; font-size: var(--text-xs); color: var(--text-tertiary); text-transform: uppercase; margin-bottom: 4px;">What It Does</div>
            <p class="text-secondary text-sm" style="margin: 0; line-height: 1.6;">${feat.detailedExplanation}</p>
          </div>

          <div style="background-color: var(--bg-tertiary); padding: var(--space-3); border-radius: var(--radius-sm); border: 1px solid var(--border-primary);">
            <div style="font-weight: 600; font-size: var(--text-xs); color: var(--text-primary); margin-bottom: 4px;">When To Use It</div>
            <p class="text-secondary text-xs" style="margin: 0; line-height: 1.5;">${feat.whenToUse}</p>
          </div>

          <div style="background-color: var(--bg-tertiary); padding: var(--space-3); border-radius: var(--radius-sm); border-left: 3px solid var(--accent-primary);">
            <div style="font-weight: 600; font-size: var(--text-xs); color: var(--text-primary); margin-bottom: 4px;">Practical Example</div>
            <p class="text-secondary text-xs" style="margin: 0; line-height: 1.5; font-style: italic;">"${feat.practicalExample}"</p>
          </div>

          ${feat.shortcut ? `
            <div style="display: flex; align-items: center; justify-content: space-between; font-size: var(--text-xs); color: var(--text-tertiary); padding-top: var(--space-2); border-top: 1px solid var(--border-primary);">
              <span>Shortcut or Access:</span>
              <code style="background: var(--bg-elevated); padding: 2px 6px; border-radius: 4px; color: var(--text-primary);">${feat.shortcut}</code>
            </div>
          ` : ''}

          ${feat.relatedFeatureIds && feat.relatedFeatureIds.length ? `
            <div style="padding-top: var(--space-2); border-top: 1px solid var(--border-primary); display: flex; align-items: center; flex-wrap: wrap; gap: 6px;">
              <span class="text-xs text-tertiary">Related Features:</span>
              ${feat.relatedFeatureIds.map(rId => {
                const rf = VaultHelpCatalog.getFeature(rId);
                return rf ? `<button class="badge btn-related-feature" data-id="${rf.id}" style="border: 1px solid var(--border-primary); background: var(--bg-tertiary); cursor: pointer; padding: 2px 8px; font-size: 11px; color: var(--text-primary);">${rf.name}</button>` : '';
              }).join('')}
            </div>
          ` : ''}
        </div>
      `;

      if (window.Modal) {
        window.Modal.open({
          title: `${feat.name} &bull; Guide`,
          content: bodyHtml,
          size: 'md',
          buttons: [
            {
              text: 'Close',
              variant: 'primary',
              onClick: (modal, inst) => {
                if (inst && inst.close) inst.close();
                else if (window.Modal && window.Modal.close) window.Modal.close();
              }
            }
          ]
        });

        // Bind related feature jump buttons
        document.querySelectorAll('.btn-related-feature').forEach(btn => {
          btn.addEventListener('click', () => {
            const relId = btn.getAttribute('data-id');
            if (window.Modal && window.Modal.close) window.Modal.close();
            setTimeout(() => {
              VaultHelpCatalog.showFeatureExplainer(relId);
            }, 100);
          });
        });
      }
    },

    openHelpMenu() {
      const features = this.getAllFeatures();
      const featureListHtml = features.map(f => `
        <div class="card vault-help-item-row" data-id="${f.id}" style="padding: var(--space-3); display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); cursor: pointer; background-color: var(--bg-tertiary); border: 1px solid var(--border-primary); margin-bottom: 6px; border-radius: var(--radius-sm); transition: border-color 150ms ease;">
          <div style="display: flex; align-items: center; gap: var(--space-3);">
            <span style="color: var(--accent-primary); display: flex;">${getIcon(f.icon)}</span>
            <div>
              <div style="font-weight: 600; font-size: var(--text-xs); color: var(--text-primary);">${f.name}</div>
              <div class="text-xs text-secondary" style="font-size: 11px;">${f.shortDescription}</div>
            </div>
          </div>
          <span style="font-size: 11px; color: var(--accent-primary); font-weight: 600;">Learn &rarr;</span>
        </div>
      `).join('');

      const menuHtml = `
        <div style="display: flex; flex-direction: column; gap: var(--space-4);">
          <!-- Top Tour Launcher Banner -->
          <div style="padding: var(--space-4); background-color: var(--bg-secondary); border-radius: var(--radius-sm); border: 1px solid var(--border-primary); display: flex; align-items: center; justify-content: space-between; gap: var(--space-3);">
            <div>
              <div style="font-weight: 600; font-size: var(--text-sm); color: var(--text-primary); margin-bottom: 2px;">Interactive Guided Tour</div>
              <div class="text-xs text-secondary">Step-by-step walkthrough of Knowledge Vault authoring, connections, and graph integration.</div>
            </div>
            <button class="btn btn--primary btn--sm" id="btn-modal-start-vault-tour" style="flex-shrink: 0;">
              ${getIcon('help-circle')} <span>Start Tour</span>
            </button>
          </div>

          <!-- Feature Explanations Section -->
          <div>
            <div style="font-size: var(--text-xs); font-weight: 600; text-transform: uppercase; color: var(--text-tertiary); margin-bottom: var(--space-2); letter-spacing: 0.04em;">
              Feature Explainers (Click to inspect)
            </div>
            <div style="max-height: 280px; overflow-y: auto; padding-right: 2px;">
              ${featureListHtml}
            </div>
          </div>
        </div>
      `;

      if (window.Modal) {
        window.Modal.open({
          title: 'Knowledge Vault Help & Tour Hub',
          content: menuHtml,
          size: 'md',
          buttons: [
            {
              text: 'Open Full Flowden Guide',
              variant: 'secondary',
              onClick: (modal, inst) => {
                if (inst && inst.close) inst.close();
                else if (window.Modal && window.Modal.close) window.Modal.close();
                if (window.Router) window.Router.navigate('/guide');
              }
            },
            {
              text: 'Explore Independently',
              variant: 'primary',
              onClick: (modal, inst) => {
                if (inst && inst.close) inst.close();
                else if (window.Modal && window.Modal.close) window.Modal.close();
              }
            }
          ]
        });

        // Bind interactive tour trigger
        const tourBtn = document.getElementById('btn-modal-start-vault-tour');
        if (tourBtn) {
          tourBtn.addEventListener('click', () => {
            if (window.Modal && window.Modal.close) window.Modal.close();
            if (window.FlowdenTour) {
              window.FlowdenTour.start('vault');
            }
          });
        }

        // Bind feature click to show detailed explainer
        document.querySelectorAll('.vault-help-item-row').forEach(row => {
          row.addEventListener('click', () => {
            const fId = row.getAttribute('data-id');
            if (window.Modal && window.Modal.close) window.Modal.close();
            setTimeout(() => {
              VaultHelpCatalog.showFeatureExplainer(fId);
            }, 100);
          });
        });
      }
    }
  };

  window.VaultHelpCatalog = VaultHelpCatalog;
  window.VaultHelp = VaultHelpCatalog;
})();
