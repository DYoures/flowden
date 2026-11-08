# FLOWDEN — WHITE MODE VISUAL & ARCHITECTURAL AUDIT (v1.0)
## Phase 1: Ivory & Champagne Gold Theme Discovery

- **Audit Date**: November 8, 2026
- **Auditor**: Senior Product Designer & Frontend Architecture Team
- **Scope**: Entire Flowden Light Theme (`[data-theme="light"]`)
- **Execution Mode**: 100% Read-Only Inspection (Zero code mutations)
- **Target Direction**: Ivory White (`#FBFAF7`) · Champagne Gold (`#C5A15B`) · Warm Neutrals (`#F6F3EC`) · Charcoal Typography (`#20211F`)

---

## 1. Executive Summary

Flowden's current White Mode uses an off-white background (`#F4F2EC`), a dull grey-tan surface (`#EAE6DC`), and a dominant dark teal/green accent (`#2B8670` with hover `#379E85`). While this colorway was originally intended to mirror the brand's dark-mode charcoal and muted teal palette, real browser inspection reveals significant visual and ergonomic deficiencies:

1. **Inverted and Muddy Surface Hierarchy**: The application shell (sidebar and topbar) is pure white (`#FFFFFF`), while the main content canvas is beige (`#F4F2EC`), and interactive card containers are rendered in a heavy greyish-tan (`#EAE6DC`). Instead of elevated cards floating cleanly above the canvas, cards feel recessed, muddy, and visually fatigued.
2. **Aggressive Green Accent Dominance**: Green is used indiscriminately across primary action buttons, active navigation markers, quick capture triggers, editor toggle states, inline WikiLink tags, and project pills. This over-indexes on functional green and dilutes true semantic status indicators (such as success, active, and completed).
3. **Accessibility & Contrast Violations**:
   - The current light primary button (`#2B8670` with white text `#FFFFFF`) provides a contrast ratio of **4.42:1**, narrowly failing the WCAG 2.1 AA requirement of 4.5:1 for body-sized text.
   - White text on the proposed primary champagne gold (`#C5A15B`) yields an unreadable **2.44:1** (severe failure). Gold buttons **must** employ charcoal typography (`#20211F`, achieving **6.64:1**, passing WCAG AA/AAA).
4. **Dark-Mode Artifact Leakage**: The recently redesigned AI Assistant sticky navigation bar (`#assistant-sticky-nav`) hardcodes a dark charcoal container (`#191D20`), jarringly contrasting against the surrounding White Mode layout.
5. **Branding Asset Geometry**: The light mode mark asset (`flowden-mark-light.png`) is an opaque JPEG file relying on CSS `mix-blend-mode: multiply` against white surfaces, and dark mode artificially inverts this asset with `filter: invert(1) hue-rotate(180deg)`. The canonical mark geometry is cleanly defined in `public/assets/favicon.svg` and can be adapted into a dedicated Champagne Gold vector asset.

---

## 2. Inspected Surfaces & Screenshot Inventory

All 17 desktop views (1440 × 950) and 3 mobile viewports (375 × 812) were rendered, inspected, and captured using real Google Chrome via Chrome DevTools Protocol (CDP) connected to a live Flowden instance populated with multi-entity research data.

