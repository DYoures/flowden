# FLOWDEN — Technical Project Brief

> **Your Ideas, in Motion.**
> *Turn scattered information into connected knowledge, and connected knowledge into meaningful action.*

---

## 1. Product Overview

**Flowden** is a Modern Spatial Productivity Workspace that bridges the gap between research, knowledge management, and project execution. It provides a unified environment where knowledge workers can collect research, organize ideas spatially, discover connections between concepts, and track workflows — all within a cohesive, premium interface.

### Core Value Chain

```
Research → Knowledge → Connection → Planning → Execution
```

### Target Users

- Knowledge workers managing complex, multi-source projects
- Researchers organizing literature, references, and findings
- Project managers coordinating tasks, decisions, and documentation
- Students managing coursework, thesis research, and study notes
- Creative professionals organizing inspiration, concepts, and deliverables

### What Flowden Combines

| Capability | Description |
|---|---|
| Visual Project Organization | Spatial workspace boards for arranging ideas, notes, and references |
| Knowledge Management | Markdown-based vault with folders, tags, internal links, and backlinks |
| Research Management | Import, preview, and connect research documents (PDF, DOCX, MD, TXT) |
| Workflow Tracking | Tasks with statuses, priorities, deadlines — list, board, and calendar views |
| AI-Assisted Context | Future MCP integration for project-aware AI assistance |

### Product Identity

Flowden is **not** a clone of Notion, Milanote, or Obsidian. It occupies a unique position:

- More **spatial** than Notion (visual canvas-based organization)
- More **structured** than Milanote (full knowledge vault, workflow tracking, research management)
- More **visual** than Obsidian (spatial boards, rich project dashboards)
- More **connected** than any single tool (smart connections across all content types)

---

## 2. Technical Architecture

### Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML, CSS, JavaScript (no framework) |
| Backend | Node.js + Express.js |
| Database | MySQL 8.0+ |
| Future MCP | Node.js, TypeScript, MCP SDK |

### Communication Flow

```
┌─────────────────────────────────────────────────────┐
│  Browser (Frontend)                                 │
│  ┌───────────┐  ┌────────────┐  ┌───────────────┐  │
│  │ HTML/CSS  │  │ JS Router  │  │ API Client    │  │
│  │ (static)  │  │ (SPA hash) │  │ (fetch-based) │  │
│  └───────────┘  └────────────┘  └───────┬───────┘  │
└─────────────────────────────────────────┼───────────┘
                                          │ HTTP/JSON
                                          ▼
┌─────────────────────────────────────────────────────┐
│  Express.js Server                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │ Middleware│  │  Routes  │  │  Models / Query  │  │
│  │ (auth,   │  │ /api/v1/ │  │  Helpers         │  │
│  │  cors,   │  │          │  │                  │  │
│  │  upload) │  │          │  │                  │  │
│  └──────────┘  └──────────┘  └────────┬─────────┘  │
│                                       │             │
│  ┌──────────────────────────────────┐ │             │
│  │ Static File Serving (public/)    │ │             │
│  └──────────────────────────────────┘ │             │
└───────────────────────────────────────┼─────────────┘
                                        │ mysql2
                                        ▼
┌─────────────────────────────────────────────────────┐
│  MySQL Database                                     │
│  flowden (utf8mb4_unicode_ci)                       │
│  ┌────────┐ ┌────────┐ ┌─────────┐ ┌────────────┐  │
│  │ users  │ │projects│ │  notes  │ │   tasks    │  │
│  │ boards │ │  items │ │ research│ │connections │  │
│  └────────┘ └────────┘ └─────────┘ └────────────┘  │
└─────────────────────────────────────────────────────┘

                    ┌─────────────────────────────┐
                    │  Future: MCP Server          │
                    │  (Node.js / TypeScript)      │
                    │  Connects to Express API     │
                    │  Exposes tools for AI agents │
                    └─────────────────────────────┘
```

### API Design

- **Base path**: `/api/v1/`
- **Format**: RESTful JSON
- **Authentication**: JWT tokens in httpOnly secure cookies
- **File uploads**: multipart/form-data via multer → `uploads/` directory
- **Error responses**: Consistent `{ error: string, details?: any }` format
- **Pagination**: `?page=1&limit=20` with response `{ data: [], total: number, page: number }`

