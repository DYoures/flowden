# FLOWDEN — Design System Specification

> Minimalist · Modern · Premium · Knowledge-focused · Spatial

---

## 1. Color System

### 1.1 Dark Theme (Default)

```css
:root {
  /* Backgrounds */
  --bg-primary:       #1a1a2e;     /* Main content background */
  --bg-secondary:     #16162a;     /* Sidebar, panels */
  --bg-tertiary:      #222240;     /* Cards, elevated surfaces */
  --bg-hover:         #2a2a4a;     /* Hover state backgrounds */
  --bg-active:        #323258;     /* Active/selected state */
  --bg-input:         #1e1e38;     /* Input field backgrounds */
  --bg-overlay:       rgba(0, 0, 0, 0.6);  /* Modal overlay */

  /* Text */
  --text-primary:     #e8e8f0;     /* Main readable text */
  --text-secondary:   #a0a0b8;     /* Secondary, labels */
  --text-tertiary:    #6e6e8a;     /* Placeholders, disabled, hints */
  --text-inverse:     #1a1a2e;     /* Text on accent-colored backgrounds */

  /* Accent — Soft Violet */
  --accent-primary:   #7c5cbf;     /* Main accent color */
  --accent-hover:     #8f6fd4;     /* Accent hover state */
  --accent-active:    #6a4daa;     /* Accent active/pressed state */
  --accent-muted:     rgba(124, 92, 191, 0.10);  /* Accent tinted backgrounds */
  --accent-border:    rgba(124, 92, 191, 0.20);  /* Accent tinted borders */

  /* Borders */
  --border-primary:   #2e2e4a;     /* Default subtle borders */
  --border-secondary: #3a3a5a;     /* Emphasized borders */
  --border-focus:     #7c5cbf;     /* Focus ring color */

  /* Status Colors */
  --status-success:   #4caf7a;
  --status-success-bg: rgba(76, 175, 122, 0.10);
  --status-warning:   #e6a847;
  --status-warning-bg: rgba(230, 168, 71, 0.10);
  --status-error:     #e05555;
  --status-error-bg:  rgba(224, 85, 85, 0.10);
  --status-info:      #5b9bd5;
  --status-info-bg:   rgba(91, 155, 213, 0.10);

  /* Shadows */
  --shadow-sm:        0 1px 2px rgba(0, 0, 0, 0.3);
  --shadow-md:        0 4px 12px rgba(0, 0, 0, 0.4);
  --shadow-lg:        0 8px 24px rgba(0, 0, 0, 0.5);
  --shadow-focus:     0 0 0 2px var(--accent-muted);
}
```

### 1.2 Light Theme

```css
[data-theme="light"] {
  /* Backgrounds */
  --bg-primary:       #f8f8fc;
  --bg-secondary:     #ffffff;
  --bg-tertiary:      #f0f0f6;
  --bg-hover:         #e8e8f0;
  --bg-active:        #dcdce8;
  --bg-input:         #ffffff;
  --bg-overlay:       rgba(0, 0, 0, 0.4);

  /* Text */
  --text-primary:     #1a1a2e;
  --text-secondary:   #5a5a72;
  --text-tertiary:    #9090a8;
  --text-inverse:     #ffffff;

  /* Accent — slightly deeper for light backgrounds */
  --accent-primary:   #6b4cad;
  --accent-hover:     #7d5ec0;
  --accent-active:    #5c3f9a;
  --accent-muted:     rgba(107, 76, 173, 0.08);
  --accent-border:    rgba(107, 76, 173, 0.15);

  /* Borders */
  --border-primary:   #e0e0ea;
  --border-secondary: #d0d0dc;
  --border-focus:     #6b4cad;

  /* Status Colors (same hues, adjusted for light bg) */
  --status-success:   #3d9668;
  --status-success-bg: rgba(61, 150, 104, 0.08);
  --status-warning:   #c8922e;
  --status-warning-bg: rgba(200, 146, 46, 0.08);
  --status-error:     #cc4444;
  --status-error-bg:  rgba(204, 68, 68, 0.08);
  --status-info:      #4a87c0;
  --status-info-bg:   rgba(74, 135, 192, 0.08);

  /* Shadows */
  --shadow-sm:        0 1px 2px rgba(0, 0, 0, 0.06);
  --shadow-md:        0 4px 12px rgba(0, 0, 0, 0.08);
  --shadow-lg:        0 8px 24px rgba(0, 0, 0, 0.12);
  --shadow-focus:     0 0 0 2px var(--accent-muted);
}
```

