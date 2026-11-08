# Flowden Knowledge Exchange — Phase 1 Architectural Decisions (ADR-001 through ADR-010)

- **Document Status:** Finalized Phase 1 Specification Contract
- **Phase:** Phase 1 (Documentation, Specification & Artifact Creation Only)
- **Target Format Version:** Flowden Knowledge Format (`FKF`) `1.0.0`
- **Primary Reference:** [flowden-knowledge-exchange-architecture-v1.md](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/docs/research/flowden-knowledge-exchange-architecture-v1.md)

---

## Epistemic Classification Legend

Every section in this document explicitly separates statements into four categories so assumptions are never disguised as verified facts:

1. **[VERIFIED EXISTING BEHAVIOR]** — Directly verified against the live MySQL `INFORMATION_SCHEMA.COLUMNS`, migration files, backend models/routes/services, and frontend components.
2. **[AGREED ARCHITECTURAL DECISION]** — Binding data-contract and design decision established in Phase 1 to govern the FKF specification, JSON Schema, and Reference Package.
3. **[PROPOSED FUTURE IMPLEMENTATION]** — Concrete engineering blueprint for Phase 2+ backend/frontend implementation (not yet coded in the application).
4. **[UNRESOLVED QUESTION]** — Any remaining edge case or operational question requiring attention during Phase 2 implementation.

---

## Decision 1 (Mandatory Resolution A): Canonical Markdown Storage

### 1.1 Evidence from the Existing Codebase & Live Database (`[VERIFIED EXISTING BEHAVIOR]`)
- **Live MySQL Schema (`INFORMATION_SCHEMA.COLUMNS`)**:
  - The `notes` table contains columns: `id`, `user_id`, `project_id`, `folder_id`, `title`, `content` (`longtext`), `is_pinned`, `word_count`, `created_at`, `updated_at`, `deleted_at`, `attachments_json`. There is **no** `content_markdown` column on the `notes` table.
  - The `note_versions` table contains both `content_markdown` (`longtext`) and `content` (`longtext`).