### Authentication Flow

1. User registers/logs in → server creates JWT → sets httpOnly cookie
2. Every API request sends cookie automatically
3. Auth middleware verifies JWT, attaches `req.user`
4. Role middleware checks `req.user.role` for admin-only routes
5. Data access filtered by `user_id` — users can only access their own data

### File Storage

- Uploaded files stored in `uploads/` directory on server filesystem
- Organized by type: `uploads/avatars/`, `uploads/research/`, `uploads/images/`
- Filenames sanitized and renamed with UUID prefix to prevent collisions
- File metadata stored in database with path reference

---

## 3. Database Schema

### Entity Relationship Overview

```
users ─────────┬──── projects ────── boards ────── board_items
               │          │                            │
               │          │                     board_item_connections
               │          │                            │
               │          ├──── tasks               board_groups
               │          ├──── decision_logs
               │          └──── research_documents ── research_tags
               │
               ├──── notes ─────── note_links
               │       │            note_versions
               │       └──────── note_tag_map ──── note_tags
               │
               ├──── note_folders (self-referencing)
               ├──── quick_captures
               ├──── templates
               └──── smart_connections (polymorphic)
```

### Table Definitions

#### `users`

| Column | Type | Constraints |
|---|---|---|
| id | INT UNSIGNED | PK, AUTO_INCREMENT |
| email | VARCHAR(255) | UNIQUE, NOT NULL |
| password_hash | VARCHAR(255) | NOT NULL |
| display_name | VARCHAR(100) | NOT NULL |
| avatar_url | VARCHAR(500) | NULL |
| role | ENUM('admin','user') | DEFAULT 'user' |
| theme_preference | ENUM('dark','light') | DEFAULT 'dark' |
| settings_json | JSON | NULL (extensible user preferences) |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |
| updated_at | TIMESTAMP | ON UPDATE CURRENT_TIMESTAMP |

#### `projects`

| Column | Type | Constraints |
|---|---|---|
| id | INT UNSIGNED | PK, AUTO_INCREMENT |
| user_id | INT UNSIGNED | FK → users(id) ON DELETE CASCADE |
| title | VARCHAR(200) | NOT NULL |
| description | TEXT | NULL |
| color | VARCHAR(7) | DEFAULT '#7c5cbf' |
| icon | VARCHAR(50) | DEFAULT 'folder' |
| status | ENUM('active','archived') | DEFAULT 'active' |
| sort_order | INT | DEFAULT 0 |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |
| updated_at | TIMESTAMP | ON UPDATE CURRENT_TIMESTAMP |

**Index**: `(user_id, status)`

#### `boards`

| Column | Type | Constraints |
|---|---|---|
| id | INT UNSIGNED | PK, AUTO_INCREMENT |
| project_id | INT UNSIGNED | FK → projects(id) ON DELETE CASCADE |
| user_id | INT UNSIGNED | FK → users(id) ON DELETE CASCADE |
| title | VARCHAR(200) | NOT NULL |
| description | TEXT | NULL |
| zoom_level | FLOAT | DEFAULT 1.0 |
| viewport_x | FLOAT | DEFAULT 0 |
| viewport_y | FLOAT | DEFAULT 0 |
| grid_size | INT | DEFAULT 20 |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |
| updated_at | TIMESTAMP | ON UPDATE CURRENT_TIMESTAMP |

**Index**: `(project_id)`, `(user_id)`

#### `board_items`

| Column | Type | Constraints |
|---|---|---|
| id | INT UNSIGNED | PK, AUTO_INCREMENT |
| board_id | INT UNSIGNED | FK → boards(id) ON DELETE CASCADE |
| user_id | INT UNSIGNED | FK → users(id) ON DELETE CASCADE |
| item_type | ENUM('note','idea','image','link','research_ref','task','document') | NOT NULL |
| title | VARCHAR(300) | NULL |
| content | TEXT | NULL |
| position_x | FLOAT | NOT NULL DEFAULT 0 |
| position_y | FLOAT | NOT NULL DEFAULT 0 |
| width | FLOAT | DEFAULT 200 |
| height | FLOAT | DEFAULT 150 |
| color | VARCHAR(7) | NULL |
| z_index | INT | DEFAULT 0 |
| group_id | INT UNSIGNED | FK → board_groups(id) ON DELETE SET NULL |
| reference_id | INT UNSIGNED | NULL (links to note/task/research by their id) |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |
| updated_at | TIMESTAMP | ON UPDATE CURRENT_TIMESTAMP |