### 1.3 Semantic / Functional Colors

#### Project Colors (8 options for user selection)

| Name | Dark Theme | Light Theme |
|---|---|---|
| Violet | `#7c5cbf` | `#6b4cad` |
| Blue | `#5b8fd9` | `#4a7cc4` |
| Teal | `#4db8a0` | `#3da08a` |
| Green | `#5dba6e` | `#4da05d` |
| Amber | `#dba54a` | `#c89230` |
| Orange | `#d97b4a` | `#c46a3a` |
| Rose | `#d45c7a` | `#c04a68` |
| Gray | `#8888a0` | `#707088` |

#### Priority Colors

| Priority | Color | Background |
|---|---|---|
| Low | `--text-tertiary` | transparent |
| Medium | `--status-info` | `--status-info-bg` |
| High | `--status-warning` | `--status-warning-bg` |
| Urgent | `--status-error` | `--status-error-bg` |

#### Task Status Colors

| Status | Color | Background |
|---|---|---|
| Planned | `--text-secondary` | `--bg-hover` |
| In Progress | `--status-info` | `--status-info-bg` |
| Done | `--status-success` | `--status-success-bg` |

---

## 2. Typography

### 2.1 Font Families

```css
:root {
  --font-sans:  'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-mono:  'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
}
```

Load from Google Fonts:
```html
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
```

### 2.2 Type Scale

| Token | Size | Line Height | Usage |
|---|---|---|---|
| `--text-xs` | 0.75rem (12px) | 1rem | Captions, badges, timestamps |
| `--text-sm` | 0.8125rem (13px) | 1.25rem | Sidebar items, secondary text, table data |
| `--text-base` | 0.875rem (14px) | 1.5rem | **Default body text** |
| `--text-md` | 1rem (16px) | 1.5rem | Emphasized body, card titles |
| `--text-lg` | 1.125rem (18px) | 1.75rem | Section headers |
| `--text-xl` | 1.5rem (24px) | 2rem | Page titles |
| `--text-2xl` | 2rem (32px) | 2.5rem | Display / hero text (rare) |

### 2.3 Font Weights

| Token | Weight | Usage |
|---|---|---|
| `--font-regular` | 400 | Body text, descriptions |
| `--font-medium` | 500 | Labels, sidebar items, button text |
| `--font-semibold` | 600 | Headings, card titles, emphasis |
| `--font-bold` | 700 | Rare — major headings only |

### 2.4 Letter Spacing

| Context | Value |
|---|---|
| Headings (xl, 2xl) | -0.01em |
| Body text | 0 (normal) |
| ALL-CAPS labels | 0.04em |

### 2.5 Paragraph & Reading

```css
.content-reading {
  max-width: 720px;
  line-height: 1.7;
  font-size: var(--text-base);
  color: var(--text-primary);
}
```

---

## 3. Spacing System

Base unit: **4px**

```css
:root {
  --space-0:   0;
  --space-1:   4px;
  --space-2:   8px;
  --space-3:   12px;
  --space-4:   16px;
  --space-5:   20px;
  --space-6:   24px;
  --space-8:   32px;
  --space-10:  40px;
  --space-12:  48px;
  --space-16:  64px;
  --space-20:  80px;
}
```

### Usage Guidelines

| Context | Spacing |
|---|---|
| Inside small components (buttons, inputs) | 4–8px |
| Inside cards | 12–16px |
| Between related items (list items, form fields) | 8–12px |
| Between sections on a page | 24–32px |
| Page edge padding | 24–32px |
| Sidebar internal padding | 12–16px |
| Modal internal padding | 24px |
| Between modal header/body/footer | 16–20px |

