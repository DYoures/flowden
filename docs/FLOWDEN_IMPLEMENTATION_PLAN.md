# FLOWDEN — Implementation Plan

> Development roadmap covering Segments 2, 3, and 4

---

## Overview

| Segment | Focus | Phases | Est. Hours |
|---|---|---|---|
| **Segment 2** | Design System & Application Foundation | 8 phases | ~24 hours |
| **Segment 3** | Core Workspace & Knowledge System | 11 phases | ~48 hours |
| **Segment 4** | Productivity, Research & Finalization | 10 phases | ~36 hours |
| **Total** | | **29 phases** | **~108 hours** |

---

## Prerequisites

| Requirement | Status | Action |
|---|---|---|
| Node.js 18+ | ✅ v24.16.0 | — |
| npm | ✅ v11.13.0 | — |
| MySQL 8.0+ | ❌ Not installed | Install MySQL, create database |

### Database Setup (before starting Segment 2)

```sql
CREATE DATABASE flowden CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'flowden_user'@'localhost' IDENTIFIED BY 'your_password';
GRANT ALL PRIVILEGES ON flowden.* TO 'flowden_user'@'localhost';
FLUSH PRIVILEGES;
```

---

## Segment 2 — Design System & Application Foundation

### Phase 2.1: Project Initialization

**Goal**: Set up the project skeleton with all dependencies.

**Tasks**:
- [ ] Create project root at `flowden/`
- [ ] Initialize `package.json` with `npm init`
- [ ] Install production dependencies:
  - `express` — web framework
  - `mysql2` — MySQL driver with promises
  - `bcryptjs` — password hashing
  - `jsonwebtoken` — JWT authentication
  - `cookie-parser` — parse httpOnly cookies
  - `multer` — file upload handling
  - `dotenv` — environment variables
  - `cors` — cross-origin configuration
  - `helmet` — security headers
  - `express-rate-limit` — rate limiting
  - `express-validator` — request validation
  - `uuid` — unique ID generation
- [ ] Install dev dependencies:
  - `nodemon` — auto-restart in development