**Index**: `(board_id)`, `(group_id)`

#### `board_item_connections`

| Column | Type | Constraints |
|---|---|---|
| id | INT UNSIGNED | PK, AUTO_INCREMENT |
| board_id | INT UNSIGNED | FK → boards(id) ON DELETE CASCADE |
| source_item_id | INT UNSIGNED | FK → board_items(id) ON DELETE CASCADE |
| target_item_id | INT UNSIGNED | FK → board_items(id) ON DELETE CASCADE |
| connection_type | VARCHAR(50) | DEFAULT 'default' |
| label | VARCHAR(200) | NULL |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

**Index**: `(board_id)`, `(source_item_id)`, `(target_item_id)`

#### `board_groups`

| Column | Type | Constraints |
|---|---|---|
| id | INT UNSIGNED | PK, AUTO_INCREMENT |
| board_id | INT UNSIGNED | FK → boards(id) ON DELETE CASCADE |
| title | VARCHAR(200) | NOT NULL |
| color | VARCHAR(7) | NULL |
| position_x | FLOAT | DEFAULT 0 |
| position_y | FLOAT | DEFAULT 0 |
| width | FLOAT | DEFAULT 400 |
| height | FLOAT | DEFAULT 300 |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |
| updated_at | TIMESTAMP | ON UPDATE CURRENT_TIMESTAMP |

#### `notes`

| Column | Type | Constraints |
|---|---|---|
| id | INT UNSIGNED | PK, AUTO_INCREMENT |
| user_id | INT UNSIGNED | FK → users(id) ON DELETE CASCADE |
| project_id | INT UNSIGNED | FK → projects(id) ON DELETE SET NULL, NULL |
| folder_id | INT UNSIGNED | FK → note_folders(id) ON DELETE SET NULL, NULL |
| title | VARCHAR(300) | NOT NULL |
| content | LONGTEXT | NULL (Markdown) |
| is_pinned | BOOLEAN | DEFAULT FALSE |
| word_count | INT | DEFAULT 0 |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |
| updated_at | TIMESTAMP | ON UPDATE CURRENT_TIMESTAMP |

**Index**: `(user_id)`, `(project_id)`, `(folder_id)`, FULLTEXT `(title, content)`

#### `note_folders`

| Column | Type | Constraints |
|---|---|---|
| id | INT UNSIGNED | PK, AUTO_INCREMENT |
| user_id | INT UNSIGNED | FK → users(id) ON DELETE CASCADE |
| parent_folder_id | INT UNSIGNED | FK → note_folders(id) ON DELETE CASCADE, NULL |
| name | VARCHAR(200) | NOT NULL |
| sort_order | INT | DEFAULT 0 |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |
| updated_at | TIMESTAMP | ON UPDATE CURRENT_TIMESTAMP |

**Index**: `(user_id, parent_folder_id)`

#### `note_tags`

| Column | Type | Constraints |
|---|---|---|
| id | INT UNSIGNED | PK, AUTO_INCREMENT |
| user_id | INT UNSIGNED | FK → users(id) ON DELETE CASCADE |
| name | VARCHAR(100) | NOT NULL |
| color | VARCHAR(7) | DEFAULT '#7c5cbf' |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

**Unique**: `(user_id, name)`

#### `note_tag_map`

| Column | Type | Constraints |
|---|---|---|
| note_id | INT UNSIGNED | FK → notes(id) ON DELETE CASCADE |
| tag_id | INT UNSIGNED | FK → note_tags(id) ON DELETE CASCADE |

**PK**: `(note_id, tag_id)`

#### `note_links`

| Column | Type | Constraints |
|---|---|---|
| id | INT UNSIGNED | PK, AUTO_INCREMENT |
| source_note_id | INT UNSIGNED | FK → notes(id) ON DELETE CASCADE |
| target_note_id | INT UNSIGNED | FK → notes(id) ON DELETE CASCADE |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