---

## 4. Border System

### Border Radius

```css
:root {
  --radius-sm:    4px;     /* Inputs, small interactive elements */
  --radius-md:    6px;     /* Cards, buttons, dropdowns */
  --radius-lg:    8px;     /* Modals, panels */
  --radius-xl:    12px;    /* Large containers (used sparingly) */
  --radius-full:  9999px;  /* Pills, avatars, circular elements */
}
```

> [!IMPORTANT]
> Do NOT use border-radius above 12px on structural containers. Excessive rounding looks unprofessional.

### Border Styles

- Default borders: `1px solid var(--border-primary)`
- Emphasized borders: `1px solid var(--border-secondary)`
- Focus borders: `1px solid var(--border-focus)` + `box-shadow: var(--shadow-focus)`
- Accent borders: `1px solid var(--accent-border)`
- No double borders, no dashed borders in the UI

---

## 5. Layout Specifications

### 5.1 App Shell

```
┌──────────────────────────────────────────────────────────────────┐
│  Topbar (48px height)                                            │
│  [☰ Toggle] [Breadcrumb        ] [Search] [Theme] [Avatar]      │
├────────────┬─────────────────────────────────────┬───────────────┤
│  Sidebar   │  Main Content Area                  │  Inspector    │
│  (240px    │  (fluid)                            │  (320px)      │
│   or 56px) │                                     │  (conditional)│
│            │                                     │               │
│  Nav items │                                     │               │
│  ...       │                                     │               │
│            │                                     │               │
│  [User]    │                                     │               │
└────────────┴─────────────────────────────────────┴───────────────┘
```

| Element | Measurement |
|---|---|
| Sidebar expanded | 240px |
| Sidebar collapsed | 56px |
| Sidebar transition | 200ms ease |
| Topbar height | 48px |
| Inspector panel | 320px |
| Inspector transition | 200ms ease |
| Main content | `calc(100vw - sidebar - inspector)` |
| Minimum main content | 600px before sidebar collapses |

### 5.2 Responsive Breakpoints

```css
:root {
  --bp-sm:   640px;    /* Mobile */
  --bp-md:   768px;    /* Tablet portrait */
  --bp-lg:   1024px;   /* Tablet landscape / small desktop */
  --bp-xl:   1280px;   /* Desktop */
  --bp-2xl:  1536px;   /* Large desktop */
}
```

| Breakpoint | Behavior |
|---|---|
| ≥ 1280px | Full layout: sidebar expanded + main + optional inspector |
| 1024–1279px | Sidebar collapsed by default, inspector overlays |
| 768–1023px | Sidebar as overlay (slide out), inspector as overlay |
| < 768px | Sidebar as full-screen menu, inspector as full-screen, simplified layout |

### 5.3 Scrollbar Styling

```css
/* Dark theme scrollbars */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: var(--border-secondary);
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
  background: var(--text-tertiary);
}
```

---

## 6. Component Specifications

### 6.1 Buttons

#### Variants

| Variant | Background | Text | Border | Hover |
|---|---|---|---|---|
| Primary | `--accent-primary` | `--text-inverse` | none | `--accent-hover` bg |
| Secondary | transparent | `--text-primary` | `--border-secondary` | `--bg-hover` bg |
| Ghost | transparent | `--text-secondary` | none | `--bg-hover` bg |
| Danger | transparent | `--status-error` | `--status-error` 30% | `--status-error-bg` bg |

#### Sizes

| Size | Height | Font | Padding (horizontal) | Icon size |
|---|---|---|---|---|
| Small | 28px | `--text-xs` | 8px | 14px |
| Medium | 36px | `--text-sm` | 12px | 16px |
| Large | 40px | `--text-base` | 16px | 18px |

#### States