- **SQL Migration Files**:
  - [001_initial_schema.sql](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/server/migrations/001_initial_schema.sql#L113-L130) and [schema-target.sql](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/server/migrations/schema-target.sql#L114-L130) define `content LONGTEXT NULL` on `notes`.
- **Backend Note Model & Routes**:
  - [`Note.create`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/server/models/Note.js#L166-L185) and [`Note.update`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/server/models/Note.js#L227-L246) read and write `notes.content` exclusively, computing `word_count` via `this.countWords(content)` and syncing `entities.search_text` via [`EntitySyncService.syncNoteEntity`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/server/services/entitySyncService.js#L62-L81).
  - Conversely, when saving a historical revision prior to an update or restore, [`Note.update`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/server/models/Note.js#L209-L214) and [`POST /api/notes/:id/versions/:versionId/restore`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/server/routes/notes.js#L668-L672) execute `INSERT INTO note_versions (note_id, user_id, title, content_markdown, version_number, created_by) VALUES (?, ?, ?, ?, ?, ?)` taking the value from `currentNote.content`.
  - Single-note Markdown import/export routes ([`POST /api/notes/import`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/server/routes/notes.js#L420) and [`GET /api/notes/:id/export`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/server/routes/notes.js#L443)) read and write `note.content`.
- **Frontend VaultEditor Loading & Saving Paths**:
  - [`VaultPage`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/public/js/pages/vault.js#L2658-L2784) loads `this.activeNote.content` into [`VaultEditor`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/public/js/components/vaultEditor.js) (`markdownToBlocks(content)`) and saves `blocksToMarkdown()` back to `PUT /api/notes/:id` inside the `content` field.

### 1.2 Chosen Approach (`[AGREED ARCHITECTURAL DECISION]`)
1. **What the Current Implementation Actually Uses**:
   - `notes.content` (`LONGTEXT`) is the active, sole Markdown storage column on `notes`.
   - `note_versions.content_markdown` (`LONGTEXT`) is the historical snapshot column on `note_versions`.
2. **What the Target Architecture Uses**:
   - `notes.content` (`LONGTEXT`) is formally ratified as the **single authoritative canonical Markdown column** for Notes across Flowden.
   - Flowden **must not** introduce a second `notes.content_markdown` column on the `notes` table, as doing so would create a split-brain dual source of truth across [`Note.js`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/server/models/Note.js), [`server/routes/notes.js`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/server/routes/notes.js), [`EntitySyncService`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/server/services/entitySyncService.js), and [`VaultEditor`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/public/js/components/vaultEditor.js).
3. **How the Knowledge Package Importer Maps Package Markdown into Authoritative Storage (`[PROPOSED FUTURE IMPLEMENTATION]`)**:
   - In an FKF package, each Note's metadata resides in `manifest.json` (under `entities.notes[]`) and/or YAML frontmatter at the top of `notes/<slug>.md`, while the Markdown body follows the closing `---` frontmatter delimiter.
   - During Phase 2 import:
     1. The importer strips the YAML frontmatter block (`^---\r?\n[\s\S]*?\r?\n---\r?\n?`).
     2. Pass 2 link and asset normalization rewrites package-local WikiLinks (`[[fkf:<id>|Display Title]]`) and relative asset URLs (`../assets/<file>`) into canonical Flowden Markdown.
     3. The normalized Markdown body is persisted into `notes.content` (`LONGTEXT`), with `word_count` computed from the normalized body, `entities.search_text` populated via [`EntitySyncService.syncNoteEntity`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/server/services/entitySyncService.js#L62-L81), and an initial version `1` snapshot written to `note_versions.content_markdown`.

### 1.3 Why It Was Chosen & Alternatives Considered
- **Why Chosen**: Zero breaking changes to existing Note CRUD, VaultEditor block serialization, MCP tools, search indexing, or existing user data, while eliminating ambiguity between `notes.content` and `note_versions.content_markdown`.
- **Alternatives Considered**:
  - *Alternative 1: Add `notes.content_markdown` and dual-write both columns.* Rejected because every query, model method, and route in Flowden already uses `notes.content`, and dual-writing creates synchronization bugs.
  - *Alternative 2: Store raw YAML frontmatter inside `notes.content`.* Rejected because [`VaultEditor`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/public/js/components/vaultEditor.js) parses `notes.content` directly into visual blocks (`---` horizontal rules and paragraphs), so leaving raw YAML frontmatter in `notes.content` would pollute the user's visual document.

### 1.4 Consequences for Phase 2 & Remaining Uncertainty
- **Consequences for Phase 2**: The Phase 2 importer must parse and strip YAML frontmatter before inserting into `notes.content`, validate frontmatter fields against the corresponding `manifest.json` note entry, and write the normalized body to `notes.content`.
- **Remaining Uncertainty (`[UNRESOLVED QUESTION]`)**: None.

---

## Decision 2 (Mandatory Resolution B): Stable Package-Local IDs and WikiLinks

### 2.1 Evidence from the Existing Codebase (`[VERIFIED EXISTING BEHAVIOR]`)
- **Title-Based WikiLink Resolution in `Note.js`**:
  - [`Note.syncWikiLinks(noteId, userId, content)`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/server/models/Note.js#L331-L349) extracts matches using `/\[\[(.*?)\]\]/g`, queries `SELECT id FROM notes WHERE user_id = ? AND deleted_at IS NULL AND title = ? LIMIT 1`, and inserts `(source_note_id, target_note_id)` into `note_links`.
  - If two Notes share the same title (or if a Note is renamed during import conflict resolution), `LIMIT 1` on `title = ?` resolves non-deterministically or breaks the link.
- **Typed WikiLink Autocomplete vs. VaultEditor Rendering**:
  - [`SearchService.autocompleteWikilinks`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/server/services/searchService.js#L108-L111) formats suggestions as `[[${r.entity_type}:${r.entity_id}|${r.title}]]`, and [`EntitySyncService.stripMarkdown`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/server/services/entitySyncService.js#L13) strips `\[\[(?:[^|\]]*\|)?([^\]]+)\]\]`.
  - However, [`VaultEditor.formatInline`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/public/js/components/vaultEditor.js#L1401-L1410) renders `<span class="vault-wikilink" data-target="$1">[[$1]]</span>` and [`VaultPage`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/public/js/pages/vault.js) opens the linked note by matching `data-target` against loaded note titles (or `id|Title` if split).

### 2.2 Chosen Approach (`[AGREED ARCHITECTURAL DECISION]`)
1. **Immutable Package-Local Identifier (`id`)**:
   - Every entity inside an FKF package MUST define a unique, immutable package-local string identifier matching the regex `^[a-z][a-z0-9_-]{2,63}$` with conventional type prefixes:
     - Project: `proj-<slug>` (e.g., `proj-urban-heat-mitigation`)
     - Folder: `fld-<slug>` (e.g., `fld-empirical-models`)
     - Note: `note-<slug>` (e.g., `note-albedo-roofing-01`)
     - Research Source: `src-<slug>` (e.g., `src-synth-epa-surface-2025`)
     - Research Excerpt: `exc-<slug>` (e.g., `exc-synth-epa-albedo-table`)
     - Asset: `ast-<slug>` (e.g., `ast-architecture-diagram`)
     - Task: `tsk-<slug>` (e.g., `tsk-verify-emissivity-dataset`)
     - Board: `brd-<slug>` (e.g., `brd-synthesis-canvas`)
     - Board Group: `grp-<slug>` (e.g., `grp-mitigation-strategies`)
     - Board Item: `bitm-<slug>` (e.g., `bitm-note-albedo-01`)
2. **Structured Relationship Files Reference Only Package-Local IDs**:
   - `relationships/links.json`, `optional/tasks.json`, and `optional/spatial-board.json` MUST reference entities exclusively by package-local `id` (`source_id`, `target_id`, `reference_package_id`, `folder_id`, `linked_note_ids`), **never** by display title.
3. **Package-Only Inline WikiLink Syntax (`[[fkf:<package_id>|Display Title]]`)**:
   - Inside Markdown files (`notes/*.md` and `project/overview.md`), external AI generators MUST write inline WikiLinks using the deterministic FKF token format:
     - `[[fkf:<package_id>|<Display Label>]]` (preferred) or `[[fkf:<package_id>]]`
     - Example: `[[fkf:note-cooling-phase-1|Phase 1 Assessment]]` and `[[fkf:note-cooling-phase-2|Phase 1 Assessment]]` (even if both target notes have the exact same display title `"Phase 1 Assessment"`).
4. **Two-Pass Import Normalization & Dual-Graph Persistence (`[PROPOSED FUTURE IMPLEMENTATION]`)**:
   - **Pass 1 (Entity Creation & ID Map Construction)**:
     - The importer inserts folders, notes, research documents, excerpts, tasks, and boards into MySQL and populates an in-memory and journaled lookup table:
       `packageIdMap: Map<packageId, { entityType, dbId, canonicalUuid, finalTitle }>`.
     - If two Notes in the package (or an existing Note in the target Project) share an identical display title (e.g., `"Thermal Performance Summary"`), the importer disambiguates the imported Note's `finalTitle` deterministically during creation (e.g., `"Thermal Performance Summary (Urban Canopy)"` or `"Thermal Performance Summary [note-thermal-summary-02]"` based on user-selected conflict policy) so each Note in the project has an unambiguous display title while keeping its exact `dbId` in `packageIdMap`.
   - **Pass 2 (Markdown Rewriting & Direct ID Graph Insertion)**:
     - The importer scans each Note's Markdown body for `/\[\[fkf:([a-z][a-z0-9_-]{2,63})(?:\|([^\]]+))?\]\]/g`.
     - Using `packageIdMap.get(packageId)`, it resolves the exact target `dbId` and `finalTitle`.
     - It directly inserts `(source_note_id, target_note_id)` into `note_links` and `(user_id, 'note', sourceDbId, targetEntityType, targetDbId, 'references', 'inline_link', contextSnippet, 1)` into `entity_links` **using `dbId` directly** (bypassing title-matching `Note.syncWikiLinks`).
     - It rewrites the inline Markdown token to `[[${target.finalTitle}]]` before updating `notes.content`, ensuring existing [`VaultEditor`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/public/js/components/vaultEditor.js) renders and navigates the WikiLink natively without requiring any new syntax parser in the frontend.

### 2.3 Why It Was Chosen & Alternatives Considered
- **Why Chosen**: Decouples semantic identity from mutable human-readable titles, solves the duplicate-title ambiguity in `Note.syncWikiLinks`, populates both `note_links` (used by Vault backlinks) and `entity_links` (used by the unified Knowledge Graph), and produces 100% standard Flowden Markdown in `notes.content`.
- **Alternatives Considered**:
  - *Alternative 1: Rely on `[[Note Title]]` inside package Markdown.* Rejected because duplicate titles or conflict-renamed notes silently corrupt or drop links.
  - *Alternative 2: Persist raw `[[fkf:note-01|Title]]` into `notes.content` permanently.* Rejected because [`VaultEditor`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/public/js/components/vaultEditor.js) does not natively understand `fkf:` prefixes and `Note.syncWikiLinks` would delete the `note_links` rows on the very next save!

### 2.4 Consequences for Phase 2 & Remaining Uncertainty
- **Consequences for Phase 2**: During import Pass 2, the importer must execute direct ID-based insertions into `note_links` and `entity_links` and must disambiguate duplicate Note titles within the same workspace/project so subsequent saves via `Note.syncWikiLinks` preserve the links.
- **Remaining Uncertainty (`[UNRESOLVED QUESTION]`)**: None.

---

## Decision 3 (Mandatory Resolution C): Crash-Safe File Import and Recovery Design

### 3.1 Evidence from the Existing Codebase (`[VERIFIED EXISTING BEHAVIOR]`)
- **Filesystem vs. Database Storage Split**:
  - Vault attachments are stored on disk under `uploads/vault/` ([`server/routes/notes.js`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/server/routes/notes.js#L19-L36)) and registered in `file_uploads` via [`SecurityService.registerUploadedFile`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/server/services/securityService.js#L744-L782).
  - Research documents are stored on disk under `uploads/research/` ([`server/routes/research.js`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/server/routes/research.js#L15-L24)) and registered in both `research_documents` and `file_uploads`.
  - MySQL transactions (`BEGIN` / `COMMIT` / `ROLLBACK`) are atomic for database rows, **not** for OS filesystem writes (`fs.copyFileSync` / `fs.renameSync`). If the Node.js process crashes (e.g., `SIGKILL`, power loss, OOM) after copying files into `uploads/vault/` or `uploads/research/` while the MySQL transaction is in-flight, an in-memory `try / catch` block never executes, leaving orphaned files on disk or inconsistent state.

### 3.2 Chosen Approach (`[AGREED ARCHITECTURAL DECISION]` & `[PROPOSED FUTURE IMPLEMENTATION]`)
Phase 2 MUST implement a **Persistent Import Journal & Crash-Recovery State Machine**:

1. **Unique Import Operation Identifier (`operation_id`)**:
   - Every validation/import request generates a cryptographically random UUID v4 `operation_id` (e.g., `fkp_op_9c4e2a10-...`) and accepts an optional client-supplied `idempotency_key` (`SHA-256(user_id + package_sha256 + target_project_id + import_mode)`).
2. **Persistent Import Journal (`knowledge_import_jobs` Table + Write-Ahead Disk Journal)**:
   - Before any file is extracted or copied, Phase 2 records a persistent job row and write-ahead JSON manifest (`temp/fkp_journals/<operation_id>.journal.json`) containing:
     - `operation_id` (PK, `VARCHAR(64)`)
     - `user_id` (`INT UNSIGNED`)
     - `idempotency_key` (`VARCHAR(128)`)
     - `package_sha256` (`CHAR(64)`)
     - `state` (`ENUM('validating', 'failed_validation', 'staged', 'committing_files', 'committing_db', 'committed', 'rollback_pending', 'rolled_back', 'recovery_required')`)
     - `staging_dir` (`VARCHAR(512)` — `temp/fkp_stage_<operation_id>/`)
     - `promoted_files_json` (`JSON` — list of exact destination paths written to `uploads/vault/` and `uploads/research/` by this `operation_id`, each prefixed with `fkp_<operation_id>_<uuid>.<ext>`)
     - `created_project_id` (`INT UNSIGNED NULL`)
     - `error_details_json` (`JSON NULL`)
     - `started_at`, `updated_at`, `completed_at`, `expires_at` (`TIMESTAMP`)
3. **Explicit State Transitions**:
   ```mermaid
   stateDiagram-v2
     [*] --> validating : Upload .flowden.zip
     validating --> failed_validation : Schema / Security / Limit violation
     validating --> staged : Extracted to temp/fkp_stage_<op_id> & preview ready
     staged --> rolled_back : User cancels or TTL (30m) expires
     staged --> committing_files : User approves import (Write-Ahead Journal lists target paths)
     committing_files --> committing_db : Staged assets copied to uploads/ with fkp_<op_id>_ prefix
     committing_files --> rollback_pending : I/O failure or crash during file promotion
     committing_db --> committed : Single MySQL transaction COMMITs all entities + links + file_uploads
     committing_db --> rollback_pending : MySQL transaction ROLLBACK or process crash before COMMIT
     rollback_pending --> rolled_back : Recovery worker deletes promoted fkp_<op_id>_* files & staging_dir
     rollback_pending --> recovery_required : Unlink permission error (logged to security_audit_logs)
   ```
4. **File Staging & Final-Storage Transitions**:
   - **Rule 1 (Write-Ahead Registration)**: Before copying any file from `temp/fkp_stage_<operation_id>/` into `uploads/vault/` or `uploads/research/`, the exact destination path (`uploads/vault/fkp_<operation_id>_<random>.<ext>`) MUST be flushed to `promoted_files_json` in the persistent journal while in state `committing_files`.
   - **Rule 2 (Namespace Isolation)**: Every promoted file is uniquely named with its `operation_id` (`fkp_<operation_id>_...`). An import operation **never** overwrites or shares a physical filename with any previously committed import or user upload.
   - **Rule 3 (Database Commit Gate)**: Only after all destination files are written and verified by SHA-256 does the state transition to `committing_db` and open a dedicated MySQL `pool.getConnection()` transaction (`await conn.beginTransaction()`). Inside that transaction, all entities, links, `file_uploads` rows, and the update of `knowledge_import_jobs.state = 'committed'` are committed atomically in the **same** MySQL transaction!
5. **Startup & Periodic Crash-Recovery Reconciliation**:
   - On server startup (and every 15 minutes via background sweep), the Recovery Reconciler inspects `knowledge_import_jobs` and `temp/fkp_journals/*.journal.json`:
     - Any job in `validating` or `staged` older than `expires_at` (30 minutes) has its `temp/fkp_stage_<operation_id>/` deleted and transitions to `rolled_back`.
     - Any job found in `committing_files` or `committing_db` whose heartbeat is stale (or found at server boot, proving the process crashed before the MySQL transaction reached `committed`) is moved to `rollback_pending`.
     - For `rollback_pending`: Because `state = 'committed'` is updated inside the same MySQL transaction as the imported entities and `file_uploads` rows, if `state != 'committed'`, the database transaction is guaranteed to have rolled back by InnoDB crash recovery. The reconciler iterates `promoted_files_json`, verifies each path starts with `uploads/vault/fkp_<operation_id>_` or `uploads/research/fkp_<operation_id>_` and has **zero** matching rows in `file_uploads`, deletes the orphaned destination files and `staging_dir`, and marks the job `rolled_back`.
     - **Protection of Committed Files**: The reconciler NEVER deletes any file whose `file_path` exists in `file_uploads` or belongs to a job in state `committed`.
6. **Idempotent Retries**:
   - If a client retries an import request with the same `operation_id` or `idempotency_key`:
     - If `state === 'committed'`, the server returns HTTP `200 OK` with the existing `created_project_id` and entity summary without re-importing.
     - If `state === 'committing_files'` or `'committing_db'`, the server returns HTTP `409 Conflict` (`IMPORT_IN_PROGRESS`).
     - If `state === 'rolled_back'` or `'failed_validation'`, a fresh retry is permitted.

### 3.3 Why It Was Chosen & Alternatives Considered
- **Why Chosen**: Updating `knowledge_import_jobs.state = 'committed'` inside the exact same InnoDB transaction as `projects`, `notes`, `entities`, and `file_uploads` makes MySQL the single atomic commit point (`2PC-lite`), while the write-ahead `promoted_files_json` journal guarantees 100% deterministic cleanup of orphaned files after a power loss or `SIGKILL`.
- **Alternatives Considered**:
  - *Alternative 1: Rely only on `try / catch` cleanup in memory.* Rejected because `SIGKILL` or process crash bypasses `catch`/`finally` blocks.
  - *Alternative 2: Store all binary assets as `LONGBLOB` inside MySQL.* Rejected because Flowden's existing architecture serves Vault attachments and Research documents from `uploads/vault/` and `uploads/research/` via `res.sendFile`.

### 3.4 Consequences for Phase 2 & Remaining Uncertainty
- **Consequences for Phase 2**: Phase 2 migration must add `knowledge_import_jobs` and the importer service must acquire a dedicated connection (`pool.getConnection()`) for the `committing_db` transaction.
- **Remaining Uncertainty (`[UNRESOLVED QUESTION]`)**: When Flowden runs in embedded JSON fallback mode (`server/data/flowden_store.json` when MySQL is unavailable), `writeLocalStore` writes the entire JSON state at once; the write-ahead file journal (`temp/fkp_journals/<operation_id>.journal.json`) handles crash recovery identically in both MySQL and fallback modes.

---

## Decision 4: Project and Folder Mapping

### 4.1 Evidence from the Existing Codebase (`[VERIFIED EXISTING BEHAVIOR]`)
- **`projects` Table & [`Project.js`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/server/models/Project.js)**:
  - Columns: `id`, `user_id`, `title` (`VARCHAR(200)`), `description` (`TEXT`), `color` (`VARCHAR(7)`), `icon` (`VARCHAR(50)`), `status` (`ENUM('active','archived')`), `sort_order` (`INT`).
  - Creating a Project also requires registering a `project` row in `entities` (`entity_type = 'project'`) and an `'owner'` row in `project_members` (`user_id`, `project_id`, `role = 'owner'`).
- **`note_folders` Table**:
  - Columns: `id`, `user_id`, `parent_folder_id` (`INT UNSIGNED NULL` self-FK with `ON DELETE SET NULL`), `name` (`VARCHAR(200)`), `sort_order` (`INT`).
  - Note that `note_folders` does **not** have a `project_id` column in the current schema (`note_folders` is scoped by `user_id` and `parent_folder_id`, while `notes` has both `project_id` and `folder_id`).

### 4.2 Chosen Approach (`[AGREED ARCHITECTURAL DECISION]`)
1. **Project Mapping**:
   - `manifest.json -> project` maps to a Flowden `projects` row (`title`, `description`, `color`, `icon`, `status: 'active'`).
   - Because `projects.description` is a plain summary (`TEXT`), the rich multi-section `project/overview.md` file is imported as a **pinned root Note** (`is_pinned = 1`, `folder_id = NULL`, `title = "<Project Title> — Project Overview"`) inside the project, in addition to populating `projects.description` with the plain-text summary from `manifest.json -> project.summary`. This guarantees that the full Markdown overview (including headings, tables, and `[[fkf:...]]` WikiLinks to key notes) is preserved as an editable, graph-connected Note in the Knowledge Vault.
2. **Folder Hierarchy Mapping**:
   - `folders.json` defines a DAG/tree of folders with `id` (package-local `fld-*`), `name`, `parent_id` (`null` or parent `fld-*`), and `sort_order`.
   - During import, folders are topologically sorted from roots (`parent_id: null`) to leaves (maximum depth `8`).
   - When importing into a new or existing workspace where a top-level folder name might collide with an existing user folder in `note_folders`, the importer creates a top-level container folder named after the imported Project (or matches/creates root folders under a dedicated root if conflict resolution specifies) and maps each `fld-*` to its newly inserted `note_folders.id` in `packageIdMap`.

### 4.3 Why It Was Chosen & Alternatives Considered
- **Why Chosen**: Preserves both the concise `projects.description` metadata and the full Markdown `project/overview.md` document without truncating Markdown or losing overview WikiLinks.
- **Alternatives Considered**:
  - *Alternative: Store `project/overview.md` only in `projects.description`.* Rejected because Flowden's Knowledge Vault editor edits `notes`, not `projects.description`, and WikiLinks inside `project/overview.md` would not participate in `note_links` or the Knowledge Graph unless stored as a pinned overview Note.

### 4.4 Consequences for Phase 2 & Remaining Uncertainty
- **Consequences for Phase 2**: The importer creates 1 `projects` row + 1 pinned Project Overview `notes` row from `project/overview.md`, plus `note_folders` rows in topological order.
- **Remaining Uncertainty (`[UNRESOLVED QUESTION]`)**: None.

---

## Decision 5: Source and Excerpt Mapping

### 5.1 Evidence from the Existing Codebase (`[VERIFIED EXISTING BEHAVIOR]`)
- **`research_documents` Table & [`server/routes/research.js`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/server/routes/research.js)**:
  - Columns verified in live MySQL: `id`, `user_id`, `project_id`, `title` (`VARCHAR(300)`), `original_filename` (`VARCHAR(300)`), `file_path` (`VARCHAR(500)`), `file_type` (`ENUM('md','pdf','docx','txt')`), `file_size` (`INT UNSIGNED`), `content_text` (`LONGTEXT`), `summary` (`TEXT`), `source_url` (`VARCHAR(1000)`), `import_date` (`TIMESTAMP`), `file_name` (`VARCHAR(300)`), `tags_json` (`JSON`).
- **`research_excerpts` Table**:
  - Columns verified in live MySQL: `id`, `research_id` (`INT UNSIGNED` FK to `research_documents.id`), `user_id`, `project_id`, `quoted_text` (`TEXT`), `annotation` (`TEXT`), `location_anchor` (`VARCHAR(100)`), `color` (`VARCHAR(30)`).
- **Entity Sync**:
  - [`EntitySyncService.syncResearchEntity`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/server/services/entitySyncService.js#L105-L124) registers `'research'` in `entities` and `project_entities`.
  - `entities.entity_type` and `entity_links` also natively support `'excerpt'`.

### 5.2 Chosen Approach (`[AGREED ARCHITECTURAL DECISION]`)
1. **`sources/index.json` + `sources/<slug>.md` Mapping to `research_documents`**:
   - Each entry in `sources/index.json` defines structured provenance metadata (`id`, `title`, `source_type`, `authors`, `publication_date`, `accessed_date`, `source_url`, `verification_status`, `is_synthetic_example`, `summary`, `tags`, `content_file`, `excerpts[]`).
   - During import, each source record is inserted into `research_documents`:
     - `title` <- `source.title`
     - `file_type` <- `'md'`
     - `content_text` <- Markdown body of `sources/<slug>.md` (with structured provenance header prepended so provenance fields like `authors`, `publication_date`, `verification_status` are visible in the Research Center reader even though `research_documents` lacks dedicated columns for `authors` or `publication_date`).
     - `summary` <- `source.summary`
     - `source_url` <- `source.source_url` (validated via [`SecurityService.validateExternalUrl`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/server/services/securityService.js#L562-L636); set to `NULL` if null or blocked, with a validation warning).
     - `tags_json` <- `JSON.stringify(source.tags || [])`
   - Synchronized into `entities` (`entity_type = 'research'`) and `project_entities`.
2. **Excerpts Mapping to `research_excerpts`**:
   - Each item in `source.excerpts[]` (`id` matching `exc-*`, `quoted_text`, `annotation`, `location_anchor`, `color`) is inserted into `research_excerpts` linked to the parent `research_id`, and registered in `entities` (`entity_type = 'excerpt'`) and `project_entities` so Notes can link directly to either a whole Source (`src-*`) or a specific Excerpt (`exc-*`) in `relationships/links.json`!

### 5.3 Why It Was Chosen & Alternatives Considered
- **Why Chosen**: Maps 100% cleanly onto existing `research_documents` and `research_excerpts` tables without requiring schema alterations, while preserving rich bibliographic metadata in both structured frontmatter/header and `content_text`.
- **Alternatives Considered**:
  - *Alternative: Import Sources as regular Notes.* Rejected because Flowden has a dedicated Research Center (`research_documents` + `research_excerpts`) designed specifically for source material and citations.

### 5.4 Consequences for Phase 2 & Remaining Uncertainty
- **Consequences for Phase 2**: Phase 2 importer must register both `'research'` and `'excerpt'` rows in `entities` and `project_entities` during Pass 1 so Pass 2 can link Notes to Sources (`cites`, `derived_from`, `supports`, `contradicts`) and Excerpts.
- **Remaining Uncertainty (`[UNRESOLVED QUESTION]`)**: None.

---

## Decision 6: Semantic Relationship Mapping

### 6.1 Evidence from the Existing Codebase (`[VERIFIED EXISTING BEHAVIOR]`)
- **`entity_links` Table**:
  - `source_type` and `target_type`: `ENUM('project','note','task','research','excerpt','board','decision','capture')`
  - `link_type`: `ENUM('references','embeds','cites','derived_from','supports','contradicts','inspired_by','depends_on','blocks','relates_to')`
  - `origin`: `ENUM('inline_link','embed','board_promoted','citation','task_sync','capture_convert','manual','ai_suggested')`
  - `context_snippet`: `VARCHAR(500) NULL`
  - `is_confirmed`: `TINYINT(1)`
- **`note_links` Table**:
  - `source_note_id`, `target_note_id` (used for Note-to-Note backlinks in Knowledge Vault).
- **`smart_connections` Table**:
  - Legacy table (`relationship ENUM('related_to','supports','contradicts','inspired_by','depends_on')`) still queried alongside `entity_links` in [`server/routes/graph.js`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/server/routes/graph.js).

### 6.2 Chosen Approach (`[AGREED ARCHITECTURAL DECISION]`)
1. **Strict 10-Value Semantic Relationship Enum**:
   - `relationships/links.json` MUST use only the exact 10 canonical `entity_links.link_type` values:
     `references`, `embeds`, `cites`, `derived_from`, `supports`, `contradicts`, `inspired_by`, `depends_on`, `blocks`, `relates_to`.
   - No custom or invented relationship types are permitted in FKF `1.0.0`.
2. **Separation of Concerns (Folders vs. Semantic Links vs. Visual Board Wires)**:
   - **Folder Hierarchy (`folders.json` + `note.folder_id`)**: Organizes Notes in the Vault tree. Never stored in `relationships/links.json`.
   - **Semantic Relationships (`relationships/links.json`)**: Represents epistemic and workflow relationships between canonical entities (`note`, `research`, `excerpt`, `task`, `project`, `board`). Stored in `entity_links` (and mirrored to `note_links` when `source_type === 'note' && target_type === 'note'`).
   - **Visual Canvas Connections (`optional/spatial-board.json -> connections[]`)**: Represents visual diagram wires between `board_items` on a Spatial Board canvas. Stored exclusively in `board_item_connections`, never in `entity_links`.
3. **Provenance & Confirmation Status**:
   - Relationships imported from `relationships/links.json` are inserted into `entity_links` with `origin = 'citation'` (when `link_type === 'cites'`), `'inline_link'` (when derived from inline `[[fkf:...]]`), or `'ai_suggested'` / `'manual'` based on the link's `origin_hint`, and `is_confirmed = 1` (since the user explicitly previews and approves the package import).

### 6.3 Why It Was Chosen & Alternatives Considered
- **Why Chosen**: Enforces 1:1 compatibility with `entity_links.link_type` in MySQL and honors the strict architectural boundary between semantic knowledge links (`entity_links`) and visual canvas wires (`board_item_connections`).
- **Alternatives Considered**:
  - *Alternative: Allow free-text relationship labels in `relationships/links.json`.* Rejected because `entity_links.link_type` is a strict MySQL `ENUM`; arbitrary strings would cause SQL truncation/errors. (Optional human-readable context is stored in `context_snippet` up to 500 chars.)

### 6.4 Consequences for Phase 2 & Remaining Uncertainty
- **Consequences for Phase 2**: When inserting `note -> note` relationships from `relationships/links.json`, the importer should also insert into `note_links` (`INSERT IGNORE`) so the Vault editor's backlinks panel displays them alongside inline WikiLinks.
- **Remaining Uncertainty (`[UNRESOLVED QUESTION]`)**: None.

---

## Decision 7: Asset Storage

### 7.1 Evidence from the Existing Codebase (`[VERIFIED EXISTING BEHAVIOR]`)
- **Upload Validation & Storage**:
  - [`SecurityService.validateUploadedFile`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/server/services/securityService.js#L370-L511) inspects file extension, MIME type, magic bytes (`PNG`, `JPEG`, `GIF`, `WEBP`, `PDF`, `DOCX/ZIP`, `MP4`, `WEBM`, `MP3`, `WAV`, `OGG`, `TXT/MD/CSV/JSON`), scans SVG/text for XSS vectors (`<script`, `onload=`, `javascript:`), and blocks executables (`MZ`, `ELF`, `#!`, etc.).
  - [`SecurityService.registerUploadedFile`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/server/services/securityService.js#L744-L782) records ownership in `file_uploads` (`user_id`, `project_id`, `entity_type`, `entity_id`, `filename`, `original_name`, `file_path`, `mime_type`, `file_size`, `sha256_hash`).
  - Authenticated file delivery in [`server/index.js`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/server/index.js#L85-L155) serves `/uploads/vault/:filename` only after [`SecurityService.canUserAccessUploadedFile`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/server/services/securityService.js#L784-L855) verifies ownership or project membership.

### 7.2 Chosen Approach (`[AGREED ARCHITECTURAL DECISION]`)
1. **Package Asset Layout & Manifest Declaration**:
   - All binary or media attachments used by Notes reside inside `assets/` in the package root and MUST be declared in `manifest.json -> entities.assets[]` with `id` (`ast-*`), `path` (`assets/<filename>`), `mime_type`, `size_bytes`, `sha256`, and `title`/`alt_text`.
   - Inside package Markdown files (`notes/*.md`), assets are referenced using relative paths `../assets/<filename>` (or `assets/<filename>`) or `fkf-asset://<asset_id>`.
2. **Import Validation, Storage & Path Rewriting (`[PROPOSED FUTURE IMPLEMENTATION]`)**:
   - Every file in `assets/` is validated through [`SecurityService.validateUploadedFile`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/server/services/securityService.js#L370-L511) and verified against its declared `sha256` and `size_bytes`.
   - Validated assets are copied during `committing_files` to `uploads/vault/fkp_<operation_id>_<uuid>.<ext>`, registered in `file_uploads` via `SecurityService.registerUploadedFile`, appended to the referencing Note's `attachments_json` array, and rewritten in `notes.content` from `../assets/<filename>` to `/uploads/vault/fkp_<operation_id>_<uuid>.<ext>`.

### 7.3 Why It Was Chosen & Alternatives Considered
- **Why Chosen**: Reuses Flowden's hardened `/uploads/vault/` authentication gate and magic-byte validator without introducing a parallel unauthenticated static asset directory.
- **Alternatives Considered**:
  - *Alternative: Base64-encode images inline inside Markdown.* Rejected because Base64 bloats `notes.content` and `entities.search_text`.

### 7.4 Consequences for Phase 2 & Remaining Uncertainty
- **Consequences for Phase 2**: Pass 2 Markdown normalization must rewrite relative `../assets/<filename>` links in Markdown image/attachment syntax to the newly promoted `/uploads/vault/fkp_<operation_id>_<uuid>.<ext>` URL and populate `notes.attachments_json`.
- **Remaining Uncertainty (`[UNRESOLVED QUESTION]`)**: None.

---

## Decision 8: Optional Tasks and Spatial Board Modules

### 8.1 Evidence from the Existing Codebase (`[VERIFIED EXISTING BEHAVIOR]`)
- **`tasks` Table & [`server/routes/tasks.js`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/server/routes/tasks.js)**:
  - Columns: `id`, `user_id`, `project_id`, `title` (`VARCHAR(300)`), `description` (`TEXT`), `status` (`ENUM('planned','in_progress','done')`), `priority` (`ENUM('low','medium','high','urgent')`), `due_date` (`DATE NULL`), `sort_order` (`INT`).
- **`boards`, `board_groups`, `board_items`, `board_item_connections` Tables & [`Board.js`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/server/models/Board.js)**:
  - `board_items.item_type`: `ENUM('note','idea','image','link','research_ref','task','document')`
  - `board_items.reference_type`: `ENUM('project','note','task','research','excerpt','board','decision')`
  - `board_items.reference_id`: `INT UNSIGNED NULL`
  - `board_item_connections`: `(board_id, source_item_id, target_item_id, connection_type, label)`

### 8.2 Chosen Approach (`[AGREED ARCHITECTURAL DECISION]`)
1. **Optional `optional/tasks.json`**:
   - May be omitted entirely when a research topic does not involve actionable follow-up tasks.
   - When present, each task defines `id` (`tsk-*`), `title`, `description`, `status` (`planned | in_progress | done`), `priority` (`low | medium | high | urgent`), `due_date` (`YYYY-MM-DD` or `null` — **external AI systems are strictly forbidden from inventing deadlines; `due_date` must be `null` unless explicitly provided by the user**), and `related_entity_ids` (package-local IDs mapped to `entity_links` with `link_type = 'relates_to'` or `'depends_on'`).
2. **Optional `optional/spatial-board.json`**:
   - May be omitted entirely without affecting Project, Folder, Note, Source, or Relationship import.
   - When present, defines a board (`id`, `title`, `description`), `groups[]` (`id`, `title`, `color`, `position_x`, `position_y`, `width`, `height`), `items[]`, and `connections[]`.
   - **Canonical Projection Rule**: Board items representing a Note, Task, Research Source, or Excerpt MUST specify `reference_type` (`note | task | research | excerpt`) and `reference_package_id` (e.g., `note-example-01`). During Pass 2, the importer resolves `reference_package_id` via `packageIdMap` into `board_items.reference_id` so the board item is a true live projection of the canonical entity, never a disconnected duplicate text card.
   - **Visual Wire Rule**: `connections[]` inside `optional/spatial-board.json` reference `source_item_id` and `target_item_id` (`bitm-*`) and map strictly to `board_item_connections` (visual canvas wires), never to `entity_links`.
3. **Optional `exports/research-report.pdf`**:
   - Optional human-readable companion PDF. If present and opted-in by the user, imported as an additional `research_documents` record (`file_type = 'pdf'`), never used as the canonical source of Notes or Relationships.

### 8.3 Why It Was Chosen & Alternatives Considered
- **Why Chosen**: Preserves Flowden's projection architecture on the Spatial Board and prevents AI hallucinations of arbitrary task deadlines.
- **Alternatives Considered**:
  - *Alternative: Make Tasks and Spatial Board mandatory in every package.* Rejected because many pure literature reviews only need Notes, Sources, and Relationships.

### 8.4 Consequences for Phase 2 & Remaining Uncertainty
- **Consequences for Phase 2**: The preview UI must allow the user to toggle checkboxes to include/skip `optional/tasks.json` and `optional/spatial-board.json` during import.
- **Remaining Uncertainty (`[UNRESOLVED QUESTION]`)**: None.

---

## Decision 9: Schema and Format Versioning

### 9.1 Evidence from the Existing Codebase (`[VERIFIED EXISTING BEHAVIOR]`)
- Flowden currently has no multi-entity package schema version contract (`POST /api/notes/import` accepts raw `{ filename, content }` JSON payloads).

### 9.2 Chosen Approach (`[AGREED ARCHITECTURAL DECISION]`)
1. **Format Identifier & Semantic Version**:
   - Format identifier: `"format": "flowden-knowledge-package"`
   - Version field: `"fkf_version": "1.0.0"` (Semantic Versioning `MAJOR.MINOR.PATCH`).
   - Schema URI: `"$schema": "https://flowden.app/schemas/flowden-package-v1.0.0.schema.json"` (locally validated against `docs/knowledge-exchange/flowden-package.schema.json`).
2. **Compatibility Rules**:
   - **Patch (`1.0.x`)**: Clarifications or bug fixes in documentation/descriptions with zero structural changes.
   - **Minor (`1.x.0`)**: Strictly **additive** optional fields or new optional modules under `optional/`. A `1.0.0` importer MUST accept any `1.x.y` package, importing all known `1.0` structures and logging an informational notice for unrecognized `optional/*` modules without failing.
   - **Major (`2.0.0+`)**: Breaking changes to required files, ID patterns, or core enums. If `MAJOR > 1`, the `1.x` importer MUST reject the package during `validating` with error code `UNSUPPORTED_FKF_MAJOR_VERSION` and a clear message stating the required Flowden version.
   - **No Silent Reinterpretation**: Importers must never guess or reinterpret renamed/deprecated fields across major versions without an explicit version migration adapter.

### 9.3 Why It Was Chosen & Alternatives Considered
- **Why Chosen**: Predictable forward/backward compatibility for external AI prompt templates and future Flowden releases.
- **Alternatives Considered**:
  - *Alternative: Unversioned manifest.* Rejected because future additions (e.g., Decision Logs or Flashcards) need clear capability negotiation.

### 9.4 Consequences for Phase 2 & Remaining Uncertainty
- **Consequences for Phase 2**: The validator must check `manifest.format === "flowden-knowledge-package"` and parse `manifest.fkf_version` before running schema validation.
- **Remaining Uncertainty (`[UNRESOLVED QUESTION]`)**: None.

---

## Decision 10: Security Validation Requirements

### 10.1 Evidence from the Existing Codebase (`[VERIFIED EXISTING BEHAVIOR]`)
- [`SecurityService`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/server/services/securityService.js) provides:
  - `validateUploadedFile(filePath, originalName, declaredMime)` (`#L370-L511`: magic-byte inspection, executable blocking, SVG script scanning, size limits).
  - `validateExternalUrl(rawUrl, options)` (`#L562-L636`: blocks `javascript:`, `data:`, `file:`, `vbscript:`, loopback `127.0.0.0/8`, `::1`, private RFC1918 `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, link-local `169.254.0.0/16`, `.local`, `.internal`).
  - `registerUploadedFile(...)` (`#L744-L782`) and `canUserAccessUploadedFile(...)` (`#L784-L855`).
  - `wrapUntrustedWorkspaceData(toolName, resultPayload)` (`#L687-L701`: wraps untrusted database content in `<untrusted_workspace_data>` tags before sending to AI/MCP).
  - `logSecurityEvent(...)` (`#L176-L224`: writes to `security_audit_logs`).

### 10.2 Chosen Approach (`[AGREED ARCHITECTURAL DECISION]` & `[PROPOSED FUTURE IMPLEMENTATION]`)
Every `.flowden.zip` package MUST be treated as **untrusted external input** and pass a 5-stage defense-in-depth validation pipeline before reaching `staged`:

1. **Stage 1 — Archive-Level & ZIP Bomb Defenses (Pre-Extraction)**:
   - Verify ZIP magic bytes (`50 4B 03 04`).
   - Maximum archive entries: **500 files/directories**.
   - Maximum compressed archive upload size: **100 MB**.
   - Maximum total uncompressed size: **250 MB** (tracked both from central directory headers and via byte-counting transform streams during extraction).
   - Maximum single-entry uncompressed size: **50 MB**.
   - Maximum compression ratio per entry and overall: **100:1** (abort immediately if exceeded).
   - **ZIP Slip & Path Traversal Rejection**: Reject the entire archive if any entry name contains `..`, starts with `/` or `\`, contains a Windows drive letter (`C:`), contains null bytes (`\0`), or resolves outside `path.resolve(stagingDir)` via `path.relative`.
   - **Symlink & Special File Rejection**: Inspect external file attributes in the ZIP central directory; reject any entry with POSIX symlink mode (`(attr >> 16) & 0o170000 === 0o120000`), hardlink, FIFO, or device node attributes.
   - **Allowlisted Package Paths Only**: Every file entry must match the documented FKF directory layout (`manifest.json`, `project/overview.md`, `folders.json`, `notes/*.md`, `sources/index.json`, `sources/*.md`, `relationships/links.json`, `assets/*`, `optional/tasks.json`, `optional/spatial-board.json`, `exports/*.pdf`). Any unexpected file (e.g., `.exe`, `.sh`, `.bat`, `.js`, `.php`, `.dll`, `.env`, `__MACOSX` executable payloads) causes validation rejection.
2. **Stage 2 — Binary & Magic-Byte Inspection**:
   - Every extracted file under `assets/` and `exports/` MUST pass [`SecurityService.validateUploadedFile`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/server/services/securityService.js#L370-L511) and match the `sha256` and `mime_type` declared in `manifest.json`.
   - Every `.md` and `.json` file MUST be valid UTF-8 without null bytes or binary executable headers.
3. **Stage 3 — JSON Schema Validation**:
   - Validate `manifest.json`, `folders.json`, `sources/index.json`, `relationships/links.json`, and present `optional/*.json` files against [flowden-package.schema.json](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/docs/knowledge-exchange/flowden-package.schema.json).
4. **Stage 4 — Cross-File Referential Integrity**:
   - Verify global uniqueness of all package-local `id` values across all entity categories.
   - Verify `folders.json` has zero cycles and depth `<= 8`.
   - Verify every `folder_id`, `source_id`, `target_id`, `asset_id`, `related_entity_ids`, and `reference_package_id` resolves to a declared entity in the package.
   - Verify every file path declared in `manifest.json` and `sources/index.json` exists in the extracted staging folder.
5. **Stage 5 — Content, Markdown & URL Sanitization**:
   - Validate every `source_url` and external link through [`SecurityService.validateExternalUrl`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/server/services/securityService.js#L562-L636).
   - Strip dangerous raw HTML (`<script>`, `<iframe>`, `<object>`, `<embed>`, inline `on*=` handlers, `javascript:`/`vbscript:`/`data:text/html` URIs) from Markdown bodies before database insertion.
   - Never execute any code, script, macro, or shell command contained in or referenced by a package.
   - Log all validation rejections and security blocks via [`SecurityService.logSecurityEvent`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/server/services/securityService.js#L176-L224).

### 10.3 Why It Was Chosen & Alternatives Considered
- **Why Chosen**: Directly extends Flowden's existing `SecurityService` controls with archive-specific protections (ZIP Slip, ZIP bomb, symlink, cross-file integrity).
- **Alternatives Considered**:
  - *Alternative: Extract the entire ZIP with an OS shell `unzip` command before inspecting.* Rejected because shell extraction before header/path inspection exposes the host filesystem to ZIP Slip and decompression bombs.

### 10.4 Consequences for Phase 2 & Remaining Uncertainty
- **Consequences for Phase 2**: The Phase 2 archive extractor must iterate central directory entries in streaming mode, checking paths, sizes, ratios, and symlink flags **before** writing each entry stream to `temp/fkp_stage_<operation_id>/`.
- **Remaining Uncertainty (`[UNRESOLVED QUESTION]`)**: None.