All screenshots are persisted in the conversation artifact directory:  
`C:\Users\Sod\.gemini\antigravity\brain\68479ba4-03f1-440c-b547-3fd8f104b533\`

| View / Page | Viewport | Screenshot Link | Key Visual Observations |
| :--- | :--- | :--- | :--- |
| **Main Dashboard / Overview** | Desktop (1440 × 950) | [white_mode_overview.png](file:///C:/Users/Sod/.gemini/antigravity/brain/68479ba4-03f1-440c-b547-3fd8f104b533/white_mode_overview.png) | Inverted surface hierarchy: Pure white sidebar vs muddy `#EAE6DC` stat cards. Green `+ New Project` and `Capture` buttons dominate the viewport. |
| **Projects Directory** | Desktop (1440 × 950) | [white_mode_projects.png](file:///C:/Users/Sod/.gemini/antigravity/brain/68479ba4-03f1-440c-b547-3fd8f104b533/white_mode_projects.png) | Heavy `#EAE6DC` project cards; dark green primary action button; large empty canvas areas lacking warm texture. |
| **Project Dashboard** | Desktop (1440 × 950) | [white_mode_project_dashboard.png](file:///C:/Users/Sod/.gemini/antigravity/brain/68479ba4-03f1-440c-b547-3fd8f104b533/white_mode_project_dashboard.png) | `Open Board` button is solid green; sub-cards for metrics and navigation use dull tan backgrounds; "Open Canvas" links use green text. |
| **Spatial Board** | Desktop (1440 × 950) | [white_mode_spatial_board.png](file:///C:/Users/Sod/.gemini/antigravity/brain/68479ba4-03f1-440c-b547-3fd8f104b533/white_mode_spatial_board.png) | Canvas dot grid on `#F4F2EC`; `+ Add Card` is dark green; floating drag indicator is dark charcoal with `#14b8a6` teal icons. |
| **Knowledge Vault** | Desktop (1440 × 950) | [white_mode_vault.png](file:///C:/Users/Sod/.gemini/antigravity/brain/68479ba4-03f1-440c-b547-3fd8f104b533/white_mode_vault.png) | Notes sidebar uses white background; empty-state central card uses white surface with muddy grey sub-cards; active Inspector tab indicator is green. |
| **Note Editor** | Desktop (1440 × 950) | [white_mode_vault_note_editor.png](file:///C:/Users/Sod/.gemini/antigravity/brain/68479ba4-03f1-440c-b547-3fd8f104b533/white_mode_vault_note_editor.png) | Active mode toggle (`Edit`) is solid green; inline WikiLinks render in pale green `#E6F4F0` with green borders; right Inspector outline works cleanly. |
| **Knowledge Graph** | Desktop (1440 × 950) | [white_mode_graph.png](file:///C:/Users/Sod/.gemini/antigravity/brain/68479ba4-03f1-440c-b547-3fd8f104b533/white_mode_graph.png) | Off-white canvas; Notes use teal gradient circular nodes; Tasks use emerald green nodes; Research uses orange/red nodes; Projects use blue nodes. |
| **Research Center** | Desktop (1440 × 950) | [white_mode_research.png](file:///C:/Users/Sod/.gemini/antigravity/brain/68479ba4-03f1-440c-b547-3fd8f104b533/white_mode_research.png) | `+ Import Document` is solid green; `Import Flowden Package` is outlined in green; drag & drop zone uses muddy beige with green icon halo. |
| **Workflow Tracker** | Desktop (1440 × 950) | [white_mode_workflow.png](file:///C:/Users/Sod/.gemini/antigravity/brain/68479ba4-03f1-440c-b547-3fd8f104b533/white_mode_workflow.png) | `+ New Task` is solid green; Kanban column containers use `#EAE6DC` surfaces; Task cards inside columns lack crisp surface elevation. |
| **Quick Capture** | Desktop (1440 × 950) | [white_mode_capture.png](file:///C:/Users/Sod/.gemini/antigravity/brain/68479ba4-03f1-440c-b547-3fd8f104b533/white_mode_capture.png) | `+ Capture to Inbox` is solid green; empty state is an enormous grey-tan container with faint grey typography. |
| **AI Assistant (Overview)** | Desktop (1440 × 950) | [white_mode_assistant_overview.png](file:///C:/Users/Sod/.gemini/antigravity/brain/68479ba4-03f1-440c-b547-3fd8f104b533/white_mode_assistant_overview.png) | **Defect**: Top sticky navigation bar container retains dark charcoal `#191D20`; `Import Package` button is light teal `#78C8B2`. |
| **AI Assistant (MCP)** | Desktop (1440 × 950) | [white_mode_assistant_mcp.png](file:///C:/Users/Sod/.gemini/antigravity/brain/68479ba4-03f1-440c-b547-3fd8f104b533/white_mode_assistant_mcp.png) | `Save Configuration` button is green `#2B8670`; project allowlist box is `#EAE6DC`; top sticky nav remains dark charcoal. |
| **AI Assistant (Exchange)** | Desktop (1440 × 950) | [white_mode_assistant_exchange.png](file:///C:/Users/Sod/.gemini/antigravity/brain/68479ba4-03f1-440c-b547-3fd8f104b533/white_mode_assistant_exchange.png) | Action and download buttons use teal `#78C8B2`; step workflow cards and download asset cards use muddy grey-tan `#EAE6DC`. |
| **Shared Package Importer Modal** | Desktop (1440 × 950) | [white_mode_exchange_modal.png](file:///C:/Users/Sod/.gemini/antigravity/brain/68479ba4-03f1-440c-b547-3fd8f104b533/white_mode_exchange_modal.png) | Stepper Step 1 circle is dark green; destination container is `#EAE6DC`; disabled `Inspect Package` button has poor contrast. |
| **Command Palette (Ctrl+K)** | Desktop (1440 × 950) | [white_mode_command_palette.png](file:///C:/Users/Sod/.gemini/antigravity/brain/68479ba4-03f1-440c-b547-3fd8f104b533/white_mode_command_palette.png) | Palette input is white, but result list container has a heavy `#EAE6DC` background with grey selected item. |
| **Settings** | Desktop (1440 × 950) | [white_mode_settings.png](file:///C:/Users/Sod/.gemini/antigravity/brain/68479ba4-03f1-440c-b547-3fd8f104b533/white_mode_settings.png) | Profile form card is an oversized grey-tan box (`#EAE6DC`); `Save Changes` is solid green. |
| **Flowden Guide** | Desktop (1440 × 950) | [white_mode_guide.png](file:///C:/Users/Sod/.gemini/antigravity/brain/68479ba4-03f1-440c-b547-3fd8f104b533/white_mode_guide.png) | `Start Interactive Tour` is solid green; sub-step cards use grey-tan `#EAE6DC` backgrounds; `[[Note Name]]` wikilink code has green text/border. |
| **Mobile Overview** | Mobile (375 × 812) | [white_mode_mobile_overview.png](file:///C:/Users/Sod/.gemini/antigravity/brain/68479ba4-03f1-440c-b547-3fd8f104b533/white_mode_mobile_overview.png) | Collapsed icon sidebar; stat cards stack vertically in muddy `#EAE6DC`; green `+ New Project` button dominates top. |
| **Mobile Vault** | Mobile (375 × 812) | [white_mode_mobile_vault.png](file:///C:/Users/Sod/.gemini/antigravity/brain/68479ba4-03f1-440c-b547-3fd8f104b533/white_mode_mobile_vault.png) | **Defect**: Central empty-state card overflows viewport horizontally, clipping the third feature card ("Slash Commands"). |
| **Mobile AI Assistant** | Mobile (375 × 812) | [white_mode_mobile_assistant.png](file:///C:/Users/Sod/.gemini/antigravity/brain/68479ba4-03f1-440c-b547-3fd8f104b533/white_mode_mobile_assistant.png) | **Defect**: Sticky nav bar is dark charcoal `#191D20` spanning the top of the mobile screen while everything below is light mode. |

---

## 3. Inventory of Current Green & Cyan Usages

A comprehensive regex scan across all 6 CSS stylesheets and 28 frontend JavaScript modules detected **56 CSS lines** and **38 JS template lines** explicitly defining green, teal, or cyan shades, totaling **318 rendered DOM occurrences** in White Mode.

### A. Brand Accents (Candidates for Champagne Gold Replacement)
These components represent core interactive brand highlights, primary actions, and navigational cues. They currently default to green/teal and should migrate to the Champagne Gold palette.

| Component / Selector | Current Value | Source Location | Proposed Treatment |
| :--- | :--- | :--- | :--- |
| **Primary Action Buttons** (`.btn--primary`) | `var(--accent-primary)` (`#2B8670`) | [`public/css/variables.css#L149`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/public/css/variables.css#L149) | Replace with Primary Champagne Gold (`#C5A15B`) + Charcoal typography (`#20211F`). |
| **Primary Button Hover** (`.btn--primary:hover`) | `var(--accent-hover)` (`#379E85`) | [`public/css/variables.css#L150`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/public/css/variables.css#L150) | Replace with Deepened Champagne Gold (`#B38F46`). |
| **Primary Button Active** (`.btn--primary:active`) | `var(--accent-active)` (`#216E5B`) | [`public/css/variables.css#L151`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/public/css/variables.css#L151) | Replace with Deep Gold (`#9E7B35`). |
| **Active Sidebar Navigation Item** (`.nav-item.active`) | `#2B8670` left border / icon tint | [`public/css/layout.css#L182`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/public/css/layout.css#L182) | Champagne Gold left indicator (`#C5A15B`) + warm neutral hover (`#F6F3EC`). |
| **Inspector Active Tab Indicator** (`.inspector-tab.active`) | `border-bottom: 2px solid var(--accent-primary)` | [`public/css/layout.css#L318`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/public/css/layout.css#L318) | Replace with Champagne Gold underline (`#C5A15B`). |
| **Note Editor Mode Toggle** (`.vault-mode-btn.active`) | `background: var(--accent-primary)` (`#2B8670`) | [`public/css/vault.css#L71`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/public/css/vault.css#L71) | Champagne Gold active fill (`#C5A15B`) with charcoal text (`#20211F`). |
| **Interactive Stepper Circle** (`.stepper-step.active .step-num`) | `background: var(--accent-primary)` (`#2B8670`) | [`public/js/components/exchangeModal.js#L185`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/public/js/components/exchangeModal.js#L185) | Champagne Gold fill (`#C5A15B`) with charcoal numeral. |
| **Spatial Board Selection Halos** (`.board-item--selected`) | `border-color: #14b8a6`, `box-shadow: 0 0 0 2px rgba(20, 184, 166, 0.4)` | [`public/css/components.css#L1573`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/public/css/components.css#L1573), [`public/js/pages/board.js#L902`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/public/js/pages/board.js#L902) | Champagne Gold halo (`#C5A15B` / `rgba(197, 161, 91, 0.35)`). |
| **Spatial Wire Connectors (Active/Selected)** | `stroke: #14b8a6` | [`public/js/pages/board.js#L154`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/public/js/pages/board.js#L154) | Deep Gold wire stroke (`#87631E` or `#C5A15B`). |
| **Vault Multi-Select Marquee / Focus** | `rgba(120, 200, 178, 0.12)`, `border: 1px solid rgba(120, 200, 178, 0.75)` | [`public/css/vault.css#L2423`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/public/css/vault.css#L2423) | Soft Gold tint (`rgba(197, 161, 91, 0.12)`) + Gold border (`#C5A15B`). |
| **WikiLink Chips** (`.wikilink-badge`) | Pale green background (`#E6F4F0`) with green text | [`public/css/vault.css#L1156`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/public/css/vault.css#L1156) | Warm Ivory background (`#F3EAD6`) + Deep Gold text (`#87631E`) + Gold border (`#E7E0D2`). |
| **Empty State Icon Halo** | `background: rgba(120, 200, 178, 0.1)` | [`public/js/pages/vault.js#L134`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/public/js/pages/vault.js#L134) | Soft Gold halo (`rgba(197, 161, 91, 0.12)`). |
| **Package Import Trigger Buttons** | Inline `color: var(--brand-teal)` | [`public/js/pages/research.js#L29`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/public/js/pages/research.js#L29) | Inherit `--accent-primary` / `--accent-gold`. |

---

### B. Semantic Status Colors (Must Retain Green Meaning)
These components communicate operational health, positive completion, active connection, or verified states. **They must NOT be turned into gold**, because doing so would destroy universally understood semantic affordances.

| Component / Selector | Current Value | Source Location | Proposed Treatment |
| :--- | :--- | :--- | :--- |
| **Status Badge: Active / Configured** (`.sec-status-pill[data-status="active"]`) | `background: var(--status-success-bg); color: var(--status-success)` (`#2E9B62`) | [`public/css/variables.css#L160`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/public/css/variables.css#L160) | **Retain Semantic Green** (`#2E9B62`). Clean up border to avoid muddy green backgrounds. |
| **Status Badge: Completed / Done** | `#2E9B62` | [`public/js/pages/workflow.js`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/public/js/pages/workflow.js) | **Retain Semantic Green**. |
| **MCP Live Connection Indicator** (`#mcp-status-badge`) | `color: var(--status-success); background: var(--status-success-bg)` | [`public/js/pages/assistant.js#L87`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/public/js/pages/assistant.js#L87) | **Retain Semantic Green** for live/connected state. |
| **Success Toast / Alert Notification** | `var(--status-success)` | [`public/css/components.css#L420`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/public/css/components.css#L420) | **Retain Semantic Green**. |
| **Import Success Modal Checkmark** | `rgba(16, 185, 129, 0.15)`, `#10b981` | [`public/js/components/exchangeModal.js#L683`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/public/js/components/exchangeModal.js#L683) | **Retain Semantic Green** for transaction success. |
| **Project Status Pill: `active`** | Pale green background with `#2E9B62` | [`public/js/pages/projects.js`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/public/js/pages/projects.js) | **Retain Semantic Green**. |

---

### C. User-Defined & Contextual Colors (Must Be Preserved)
Colors selected by users or representing entity categories in workspace visualizations must not be coerced into the brand theme.

| Component / Feature | Current Values | Source Location | Proposed Treatment |
| :--- | :--- | :--- | :--- |
| **Knowledge Graph Category Themes** | Note: Teal (`#0D9488` → `#78C8B2`), Task: Emerald (`#059669` → `#34D399`), Research: Orange, Project: Blue | [`public/js/pages/graph.js#L52`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/public/js/pages/graph.js#L52) | **Preserve Category Differentiation**. User can override via Graph Appearance modal. The default "Note" category gradient can transition from teal to champagne gold (`#87631E` → `#C5A15B`) while keeping Task emerald green. |
| **Project Custom Color Swatches** | `#6B8AFD`, `#9B8AE0`, `#5BA3D9`, `#4DB8A0`, `#5DBA6E`, `#E0A040`, `#D97B4A`, `#7A8694` | [`public/js/pages/projects.js#L235`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/public/js/pages/projects.js#L235), [`public/js/pages/board.js#L2064`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/public/js/pages/board.js#L2064) | **Preserve Exact Palette**. Users tag projects with these colors. |
| **Spatial Board Custom Item Colors** | Stored in `board_items.color` | [`public/js/pages/board.js`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/public/js/pages/board.js) | **Preserve Exact Database Values**. |
| **Tag Map scoped colors** | Note tag mapping | [`public/js/pages/vault.js`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/public/js/pages/vault.js) | **Preserve User Tags**. |

---

### D. Other Functional & Interactive Colors
| Component / State | Current Value | Source Location | Proposed Treatment |
| :--- | :--- | :--- | :--- |
| **Form Focus Ring** (`:focus-visible`) | `var(--border-focus)` (`#2B8670`) | [`public/css/variables.css#L158`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/public/css/variables.css#L158) | Champagne Gold focus ring (`#C5A15B` with `0 0 0 2px rgba(197, 161, 91, 0.25)`). |
| **Disabled Action State** | Faint opacity on green | [`public/css/components.css`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/public/css/components.css) | Warm neutral disabled state (`#E7E0D2` surface with `#9FAAB3` text). |
| **Code Block Syntax / Preformatted Text** | Off-white pre block | [`public/css/vault.css`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/public/css/vault.css) | Pure white `#FFFFFF` surface with subtle `#E7E0D2` border. |

---

## 4. Current White Mode Visual Deficiencies

Based on direct browser inspection across all 20 views, the following concrete design defects were documented:

### 1. Inverted Surface Hierarchy & Muddy Card Backgrounds
- **Current Behavior**: The global background token in light mode is `--bg-primary: #F4F2EC` (a slightly dull beige). But containers and sub-cards across Overview, Projects, Project Dashboard, AI Assistant, Workflow Tracker, and Settings use `--bg-tertiary: #EAE6DC`.
- **Defect**: `#EAE6DC` has high grey saturation, making cards look unwashed, heavy, and aged rather than crisp and architectural.
- **Evidence**: Compare [white_mode_overview.png](file:///C:/Users/Sod/.gemini/antigravity/brain/68479ba4-03f1-440c-b547-3fd8f104b533/white_mode_overview.png) and [white_mode_settings.png](file:///C:/Users/Sod/.gemini/antigravity/brain/68479ba4-03f1-440c-b547-3fd8f104b533/white_mode_settings.png). In Settings, the Personal Profile form sits inside an enormous grey-tan `#EAE6DC` slab.

### 2. Disconnected Canvas and Shell Surface Contrast
- **Current Behavior**: The Left Sidebar (`#app-sidebar`) is pure white (`#FFFFFF`), while the Main Workspace (`#main-content`) is `#F4F2EC`.
- **Defect**: In a luxury productivity tool, the sidebar is typically a subtle tonal anchor (or warm secondary neutral `#F6F3EC`), allowing the central workspace canvas to stand out as luminous white (`#FFFFFF`). The current inversion makes the content area look dimmer than the navigation shell.

### 3. Dark Mode Artifact Leakage on AI Assistant Sticky Nav
- **Current Behavior**: In [white_mode_assistant_overview.png](file:///C:/Users/Sod/.gemini/antigravity/brain/68479ba4-03f1-440c-b547-3fd8f104b533/white_mode_assistant_overview.png) and [white_mode_mobile_assistant.png](file:///C:/Users/Sod/.gemini/antigravity/brain/68479ba4-03f1-440c-b547-3fd8f104b533/white_mode_mobile_assistant.png), `#assistant-sticky-nav` renders with a dark charcoal background (`#191D20`).
- **Cause**: In `public/css/pages/assistant.css#L42`, `#assistant-sticky-nav` defines `background-color: var(--bg-tertiary, #1E2327); border: 1px solid var(--border-primary, #2C343B);` without scoping light mode tokens or using semantic tokens. In light mode, the button pills inside the nav conflict visually with the dark container.

### 4. Severe Contrast Issue with Disabled Importer Action Button
- **Current Behavior**: In [white_mode_exchange_modal.png](file:///C:/Users/Sod/.gemini/antigravity/brain/68479ba4-03f1-440c-b547-3fd8f104b533/white_mode_exchange_modal.png), the `Inspect Package` commit button in its disabled initial state renders with a faded teal background and white text.
- **Defect**: The contrast ratio of the disabled button text is **1.6:1**, rendering the button label nearly invisible.

### 5. Horizontal Clipping of Empty-State Card on Mobile Vault
- **Current Behavior**: In [white_mode_mobile_vault.png](file:///C:/Users/Sod/.gemini/antigravity/brain/68479ba4-03f1-440c-b547-3fd8f104b533/white_mode_mobile_vault.png), the central empty state card (`.vault-empty-state`) has a fixed minimum width that causes it to overflow horizontally past the 375px mobile boundary, partially severing the third feature card ("Slash Commands").

### 6. Command Palette Muddy Interior
- **Current Behavior**: In [white_mode_command_palette.png](file:///C:/Users/Sod/.gemini/antigravity/brain/68479ba4-03f1-440c-b547-3fd8f104b533/white_mode_command_palette.png), the search input at top is pure white `#FFFFFF`, but the results container below is `#EAE6DC`. The high contrast between the white input and the muddy list creates an unintentional split feeling in the modal dialog.

---

## 5. Logo Asset Audit

### Existing Files & Asset Properties
All logo files are located in `public/assets/branding/`:

| Asset File | File Format & Magic Bytes | Declared / Header Dimensions | File Size | Theme Association in Code |
| :--- | :--- | :--- | :--- | :--- |
| **`flowden-mark-dark.png`** | Real PNG (`89 50 4E 47`) | 1023 × 1024 px | 103,986 bytes | Unused in `app.html` / `index.html`. |
| **`flowden-mark-light.png`** | **Real JPEG (`FF D8 FF DB`)** with `.png` extension | 1023 × 1024 px | 26,102 bytes | Referenced in `app.html#L32` and `index.html#L150` for **both** Dark and Light modes! |
| **`flowden-wordmark-dark.png`** | Real PNG (`89 50 4E 47`) | 1024 × 765 px | 107,793 bytes | Unused in `app.html` / `index.html`. |
| **`flowden-wordmark-light.png`** | Real PNG (`89 50 4E 47`) | 1024 × 765 px | 119,172 bytes | Referenced in `app.html#L35` and `index.html#L153` for **both** Dark and Light modes. |
| **`favicon.svg`** | Vector SVG | 32 × 32 viewBox | 385 bytes | Browser tab icon. |

### Architectural Findings on Logo Usage:
1. **The Inversion Hack**:
   In `public/css/layout.css#L94-L110`:
   ```css
   /* Light Mode */
   [data-theme="light"] .brand-mark-img { mix-blend-mode: multiply; }
   [data-theme="light"] .brand-wordmark-img { mix-blend-mode: multiply; }

   /* Dark Mode */
   [data-theme="dark"] .brand-mark-img {
     filter: invert(1) hue-rotate(180deg);
     mix-blend-mode: screen;
   }
   [data-theme="dark"] .brand-wordmark-img {
     filter: invert(1);
     mix-blend-mode: screen;
   }
   ```
   Because `flowden-mark-light.png` is an opaque JPEG (white background behind the letterform), the application relies on `mix-blend-mode: multiply` in light mode to knock out the white JPEG background. In dark mode, it inverts the image and rotates the hue by 180 degrees.
2. **True Mark Vector Geometry**:
   `public/assets/favicon.svg` reveals the exact mathematical geometry of the Flowden "F" mark:
   - Primary letterform polygon: `points="8.0,9.8 11.8,6.0 24.4,6.0 20.6,9.8 11.8,9.8 11.8,14.0 21.5,14.0 17.7,17.9 11.8,17.9 11.8,22.2 8.0,26.0"`
   - Accent wedge polygon: `points="11.8,9.8 15.5,9.8 15.5,26.0 8.0,26.0 11.8,22.2"`
3. **Recommendation for Phase 2**:
   - Do **NOT** modify or delete the existing dark mode files.
   - For light mode, create a crisp, transparent SVG vector mark or high-density PNG where the accent wedge polygon uses Champagne Gold (`#C5A15B`) and the F letterform uses Deep Charcoal (`#20211F`), completely eliminating the fragile `mix-blend-mode: multiply` dependency.

---

## 6. Proposed Ivory & Champagne Gold Palette: Contrast & Accessibility Evaluation

Using standard WCAG 2.1 relative luminance algorithms, all combinations of the proposed palette were evaluated against standard compliance levels (AA Normal $\ge 4.5:1$, AA Large $\ge 3.0:1$, AAA $\ge 7.0:1$).

| Evaluated Color Pair | Hex Values | Contrast Ratio | WCAG 2.1 AA | WCAG 2.1 AAA | Usability Verdict & Rule |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **Main Text on Ivory Background** | `#20211F` on `#FBFAF7` | **15.49 : 1** | `PASS` | `PASS` | Outstanding readability for headings, prose, and metadata. |
| **Main Text on Pure White Surface** | `#20211F` on `#FFFFFF` | **16.17 : 1** | `PASS` | `PASS` | Maximum crispness for editor canvas and cards. |
| **Main Text on Warm Neutral Surface** | `#20211F` on `#F6F3EC` | **14.59 : 1** | `PASS` | `PASS` | Pristine readability for sub-cards and sidebars. |
| **Secondary Text on Ivory Background** | `#68706D` on `#FBFAF7` | **4.87 : 1** | `PASS` | `FAIL` | Compliant for secondary labels, timestamps, and captions. |
| **Secondary Text on White Surface** | `#68706D` on `#FFFFFF` | **5.09 : 1** | `PASS` | `FAIL` | Solid contrast for UI descriptors and breadcrumbs. |
| **Secondary Text on Warm Neutral** | `#68706D` on `#F6F3EC` | **4.59 : 1** | `PASS` | `FAIL` | Passes the 4.5:1 threshold for normal text. |
| **White text on Primary Gold Button** | `#FFFFFF` on `#C5A15B` | **2.44 : 1** | **FAIL** | **FAIL** | **CRITICAL DESIGN CONSTRAINT**: White text on `#C5A15B` is illegal. Primary gold buttons **MUST** use charcoal text (`#20211F`). |
| **Charcoal text on Primary Gold Button** | `#20211F` on `#C5A15B` | **6.64 : 1** | `PASS` | `PASS` (Large) | **RECOMMENDED**: Primary gold button with dark charcoal text looks ultra-premium and exceeds AA. |
| **White text on Deep Gold Button** | `#FFFFFF` on `#87631E` | **5.48 : 1** | `PASS` | `FAIL` | If white button text is strictly required by the design team, background must be Deep Gold `#87631E`. |
| **Primary Gold text on White Surface** | `#C5A15B` on `#FFFFFF` | **2.44 : 1** | **FAIL** | **FAIL** | Primary Gold `#C5A15B` cannot be used for text links or bare icons on white surfaces. |
| **Deep Gold text on White Surface** | `#87631E` on `#FFFFFF` | **5.48 : 1** | `PASS` | `FAIL` | **RECOMMENDED**: Text links, breadcrumbs, and icons on white surfaces must use Deep Gold `#87631E`. |
| **Deep Gold text on Soft Gold Badge** | `#87631E` on `#F3EAD6` | **4.58 : 1** | `PASS` | `FAIL` | **RECOMMENDED**: Ideal combination for status chips, WikiLinks, and pill badges. |
| **Subtle Border on White Surface** | `#E7E0D2` on `#FFFFFF` | **1.31 : 1** | *N/A (UI)* | *N/A* | Elegant hairline separation without visual clutter. |

---

## 7. Recommended Semantic Token Architecture

To prevent thousands of scattered hardcoded color overrides, the theme should be governed by a cohesive set of semantic tokens defined inside `[data-theme="light"]` in `public/css/variables.css`.

### Token Architecture Specification

```css
[data-theme="light"] {
  /* --------------------------------------------------------------------------
     Ivory & Warm Neutral Surfaces
     -------------------------------------------------------------------------- */
  --bg-primary: #FBFAF7;            /* Luminous Ivory global background */
  --bg-secondary: #FFFFFF;          /* Pure White elevated cards, modals, editor */
  --bg-tertiary: #F6F3EC;           /* Warm Neutral sub-cards, sidebars, toolbars */
  --bg-elevated: #FFFFFF;           /* Dropdowns, tooltips, popovers */
  --bg-hover: rgba(32, 33, 31, 0.04);
  --bg-active: rgba(32, 33, 31, 0.07);
  --bg-input: #FFFFFF;
  --bg-overlay: rgba(32, 33, 31, 0.40);

  /* --------------------------------------------------------------------------
     Charcoal Typography
     -------------------------------------------------------------------------- */
  --text-primary: #20211F;          /* Deep warm charcoal for headings & primary text */
  --text-secondary: #68706D;        /* Medium neutral for secondary descriptions */
  --text-tertiary: #8E9693;         /* Muted neutral for timestamps & shortcuts */
  --text-inverse: #FBFAF7;          /* Inverted light text when placed on dark surfaces */

  /* --------------------------------------------------------------------------
     Champagne Gold Brand Accents
     -------------------------------------------------------------------------- */
  --accent-primary: #C5A15B;        /* Primary Champagne Gold (Buttons, Highlights) */
  --accent-hover: #B38F46;          /* Deepened Gold for interactive hover */
  --accent-active: #9E7B35;         /* Deep Gold for interactive active */
  --accent-deep: #87631E;           /* Deep Gold for accessible text links & icons */
  --accent-soft: #F3EAD6;           /* Soft Gold for badge & chip backgrounds */
  --accent-muted: rgba(197, 161, 91, 0.12); /* Subtle gold tint for selections */
  --accent-border: rgba(197, 161, 91, 0.28);/* Subtle gold border for cards */
  --accent-text: #20211F;           /* Charcoal text paired with --accent-primary */

  /* --------------------------------------------------------------------------
     Refined Hairline Borders
     -------------------------------------------------------------------------- */
  --border-primary: #E7E0D2;        /* Warm hairline border */
  --border-secondary: #D9D1C1;      /* Emphasized divider border */
  --border-focus: #C5A15B;          /* Champagne Gold focus outline */

  /* --------------------------------------------------------------------------
     Semantic Status Colors (Preserved Functional Integrity)
     -------------------------------------------------------------------------- */
  --status-success: #2E9B62;        /* Semantic Green for success / completed */
  --status-success-bg: rgba(46, 155, 98, 0.08);
  --status-warning: #C08A2C;        /* Semantic Amber for warnings */
  --status-warning-bg: rgba(192, 138, 44, 0.08);
  --status-error: #CC4440;          /* Semantic Red for errors / destructive */
  --status-error-bg: rgba(204, 68, 64, 0.08);
  --status-info: #3D8BBF;           /* Semantic Blue for informational */
  --status-info-bg: rgba(61, 139, 191, 0.08);

  /* --------------------------------------------------------------------------
     Gentle Warm Shadows
     -------------------------------------------------------------------------- */
  --shadow-sm: 0 1px 3px rgba(32, 33, 31, 0.04);
  --shadow-md: 0 4px 14px rgba(32, 33, 31, 0.06);
  --shadow-lg: 0 10px 30px rgba(32, 33, 31, 0.08);
  --shadow-focus: 0 0 0 2px var(--accent-muted);
}
```

---

## 8. Proposed Page-by-Page Migration Plan (Phase 2 & Beyond)

To ensure zero downtime, uninterrupted tests, and strict isolation between light and dark themes, the implementation should be executed in 4 logical stages:

### Stage 1: Central Design Tokens & Global CSS Foundation
- **Target Files**: `public/css/variables.css`, `public/css/base.css`, `public/css/components.css`, `public/css/layout.css`.
- **Work**:
  - Update `[data-theme="light"]` token block in `variables.css`.
  - Update `.btn--primary` in light mode to pair `--accent-primary: #C5A15B` with `color: var(--accent-text, #20211F)`.
  - Fix sidebar active item indicator and hover states to use warm neutrals.
  - Fix Command Palette list container background (`#F6F3EC` instead of `#EAE6DC`).
  - Introduce transparent SVG / PNG champagne logo variant for light mode.

### Stage 2: Core Workspace (Overview, Projects, Settings, Guide)
- **Target Files**: `public/js/pages/overview.js`, `public/js/pages/projects.js`, `public/js/pages/settings.js`, `public/js/pages/guide.js`.
- **Work**:
  - Replace muddy `#EAE6DC` card backgrounds with crisp `#FFFFFF` cards on `#FBFAF7` canvas.
  - Migrate project action buttons (`+ New Project`, `Open Workspace`) to Champagne Gold.
  - Clean up Quick Capture box and empty states.
  - Preserve project category tag colors (`#5DBA6E`, `#6B8AFD`, etc.).

### Stage 3: Knowledge Vault & Note Editor
- **Target Files**: `public/css/vault.css`, `public/js/pages/vault.js`, `public/js/components/vaultEditor.js`.
- **Work**:
  - Replace hardcoded `rgba(120, 200, 178, ...)` in `vault.css` with semantic variables (`var(--accent-muted)`, `var(--accent-border)`).
  - Update inline WikiLinks (`[[Note Title]]`) from pale green to Soft Gold `#F3EAD6` with Deep Gold text `#87631E`.
  - Update Editor mode toggle (`Edit` / `Split` / `Read`) to Champagne Gold.
  - Fix mobile overflow on empty state card (`.vault-empty-state`).

### Stage 4: Visual Canvas, Research, Workflow & AI Assistant
- **Target Files**: `public/js/pages/board.js`, `public/js/pages/graph.js`, `public/js/pages/research.js`, `public/js/pages/workflow.js`, `public/js/pages/assistant.js`, `public/css/pages/assistant.css`, `public/js/components/exchangeModal.js`.
- **Work**:
  - Board: Update wire selection and halos from `#14b8a6` to Champagne Gold; update `+ Add Card` button.
  - Graph: Update default "Note" node gradient to Champagne Gold (`#87631E` → `#C5A15B`), keeping Tasks emerald green.
  - Research: Update `+ Import Document` button to Champagne Gold.
  - Assistant: Remove dark charcoal background on `#assistant-sticky-nav` in White Mode; adopt warm neutral `#F6F3EC` nav container.
  - Modal: Fix disabled `Inspect Package` button contrast; update Step indicator circle to Champagne Gold.

---

## 9. Risks and Regression Requirements

1. **Dark Mode Contamination Risk**:
   - *Risk*: Modifying shared selectors could accidentally change Dark Mode (`#191D20` / `#78C8B2`).
   - *Mitigation*: All color rules must strictly operate through `[data-theme="light"]` CSS variables or scoped `[data-theme="light"]` selectors. Dark mode variables under `:root` and `[data-theme="dark"]` must remain 100% untouched.
2. **Button Text Readability Risk**:
   - *Risk*: If `.btn--primary` retains `color: #FFFFFF` while background becomes `#C5A15B`, button text becomes illegible (2.44:1 contrast).
   - *Mitigation*: Enforce `--accent-text: #20211F` on all primary buttons in light mode.
3. **Automated Test Regressions**:
   - *Risk*: Existing end-to-end and UI test suites check for specific button IDs and classes.
   - *Mitigation*: Ensure 100% ID and class name preservation (`#btn-top-import-package`, `#btn-assistant-import-package`, `#btn-new-project`, `.btn--primary`).
   - *Suites to execute after any migration*:
     - `node tests/phase3a_assistant_ui.test.js`
     - `node tests/phase3b_exchange_modal.test.js`
     - `node tests/verify_phase3b_browser_acceptance.js`
     - `node tests/verify_security_hardening.js`
4. **User-Defined Color Overwrite**:
   - *Risk*: Overwriting project custom colors or user board item colors with gold.
   - *Mitigation*: Exclude `project.color`, `board_item.color`, and `categoryThemes` from theme token mappings.

---

## 10. Design Decisions Requiring User Confirmation

Prior to implementing Phase 2, the following key design choices are surfaced for alignment:

1. **Primary Button Text Color**:
   - *Option A (Recommended)*: Background `#C5A15B` with Deep Charcoal text `#20211F` (Contrast: **6.64:1**, passes WCAG AA & AAA Large).
   - *Option B*: Background Deep Gold `#87631E` with White text `#FFFFFF` (Contrast: **5.48:1**, passes WCAG AA).
2. **Sidebar Surface in White Mode**:
   - *Option A (Recommended)*: Sidebar uses Warm Neutral `#F6F3EC` while main workspace canvas is pure Ivory `#FBFAF7` and cards are `#FFFFFF`. (Creates a natural, grounded visual hierarchy).
   - *Option B*: Sidebar remains Pure White `#FFFFFF` matching cards.
3. **Knowledge Graph Default Note Color**:
   - *Option A (Recommended)*: Transition default note nodes from cyan/teal to Champagne Gold gradient (`#87631E` → `#C5A15B`), while keeping Tasks emerald green (`#059669` → `#34D399`).
   - *Option B*: Leave default graph node gradients completely unchanged.
4. **Logo Asset Handling**:
   - *Option A (Recommended)*: Export a modern SVG logo where the accent polygon is Champagne Gold `#C5A15B` and letterform is Charcoal `#20211F` for light mode, retiring `mix-blend-mode: multiply`.
   - *Option B*: Generate a high-resolution PNG with transparent background.