```css
.btn {
  border-radius: var(--radius-md);
  font-weight: 500;
  cursor: pointer;
  transition: background 150ms ease, border-color 150ms ease, opacity 150ms ease;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  white-space: nowrap;
}
.btn:focus-visible {
  outline: 2px solid var(--border-focus);
  outline-offset: 2px;
}
.btn:disabled {
  opacity: 0.4;
  pointer-events: none;
}
```

#### Icon Buttons

Square aspect ratio. Same heights as standard button sizes. No text — just centered icon. Include `aria-label`.

### 6.2 Inputs

```css
.input {
  height: 36px;
  padding: 0 12px;
  background: var(--bg-input);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-size: var(--text-base);
  font-family: var(--font-sans);
  transition: border-color 150ms ease, box-shadow 150ms ease;
}
.input::placeholder {
  color: var(--text-tertiary);
}
.input:focus {
  border-color: var(--border-focus);
  box-shadow: var(--shadow-focus);
  outline: none;
}
.input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Compact variant */
.input--compact {
  height: 28px;
  padding: 0 8px;
  font-size: var(--text-sm);
}

/* Textarea */
.textarea {
  min-height: 80px;
  padding: 8px 12px;
  resize: vertical;
  line-height: 1.5;
}

/* Select */
.select {
  appearance: none;
  background-image: url("data:image/svg+xml,..."); /* chevron-down icon */
  background-repeat: no-repeat;
  background-position: right 10px center;
  padding-right: 32px;
}
```

### 6.3 Cards

```css
.card {
  background: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  transition: border-color 150ms ease;
}
.card:hover {
  border-color: var(--border-secondary);
}
.card--interactive {
  cursor: pointer;
}
.card--interactive:hover {
  border-color: var(--accent-border);
}
```

Card anatomy:
- **Header**: Title (text-md, semibold) + optional actions (icon buttons, right-aligned)
- **Body**: Content area (text-base, regular)
- **Footer**: Metadata/tags (text-xs, text-tertiary)
- **Divider**: `1px solid var(--border-primary)` between sections, with `margin: var(--space-3) 0`

### 6.4 Modals

```css
.modal-overlay {
  position: fixed;
  inset: 0;
  background: var(--bg-overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 150ms ease;
}
.modal {
  background: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-lg);
  width: 100%;
  max-height: 85vh;
  overflow-y: auto;
  animation: modalIn 150ms ease;
}
/* Sizes */
.modal--sm { max-width: 400px; }
.modal--md { max-width: 560px; }
.modal--lg { max-width: 720px; }

.modal-header {
  padding: var(--space-5) var(--space-6);
  border-bottom: 1px solid var(--border-primary);
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.modal-header h2 {
  font-size: var(--text-lg);
  font-weight: 600;
}
.modal-body {
  padding: var(--space-5) var(--space-6);
}
.modal-footer {
  padding: var(--space-4) var(--space-6);
  border-top: 1px solid var(--border-primary);
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}
```

Animations:
```css
@keyframes fadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes modalIn {
  from { opacity: 0; transform: scale(0.98); }
  to   { opacity: 1; transform: scale(1); }
}
```

### 6.5 Dropdowns

```css
.dropdown {
  background: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  padding: var(--space-1) 0;
  min-width: 180px;
  max-height: 280px;
  overflow-y: auto;
  z-index: 900;
  animation: dropdownIn 150ms ease;
}
.dropdown-item {
  height: 36px;
  padding: 0 var(--space-3);
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
  color: var(--text-secondary);
  cursor: pointer;
  transition: background 100ms ease;
}
.dropdown-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.dropdown-item--active {
  background: var(--bg-active);
  color: var(--accent-primary);
}
.dropdown-divider {
  height: 1px;
  background: var(--border-primary);
  margin: var(--space-1) 0;
}

@keyframes dropdownIn {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

### 6.6 Toast Notifications

```css
.toast-container {
  position: fixed;
  bottom: var(--space-6);
  right: var(--space-6);
  z-index: 1100;
  display: flex;
  flex-direction: column-reverse;
  gap: var(--space-2);
}
.toast {
  width: 360px;
  padding: var(--space-3) var(--space-4);
  background: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  animation: toastIn 200ms ease;
}
.toast--success { border-left: 3px solid var(--status-success); }
.toast--error   { border-left: 3px solid var(--status-error); }
.toast--warning { border-left: 3px solid var(--status-warning); }
.toast--info    { border-left: 3px solid var(--status-info); }

