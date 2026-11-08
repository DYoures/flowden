// Flowden Contextual Inspector Lifecycle Manager
// Prevents cross-page state leakage and manages lifecycle hooks

(function() {
  let currentOwner = null;
  let currentOnClose = null;

  function getElements() {
    return {
      panel: document.getElementById('app-inspector'),
      body: document.getElementById('inspector-body'),
      title: document.querySelector('.inspector-title'),
      closeBtn: document.getElementById('inspector-close-btn')
    };
  }

  const defaultContent = '<span class="text-xs text-tertiary">Select an item on the board or graph to inspect properties and connections.</span>';

  const Inspector = {
    get currentOwner() {
      return currentOwner;
    },

    isOpen() {
      const { panel } = getElements();
      return panel ? panel.classList.contains('inspector--open') : false;
    },

    open({ owner, title, content, onMount, onClose }) {
      const { panel, body, title: titleEl } = getElements();
      if (!panel || !body) return;

      currentOwner = owner || 'generic';
      currentOnClose = onClose || null;

      if (titleEl) {
        titleEl.textContent = title || 'Inspector';
      }

      if (typeof content === 'string') {
        body.innerHTML = content;
      } else if (content instanceof HTMLElement) {
        body.innerHTML = '';
        body.appendChild(content);
      }

      panel.classList.add('inspector--open');

      if (typeof onMount === 'function') {
        onMount(body);
      }
    },

    close(owner) {
      // If owner provided, only close if currently owned by that owner
      if (owner && currentOwner && currentOwner !== owner) {
        return;
      }

      const { panel, body, title: titleEl } = getElements();
      if (panel) {
        panel.classList.remove('inspector--open');
      }

      const prevClose = currentOnClose;
      currentOwner = null;
      currentOnClose = null;

      if (typeof prevClose === 'function') {
        try { prevClose(); } catch (e) { console.error('[Inspector] onClose error:', e); }
      }

      // Reset content to default placeholder so it never leaks to other views
      if (body) {
        body.innerHTML = defaultContent;
      }
      if (titleEl) {
        titleEl.textContent = 'Inspector';
      }
    },

    // Called automatically by Router on ANY navigation
    resetOnNavigation(toPattern) {
      if (!currentOwner) {
        // Ensure panel is closed and clean if no owner
        const { panel, body, title: titleEl } = getElements();
        if (panel && panel.classList.contains('inspector--open')) {
          panel.classList.remove('inspector--open');
        }
        if (body && !body.innerHTML.includes('Select an item')) {
          body.innerHTML = defaultContent;
        }
        if (titleEl) titleEl.textContent = 'Inspector';
        return;
      }

      // Allow keeping open ONLY if new route matches the current owner
      const isSameOwner = 
        (currentOwner === 'graph' && toPattern === '#/graph') ||
        (currentOwner === 'board' && toPattern.includes('/board'));

      if (!isSameOwner) {
        this.close();
      }
    },

    init() {
      const { closeBtn } = getElements();
      if (closeBtn) {
        closeBtn.onclick = () => {
          this.close();
        };
      }
    }
  };

  window.Inspector = Inspector;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => Inspector.init());
  } else {
    Inspector.init();
  }
})();

