// Flowden Dropdown System

const Dropdown = {
  activeDropdown: null,

  open(triggerEl, items = []) {
    this.close();

    const dropdown = document.createElement('div');
    dropdown.className = 'dropdown';

    items.forEach(item => {
      if (item.type === 'divider') {
        const div = document.createElement('div');
        div.className = 'dropdown-divider';
        dropdown.appendChild(div);
        return;
      }

      const itemEl = document.createElement('div');
      itemEl.className = `dropdown-item ${item.active ? 'dropdown-item--active' : ''}`;

      let iconHtml = '';
      if (item.icon && window.FlowdenIcons) {
        iconHtml = window.FlowdenIcons.getIcon(item.icon);
      }

      itemEl.innerHTML = `
        ${iconHtml}
        <span>${item.label}</span>
      `;

      itemEl.addEventListener('click', (e) => {
        e.stopPropagation();
        this.close();
        if (item.onClick) item.onClick();
      });

      dropdown.appendChild(itemEl);
    });

    document.body.appendChild(dropdown);

    // Position dropdown below trigger
    const rect = triggerEl.getBoundingClientRect();
    const dropdownHeight = dropdown.offsetHeight || 150;
    const fitsBelow = rect.bottom + dropdownHeight <= window.innerHeight;

    dropdown.style.left = `${Math.min(rect.left, window.innerWidth - dropdown.offsetWidth - 16)}px`;
    if (fitsBelow) {
      dropdown.style.top = `${rect.bottom + 6}px`;
    } else {
      dropdown.style.top = `${rect.top - dropdownHeight - 6}px`;
    }

    const clickOutsideHandler = (e) => {
      if (!dropdown.contains(e.target) && !triggerEl.contains(e.target)) {
        this.close();
        document.removeEventListener('click', clickOutsideHandler);
      }
    };

    setTimeout(() => {
      document.addEventListener('click', clickOutsideHandler);
    }, 10);

    this.activeDropdown = dropdown;
  },

  close() {
    if (this.activeDropdown && this.activeDropdown.parentElement) {
      this.activeDropdown.remove();
      this.activeDropdown = null;
    }
  }
};

if (typeof window !== 'undefined') {
  window.Dropdown = Dropdown;
}