.toast-message {
  flex: 1;
  font-size: var(--text-sm);
  color: var(--text-primary);
}
.toast-close {
  color: var(--text-tertiary);
  cursor: pointer;
}

@keyframes toastIn {
  from { opacity: 0; transform: translateX(24px); }
  to   { opacity: 1; transform: translateX(0); }
}
```

Auto-dismiss: **4 seconds** default. Progress bar at bottom optional.

### 6.7 Navigation Items (Sidebar)

```css
.nav-item {
  height: 36px;
  padding: 0 var(--space-3);
  margin: 0 var(--space-2);
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--text-secondary);
  cursor: pointer;
  transition: background 150ms ease, color 150ms ease;
  position: relative;
}
.nav-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.nav-item--active {
  background: var(--bg-active);
  color: var(--accent-primary);
}
.nav-item--active::before {
  content: '';
  position: absolute;
  left: -8px;
  top: 6px;
  bottom: 6px;
  width: 3px;
  background: var(--accent-primary);
  border-radius: 2px;
}
.nav-item-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}
.nav-item-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

### 6.8 Tags / Pills

```css
.tag {
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 0 var(--space-2);
  border-radius: var(--radius-full);
  font-size: var(--text-xs);
  font-weight: 500;
  white-space: nowrap;
}
/* Generate per-color: background at 12% opacity, text at full */
.tag--violet  { background: rgba(124,92,191,0.12);  color: #7c5cbf; }
.tag--blue    { background: rgba(91,143,217,0.12);   color: #5b8fd9; }
.tag--teal    { background: rgba(77,184,160,0.12);   color: #4db8a0; }
.tag--green   { background: rgba(93,186,110,0.12);   color: #5dba6e; }
.tag--amber   { background: rgba(219,165,74,0.12);   color: #dba54a; }
.tag--orange  { background: rgba(217,123,74,0.12);   color: #d97b4a; }
.tag--rose    { background: rgba(212,92,122,0.12);   color: #d45c7a; }
.tag--gray    { background: rgba(136,136,160,0.12);  color: #8888a0; }
```

### 6.9 Empty States

```css
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-16) var(--space-8);
  text-align: center;
}
.empty-state-icon {
  width: 48px;
  height: 48px;
  color: var(--text-tertiary);
  margin-bottom: var(--space-4);
}
.empty-state-title {
  font-size: var(--text-md);
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: var(--space-2);
}
.empty-state-description {
  font-size: var(--text-sm);
  color: var(--text-tertiary);
  max-width: 360px;
  margin-bottom: var(--space-4);
}
```

No decorative illustrations. Use a simple, meaningful Lucide icon.

### 6.10 Loading States

```css
/* Skeleton screen */
.skeleton {
  background: var(--bg-hover);
  border-radius: var(--radius-sm);
  animation: skeletonPulse 1.5s ease-in-out infinite;
}
.skeleton--text   { height: 14px; width: 80%; }
.skeleton--title  { height: 20px; width: 60%; }
.skeleton--avatar { width: 32px; height: 32px; border-radius: var(--radius-full); }
.skeleton--card   { height: 120px; width: 100%; border-radius: var(--radius-md); }

@keyframes skeletonPulse {
  0%, 100% { opacity: 0.4; }
  50%      { opacity: 0.8; }
}

/* Spinner — use only for action confirmations */
.spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--border-primary);
  border-top-color: var(--accent-primary);
  border-radius: 50%;
  animation: spin 600ms linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
```

### 6.11 Command Palette