**Unique**: `(source_note_id, target_note_id)`

#### `note_versions`

| Column | Type | Constraints |
|---|---|---|
| id | INT UNSIGNED | PK, AUTO_INCREMENT |
| note_id | INT UNSIGNED | FK → notes(id) ON DELETE CASCADE |
| title | VARCHAR(300) | NOT NULL |
| content | LONGTEXT | NULL |
| version_number | INT | NOT NULL |
| created_by | INT UNSIGNED | FK → users(id) ON DELETE SET NULL |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

**Index**: `(note_id, version_number DESC)`

#### `research_documents`

| Column | Type | Constraints |
|---|---|---|
| id | INT UNSIGNED | PK, AUTO_INCREMENT |
| user_id | INT UNSIGNED | FK → users(id) ON DELETE CASCADE |
| project_id | INT UNSIGNED | FK → projects(id) ON DELETE SET NULL, NULL |
| title | VARCHAR(300) | NOT NULL |
| original_filename | VARCHAR(300) | NOT NULL |
| file_path | VARCHAR(500) | NOT NULL |
| file_type | ENUM('md','pdf','docx','txt') | NOT NULL |
| file_size | INT UNSIGNED | NOT NULL |
| content_text | LONGTEXT | NULL (extracted text for search) |
| summary | TEXT | NULL |
| source_url | VARCHAR(1000) | NULL |
| import_date | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |
| updated_at | TIMESTAMP | ON UPDATE CURRENT_TIMESTAMP |

**Index**: `(user_id)`, `(project_id)`, FULLTEXT `(title, content_text, summary)`

#### `research_tags`

| Column | Type | Constraints |
|---|---|---|
| research_document_id | INT UNSIGNED | FK → research_documents(id) ON DELETE CASCADE |
| tag_id | INT UNSIGNED | FK → note_tags(id) ON DELETE CASCADE |

**PK**: `(research_document_id, tag_id)`

#### `tasks`

| Column | Type | Constraints |
|---|---|---|
| id | INT UNSIGNED | PK, AUTO_INCREMENT |
| user_id | INT UNSIGNED | FK → users(id) ON DELETE CASCADE |
| project_id | INT UNSIGNED | FK → projects(id) ON DELETE SET NULL, NULL |
| title | VARCHAR(300) | NOT NULL |
| description | TEXT | NULL |
| status | ENUM('planned','in_progress','done') | DEFAULT 'planned' |
| priority | ENUM('low','medium','high','urgent') | DEFAULT 'medium' |
| due_date | DATE | NULL |
| sort_order | INT | DEFAULT 0 |
| completed_at | TIMESTAMP | NULL |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |
| updated_at | TIMESTAMP | ON UPDATE CURRENT_TIMESTAMP |

**Index**: `(user_id, status)`, `(project_id)`, `(due_date)`

#### `decision_logs`

| Column | Type | Constraints |
|---|---|---|
| id | INT UNSIGNED | PK, AUTO_INCREMENT |
| user_id | INT UNSIGNED | FK → users(id) ON DELETE CASCADE |
| project_id | INT UNSIGNED | FK → projects(id) ON DELETE CASCADE |
| title | VARCHAR(300) | NOT NULL |
| context | TEXT | NULL |
| decision | TEXT | NOT NULL |
| outcome | TEXT | NULL |
| decided_at | DATE | NULL |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |
| updated_at | TIMESTAMP | ON UPDATE CURRENT_TIMESTAMP |

**Index**: `(project_id)`

#### `templates`

| Column | Type | Constraints |
|---|---|---|
| id | INT UNSIGNED | PK, AUTO_INCREMENT |
| user_id | INT UNSIGNED | FK → users(id) ON DELETE SET NULL, NULL |
| name | VARCHAR(200) | NOT NULL |
| description | TEXT | NULL |
| type | ENUM('project','board','note') | NOT NULL |
| template_data | JSON | NOT NULL |
| is_system | BOOLEAN | DEFAULT FALSE |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |
| updated_at | TIMESTAMP | ON UPDATE CURRENT_TIMESTAMP |

#### `quick_captures`

