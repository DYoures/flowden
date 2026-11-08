// Flowden Toast Notification Component

function showToast(message, type = 'info', duration = 4000) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.setAttribute('role', 'alert');

  toast.innerHTML = `
    <div class="toast-message">${message}</div>
    <button class="toast-close" aria-label="Close notification">
      ${window.FlowdenIcons ? window.FlowdenIcons.getIcon('x') : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>'}
    </button>
  `;

  const closeBtn = toast.querySelector('.toast-close');
  closeBtn.addEventListener('click', () => {
    toast.remove();
  });

  container.appendChild(toast);

  if (duration > 0) {
    setTimeout(() => {
      if (toast.parentElement) {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(20px)';
        toast.style.transition = 'all 150ms ease';
        setTimeout(() => toast.remove(), 150);
      }
    }, duration);
  }

  return toast;
}

if (typeof window !== 'undefined') {
  window.showToast = showToast;
}