```css
.command-palette-overlay {
  /* same as modal overlay */
  align-items: flex-start;
  padding-top: 20vh;
}
.command-palette {
  width: 100%;
  max-width: 560px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-secondary);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}
.command-palette-input {
  width: 100%;
  height: 48px;
  padding: 0 var(--space-4);
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--border-primary);
  color: var(--text-primary);
  font-size: var(--text-md);
}
.command-palette-results {
  max-height: 320px;
  overflow-y: auto;
  padding: var(--space-1) 0;
}
.command-palette-item {
  height: 40px;
  padding: 0 var(--space-4);
  display: flex;
  align-items: center;
  gap: var(--space-3);
  font-size: var(--text-sm);
  color: var(--text-secondary);
  cursor: pointer;
}
.command-palette-item--focused {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.command-palette-item-shortcut {
  margin-left: auto;
  font-size: var(--text-xs);
  color: var(--text-tertiary);
  font-family: var(--font-mono);
}
```

Trigger: `Ctrl+K` / `Cmd+K`. Escape to close. Arrow keys to navigate. Enter to select.

### 6.12 Context Menu

```css
.context-menu {
  position: fixed;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  padding: var(--space-1) 0;
  min-width: 160px;
  z-index: 950;
}
/* Items same as dropdown items */
```

### 6.13 Breadcrumbs

```css
.breadcrumb {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--text-sm);
  color: var(--text-tertiary);
}
.breadcrumb-item {
  color: var(--text-tertiary);
  cursor: pointer;
}
.breadcrumb-item:hover {
  color: var(--text-secondary);
}
.breadcrumb-separator {
  color: var(--text-tertiary);
  font-size: var(--text-xs);
}
.breadcrumb-current {
  color: var(--text-primary);
  font-weight: 500;
}
```

### 6.14 Form Layout

```css
.form-group {
  margin-bottom: var(--space-5);
}
.form-label {
  display: block;
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: var(--space-1);
}
.form-hint {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
  margin-top: var(--space-1);
}
.form-error {
  font-size: var(--text-xs);
  color: var(--status-error);
  margin-top: var(--space-1);
}
```

---

## 7. Iconography

### Icon Library

**Lucide Icons** — <https://lucide.dev>

Consistent, minimal, professional line icons. Use inline SVG for flexibility.

### Icon Sizes

| Context | Size | Stroke Width |
|---|---|---|
| Inline with text | 16px | 1.5px |
| Sidebar navigation | 18px | 1.5px |
| Page headers | 20px | 1.5px |
| Empty states (small) | 24px | 1.5px |
| Empty states (large) | 48px | 1px |

### Icon Color

Icons inherit `color` from their parent element. Do not apply separate colors to icons unless needed for status indication.

### Key Icon Mappings

| Feature | Icon Name |
|---|---|
| Overview / Dashboard | `layout-dashboard` |
| Projects | `folder-kanban` |
| Workspace Board | `layout-grid` |
| Knowledge Vault | `book-open` |
| Knowledge Graph | `share-2` |
| Research Center | `file-search` |
| Workflow | `check-square` |
| Quick Capture | `inbox` |
| AI Assistant | `bot` |
| Guide / Help | `help-circle` |
| Settings | `settings` |
| Search | `search` |
| Theme toggle (dark) | `moon` |
| Theme toggle (light) | `sun` |
| Sidebar collapse | `panel-left-close` |
| Sidebar expand | `panel-left-open` |
| Create / Add | `plus` |
| More actions | `more-horizontal` |
| Close | `x` |
| Delete | `trash-2` |
| Edit | `pencil` |
| Connection / Link | `link` |
| Tag | `tag` |
| Pin | `pin` |
| Calendar | `calendar` |
| Clock | `clock` |
| Filter | `filter` |
| Sort | `arrow-up-down` |
| Folder | `folder` |
| Note | `file-text` |
| Task | `circle-check` |
| Image | `image` |
| External link | `external-link` |

---

## 8. Animation & Motion

### Principles

1. **Purposeful**: Every animation must serve a functional purpose (feedback, orientation, continuity)
2. **Brief**: Keep all transitions under 250ms
3. **Subtle**: Minimal transform distances (2–8px), minimal scale changes (0.98–1.0)
4. **Consistent**: Use the same easing and duration for similar interactions