| Column | Type | Constraints |
|---|---|---|
| id | INT UNSIGNED | PK, AUTO_INCREMENT |
| user_id | INT UNSIGNED | FK → users(id) ON DELETE CASCADE |
| content | TEXT | NOT NULL |
| capture_type | ENUM('text','link','image') | DEFAULT 'text' |
| is_processed | BOOLEAN | DEFAULT FALSE |
| project_id | INT UNSIGNED | FK → projects(id) ON DELETE SET NULL, NULL |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

**Index**: `(user_id, is_processed)`

#### `smart_connections`

| Column | Type | Constraints |
|---|---|---|
| id | INT UNSIGNED | PK, AUTO_INCREMENT |
| user_id | INT UNSIGNED | FK → users(id) ON DELETE CASCADE |
| source_type | ENUM('note','research','task','project') | NOT NULL |
| source_id | INT UNSIGNED | NOT NULL |
| target_type | ENUM('note','research','task','project') | NOT NULL |
| target_id | INT UNSIGNED | NOT NULL |
| relationship | ENUM('related_to','supports','contradicts','inspired_by','depends_on') | NOT NULL |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

**Unique**: `(source_type, source_id, target_type, target_id, relationship)`
**Index**: `(user_id)`, `(source_type, source_id)`, `(target_type, target_id)`

---

## 4. Application Structure

### Frontend Routes (Hash-based SPA)

| Route | Page | Description |
|---|---|---|
| `#/overview` | Overview Dashboard | Quick stats, recent activity, quick actions |
| `#/projects` | Projects | Project list/grid with CRUD |
| `#/projects/:id` | Project Dashboard | Per-project overview with related items |
| `#/projects/:id/board` | Workspace Board | Spatial canvas for the project |
| `#/vault` | Knowledge Vault | Note list, folders, editor |
| `#/vault/:noteId` | Note Editor | Full note editing view |
| `#/graph` | Knowledge Graph | Interactive node visualization |
| `#/research` | Research Center | Research document management |
| `#/workflow` | Workflow Tracker | Tasks — list, board, calendar |
| `#/capture` | Quick Capture | Inbox for quick thoughts |
| `#/assistant` | AI Assistant | Future MCP integration |
| `#/guide` | Flowden Guide | Help center and tutorials |
| `#/settings` | Settings | User profile and app configuration |
| `#/search?q=` | Search Results | Universal search results |

### Backend API Routes

```
/api/v1/
├── auth/
│   ├── POST   /register
│   ├── POST   /login
│   ├── POST   /logout
│   └── GET    /me
├── users/
│   ├── GET    /me
│   └── PUT    /me
├── projects/
│   ├── GET    /                  (list user's projects)
│   ├── POST   /                  (create project)
│   ├── GET    /:id               (get project with stats)
│   ├── PUT    /:id               (update project)
│   ├── DELETE /:id               (delete project)
│   └── GET    /:id/dashboard     (aggregated project data)
├── boards/
│   ├── GET    /project/:projectId
│   ├── POST   /
│   ├── GET    /:id               (full board with items, groups, connections)
│   ├── PUT    /:id               (update viewport, title, etc.)
│   └── DELETE /:id
├── board-items/
│   ├── POST   /                  (create item on board)
│   ├── PUT    /:id               (update position, content, etc.)
│   ├── PUT    /batch             (batch update positions)
│   └── DELETE /:id
├── board-groups/
│   ├── POST   /
│   ├── PUT    /:id
│   └── DELETE /:id
├── board-connections/
│   ├── POST   /
│   ├── PUT    /:id
│   └── DELETE /:id
├── notes/
│   ├── GET    /                  (list, filter, search)
│   ├── POST   /
│   ├── GET    /:id
│   ├── PUT    /:id
│   ├── DELETE /:id
│   └── POST   /import            (import .md file)
├── note-folders/
│   ├── GET    /                  (folder tree)
│   ├── POST   /
│   ├── PUT    /:id
│   └── DELETE /:id
├── note-tags/
│   ├── GET    /
│   ├── POST   /
│   ├── PUT    /:id
│   └── DELETE /:id
├── note-links/
│   ├── GET    /note/:noteId      (links + backlinks)
│   ├── POST   /
│   ├── DELETE /:id
│   └── GET    /unlinked/:noteId  (unlinked mentions)
├── note-versions/
│   ├── GET    /note/:noteId      (version list)
│   ├── GET    /:id               (version content)
│   └── POST   /:id/restore      (restore version)
├── research/
│   ├── GET    /
│   ├── POST   /import            (file upload)
│   ├── GET    /:id
│   ├── PUT    /:id
│   ├── DELETE /:id
│   └── GET    /:id/preview       (file content/preview)
├── tasks/
│   ├── GET    /                  (list, filter, sort)
│   ├── POST   /
│   ├── GET    /:id
│   ├── PUT    /:id
│   ├── DELETE /:id
│   └── PUT    /reorder           (batch reorder)
├── decision-logs/
│   ├── GET    /project/:projectId
│   ├── POST   /
│   ├── PUT    /:id
│   └── DELETE /:id
├── templates/
│   ├── GET    /
│   ├── POST   /
│   ├── GET    /:id
│   ├── POST   /:id/apply         (create from template)
│   └── DELETE /:id
├── quick-captures/
│   ├── GET    /
│   ├── POST   /
│   ├── PUT    /:id/process       (move to note/task)
│   └── DELETE /:id
├── connections/
│   ├── GET    /                  (filter by source/target)
│   ├── POST   /
│   └── DELETE /:id
├── search/
│   └── GET    /?q=&type=         (universal search)
├── graph/
│   └── GET    /                  (aggregated graph data)
└── admin/
    ├── GET    /users             (admin: user list)
    ├── PUT    /users/:id/role    (admin: change role)
    └── GET    /stats             (admin: system stats)
```