- [ ] Create `.env.example` with all required variables
- [ ] Create `.gitignore` (node_modules, .env, uploads/*, !uploads/.gitkeep)
- [ ] Create directory structure:
  ```
  server/ (config, middleware, routes, models, utils, migrations)
  public/ (css, js/components, js/pages, js/utils, assets/icons, assets/images)
  uploads/ (avatars, research, images — with .gitkeep files)
  docs/
  ```
- [ ] Create Express entry point (`server/index.js`) with middleware stack:
  - helmet, cors, cookie-parser, express.json, express.static, rate-limit
  - Route mounting
  - Global error handler
  - Server start on configured port

**Estimated time**: 2 hours

---

### Phase 2.2: Database Setup

**Goal**: Create all database tables via migration scripts.

**Tasks**:
- [ ] Create `server/config/database.js` — mysql2 connection pool with promise wrapper
- [ ] Create `server/migrations/runner.js` — reads and executes SQL files in order
- [ ] Write migration SQL files (numbered for order):
  - `001_users.sql` — users table with indexes
  - `002_projects.sql` — projects table with FK to users
  - `003_boards.sql` — boards table with FKs to projects, users
  - `004_board_items.sql` — board_items, board_groups, board_item_connections
  - `005_notes.sql` — notes table with fulltext index
  - `006_note_folders.sql` — note_folders with self-reference
  - `007_tags.sql` — note_tags, note_tag_map, note_links
  - `008_research.sql` — research_documents, research_tags
  - `009_tasks.sql` — tasks table
  - `010_decision_logs.sql` — decision_logs table
  - `011_templates.sql` — templates table
  - `012_quick_captures.sql` — quick_captures table
  - `013_connections.sql` — smart_connections table
  - `014_note_versions.sql` — note_versions table
  - `015_migrations_tracking.sql` — migrations table to track executed migrations
- [ ] Add `npm run migrate` script to `package.json`
- [ ] Test: run migrations, verify all tables created

**Estimated time**: 3 hours

---

### Phase 2.3: Authentication & Authorization

**Goal**: Working register/login/logout with JWT and role-based access.

**Tasks**:
- [ ] Create `server/config/auth.js` — JWT secret, expiration config
- [ ] Create `server/models/User.js` — findByEmail, create, findById, updateSettings
- [ ] Create `server/middleware/auth.js`:
  - Extract JWT from httpOnly cookie
  - Verify token, attach `req.user = { id, email, role }`
  - Return 401 on invalid/missing token
- [ ] Create `server/middleware/roles.js`:
  - `requireRole('admin')` — returns 403 if not admin
- [ ] Create `server/routes/auth.js`:
  - `POST /register` — validate input, check duplicate email, hash password, create user, set JWT cookie
  - `POST /login` — validate credentials, set JWT cookie
  - `POST /logout` — clear JWT cookie
  - `GET /me` — return current authenticated user (without password_hash)
- [ ] First registered user automatically gets `role = 'admin'`
- [ ] Input validation: email format, password min length (8), display_name required
- [ ] Create `server/middleware/errorHandler.js` — consistent error JSON format
- [ ] Test: register, login, access protected route, logout, verify admin auto-assign

**Estimated time**: 3 hours

---

### Phase 2.4: Design System CSS

**Goal**: Complete CSS design system implementing the Design System specification.

**Tasks**:
- [ ] Create `public/css/variables.css`:
  - All CSS custom properties from Design System spec
  - Both `:root` (dark) and `[data-theme="light"]` themes
  - Typography tokens, spacing tokens, radius tokens, shadow tokens
- [ ] Create `public/css/base.css`:
  - CSS reset (box-sizing, margin, padding)
  - HTML/body defaults (font-family, background, color, font-size)
  - Typography rules (h1–h6, p, a, code, pre, blockquote)
  - Custom scrollbar styling
  - Utility classes (`.sr-only`, `.text-truncate`, etc.)
  - `@media (prefers-reduced-motion: reduce)` rule
- [ ] Create `public/css/components.css`:
  - Buttons: `.btn`, `.btn--primary/secondary/ghost/danger`, `.btn--sm/md/lg`, `.btn-icon`
  - Inputs: `.input`, `.textarea`, `.select`, `.input--compact`
  - Cards: `.card`, `.card--interactive`, `.card-header`, `.card-body`, `.card-footer`
  - Modals: `.modal-overlay`, `.modal`, `.modal--sm/md/lg`, `.modal-header/body/footer`
  - Dropdowns: `.dropdown`, `.dropdown-item`, `.dropdown-divider`
  - Toasts: `.toast-container`, `.toast`, `.toast--success/error/warning/info`
  - Tags: `.tag`, `.tag--violet/blue/teal/green/amber/orange/rose/gray`
  - Empty states: `.empty-state`, `.empty-state-icon/title/description`
  - Loading: `.skeleton`, `.skeleton--text/title/avatar/card`, `.spinner`
  - Navigation: `.nav-item`, `.nav-item--active`, `.nav-item-icon`
  - Breadcrumbs: `.breadcrumb`, `.breadcrumb-item`, `.breadcrumb-current`
  - Forms: `.form-group`, `.form-label`, `.form-hint`, `.form-error`
  - Command palette: `.command-palette`, `.command-palette-input`, `.command-palette-item`
  - Context menu: `.context-menu`
  - Badges: `.badge`, status variants
  - Avatars: `.avatar`, `.avatar--sm/md/lg`
  - Tooltips: `.tooltip`
- [ ] Create `public/css/layout.css`:
  - App shell CSS Grid (sidebar + main + inspector)
  - Sidebar styles (expanded/collapsed states)
  - Topbar styles
  - Inspector panel styles
  - Responsive breakpoints with media queries
  - Page layout helpers (`.page-layout`, `.page-layout--split`, `.page-layout--dashboard`)
- [ ] Load Inter + JetBrains Mono from Google Fonts
- [ ] Verify visual consistency between dark and light themes

**Estimated time**: 4 hours

---

### Phase 2.5: Application Shell

**Goal**: Main app HTML structure with working navigation, sidebar, and routing.

**Tasks**:
- [ ] Create `public/app.html` — main SPA entry:
  - Skip-to-content link
  - Sidebar structure with nav items (all routes from spec)
  - Sidebar collapse button
  - Sidebar user section at bottom (avatar, name, logout)
  - Topbar with: sidebar toggle, breadcrumb, search trigger, theme toggle, user avatar
  - Main content container (`#main-content`)
  - Inspector panel container (hidden by default)
  - Toast container
  - Command palette container (hidden)
  - Script includes
- [ ] Create `public/js/router.js`:
  - Hash-based routing (`window.onhashchange`)
  - Route registration with page loader functions
  - Route parameter parsing (`:id`)
  - Default route redirect
  - History management
- [ ] Create `public/js/app.js`:
  - Initialize router with all routes
  - Initialize sidebar state from localStorage
  - Initialize theme from localStorage (or user preference)
  - Set up global keyboard shortcuts (Ctrl+K for command palette)
  - Set up auth check (redirect to login if no token)
- [ ] Create `public/js/auth.js`:
  - Check auth state on load
  - Store/retrieve user info
  - Redirect to login on 401
  - Logout function
- [ ] Create `public/js/api.js`:
  - `fetchAPI(endpoint, options)` — wrapper around fetch
  - Automatic JSON parsing
  - Automatic error handling (401 → redirect to login)
  - Base URL configuration
- [ ] Create `public/js/store.js`:
  - Simple reactive state store
  - Subscribe/notify pattern for UI updates
- [ ] Create `public/js/components/commandPalette.js`:
  - Open on Ctrl+K / Cmd+K
  - Search input with instant filtering
  - Navigate to pages, trigger actions
  - Keyboard navigation (arrows + enter + escape)
- [ ] Create `public/js/components/toast.js`:
  - `showToast(message, type, duration)` function
  - Auto-dismiss with progress
  - Close button
- [ ] Create `public/js/components/modal.js`:
  - `openModal(options)` — title, content, buttons, size
  - `confirmModal(message)` — confirm/cancel dialog
  - Escape to close
  - Click overlay to close
- [ ] Create `public/js/components/dropdown.js`:
  - `openDropdown(triggerEl, items, onSelect)`
  - Position relative to trigger
  - Keyboard navigation
  - Close on outside click
- [ ] Implement sidebar collapse/expand with localStorage persistence
- [ ] Implement theme toggle with localStorage + `data-theme` attribute
- [ ] Verify responsive behavior at all breakpoints

**Estimated time**: 4 hours

---

### Phase 2.6: Login & Registration

**Goal**: Working login and registration pages.

**Tasks**:
- [ ] Create `public/index.html`:
  - Clean login form (email + password)
  - Toggle to registration form (email + password + display name + confirm password)
  - Form validation (inline error messages)
  - Submit handler calling auth API
  - Success → redirect to `/app.html#/overview`
  - Error → display error message
  - Link between login/register
  - Theme toggle
  - Flowden branding (logo + tagline)
- [ ] Create `public/css/pages/auth.css` — centered card layout for auth forms
- [ ] Client-side validation: email format, password length, password match
- [ ] Loading state on submit button
- [ ] Redirect to app if already authenticated

**Estimated time**: 2 hours

---

### Phase 2.7: Initial Page Stubs

**Goal**: All navigation targets render with proper empty states.

**Tasks**:
- [ ] Create page modules (each in `public/js/pages/`):

  **Overview Dashboard** (`overview.js` + `overview.css`):
  - Welcome message with user's display name
  - Quick stats row: project count, note count, task count, capture count
  - Recent activity list (most recent items across all types)
  - Quick action buttons: New Project, New Note, New Task, Quick Capture

  **Projects** (`projects.js` + `projects.css`):
  - Grid/list toggle for project cards
  - Create Project button
  - Empty state: "Create your first project to get started"
  - Project card: title, description preview, color bar, status badge, stats

  **Project Dashboard** (`projectDashboard.js`):
  - Project title and description
  - Tab navigation: Overview, Board, Notes, Tasks, Research, Decisions
  - Empty state per tab

  **Workspace Board** (`board.js` + `board.css`):
  - Empty state: "Open or create a board to start organizing"
  - Board toolbar placeholder

  **Knowledge Vault** (`vault.js` + `vault.css`):
  - Split layout: folder sidebar + note list + editor area
  - Empty state: "Create your first note"

  **Knowledge Graph** (`graph.js` + `graph.css`):
  - Canvas container
  - Empty state: "Create notes and connections to see your knowledge graph"

  **Research Center** (`research.js` + `research.css`):
  - Empty state: "Import your first research document"
  - Import button

  **Workflow Tracker** (`workflow.js` + `workflow.css`):
  - View toggle: List / Board / Calendar
  - Empty state: "Create your first task"

  **Quick Capture** (`capture.js`):
  - Capture input (text + submit)
  - Empty state: "Your inbox is empty"

  **AI Assistant** (`assistant.js`):
  - "Coming Soon" state with description of planned MCP capabilities
  - Configuration placeholder (API key, permissions)
  - Clear "Not Configured" indication

  **Flowden Guide** (`guide.js` + `guide.css`):
  - Getting Started section
  - Feature overview list
  - Keyboard shortcuts reference

  **Settings** (`settings.js` + `settings.css`):
  - Tab navigation: Profile, Appearance, Account, Admin (if admin)
  - Profile: display name, email (read-only), avatar
  - Appearance: theme selector
  - Account: change password, delete account
  - Admin: user list (admin only)

  **Search Results** (`search.js`):
  - Query display
  - Tabbed results: All, Notes, Projects, Tasks, Research
  - Empty state: "No results found"

- [ ] Register all pages with router
- [ ] Verify navigation between all pages
- [ ] Verify breadcrumbs update correctly
- [ ] Verify active state in sidebar updates correctly

**Estimated time**: 3 hours

---

### Phase 2.8: Core Backend API Routes

**Goal**: CRUD APIs for projects and user settings.

**Tasks**:
- [ ] Create `server/models/Project.js`:
  - `findAllByUser(userId, filters)`
  - `findById(id, userId)`
  - `create(data)`
  - `update(id, data, userId)`
  - `delete(id, userId)`
  - `getStats(id, userId)` — counts of related items
- [ ] Create `server/routes/projects.js`:
  - `GET /api/v1/projects` — list with optional `?status=active|archived`
  - `POST /api/v1/projects` — create with validation
  - `GET /api/v1/projects/:id` — get with stats
  - `PUT /api/v1/projects/:id` — update with ownership check
  - `DELETE /api/v1/projects/:id` — delete with ownership check
- [ ] Create `server/routes/users.js`:
  - `GET /api/v1/users/me` — current user profile
  - `PUT /api/v1/users/me` — update display_name, avatar, theme_preference, settings
  - `PUT /api/v1/users/me/password` — change password (require current password)
- [ ] Create `server/routes/admin.js`:
  - `GET /api/v1/admin/users` — list all users (admin only)
  - `PUT /api/v1/admin/users/:id/role` — change user role (admin only)
  - `GET /api/v1/admin/stats` — system-wide statistics (admin only)
- [ ] Create `server/middleware/validate.js` — validation helper using express-validator
- [ ] Wire all routes into `server/index.js`
- [ ] Test: CRUD projects via API, user settings update, admin routes with role check

**Estimated time**: 3 hours

---

### Segment 2 — Deliverable Checklist

- [ ] Express server starts and connects to MySQL
- [ ] All database tables created via migrations
- [ ] User can register and login
- [ ] JWT authentication protects all `/api/v1/` routes
- [ ] First user is auto-promoted to admin
- [ ] App shell renders: sidebar, topbar, main content area
- [ ] Client-side routing works for all pages
- [ ] All pages show appropriate empty states
- [ ] Theme switching works (dark ↔ light) with persistence
- [ ] Sidebar collapse/expand with persistence
- [ ] Command Palette opens with Ctrl+K / Cmd+K
- [ ] Projects CRUD works end-to-end (API + UI)
- [ ] User settings (profile, theme) work end-to-end
- [ ] Admin panel visible only to admin users
- [ ] Responsive layout adapts at all breakpoints
- [ ] No browser console errors
- [ ] Design is consistent, premium, and not generic

---

## Segment 3 — Core Workspace & Knowledge System

### Phase 3.1: Workspace Board — Canvas Foundation

**Goal**: Infinite pan/zoom canvas with grid.

**Tasks**:
- [ ] Canvas container with CSS transform-based pan/zoom
- [ ] Mouse drag to pan (middle-click or spacebar+drag)
- [ ] Scroll wheel to zoom (centered on cursor)
- [ ] Touch support: two-finger pan, pinch to zoom
- [ ] Zoom limits: 25% – 300%
- [ ] Snap-to-grid system (configurable: 10px, 20px, 40px, off)
- [ ] Grid background rendering (CSS background-image pattern)
- [ ] Zoom controls toolbar (zoom in, zoom out, fit, percentage display)
- [ ] Minimap (bottom-right corner) showing viewport position
- [ ] Save/restore viewport state per board (API call)
- [ ] Board CRUD API: `GET/POST/PUT/DELETE /api/v1/boards`
- [ ] Backend: `server/routes/boards.js`, `server/models/Board.js`

**Estimated time**: 6 hours

---

### Phase 3.2: Workspace Board — Cards & Interactions

**Goal**: Create, position, resize, and edit cards on the canvas.

**Tasks**:
- [ ] Add cards via toolbar button or double-click on canvas
- [ ] Card type selector: Note, Idea, Image, Link, Research Ref, Task, Document
- [ ] Card rendering with type-specific styling (icon, color accent)
- [ ] Drag to reposition (with snap-to-grid)
- [ ] Resize via drag handles (corners and edges)
- [ ] Inline title editing (click to edit)
- [ ] Content editing via inspector panel or double-click modal
- [ ] Card context menu (right-click): Edit, Duplicate, Change Type, Change Color, Delete
- [ ] Card color picker (8 project colors)
- [ ] Z-index management: bring to front, send to back
- [ ] Multi-select: Shift+click to add to selection, click empty space to deselect
- [ ] Lasso selection: click+drag on empty canvas area
- [ ] Multi-drag: drag any selected card moves all selected
- [ ] Delete selected: Delete key with confirmation for multiple
- [ ] Backend CRUD: `server/routes/boardItems.js`, batch position update endpoint
- [ ] Debounced auto-save of position changes

**Estimated time**: 6 hours

---

### Phase 3.3: Workspace Board — Groups & Connections

**Goal**: Grouping containers and visual connections between cards.

**Tasks**:
- [ ] Create groups: toolbar button or context menu "Group Selected"
- [ ] Group rendering: labeled rectangle container with color
- [ ] Drag cards into/out of groups (visual snap)
- [ ] Group resize and repositioning
- [ ] Moving a group moves all contained cards
- [ ] Connection creation: hover card edge → show connection anchor → drag to target card
- [ ] Connection rendering: SVG cubic bezier curves between cards
- [ ] Connection type selector: default, supports, contradicts, depends-on
- [ ] Connection labels (optional, editable)
- [ ] Connection selection and deletion
- [ ] Different visual styles per connection type (color, dash pattern)
- [ ] Backend: `server/routes/boardGroups.js`, `server/routes/boardConnections.js`

**Estimated time**: 4 hours

---

### Phase 3.4: Workspace Board — Inspector Panel

**Goal**: Right-side detail panel for selected items.

**Tasks**:
- [ ] Panel slides in when an item is selected
- [ ] Shows all editable properties: title, content (textarea/markdown), color, type
- [ ] List incoming and outgoing connections with navigation
- [ ] Quick actions: Duplicate, Delete, Change Type, Open Referenced Item
- [ ] For reference cards (task, note, research): link to the full item
- [ ] Escape key: deselect and close panel
- [ ] Panel updates reactively when card changes

**Estimated time**: 3 hours

---

### Phase 3.5: Knowledge Vault — Note Editor

**Goal**: Full markdown note creation and editing experience.

**Tasks**:
- [ ] Vault page layout: folder sidebar (left) + note list (center) + editor (right)
- [ ] Note list: title, preview snippet, date, pinned indicator
- [ ] Note list sorting: by date, by title, by updated
- [ ] Note list search (title + content filter)
- [ ] Create new note button
- [ ] Markdown editor:
  - Textarea with monospace font
  - Toolbar: Bold, Italic, H1–H3, Bullet List, Numbered List, Checkbox, Code, Code Block, Link, Image, Quote, Horizontal Rule
  - Keyboard shortcuts: Ctrl+B, Ctrl+I, Ctrl+K (link), etc.
  - Tab for indentation
- [ ] Live preview pane (toggle: edit / preview / split)
- [ ] Markdown rendering: headings, lists, links, code blocks, images, blockquotes, tables, checkboxes
- [ ] Auto-save with debounce (1 second after last keystroke)
- [ ] Save indicator ("Saved" / "Saving..." / "Unsaved changes")
- [ ] Pin/unpin notes (pinned appear at top of list)
- [ ] Delete note with confirmation
- [ ] Reading mode: max-width 720px, comfortable line-height
- [ ] Word count display
- [ ] Backend: `server/routes/notes.js`, `server/models/Note.js` — full CRUD + search

**Estimated time**: 6 hours

---

### Phase 3.6: Knowledge Vault — Organization

**Goal**: Folders, tags, internal links, backlinks.

**Tasks**:
- [ ] Folder hierarchy in sidebar:
  - Create folder (with name input)
  - Rename folder (inline edit)
  - Delete folder (with confirmation — moves notes to root)
  - Nested folders (drag to nest, max 3 levels)
  - Expand/collapse folders
  - Drag notes between folders
  - Folder note count display
- [ ] Tags:
  - Create tag (name + color)
  - Assign tags to notes (tag picker in editor/inspector)
  - Remove tags
  - Filter note list by tag
  - Tag management page in settings or dedicated UI
- [ ] Internal links:
  - `[[Note Title]]` syntax in editor
  - Auto-complete note titles when typing `[[`
  - Rendered as clickable links in preview
  - Navigate to linked note on click
- [ ] Backlinks panel:
  - Show in note inspector/sidebar
  - List all notes that link to current note
  - Click to navigate
- [ ] Unlinked mentions:
  - Find notes mentioning current note's title but not explicitly linked
  - Option to create link from unlinked mention
- [ ] Backend: `server/routes/noteFolders.js`, `server/routes/noteTags.js`, `server/routes/noteLinks.js`
- [ ] Update note links on save (parse `[[...]]` from content)

**Estimated time**: 4 hours

---

### Phase 3.7: Knowledge Vault — Import & Export

**Goal**: Import and export Markdown notes.

**Tasks**:
- [ ] Import single `.md` file as new note
  - Extract title from first `# heading` or filename
  - Store content as-is
  - Show import confirmation
- [ ] Import multiple `.md` files at once
- [ ] Export single note as `.md` file (browser download)
- [ ] Export all notes as `.zip` of `.md` files
  - Preserve folder structure in zip
  - Filename from note title
- [ ] Backend: `POST /api/v1/notes/import` (multer), `GET /api/v1/notes/export`

**Estimated time**: 2 hours

---

### Phase 3.8: Knowledge Graph

**Goal**: Interactive node-and-edge visualization of all knowledge connections.

**Tasks**:
- [ ] Graph rendering (SVG-based for interactivity):
  - Nodes: circles or rounded rects with label
  - Edges: lines/curves between connected nodes
  - Color-coded by type: notes, projects, tasks, research (using project colors)
  - Node size based on connection count
- [ ] Force-directed layout algorithm:
  - Implement simple force simulation (repulsion + attraction + centering)
  - Run in requestAnimationFrame loop until settled
  - Auto-Arrange button to reset layout
- [ ] Interaction:
  - Drag nodes to reposition (pin position after manual move)
  - Pan canvas (mouse drag on background)
  - Zoom (scroll wheel)
  - Click node: show info panel on right
  - Double-click node: navigate to item
- [ ] Info panel (on node click):
  - Item title, type, date
  - List of connections (with relationship labels)
  - Quick actions: Open, Edit, Remove from graph
- [ ] Filtering:
  - Toggle node types on/off (notes, projects, tasks, research)
  - Filter by project
  - Filter by tag
- [ ] Search: type to find and focus/highlight a specific node
- [ ] Smart Clusters: visually group nodes by project or by dense connections
- [ ] Focus Mode: select a node → show only nodes within 1–2 degrees of connection
- [ ] Overview mode: zoom-to-fit all visible nodes
- [ ] Backend: `GET /api/v1/graph`:
  - Aggregate nodes from: notes, projects, tasks, research_documents
  - Aggregate edges from: note_links, smart_connections, project associations
  - Return `{ nodes: [...], edges: [...] }`
- [ ] Performance: limit to ~500 nodes, paginate or filter if more

**Estimated time**: 6 hours

---

### Phase 3.9: Smart Connections

**Goal**: Typed relationships between any content items.

**Tasks**:
- [ ] Connection creation UI:
  - "Connect" action in item context menus and inspector panels
  - Modal: select target item (searchable) + relationship type
  - Relationship types: Related To, Supports, Contradicts, Inspired By, Depends On
- [ ] Connection display:
  - Show connections in item inspector panels
  - Group by relationship type
  - Click to navigate to connected item
- [ ] Connection management:
  - Delete connections
  - View all connections for current item
- [ ] Reflect all connections in Knowledge Graph (as typed edges)
- [ ] Backend: `server/routes/connections.js`, `server/models/Connection.js`
  - Polymorphic: `source_type` + `source_id` → `target_type` + `target_id`
  - Validate that referenced items exist and belong to user
- [ ] Prevent duplicate connections (same source + target + relationship)

**Estimated time**: 3 hours

---

### Phase 3.10: Project Management

**Goal**: Full project lifecycle with dashboard aggregating related items.

**Tasks**:
- [ ] Project creation form: title, description, color (8 options), icon
- [ ] Project list view:
  - Grid layout with project cards
  - Status filter: Active / Archived / All
  - Sort: by name, by date, by activity
  - Card shows: title, description preview, color bar, note/task/research counts
- [ ] Project dashboard page:
  - Header: title, description, color, status, edit button
  - Progress bar: tasks done / total tasks
  - Tabs or sections:
    - **Overview**: recent activity, quick stats
    - **Board**: link to workspace board for this project
    - **Notes**: notes associated with this project (with create/associate actions)
    - **Tasks**: tasks for this project (with create action)
    - **Research**: research documents linked to project
    - **Decisions**: decision log entries (with create action)
- [ ] Project editing (inline or modal)
- [ ] Project archiving (soft: set status to 'archived')
- [ ] Project deletion (with confirmation — cascading effects explained)
- [ ] Associate existing notes/tasks/research with a project
- [ ] Backend: enhance project routes with dashboard aggregation queries

**Estimated time**: 4 hours

---

### Phase 3.11: Supporting Features

**Goal**: Quick Capture, Universal Search, Decision Log, Templates.

**Tasks**:

**Quick Capture Inbox**:
- [ ] Fast capture input at top of page (always visible)
- [ ] Capture types: Text (default), Link (auto-detect URLs), Image (paste/upload)
- [ ] Capture list sorted by newest first
- [ ] "Process" action on each capture: convert to Note, Task, or Research with pre-filled content
- [ ] "Assign to Project" action
- [ ] Delete captures
- [ ] Badge count of unprocessed captures on sidebar nav item
- [ ] Backend: `server/routes/quickCaptures.js`

**Universal Search**:
- [ ] Search bar in topbar triggers search
- [ ] Search input with type-ahead suggestions
- [ ] Search results page with tabs: All, Notes, Projects, Tasks, Research
- [ ] Results show: title, snippet with highlighted match, type icon, date
- [ ] Click result navigates to item
- [ ] Backend: `GET /api/v1/search?q=&type=` — searches across all content types using FULLTEXT or LIKE queries
- [ ] Integrate into Command Palette as well

**Decision Log**:
- [ ] Per-project decision log (accessible from project dashboard)
- [ ] Create decision: title, context, decision, outcome, date
- [ ] List view with inline editing
- [ ] Edit and delete decisions
- [ ] Backend: `server/routes/decisionLogs.js`

**Project Templates**:
- [ ] "Save as Template" option on project context menu
- [ ] Saves: project structure, board layout, sample notes/tasks
- [ ] "Create from Template" option in project creation
- [ ] Template management: view, preview, delete
- [ ] System templates (pre-built, `is_system = true`):
  - Research Project (with folders: Literature, Notes, Analysis)
  - Product Launch (with task templates)
  - Knowledge Base (with folder structure)
- [ ] Backend: `server/routes/templates.js`

**Estimated time**: 4 hours

---

### Segment 3 — Deliverable Checklist

- [ ] Workspace Board: infinite canvas, pan/zoom, grid, minimap
- [ ] Board cards: create, drag, resize, edit, multi-select, all 7 types
- [ ] Board groups: create, contain cards, move together
- [ ] Board connections: create, label, different types, visual curves
- [ ] Board inspector panel: edit selected item details
- [ ] Knowledge Vault: markdown editor with toolbar, live preview, auto-save
- [ ] Vault folders: create, nest, drag notes between
- [ ] Vault tags: create, assign, filter
- [ ] Internal links: `[[Note Title]]` with auto-complete
- [ ] Backlinks and unlinked mentions
- [ ] Import/export markdown notes
- [ ] Knowledge Graph: nodes, edges, force layout, drag, zoom, filter
- [ ] Graph focus mode and auto-arrange
- [ ] Smart Connections: typed relationships between any items
- [ ] Project dashboard with related items aggregation
- [ ] Quick Capture: fast capture, process, project assignment
- [ ] Universal Search: across all content types
- [ ] Decision Log: per-project CRUD
- [ ] Project Templates: save, create from, system templates
- [ ] All data persists to MySQL
- [ ] All buttons functional — no dead interactions
- [ ] Cross-feature navigation works (graph → note, project → board, etc.)

---

## Segment 4 — Productivity, Research & Finalization

### Phase 4.1: Workflow Tracker — Task CRUD

**Goal**: Full task management with statuses and priorities.

**Tasks**:
- [ ] Task creation form: title, description, status, priority, due date, project
- [ ] Task editing (modal or inline)
- [ ] Task deletion with confirmation
- [ ] Task statuses: Planned, In Progress, Done (with color indicators)
- [ ] Task priorities: Low, Medium, High, Urgent (with color indicators)
- [ ] Status quick-toggle (click to cycle through statuses)
- [ ] Set `completed_at` timestamp when status changes to Done
- [ ] Backend: `server/routes/tasks.js`, `server/models/Task.js`
- [ ] Filtering: by status, by priority, by project, by date range
- [ ] Sorting: by due date, by priority, by title, by status

**Estimated time**: 4 hours

---

### Phase 4.2: Workflow Tracker — Views

**Goal**: List, Board (Kanban), and Calendar views for tasks.

**Tasks**:

**List View**:
- [ ] Table layout: checkbox, title, status badge, priority badge, due date, project name
- [ ] Sortable columns (click header to sort)
- [ ] Inline status toggle
- [ ] Row click opens task detail
- [ ] Bulk selection and bulk actions (change status, delete)

**Board View (Kanban)**:
- [ ] Three columns: Planned | In Progress | Done
- [ ] Task cards in each column
- [ ] Drag and drop between columns (changes status)
- [ ] Drag and drop within column (changes sort order)
- [ ] Column header shows count
- [ ] Add task button at bottom of each column

**Calendar View**:
- [ ] Monthly calendar grid
- [ ] Tasks appear on their due date
- [ ] Color-coded by priority
- [ ] Click date to add new task with that due date
- [ ] Click task to open detail
- [ ] Navigation: previous/next month
- [ ] Today indicator

**View Persistence**:
- [ ] View toggle buttons (List / Board / Calendar)
- [ ] Remember selected view in localStorage
- [ ] Filters persist across view switches

**Progress Tracking**:
- [ ] Per-project progress bar (done / total)
- [ ] Overall progress summary on dashboard

**Estimated time**: 5 hours

---

### Phase 4.3: Research Center — File Import

**Goal**: Import and process research documents (MD, PDF, DOCX, TXT).

**Tasks**:
- [ ] Install additional dependencies: `pdf-parse`, `mammoth`
- [ ] File upload UI:
  - Drag-and-drop zone
  - File picker button
  - Accepted types: `.md`, `.pdf`, `.docx`, `.txt`
  - File size limit: 10MB
  - Upload progress indicator
- [ ] File processing pipeline:
  - **MD**: Read file, store content directly as `content_text`
  - **TXT**: Read file, store content directly as `content_text`
  - **PDF**: Use `pdf-parse` to extract text → `content_text`
  - **DOCX**: Use `mammoth` to extract text/HTML → `content_text`
- [ ] Store file in `uploads/research/` with UUID prefix
- [ ] Metadata capture on import: title (from filename or first heading), source URL (optional input)
- [ ] Backend: `POST /api/v1/research/import` with multer:
  - Validate file type and size
  - Sanitize filename
  - Process and extract text
  - Create `research_documents` record
- [ ] Show import result (success/failure with details)
- [ ] Batch import: multiple files at once

**Estimated time**: 4 hours

---

### Phase 4.4: Research Center — Management

**Goal**: Browse, preview, edit metadata, and connect research documents.

**Tasks**:
- [ ] Research list view:
  - Cards or table rows
  - Columns: title, type icon, file size, import date, project, tags
  - Filter by: file type, project, tags
  - Sort by: date, title, type
  - Search (title + content)
- [ ] Document preview panel:
  - **MD/TXT**: Render as formatted markdown/text
  - **PDF**: Embedded PDF viewer (`<iframe>` or `<object>`)
  - **DOCX**: Render extracted HTML content
  - Toggle between preview and metadata view
- [ ] Metadata editing:
  - Title (editable)
  - Summary (textarea — user-written or future AI-generated)
  - Source URL (input)
  - Tags (tag picker — shared with note tags)
  - Project association (dropdown)
- [ ] Connect research to vault notes (via smart connections UI)
- [ ] Delete with confirmation (removes file from disk + database record)
- [ ] Backend: full CRUD in `server/routes/research.js`
  - `GET /api/v1/research` — list with filters
  - `GET /api/v1/research/:id` — detail
  - `GET /api/v1/research/:id/preview` — serve file content or raw file
  - `PUT /api/v1/research/:id` — update metadata
  - `DELETE /api/v1/research/:id` — delete record + file

**Estimated time**: 4 hours

---

### Phase 4.5: Version History

**Goal**: Automatic note versioning with restore capability.

**Tasks**:
- [ ] Auto-create version on significant saves:
  - Version created when note is saved after ≥30 seconds since last version
  - Or when content changes exceed a threshold (e.g., >50 characters changed)
  - Store: title, content, version_number, created_by, timestamp
- [ ] Version list UI:
  - Accessible from note editor (history icon/button)
  - Modal or side panel listing versions
  - Each entry: version number, date, time ago
  - Click to preview version content
- [ ] Version preview:
  - Read-only rendered view of the version
  - Side-by-side or toggle comparison with current
- [ ] Diff view:
  - Highlight additions (green) and deletions (red)
  - Line-by-line or word-by-word comparison
- [ ] Restore version:
  - Button to restore (creates a new version with the restored content, doesn't delete history)
  - Confirmation dialog
- [ ] Backend: `server/routes/noteVersions.js`
  - `GET /api/v1/note-versions/note/:noteId` — list versions
  - `GET /api/v1/note-versions/:id` — version content
  - `POST /api/v1/note-versions/:id/restore` — restore version

**Estimated time**: 3 hours

---

### Phase 4.6: Flowden Guide

**Goal**: In-app help center with feature documentation and guided tour.

**Tasks**:
- [ ] Guide page structure:
  - Sidebar navigation (within guide page)
  - Content area with rendered documentation

- [ ] **Getting Started**:
  - Welcome and product overview
  - Creating your first project
  - Adding notes to the Knowledge Vault
  - Using the Workspace Board
  - Creating and managing tasks
  - Importing research documents
  - Discovering connections

- [ ] **Feature Library**:
  - Categorized list of all features
  - Each feature: name, description, screenshot placeholder, related tips
  - Categories: Organization, Knowledge, Research, Workflow, Navigation

- [ ] **Tips & Tricks**:
  - Keyboard shortcuts table (all shortcuts in one page)
  - Power user workflows (e.g., "Research to Action" pipeline)
  - Hidden features and productivity hacks

- [ ] **What's New**:
  - Changelog format with dates
  - Version-tagged entries
  - Highlight new features

- [ ] **Search within Guide**:
  - Filter/search guide content
  - Highlight matching sections

- [ ] **Contextual Help**:
  - `?` icons on complex features
  - Click opens relevant guide section in side panel or navigates to guide
  - Help tooltips on first-time interactions

- [ ] **Guided Tour** (first-time users):
  - Step-by-step overlay highlighting UI elements
  - Steps: Sidebar, Projects, Vault, Board, Graph, Workflow, Search, Capture
  - Skip button, Next/Back buttons, progress dots
  - Tour completion stored in `user.settings_json`
  - "Restart Tour" button in Guide page
  - Tour auto-starts on first login (if not completed)

**Estimated time**: 4 hours

---

### Phase 4.7: AI Assistant & MCP Foundation

**Goal**: Architecture for future AI integration, clear current-state UI.

**Tasks**:
- [ ] AI Assistant page:
  - Header: "AI Assistant" with status badge ("Not Configured")
  - Description section: what the AI Assistant will be able to do
    - Read authorized project documentation
    - Search project knowledge base
    - Retrieve relevant research
    - Understand project context
    - Suggest tasks and organizational improvements
  - Configuration panel:
    - MCP Server URL input (disabled/placeholder)
    - API key input (disabled/placeholder)
    - "Save Configuration" button (disabled)
  - Permission settings:
    - Toggle per project: allow AI access
    - Data scope: read-only vs read-write
  - Status: clear "Configure AI provider to enable" message
  - **Do not fake any AI responses**

- [ ] MCP-ready architecture (code-level preparation):
  - Create `server/mcp/` directory structure:
    ```
    server/mcp/
    ├── README.md          (integration documentation)
    ├── tools/             (tool definitions)
    │   ├── readProject.js
    │   ├── searchNotes.js
    │   ├── getTasks.js
    │   ├── getResearch.js
    │   └── getConnections.js
    └── middleware/
        └── mcpAuth.js     (MCP-specific auth middleware)
    ```
  - Document each tool's schema (name, description, parameters, returns)
  - Create MCP integration guide in `server/mcp/README.md`
  - Permission check: MCP tools only access projects where user has granted permission

- [ ] Add `assistant` section to user settings (store MCP config for when it's ready)

**Estimated time**: 3 hours

---

### Phase 4.8: Settings Enhancements

**Goal**: Complete settings with all user and admin functionality.

**Tasks**:
- [ ] **Profile tab**:
  - Display name (editable)
  - Email (read-only)
  - Avatar upload (with preview and crop)
  - Save button with success toast

- [ ] **Appearance tab**:
  - Theme selector: Dark / Light (with live preview)
  - Sidebar default state: Expanded / Collapsed
  - Editor font size preference
  - Grid size preference for workspace board

- [ ] **Data tab**:
  - Export all data as JSON bundle (projects, notes, tasks, research metadata)
  - Import data (with validation and conflict resolution)
  - Account data summary (counts per entity type)

- [ ] **Account tab**:
  - Change password (current password + new password + confirm)
  - Delete account (with "type DELETE to confirm" safeguard)
  - Session info (last login time)

- [ ] **Admin tab** (admin only):
  - User list table: email, display name, role, created date, last login
  - Change user role (dropdown: admin/user)
  - User count and system statistics
  - Storage usage (uploaded files total size)

**Estimated time**: 2 hours

---

### Phase 4.9: Security & Quality Audit

**Goal**: Comprehensive security review and bug fixing.

**Tasks**:

**Security Audit**:
- [ ] All API routes require authentication (except register, login)
- [ ] Admin-only routes check `req.user.role === 'admin'`
- [ ] Every data query filters by `user_id` (no cross-user data access)
- [ ] File upload validation:
  - Allowed MIME types only
  - File size limits enforced
  - Filenames sanitized (no path traversal)
  - Files stored outside public directory
- [ ] All database queries use parameterized statements (no string concatenation)
- [ ] User-generated content sanitized on output (prevent XSS)
- [ ] Rate limiting on authentication routes (5 attempts / 15 minutes)
- [ ] CORS configured for same-origin in production
- [ ] Helmet middleware sets security headers
- [ ] JWT secret is strong and not hardcoded
- [ ] Passwords hashed with bcryptjs (cost factor 12)
- [ ] httpOnly + secure (in production) + sameSite on JWT cookies

**Functional Testing**:
- [ ] All forms submit correctly and show validation errors
- [ ] All buttons have working handlers (no dead clicks)
- [ ] All navigation links route correctly
- [ ] All CRUD operations work: create, read, update, delete for every entity
- [ ] Search works across all content types
- [ ] Drag and drop works on workspace board
- [ ] Knowledge graph renders and interactions work
- [ ] File import/export works for all supported types
- [ ] Version history creates, lists, and restores correctly
- [ ] Theme switching applies correctly everywhere

**Responsive Testing**:
- [ ] Desktop (1280px+): full layout
- [ ] Small desktop (1024–1279px): sidebar collapsed
- [ ] Tablet (768–1023px): sidebar overlay
- [ ] Mobile (<768px): simplified layout

**Error Handling**:
- [ ] No unhandled promise rejections on server
- [ ] No uncaught exceptions on server
- [ ] No console errors in browser
- [ ] API errors return proper status codes and messages
- [ ] Network failures show user-friendly errors
- [ ] 404 page for unknown routes

**Estimated time**: 4 hours

---

### Phase 4.10: Final Polish & Documentation

**Goal**: Production-ready state with complete documentation.

**Tasks**:
- [ ] Create comprehensive `README.md`:
  - Product description and philosophy
  - Screenshots (or screenshot placeholders)
  - Prerequisites: Node.js 18+, MySQL 8.0+
  - Installation steps:
    1. Clone repository
    2. `npm install`
    3. Create MySQL database
    4. Copy `.env.example` → `.env` and configure
    5. `npm run migrate`
    6. `npm run dev` (or `npm start`)
  - Default access: first registered user becomes admin
  - Feature overview (with section for each major module)
  - Keyboard shortcuts table
  - MCP integration notes (how to connect when ready)
  - Technology stack
  - Project structure overview
  - License

- [ ] Code cleanup:
  - Remove `console.log` debug statements
  - Consistent code formatting
  - Add JSDoc comments to backend route handlers
  - Add comments to complex frontend logic (canvas, graph)

- [ ] Visual consistency pass:
  - Verify all pages use same spacing, typography, colors
  - Check dark mode and light mode for every page
  - Verify empty states are consistent
  - Verify loading states are consistent

- [ ] Performance check:
  - Test with large note list (100+ notes)
  - Test graph with many nodes (50+ nodes, 100+ connections)
  - Test board with many cards (50+)
  - Identify and fix any sluggish interactions

- [ ] Final build:
  - Test clean install from scratch
  - Run migrations on empty database
  - Register first user → verify admin
  - Walk through every feature

**Estimated time**: 3 hours

---

### Segment 4 — Deliverable Checklist

- [ ] Workflow Tracker: task CRUD with status (Planned/In Progress/Done) and priority
- [ ] Workflow List View: sortable table, inline status toggle
- [ ] Workflow Board View: Kanban drag-and-drop between columns
- [ ] Workflow Calendar View: monthly view with tasks on due dates
- [ ] Research Center: import MD, PDF, DOCX, TXT files
- [ ] Research preview: rendered content for each file type
- [ ] Research metadata editing: title, summary, source URL, tags, project
- [ ] Version History: auto-versioning, version list, preview, diff, restore
- [ ] Flowden Guide: Getting Started, Feature Library, Tips, What's New
- [ ] Guided Tour: step-by-step overlay, skip/restart, persisted completion
- [ ] Contextual help: `?` icons linking to guide
- [ ] AI Assistant: "Not Configured" state with clear description and setup placeholder
- [ ] MCP architecture: tool schemas, directory structure, integration docs
- [ ] Settings: profile, appearance, data export/import, account, admin panel
- [ ] Security audit passed: auth, roles, data isolation, uploads, XSS, SQLi
- [ ] All forms and buttons functional
- [ ] Responsive layout at all breakpoints
- [ ] No console errors (frontend or backend)
- [ ] README.md with complete setup instructions
- [ ] Clean codebase with consistent formatting

---

## Risk Register

| Risk | Impact | Mitigation |
|---|---|---|
| Canvas performance with many cards | Board becomes sluggish | Virtual rendering — only render visible cards. Batch position updates. |
| Graph performance with many nodes | Graph becomes unresponsive | Limit to 500 nodes. Web Worker for force simulation. Level-of-detail rendering. |
| File upload security | Malicious files | Strict MIME type validation. File content scanning. Filename sanitization. Store outside webroot. |
| MySQL FULLTEXT search limitations | Poor search relevance | Consider adding search indexing or relevance scoring. Fallback to LIKE queries. |
| Large file imports (PDF/DOCX) | Memory issues on server | Stream processing. File size limits. Process in background if needed. |
| Browser compatibility | Canvas/SVG differences | Test on Chrome, Firefox, Edge. Use standard APIs. Provide fallbacks. |
| Data migration between versions | Schema changes break existing data | Numbered migration files. Never modify existing migrations — add new ones. |

---

## Technology Dependencies

| Package | Version | Purpose |
|---|---|---|
| express | ^4.x | Web framework |
| mysql2 | ^3.x | MySQL driver |
| bcryptjs | ^2.x | Password hashing |
| jsonwebtoken | ^9.x | JWT auth |
| cookie-parser | ^1.x | Cookie handling |
| multer | ^1.x | File uploads |
| dotenv | ^16.x | Environment variables |
| cors | ^2.x | CORS middleware |
| helmet | ^7.x | Security headers |
| express-rate-limit | ^7.x | Rate limiting |
| express-validator | ^7.x | Input validation |
| uuid | ^9.x | Unique identifiers |
| pdf-parse | ^1.x | PDF text extraction (Segment 4) |
| mammoth | ^1.x | DOCX text extraction (Segment 4) |
| nodemon | ^3.x | Dev auto-restart (devDependency) |