### Timing Table

| Interaction | Duration | Easing |
|---|---|---|
| Button hover / press | 150ms | ease |
| Input focus | 150ms | ease |
| Card hover | 150ms | ease |
| Sidebar collapse/expand | 200ms | ease |
| Modal open/close | 150ms | ease |
| Dropdown open/close | 150ms | ease |
| Toast enter/exit | 200ms | ease |
| Inspector panel slide | 200ms | ease |
| Page content transition | none (instant swap with skeleton) |
| Canvas zoom/pan | 0ms (direct transform) |

### Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

### Prohibited Animations

- ❌ Bouncing / elastic / spring physics
- ❌ Parallax scrolling effects
- ❌ Particle effects
- ❌ Continuous background animations
- ❌ Auto-playing carousels or marquees
- ❌ Entrance animations on page load (except skeleton → content)
- ❌ Hover animations that shift layout

---

## 9. Accessibility

### Focus Management

- All interactive elements must receive focus via keyboard (Tab / Shift+Tab)
- Focus rings: `outline: 2px solid var(--border-focus); outline-offset: 2px;`
- Never remove focus outlines without providing an alternative
- Only show focus rings on keyboard navigation (`:focus-visible`)

### Color Contrast

- Body text on backgrounds: minimum **4.5:1** ratio
- Large text (18px+) on backgrounds: minimum **3:1** ratio
- Interactive elements: minimum **3:1** ratio

### ARIA

- Icon-only buttons: `aria-label="description"`
- Modals: `role="dialog"`, `aria-modal="true"`, `aria-labelledby`
- Navigation: `role="navigation"`, `aria-label`
- Toast notifications: `role="alert"`, `aria-live="polite"`
- Loading states: `aria-busy="true"`
- Expandable regions: `aria-expanded`

### Skip Navigation

```html
<a href="#main-content" class="skip-link">Skip to content</a>
```

```css
.skip-link {
  position: absolute;
  top: -100%;
  left: var(--space-4);
  padding: var(--space-2) var(--space-4);
  background: var(--accent-primary);
  color: var(--text-inverse);
  border-radius: var(--radius-sm);
  z-index: 9999;
}
.skip-link:focus {
  top: var(--space-4);
}
```

---

## 10. Anti-Patterns Checklist

Before any design implementation, verify **none** of these patterns are present:

| ❌ Anti-Pattern | ✅ Instead |
|---|---|
| Random decorative dot grids | Use dots only for real data (graph nodes) |
| Floating gradient blobs | Solid, flat backgrounds |
| Excessive neon glow | Subtle accent colors with controlled opacity |
| Gratuitous glassmorphism | Solid backgrounds with subtle borders |
| Decorative-only icons | Every icon accompanies a function |
| Heavily rounded containers (20px+) | Max 12px radius on containers |
| Generic "metric cards" with fake numbers | Show real data or honest empty states |
| Meaningless charts | Charts only when there's real data to show |
| Excessive animation | Brief, purposeful transitions only |
| AI-dashboard aesthetic | Clean, knowledge-focused, intentional design |

---

## 11. Grid & Alignment

### Page Layouts

Use **CSS Grid** for page-level layout:

```css
.page-layout {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-6);
  padding: var(--space-6);
}

/* Two-column layout (e.g., vault with sidebar) */
.page-layout--split {
  grid-template-columns: 280px 1fr;
  gap: var(--space-4);
}

/* Dashboard grid */
.page-layout--dashboard {
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--space-4);
}
```

### Component Internals

Use **Flexbox** for component layouts:
- Horizontal groups: `display: flex; align-items: center; gap: var(--space-2);`
- Vertical stacks: `display: flex; flex-direction: column; gap: var(--space-3);`

### Alignment Rules

- Text: left-aligned (LTR)
- Empty states: center-aligned
- Action buttons in cards: right-aligned
- Modal footer buttons: right-aligned
- Form labels: left-aligned above inputs
- Numbers / dates in tables: right-aligned