### Reusable Frontend Components

| Component | Usage |
|---|---|
| Modal | Confirmations, forms, info display |
| Dropdown | Menus, selects, filters |
| Button | Primary, Secondary, Ghost, Danger variants |
| Input | Text, textarea, select, date, file |
| Card | Project, note, task, research cards |
| Toast | Success, error, warning, info notifications |
| EmptyState | Icon + title + description + CTA |
| LoadingSkeleton | Content placeholder during loading |
| SearchBar | Global and in-page search |
| TagPill | Colored tag display |
| Avatar | User avatar with fallback |
| Breadcrumb | Navigation path |
| ContextMenu | Right-click actions |
| CommandPalette | Ctrl+K global command interface |
| Inspector | Right-side detail panel |

---

## 5. Project Directory Structure

```
flowden/
├── docs/
│   ├── FLOWDEN_PROJECT_BRIEF.md
│   ├── FLOWDEN_DESIGN_SYSTEM.md
│   └── FLOWDEN_IMPLEMENTATION_PLAN.md
├── server/
│   ├── index.js                    # Express entry point
│   ├── config/
│   │   ├── database.js             # MySQL connection pool (mysql2)
│   │   └── auth.js                 # JWT configuration
│   ├── middleware/
│   │   ├── auth.js                 # JWT verification
│   │   ├── roles.js                # Role-based access control
│   │   ├── upload.js               # Multer file upload config
│   │   ├── validate.js             # Request validation helpers
│   │   └── errorHandler.js         # Global error handler
│   ├── routes/
│   │   ├── auth.js
│   │   ├── users.js
│   │   ├── projects.js
│   │   ├── boards.js
│   │   ├── boardItems.js
│   │   ├── boardGroups.js
│   │   ├── boardConnections.js
│   │   ├── notes.js
│   │   ├── noteFolders.js
│   │   ├── noteTags.js
│   │   ├── noteLinks.js
│   │   ├── noteVersions.js
│   │   ├── research.js
│   │   ├── tasks.js
│   │   ├── decisionLogs.js
│   │   ├── templates.js
│   │   ├── quickCaptures.js
│   │   ├── connections.js
│   │   ├── search.js
│   │   ├── graph.js
│   │   └── admin.js
│   ├── models/                     # Database query helpers per entity
│   │   ├── User.js
│   │   ├── Project.js
│   │   ├── Board.js
│   │   ├── Note.js
│   │   ├── Task.js
│   │   └── ...
│   ├── utils/
│   │   ├── validators.js           # Input validation schemas
│   │   └── helpers.js              # Shared utilities
│   └── migrations/
│       ├── runner.js               # Migration execution script
│       ├── 001_users.sql
│       ├── 002_projects.sql
│       ├── 003_boards.sql
│       ├── 004_board_items.sql
│       ├── 005_notes.sql
│       ├── 006_note_folders.sql
│       ├── 007_tags.sql
│       ├── 008_research.sql
│       ├── 009_tasks.sql
│       ├── 010_decision_logs.sql
│       ├── 011_templates.sql
│       ├── 012_quick_captures.sql
│       ├── 013_connections.sql
│       └── 014_note_versions.sql
├── public/
│   ├── index.html                  # Login / Register page
│   ├── app.html                    # Main SPA shell
│   ├── css/
│   │   ├── variables.css           # Design tokens (both themes)
│   │   ├── base.css                # Reset, typography, scrollbar
│   │   ├── components.css          # All reusable component styles
│   │   ├── layout.css              # App shell grid, sidebar, topbar
│   │   └── pages/
│   │       ├── overview.css
│   │       ├── projects.css
│   │       ├── board.css
│   │       ├── vault.css
│   │       ├── graph.css
│   │       ├── research.css
│   │       ├── workflow.css
│   │       ├── guide.css
│   │       └── settings.css
│   ├── js/
│   │   ├── app.js                  # App initialization
│   │   ├── api.js                  # API client (fetch wrapper)
│   │   ├── auth.js                 # Auth state management
│   │   ├── router.js               # Hash-based SPA router
│   │   ├── store.js                # Simple client state store
│   │   ├── components/
│   │   │   ├── modal.js
│   │   │   ├── dropdown.js
│   │   │   ├── toast.js
│   │   │   ├── commandPalette.js
│   │   │   ├── contextMenu.js
│   │   │   ├── searchBar.js
│   │   │   ├── emptyState.js
│   │   │   └── inspector.js
│   │   ├── pages/
│   │   │   ├── overview.js
│   │   │   ├── projects.js
│   │   │   ├── projectDashboard.js
│   │   │   ├── board.js
│   │   │   ├── vault.js
│   │   │   ├── graph.js
│   │   │   ├── research.js
│   │   │   ├── workflow.js
│   │   │   ├── capture.js
│   │   │   ├── assistant.js
│   │   │   ├── guide.js
│   │   │   ├── settings.js
│   │   │   └── search.js
│   │   └── utils/
│   │       ├── dom.js              # DOM helper utilities
│   │       ├── format.js           # Date/number formatting
│   │       └── debounce.js         # Debounce/throttle utilities
│   ├── assets/
│   │   ├── icons/                  # SVG icon files (Lucide)
│   │   └── images/
│   │       └── flowden-logo.svg
│   └── favicon.ico
├── uploads/
│   ├── avatars/
│   ├── research/
│   └── images/
├── package.json
├── .env.example
├── .gitignore
└── README.md
```

