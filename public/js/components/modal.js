// Flowden Modal System

const Modal = {
  currentModal: null,

  open({ title, content, size = 'md', buttons = [], onOpen = null }) {
    this.close();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    const modal = document.createElement('div');
    modal.className = `modal modal--${size}`;

    const iconX = window.FlowdenIcons ? window.FlowdenIcons.getIcon('x') : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';

    modal.innerHTML = `
      <div class="modal-header">
        <h2 class="modal-title">${title}</h2>
        <button class="btn btn--ghost btn--icon btn--sm modal-close-btn" aria-label="Close modal">
          ${iconX}
        </button>
      </div>
      <div class="modal-body"></div>
      <div class="modal-footer"></div>
    `;

    const bodyEl = modal.querySelector('.modal-body');
    if (typeof content === 'string') {
      bodyEl.innerHTML = content;
    } else if (content instanceof HTMLElement) {
      bodyEl.appendChild(content);
    }

    const footerEl = modal.querySelector('.modal-footer');
    if (buttons && buttons.length > 0) {
      buttons.forEach(btnConfig => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `btn btn--${btnConfig.variant || 'secondary'} btn--md ${btnConfig.class || ''}`;
        btn.textContent = btnConfig.text;
        if (btnConfig.id) btn.id = btnConfig.id;
        if (btnConfig.disabled) btn.disabled = true;
        btn.addEventListener('click', () => {
          if (btnConfig.onClick) {
            btnConfig.onClick(modal, this);
          } else {
            this.close();
          }
        });
        footerEl.appendChild(btn);
      });
    } else {
      footerEl.style.display = 'none';
    }

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Event listeners
    const closeBtn = modal.querySelector('.modal-close-btn');
    closeBtn.addEventListener('click', () => this.close());

    // Make modal draggable by header
    const headerEl = modal.querySelector('.modal-header');
    if (headerEl) {
      headerEl.style.cursor = 'grab';
      headerEl.title = 'Drag to move window';
      headerEl.addEventListener('mousedown', (e) => {
        if (e.target.closest('.modal-close-btn') || e.button !== 0) return;
        e.preventDefault();
        headerEl.style.cursor = 'grabbing';
        document.body.style.userSelect = 'none';

        const rect = modal.getBoundingClientRect();
        modal.style.position = 'fixed';
        modal.style.margin = '0';
        modal.style.left = `${rect.left}px`;
        modal.style.top = `${rect.top}px`;

        const startX = e.clientX;
        const startY = e.clientY;
        const initLeft = rect.left;
        const initTop = rect.top;

        const onMove = (ev) => {
          const deltaX = ev.clientX - startX;
          const deltaY = ev.clientY - startY;
          const newLeft = Math.max(10, Math.min(window.innerWidth - modal.offsetWidth - 10, initLeft + deltaX));
          const newTop = Math.max(10, Math.min(window.innerHeight - modal.offsetHeight - 10, initTop + deltaY));
          modal.style.left = `${newLeft}px`;
          modal.style.top = `${newTop}px`;
        };

        const onUp = () => {
          headerEl.style.cursor = 'grab';
          document.body.style.userSelect = '';
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      });
    }

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.close();
    });

    const escHandler = (e) => {
      if (e.key === 'Escape') {
        this.close();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);

    this.currentModal = overlay;

    if (onOpen) onOpen(modal);

    return modal;
  },

  close() {
    if (this.currentModal && this.currentModal.parentElement) {
      this.currentModal.remove();
      this.currentModal = null;
    }
  },

  confirm({ title = 'Confirm Action', message, confirmText = 'Confirm', danger = false, onConfirm }) {
    return this.open({
      title,
      size: 'sm',
      content: `<p class="text-secondary" style="margin-top: 4px;">${message}</p>`,
      buttons: [
        {
          text: 'Cancel',
          variant: 'ghost',
          onClick: () => this.close()
        },
        {
          text: confirmText,
          variant: danger ? 'danger' : 'primary',
          onClick: async () => {
            this.close();
            if (onConfirm) await onConfirm();
          }
        }
      ]
    });
  }
};

if (typeof window !== 'undefined') {
  window.Modal = Modal;
}

