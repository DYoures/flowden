// Flowden Interactive Guided Tour Engine
// Spotlight-overlay walkthrough with 9 core stages, page navigation, lifecycle synchronization, and persistence

(function () {
  'use strict';

  const STORAGE_KEY = 'flowden_tour_completed';
  const VAULT_STORAGE_KEY = 'flowden_vault_tour_completed';

  // 9 Essential Stages matching Flowden's Value Chain & Architecture
  const workspaceSteps = [
    {
      route: '/overview',
      target: 'a.nav-item[href="#/overview"], .sidebar-brand',
      title: '1. Overview Dashboard',
      content: 'Your centralized productivity cockpit. Track cross-project metrics, active workspaces, and use Quick Capture to record fleeting thoughts instantly.',
      placement: 'right'
    },
    {
      route: '/projects',
      target: 'a.nav-item[href="#/projects"], #btn-create-project',
      title: '2. Projects Hub',
      content: 'Create and organize isolated project workspaces with architectural decision logs (ADRs), blueprints, and cross-entity progress tracking.',
      placement: 'right'
    },
    {
      route: '/projects',
      target: '.project-card, #projects-grid, a.nav-item[href="#/projects"]',
      title: '3. Workspace Board',
      content: 'Freeform 2D infinite spatial canvas for visual ideation. Arrange modular cards, organize clusters, and wire ideas together with cubic bezier curves.',
      placement: 'bottom'
    },
    {
      route: '/vault',
      target: 'a.nav-item[href="#/vault"]',
      title: '4. Knowledge Vault',
      content: 'Markdown editor with resizable split panels, folder hierarchies, tags, internal [[Wiki Links]], bi-directional backlinks, and snapshot version history.',
      placement: 'right'
    },
    {
      route: '/graph',
      target: 'a.nav-item[href="#/graph"]',
      title: '5. Knowledge Graph',
      content: 'Force-directed knowledge network with customizable circular gradient themes (Ocean, Emerald, Sunset, Silver, Teal & Slate) and relationship paths.',
      placement: 'right'
    },
    {
      route: '/workflow',
      target: 'a.nav-item[href="#/workflow"]',
      title: '6. Workflow Tracker',
      content: 'Actionable execution engine offering Kanban drag-and-drop columns, sortable List view, and interactive monthly Calendar view.',
      placement: 'right'
    },
    {
      route: '/research',
      target: 'a.nav-item[href="#/research"]',
      title: '7. Research Center',
      content: 'Ingest research papers and literature across .PDF, .DOCX, .MD, and .TXT formats with automated full-text extraction and source indexing.',
      placement: 'right'
    },
    {
      route: '/assistant',
      target: 'a.nav-item[href="#/assistant"]',
      title: '8. AI Assistant & MCP',
      content: 'Chat interface with Model Context Protocol (MCP) primitives for contextual search, knowledge retrieval, and workspace automation.',
      placement: 'right'
    },
    {
      route: '/guide',
      target: 'a.nav-item[href="#/guide"], #btn-start-interactive-tour',
      title: '9. Flowden Guide',
      content: 'Comprehensive documentation, feature library, shortcuts, and philosophy. You can restart this interactive walkthrough anytime from here!',
      placement: 'right'
    }
  ];

  // 8 Dedicated Stages for Knowledge Vault 2.0 Tour
  const vaultSteps = [
    {
      route: '/vault',
      target: '#vault-notes-list, #vault-nav-pane, a.nav-item[href="#/vault"]',
      title: '1. Note List and Folders',
      content: 'Organize knowledge with custom folder hierarchies and tag filters. Click any note to open it, or create new folders to structure domains.',
      placement: 'right'
    },
    {
      route: '/vault',
      target: '.mode-btn, .vault-mode-btn, #vault-editor-active',
      title: '2. Editor layout and current Edit, Split, Read modes',
      content: 'Switch between distraction-free raw Markdown editing, split view with live side-by-side rendering, and a clean reading presentation mode.',
      placement: 'bottom'
    },
    {
      route: '/vault',
      target: '#vault-formatting-bar, .fmt-btn, #vault-editor-active',
      title: '3. Existing Formatting Tools',
      content: 'One-click Markdown styling for headings, bold, italic, code blocks, task checkboxes, bullet lists, and wiki links.',
      placement: 'bottom'
    },
    {
      route: '/vault',
      target: '#btn-vault-connect-note, #btn-tray-connect-note, #vault-editor-col',
      title: '4. Connect Note',
      content: 'Create explicit semantic relationships between notes with typed links like Relates To, Supports, Contradicts, Inspired By, and Depends On.',
      placement: 'top'
    },
    {
      route: '/vault',
      target: '#vault-connected-notes-list, #backlinks-list, #tab-btn-connections, #vault-inspector-pane',
      title: '5. Connected Notes and Backlinks',
      content: 'Track bi-directional links referencing this note and inspect typed relationships with other vault notes.',
      placement: 'left'
    },
    {
      route: '/vault',
      target: '#unlinked-list, #tab-btn-connections, #vault-inspector-pane',
      title: '6. Unlinked Mentions',
      content: 'Discover unlinked text mentions across your entire Knowledge Vault and convert passive references into active hyperlinks.',
      placement: 'left'
    },
    {
      route: '/graph',
      target: 'a.nav-item[href="#/graph"], #graph-container',
      title: '7. Knowledge Graph',
      content: 'Visualize all your notes and semantic connection wires as an interactive force-directed graph with customizable themes and direct node navigation.',
      placement: 'right'
    },
    {
      route: '/vault',
      target: '#vault-connected-tasks-list, #btn-vault-add-task, #tab-btn-connections, #vault-inspector-pane',
      title: '8. Connected Tasks',
      content: 'Bridge ideas into execution by attaching Workflow Tracker tasks or creating new deliverables directly from your active note.',
      placement: 'left'
    }
  ];

  let currentTourType = 'workspace';
  let activeSteps = workspaceSteps;
  let currentStorageKey = STORAGE_KEY;
  let steps = workspaceSteps;

  let currentIdx = 0;
  let overlayEl = null;
  let isActive = false;
  let isTransitioning = false;

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function getTransitionDuration() {
    return prefersReducedMotion() ? '0ms' : '220ms';
  }

  function isElementVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).visibility !== 'hidden';
  }

  // Resolves immediately when target is present and measured, avoiding arbitrary fixed delays
  function waitForTarget(selector, timeoutMs = 1500) {
    return new Promise((resolve) => {
      const existing = document.querySelector(selector);
      if (existing && isElementVisible(existing)) {
        return resolve(existing);
      }

      let timeoutId = null;
      const observer = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el && isElementVisible(el)) {
          cleanup();
          resolve(el);
        }
      });

      function cleanup() {
        if (timeoutId) clearTimeout(timeoutId);
        observer.disconnect();
      }

      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class', 'hidden']
      });

      timeoutId = setTimeout(() => {
        cleanup();
        resolve(document.querySelector(selector));
      }, timeoutMs);
    });
  }

  function buildOverlay() {
    const existing = document.getElementById('flowden-tour-overlay');
    if (existing) existing.remove();

    const el = document.createElement('div');
    el.id = 'flowden-tour-overlay';
    el.style.display = 'none';
    el.style.opacity = '0';
    el.innerHTML = `
      <div class="tour-backdrop" id="tour-backdrop"></div>
      <div class="tour-spotlight" id="tour-spotlight" style="opacity: 0;"></div>
      <div class="tour-card" id="tour-card" role="dialog" aria-modal="true" aria-labelledby="tour-title" style="opacity: 0; pointer-events: none;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-2);">
          <span class="badge badge--primary" id="tour-step-counter" style="font-size: 10px;"></span>
          <button class="btn btn--ghost btn--sm btn--icon tour-close-x" style="height: 24px; width: 24px; min-width: 24px;" title="Exit tour" aria-label="Close tour"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>
        </div>
        <h3 id="tour-title" style="font-size: var(--text-md); font-weight: 600; margin-bottom: var(--space-2); color: var(--text-primary);"></h3>
        <p id="tour-body" class="text-sm text-secondary" style="line-height: 1.55; margin-bottom: var(--space-4);"></p>
        <div class="tour-progress-bar" style="height: 3px; background: var(--bg-hover); border-radius: 2px; margin-bottom: var(--space-3); overflow: hidden;">
          <div id="tour-progress-fill" style="height: 100%; background: var(--accent-primary); border-radius: 2px; transition: width 220ms ease;"></div>
        </div>
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <button class="btn btn--ghost btn--sm" id="btn-tour-skip">Skip Tour</button>
          <div style="display: flex; gap: var(--space-2);">
            <button class="btn btn--secondary btn--sm" id="btn-tour-prev">Back</button>
            <button class="btn btn--primary btn--sm" id="btn-tour-next">Next</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(el);

    el.querySelector('.tour-close-x').addEventListener('click', endTour);
    el.querySelector('#btn-tour-skip').addEventListener('click', endTour);
    el.querySelector('#btn-tour-prev').addEventListener('click', goPrev);
    el.querySelector('#btn-tour-next').addEventListener('click', goNext);

    return el;
  }

  function goNext() {
    if (isTransitioning) return;
    if (currentIdx < steps.length - 1) {
      currentIdx++;
      navigateAndShow(currentIdx);
    } else {
      completeTour();
    }
  }

  function goPrev() {
    if (isTransitioning) return;
    if (currentIdx > 0) {
      currentIdx--;
      navigateAndShow(currentIdx);
    }
  }

  async function navigateAndShow(idx) {
    if (!isActive) return;
    isTransitioning = true;
    const step = steps[idx];
    const currentHash = window.location.hash.replace('#', '');
    const isVaultSubroute = step.route === '/vault' && currentHash.startsWith('/vault');
    const needsNavigation = step.route && currentHash !== step.route && !isVaultSubroute;

    const spotlight = document.getElementById('tour-spotlight');
    const card = document.getElementById('tour-card');

    if (needsNavigation) {
      // Instantly fade out previous highlight & card to prevent stale outlines on page change
      if (spotlight) {
        spotlight.style.opacity = '0';
      }
      if (card) {
        card.style.opacity = '0';
        card.style.pointerEvents = 'none';
      }

      // Synchronize with the router's page rendering lifecycle
      const routeDonePromise = new Promise((resolve) => {
        const onRoute = () => {
          window.removeEventListener('flowden:route-changed', onRoute);
          resolve();
        };
        window.addEventListener('flowden:route-changed', onRoute);
        // Fallback safety timeout if already routed
        setTimeout(resolve, 350);
      });

      window.Router.navigate(step.route);
      await routeDonePromise;
    }

    // When touring Vault, ensure an active note is open so all editor elements exist
    if (step.route === '/vault') {
      const activeView = document.getElementById('vault-editor-active');
      if (activeView && (activeView.style.display === 'none' || !activeView.offsetParent)) {
        const firstNote = document.querySelector('.vault-note-item');
        if (firstNote) {
          firstNote.click();
          await new Promise(r => setTimeout(r, 150));
        }
      }

      // If step targets connections, backlinks, or tasks, ensure connections tab and inspector are open
      if (step.target.includes('connections') || step.target.includes('backlinks') || step.target.includes('unlinked') || step.target.includes('tasks')) {
        const inspector = document.getElementById('vault-inspector-pane');
        if (inspector) inspector.style.display = 'flex';
        const connTab = document.getElementById('tab-btn-connections');
        if (connTab) connTab.click();
      }
    }

    // Wait until destination target element is ready in the DOM
    const targetEl = await waitForTarget(step.target, 800);
    showStep(idx, targetEl);
    isTransitioning = false;
  }

  function showStep(idx, targetEl) {
    if (!isActive) return;
    const step = steps[idx];
    const spotlight = document.getElementById('tour-spotlight');
    const card = document.getElementById('tour-card');
    const titleEl = document.getElementById('tour-title');
    const bodyEl = document.getElementById('tour-body');
    const counterEl = document.getElementById('tour-step-counter');
    const prevBtn = document.getElementById('btn-tour-prev');
    const nextBtn = document.getElementById('btn-tour-next');
    const progressFill = document.getElementById('tour-progress-fill');

    if (!spotlight || !card || !overlayEl) return;

    // Reveal overlay wrapper
    overlayEl.style.display = 'block';
    overlayEl.style.opacity = '1';

    // Update text content
    titleEl.textContent = step.title;
    bodyEl.textContent = step.content;
    counterEl.textContent = `Step ${idx + 1} of ${steps.length}`;
    progressFill.style.width = `${((idx + 1) / steps.length) * 100}%`;

    prevBtn.disabled = idx === 0;
    prevBtn.style.visibility = idx === 0 ? 'hidden' : 'visible';
    nextBtn.textContent = idx === steps.length - 1 ? 'Finish' : 'Next';

    const dur = getTransitionDuration();
    spotlight.style.transitionDuration = dur;
    card.style.transitionDuration = dur;

    if (!targetEl) {
      spotlight.style.opacity = '0';
      card.style.left = `${Math.max(16, (window.innerWidth - 340) / 2)}px`;
      card.style.top = `${Math.max(16, (window.innerHeight - 260) / 2)}px`;
      card.style.opacity = '1';
      card.style.pointerEvents = 'auto';
      return;
    }

    targetEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });

    // Pre-calculate target rectangle and position before making spotlight and card visible
    const rect = targetEl.getBoundingClientRect();
    const pad = 6;

    spotlight.style.top = `${rect.top - pad}px`;
    spotlight.style.left = `${rect.left - pad}px`;
    spotlight.style.width = `${rect.width + pad * 2}px`;
    spotlight.style.height = `${rect.height + pad * 2}px`;

    positionCard(card, rect, step.placement);

    // Smoothly reveal with zero initial positioning glitch
    requestAnimationFrame(() => {
      spotlight.style.opacity = '1';
      card.style.opacity = '1';
      card.style.pointerEvents = 'auto';
    });
  }

  function positionCard(card, targetRect, placement) {
    const cardW = 320;
    const cardH = card.offsetHeight || 240;
    const gap = 14;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left, top;

    switch (placement) {
      case 'right':
        left = targetRect.right + gap;
        top = targetRect.top;
        if (left + cardW > vw - 16) {
          left = Math.max(16, targetRect.left);
          top = targetRect.bottom + gap;
        }
        break;
      case 'bottom':
        left = targetRect.left;
        top = targetRect.bottom + gap;
        if (targetRect.width > cardW) {
          left = targetRect.left + (targetRect.width - cardW) / 2;
        }
        break;
      case 'left':
        left = targetRect.left - cardW - gap;
        top = targetRect.top;
        if (left < 16) {
          left = targetRect.right + gap;
        }
        break;
      case 'top':
        left = targetRect.left;
        top = targetRect.top - cardH - gap;
        if (top < 16) {
          top = targetRect.bottom + gap;
        }
        break;
      default:
        left = targetRect.right + gap;
        top = targetRect.top;
    }

    left = Math.max(16, Math.min(left, vw - cardW - 16));
    top = Math.max(16, Math.min(top, vh - cardH - 16));

    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
  }

  function handleResize() {
    if (isActive) {
      const step = steps[currentIdx];
      const targetEl = document.querySelector(step.target);
      showStep(currentIdx, targetEl);
    }
  }

  function handleKeyDown(e) {
    if (!isActive) return;
    if (e.key === 'Escape') {
      endTour();
    } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
      e.preventDefault();
      goNext();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      goPrev();
    }
  }

  function start(tourType = 'workspace') {
    if (isActive) return;
    isActive = true;
    currentTourType = tourType;
    if (tourType === 'vault') {
      steps = vaultSteps;
      currentStorageKey = VAULT_STORAGE_KEY;
    } else {
      steps = workspaceSteps;
      currentStorageKey = STORAGE_KEY;
    }
    currentIdx = 0;
    overlayEl = buildOverlay();
    navigateAndShow(0);

    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleResize);
  }

  function endTour() {
    isActive = false;
    isTransitioning = false;
    if (overlayEl) {
      overlayEl.style.opacity = '0';
      overlayEl.remove();
      overlayEl = null;
    }
    document.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('resize', handleResize);
  }

  function completeTour() {
    const wasVault = currentTourType === 'vault';
    endTour();
    localStorage.setItem(currentStorageKey, 'true');

    // Update button in Guide page if currently rendered
    const tourBtn = document.getElementById('btn-start-interactive-tour');
    if (tourBtn && !wasVault) {
      const getIcon = window.FlowdenIcons ? window.FlowdenIcons.getIcon : () => '';
      tourBtn.innerHTML = `${getIcon('help-circle')} <span>Restart Interactive Tour</span>`;
    }

    if (window.showToast) {
      if (wasVault) {
        window.showToast('Knowledge Vault tour completed. You can revisit it from Help anytime.', 'success');
      } else {
        window.showToast('You completed the Flowden tour. You can restart it from the Guide page anytime.', 'success');
      }
    }
  }

  function resetCompletion(tourType = 'workspace') {
    if (tourType === 'vault') {
      localStorage.removeItem(VAULT_STORAGE_KEY);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  window.FlowdenTour = {
    start: start,
    startVaultTour: () => start('vault'),
    endTour: endTour,
    reset: resetCompletion,
    isCompleted: (type = 'workspace') => (type === 'vault' ? localStorage.getItem(VAULT_STORAGE_KEY) === 'true' : localStorage.getItem(STORAGE_KEY) === 'true'),
    isVaultTourCompleted: () => localStorage.getItem(VAULT_STORAGE_KEY) === 'true',
    isActive: () => isActive,
    getStepsCount: () => steps.length,
    getTourType: () => currentTourType
  };
})();