---

## 6. Environment Configuration

### `.env.example`

```env
# Server
PORT=3000
NODE_ENV=development

# Database
DB_HOST=localhost
DB_PORT=3306
DB_USER=flowden_user
DB_PASSWORD=your_password_here
DB_NAME=flowden

# Authentication
JWT_SECRET=your-secure-random-string-here
JWT_EXPIRES_IN=7d

# File Upload
MAX_FILE_SIZE=10485760
UPLOAD_DIR=./uploads
```

### Prerequisites

| Requirement | Status |
|---|---|
| Node.js 18+ | ✅ v24.16.0 installed |
| npm | ✅ v11.13.0 installed |
| MySQL 8.0+ | ❌ Needs installation |

---

## 7. Security Considerations

- **Password hashing**: bcryptjs with salt rounds of 12
- **JWT**: httpOnly, secure (in production), sameSite strict cookies
- **Input validation**: express-validator on all endpoints
- **SQL injection**: mysql2 parameterized queries throughout
- **XSS**: Sanitize HTML output, Content-Security-Policy headers
- **Rate limiting**: express-rate-limit on auth endpoints (5 attempts/15min)
- **File upload**: Type validation, size limits, filename sanitization
- **CORS**: Configured for same-origin in production
- **Helmet**: Security headers via helmet middleware
- **Data isolation**: All queries filtered by `user_id` from JWT

