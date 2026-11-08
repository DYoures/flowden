# Flowden FKF 2.0 — Phase 0: Read-Only Architecture Rebaseline Report

- **Document Identifier:** `FLOWDEN-FKF2-PHASE0-REBASELINE`
- **Document Path:** `docs/reports/fkf2-phase0-rebaseline.md`
- **Execution Mode:** READ-ONLY Verification & Live Audit (No code or schema alterations)
- **Date:** November 9, 2026
- **Auditor:** Antigravity Advanced Agentic Architecture Pair
- **Inspected Workspace:** `C:\Users\Sod\.gemini\antigravity\scratch\flowden`
- **Target Schema Version:** `FKF 2.0.0` / MySQL 8.4.13

---

## Executive Summary

Phase 0 performs a rigorous, read-only empirical baseline of Flowden's live database, backend services, authorization predicates, import infrastructure, and test harness before finalizing the FKF 2.0 specification.

### Key Verified Findings:
1. **Live MySQL 8.4 Verified:** The application environment is actively connected to **MySQL Community Server v8.4.13** on `127.0.0.1:3306`, database `flowden_test`. No JSON fallback emulator is currently active.
2. **Schema Drift Uncovered in `schema-target.sql`:** The snapshot file `schema-target.sql` is severely stale and inaccurate. It is missing **3 entire production tables** (`file_uploads`, `knowledge_import_jobs`, `knowledge_exchange_tickets`) and multiple active columns (`notes.attachments_json`, `research_documents.file_name`, `research_documents.tags_json`, `note_versions.user_id`, `note_versions.content_markdown`).
3. **Dynamic DDL Outside Migration Runner:** Critical tables (`file_uploads`, `security_reports`) and columns (`notes.attachments_json`, `research_documents.file_name`, `research_documents.tags_json`) were spawned dynamically at server startup by `SecurityService.initSecurityTables()` rather than tracked migrations.
4. **Root Cause of Test 9 / Universal Search Failure:** In real MySQL, `SearchService.universalSearch` queries the `entities` table exclusively. However, normal runtime CRUD in `Project.create()`, `Research` upload, and `Board` creation **never inserts into `entities`**. Only 14 out of 228 projects in the database exist in `entities`! In local JSON emulator mode, search queries `projects` directly (passing Test 9); in real MySQL, it returns 0 projects (failing Test 9).
5. **Claude's Independent Review Absence:** As required, `docs/reports/flowden-fkf2-independent-review.md` was explicitly searched for via `Test-Path` and confirmed **absent** from the workspace.

---

## A. Environment Verification

| Attribute | Verified Live Value | Verification Source | Epistemic Status |
| :--- | :--- | :--- | :--- |
| **Node.js Runtime** | `v24.16.0` (x64) | `node -v` | `[CONFIRMED]` |
| **Database Engine** | `MySQL Community Server - GPL` | `SELECT @@global.version_comment` | `[CONFIRMED]` |
| **Database Server Version** | `8.4.13` | `SELECT VERSION()` | `[CONFIRMED]` |
| **Active Database Name** | `flowden_test` | `SELECT DATABASE()` | `[CONFIRMED]` |
| **Connection Configuration** | `127.0.0.1:3306`, user `root`, password configured | `.env` lines 3–7 | `[CONFIRMED]` |
| **Fallback Emulator Status** | **Inactive** (Connected to real MySQL) | `database.js` connection probe | `[CONFIRMED]` |
| **Claude Review Status** | **NOT FOUND** (`docs/reports/flowden-fkf2-independent-review.md`) | Filesystem check (`Test-Path`) | `[CONFIRMED ABSENT]` |
| **Total Live Database Tables** | **29 tables** in `flowden_test` | `SHOW TABLES` | `[CONFIRMED]` |
| **Applied Migrations** | 6 applied (001 through 006) | `SELECT * FROM schema_migrations` | `[CONFIRMED]` |

---

## B. Schema Verification Matrix

The following matrix compares:
- **Expected by FKF 2.0:** Entities and columns specified in the FKF 2.0 draft.
- **Migration Files:** Migrations `001_initial_schema.sql` through `006_knowledge_import_jobs.js`.
- **`schema-target.sql`:** The checked-in target schema snapshot.
- **Live MySQL 8.4:** The actual database columns queried from `INFORMATION_SCHEMA.COLUMNS` in `flowden_test`.

| Table | Expected by FKF 2.0 | Migration Files | `schema-target.sql` | Live MySQL 8.4 (`flowden_test`) | Constraints & Enums | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`entities`** | `id`, `uuid`, `entity_type`, `entity_id`, `owner_user_id`, `primary_project_id`, `title`, `search_text`, `is_archived`, `deleted_at`, `cascade_deleted_by` | Migrations 002, 004, 005 | Matches 13 cols | **346 rows**. 13 cols match perfectly. | `entity_type`: `enum('project','note','task','research','excerpt','board','decision','capture')`. `UNIQUE(entity_type, entity_id)`, `UNIQUE(uuid)`, `FULLTEXT(title, search_text)`. | `CONFIRMED` |
| **`projects`** | `id`, `user_id`, `title`, `description`, `color`, `icon`, `status`, `sort_order`, timestamps | Migration 001 | Matches 10 cols | **228 rows**. 10 cols match perfectly. | `status`: `enum('active','archived')` (default `'active'`). `INDEX(user_id, status)`. | `CONFIRMED` |
| **`project_members`** | `id`, `project_id`, `user_id`, `role`, `created_at`, `revoked_at` | Migration 005 | Matches 6 cols | **173 rows**. 6 cols match perfectly. | `role`: `enum('owner','editor','viewer')` (default `'editor'`). `UNIQUE(project_id, user_id)`. Soft revocation via `revoked_at`. | `CONFIRMED` |
| **`project_entities`** | `id`, `project_id`, `entity_type`, `entity_id`, `access_role`, `added_by`, `created_at` | Migration 005 | Matches 7 cols | **856 rows**. 7 cols match perfectly. | `entity_type`: `enum('note','task','research','excerpt','board','decision')`. `access_role`: `enum('viewer','contributor','admin')`. `UNIQUE(project_id, entity_type, entity_id)`. | `CONFIRMED` |
| **`notes`** | `id`, `user_id`, `project_id`, `folder_id`, `title`, `content`, `is_pinned`, `word_count`, `deleted_at`, `attachments_json` | Migration 001 (missing `attachments_json`) | Missing `attachments_json` | **435 rows**. Has `attachments_json JSON NULL`. | `content` is `LONGTEXT NULL` (**Sole canonical markdown column**). NO `content_markdown` column on `notes`. `is_pinned TINYINT(1) DEFAULT 0`. | `CONFIRMED` |
| **`note_versions`** | `id`, `note_id`, `user_id`, `title`, `content_markdown`, `content`, `version_number`, `created_by`, `created_at` | Migration 001 | Missing `user_id`, `content_markdown` | **321 rows**. Contains both `content_markdown` and `content`. | `version_number INT NOT NULL`. `INDEX(note_id, version_number)`. | `CONFIRMED` |
| **`note_folders`** | `id`, `user_id`, `parent_folder_id`, `name`, `sort_order`, timestamps | Migration 001 | Matches 7 cols | **253 rows**. 7 cols match perfectly. | `parent_folder_id INT UNSIGNED NULL`. Max hierarchy depth enforced by app: 8. | `CONFIRMED` |
| **`note_links`** | `id`, `source_note_id`, `target_note_id`, `created_at` | Migration 001 | Matches 4 cols | **615 rows**. 4 cols match perfectly. | `UNIQUE KEY uq_note_link (source_note_id, target_note_id)`. Populated by title/durable WikiLink sync. | `CONFIRMED` |
| **`entity_links`** | `id`, `user_id`, `source_type`, `source_id`, `target_type`, `target_id`, `link_type`, `origin`, `context_snippet`, `is_confirmed`, `deleted_at` | Migration 002 | Matches 13 cols | **1,554 rows**. 13 cols match perfectly. | `link_type`: 10 canonical values (`references`, `embeds`, `cites`, `derived_from`, `supports`, `contradicts`, `inspired_by`, `depends_on`, `blocks`, `relates_to`). `origin`: 8 values. `UNIQUE(source_type, source_id, target_type, target_id, link_type)`. | `CONFIRMED` |
| **`research_documents`** | `id`, `user_id`, `project_id`, `title`, `original_filename`, `file_name`, `file_path`, `file_type`, `file_size`, `content_text`, `summary`, `source_url`, `tags_json` | Migrations 001, 003 | Missing `file_name`, `tags_json` | **56 rows**. Contains `file_name VARCHAR(300)` and `tags_json JSON`. | `file_type`: `enum('md','pdf','docx','txt')`. `content_text LONGTEXT NULL`. `summary TEXT NULL`. | `CONFIRMED` |
| **`research_excerpts`** | `id`, `research_id`, `user_id`, `project_id`, `quoted_text`, `annotation`, `location_anchor`, `color`, `deleted_at`, `cascade_deleted_by` | Migrations 001, 004 | Matches 11 cols | **48 rows**. 11 cols match perfectly. | `location_anchor VARCHAR(100) NOT NULL`. `color VARCHAR(30) DEFAULT 'yellow'`. `INDEX(research_id)`. | `CONFIRMED` |
| **`file_uploads`** | `id`, `user_id`, `project_id`, `entity_type`, `entity_id`, `filename`, `original_name`, `file_path`, `mime_type`, `file_size`, `sha256_hash` | **Missing from all migrations!** (Created by `SecurityService`) | **Missing from `schema-target.sql`!** | **122 rows**. 11 cols. | `entity_type VARCHAR(32) DEFAULT 'note'`. `file_path VARCHAR(512) UNIQUE`. `sha256_hash VARCHAR(64) NULL`. | `CONFIRMED (LIVE ONLY)` |
| **`tasks`** | `id`, `user_id`, `project_id`, `title`, `description`, `status`, `priority`, `due_date`, `sort_order`, `completed_at`, `deleted_at` | Migration 001 | Matches 13 cols | **190 rows**. 13 cols match perfectly. | `status`: `enum('planned','in_progress','done')` (default `'planned'`). `priority`: `enum('low','medium','high','urgent')` (default `'medium'`). | `CONFIRMED` |
| **`boards`** | `id`, `project_id`, `parent_board_id`, `user_id`, `title`, `description`, `zoom_level`, `viewport_x`, `viewport_y`, `grid_size`, `deleted_at`, `cascade_deleted_by` | Migrations 001, 003, 004 | Matches 14 cols | **214 rows**. 14 cols match perfectly. | `zoom_level FLOAT DEFAULT 1.0`. `INDEX(project_id)`. `INDEX(parent_board_id)`. | `CONFIRMED` |
| **`board_groups`** | `id`, `board_id`, `title`, `color`, `position_x`, `position_y`, `width`, `height` | Migration 001 | Matches 10 cols | **175 rows**. 10 cols match perfectly. | `INDEX(board_id)`. Visual boundary for spatial grouping. | `CONFIRMED` |
| **`board_items`** | `id`, `board_id`, `user_id`, `item_type`, `reference_type`, `reference_id`, `group_id`, `title`, `content`, `position_x`, `position_y`, `width`, `height`, `color`, `z_index`, `metadata_json`, `deleted_at`, `cascade_deleted_by` | Migrations 001, 003, 004 | Matches 20 cols | **119 rows**. 20 cols match perfectly. | `item_type`: `enum('note','idea','image','link','research_ref','task','document')`. `reference_type`: `enum('project','note','task','research','excerpt','board','decision') NULL`. | `CONFIRMED` |
| **`board_item_connections`** | `id`, `board_id`, `source_item_id`, `target_item_id`, `connection_type`, `label`, `created_at` | Migration 001 | Matches 7 cols | **62 rows**. 7 cols match perfectly. | Visual canvas diagram wires only. `source_item_id`, `target_item_id` point to `board_items.id`. **Never inserted into `entity_links`**. | `CONFIRMED` |
| **`knowledge_import_jobs`** | `id`, `operation_id`, `idempotency_key`, `user_id`, `destination_project_id`, `package_name`, `package_sha256`, `state`, `staging_dir`, `journal_path`, `promoted_files_json`, `created_project_id`, `summary_json`, `error_details_json`, timestamps | Migration 006 | **Missing from `schema-target.sql`!** | **95 rows**. 18 cols. | `state`: `enum('validating','failed_validation','staged','committing_files','committing_db','committed','rollback_pending','rolled_back','recovery_required')`. `UNIQUE(user_id, idempotency_key)`. | `CONFIRMED (LIVE ONLY)` |
| **`knowledge_exchange_tickets`** | `id`, `ticket_hash`, `operation_id`, `user_id`, `package_sha256`, `destination_project_id`, `staging_dir`, `staged_package_path`, `package_name`, `report_json`, `is_consumed`, `consumed_at`, `consumed_by_operation_id`, timestamps, `expires_at` | Migration 006 | **Missing from `schema-target.sql`!** | **124 rows**. 15 cols. | `ticket_hash CHAR(64) UNIQUE`. `is_consumed TINYINT(1) DEFAULT 0`. 15-minute expiration window. | `CONFIRMED (LIVE ONLY)` |

---

## C. Domain Service Verification

We inspected whether existing Flowden domain services can be safely reused by the FKF 2.0 transactional import pipeline:

| Service / Model | Methods Inspected | Transaction-Aware? (`conn` parameter) | Safe for Import Reuse? | Verified Defect / Limitation |
| :--- | :--- | :--- | :--- | :--- |
| **`Note` Model** ([`server/models/Note.js`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/server/models/Note.js)) | `create`, `update`, `delete`, `findById`, `syncTags`, `syncWikiLinks` | **PARTIAL**: Only `syncWikiLinks` accepts `(dbOrConn = db)`. `create()` and `update()` execute directly on global `db.query()`. | **UNSAFE for transactional import**. Calling `Note.create()` executes outside the import transaction and auto-commits. | If used during import, an import failure cannot rollback created notes. |
| **`Project` Model** ([`server/models/Project.js`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/server/models/Project.js)) | `create`, `update`, `findById`, `findAll` | **NO**: All queries execute directly on global `db.query()`. | **UNSAFE for transactional import**. | Auto-provisions a default board on global connection; cannot participate in an external transaction. |
| **`EntitySyncService`** ([`server/services/entitySyncService.js`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/server/services/entitySyncService.js)) | `syncNoteEntity`, `syncTaskEntity`, `deleteNoteEntity`, `deleteTaskEntity`, `linkNotes` | **YES**: Every method takes `dbOrConn` as its first parameter. | **SAFE for transactional reuse**. | Only implements methods for `note` and `task`. Completely lacks `syncProjectEntity`, `syncResearchEntity`, `syncExcerptEntity`, `syncBoardEntity`. |
| **`SearchService`** ([`server/services/searchService.js`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/server/services/searchService.js)) | `universalSearch`, `autocompleteWikilinks` | **YES**: Takes `dbOrConn` as first parameter. | **SAFE for query reuse**. | Queries `entities` table exclusively via `searchAccessPredicate`. Misses all entities not explicitly registered in `entities`. |
| **`SecurityService`** ([`server/services/securityService.js`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/server/services/securityService.js)) | `validateUploadedFile`, `validateExternalUrl`, `wrapUntrustedWorkspaceData`, `logSecurityEvent` | **YES**: Pure functional security validations and isolated audit logging. | **SAFE and MANDATORY for import reuse**. | Magic-byte checks and URL blocking must be called on all assets and source links. |
| **`KnowledgeExchangeService`** ([`server/services/knowledgeExchangeService.js`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/server/services/knowledgeExchangeService.js)) | `executeImport`, `rollbackPromotedFiles`, `writeAheadJournal` | **YES**: Owns the master transaction `conn = await db.getConnection(); await conn.beginTransaction();` | **AUTHORITATIVE for import**. | Currently executes raw SQL queries directly on `conn` for all 10 entity types precisely because models lack transaction support. |

### Domain Service Reuse Verdict:
The existing domain models (`Note`, `Project`, `Task`, `Board`) **cannot be invoked directly** during import unless they are refactored to accept an optional `dbOrConn = db` parameter. The raw SQL pattern currently used in `KnowledgeExchangeService` is architecturally correct and necessary to guarantee atomic rollback across all 10 entity types.

---

## D. Authorization Verification

We audited Flowden's authorization layer across `searchAccessPredicate.js`, `Project.js`, `Note.js`, and MCP tool implementations.

### 1. Ownership & Direct Access
- Primary ownership is defined by `user_id` on the base table (`notes`, `projects`, `tasks`, `research_documents`, `boards`) and mirrored in `entities.owner_user_id`.
- The owner has unconditional read, write, soft-delete, and restore permissions.

### 2. Project Membership (`project_members`)
- Roles: `'owner'`, `'editor'`, `'viewer'`.
- When a user creates a project, an owner membership row is inserted (`role = 'owner'`).
- Active membership requires `revoked_at IS NULL`. Queries join `LEFT JOIN project_members pm ON pm.project_id = ... AND pm.user_id = ? AND pm.revoked_at IS NULL`.

### 3. Shared Entity Membership (`project_entities`)
- Connects entities to projects with access roles: `'viewer'`, `'contributor'`, `'admin'`.
- Access Rule: An entity is accessible to a non-owning user if and only if:
  1. The entity is linked to a project in `project_entities` (or has `primary_project_id = project.id`), AND
  2. The user has active membership (`revoked_at IS NULL`) in that project in `project_members`.

### 4. Personal Quick Capture Privacy
- Quick captures (`entity_type = 'capture'`) are strictly private to their author.
- `searchAccessPredicate.js` explicitly enforces:
  `(${alias}.entity_type <> 'capture' OR ${alias}.owner_user_id = ?)`
- Quick captures are never returned to project collaborators and are excluded from all MCP tools.

### 5. Zero-Trust Access Predicate (`searchAccessPredicate.js`)
- Authoritative SQL snippet generator enforcing soft-delete isolation (`deleted_at IS NULL`) and membership verification.
- **Link Non-Traversal Rule:** A link in `entity_links` or `note_links` never grants access to an unauthorized entity. Both the source entity and target entity must independently satisfy the access predicate.
- **MCP Tool Isolation (`isMcp: true`):**
  - Requires caller to have active membership in an explicitly enabled project (`enabledProjectIds`).
  - If `enabledProjectIds` is empty, the predicate evaluates to `(${alias}.deleted_at IS NULL AND 1 = 0)` returning zero records.

---

## E. Import Infrastructure Verification

We verified the existing Knowledge Exchange import infrastructure across `packageInspectionService.js`, `knowledgeExchangeService.js`, and `exchange.js`:

| Component / Capability | Status in Codebase | Verification Details |
| :--- | :--- | :--- |
| **Two-Phase Ticketed Import** | **CONFIRMED IMPLEMENTED** | `POST /api/v1/exchange/inspect` stores validated ticket in `knowledge_exchange_tickets` and issues `fkp_tok_...` token (15-min TTL). `POST /api/v1/exchange/commit` verifies ticket, checks user binding, and sets `is_consumed = TRUE`. |
| **Crash-Safe Write-Ahead Journal** | **CONFIRMED IMPLEMENTED** | Atomic write-ahead journal at `temp/fkp_journals/<op_id>.journal.json` tracks staged assets before permanent promotion to `uploads/vault/`. |
| **State Machine (`knowledge_import_jobs`)** | **CONFIRMED IMPLEMENTED** | All 9 states (`validating`, `failed_validation`, `staged`, `committing_files`, `committing_db`, `committed`, `rollback_pending`, `rolled_back`, `recovery_required`) tracked and synchronized. |
| **Idempotency Key Enforcement** | **CONFIRMED IMPLEMENTED** | Composite unique index `(user_id, idempotency_key)` in MySQL. Replay of committed jobs returns cached summary; concurrent executions return `409 Conflict`. |
| **Two-Pass Entity Resolution** | **CONFIRMED IMPLEMENTED** | Pass 1 creates entities and builds `packageIdMap`. Pass 2 rewrites WikiLinks (`[[fkf:<id>|...]]` -> `[[note:<dbId>|...]]`), inserts `entity_links`, and wires `board_item_connections`. |
| **Rollback File Cleanup** | **CONFIRMED IMPLEMENTED** | `KnowledgeExchangeService.rollbackPromotedFiles()` removes promoted files from `uploads/vault/` if the database transaction aborts. |
| **Standalone `.fkf` Ingress** | **MISSING** | `packageInspectionService.js` strictly requires `.flowden.zip` uploaded via multipart form. No route or parser exists for standalone `.fkf` or raw JSON. |
| **Unified Intermediate Model** | **MISSING** | No `CanonicalKnowledgePackage` object exists. Inspection and commit are coupled directly to ZIP extraction and staged filesystem reading. |
| **Decoupled Projection Cards** | **MISSING** | Spatial Board copies entire raw note markdown (`item.content = chosen.content`) instead of clean 140-char excerpts. |

---

## F. Test Environment and Results

### 1. Test Harness Audit
We inspected the test files in `tests/`:

- **Mock / Simulator Tests:**
  - `tests/issue5_universal_search_auth.test.js`: Uses an in-memory JavaScript SQL simulator (`createSearchDatabase()`), not MySQL.
  - `tests/issue1_2_cascade_lifecycle.test.js`: Uses in-memory simulator.
- **Local Fallback JSON Store:**
  - `tests/foundation.test.js`: Historically designed to run against `flowden_store.json` (the local fallback file).
- **Real MySQL Tests:**
  - `tests/issue5_real_mysql.test.js`: Connects to `flowden_test` on `127.0.0.1:3306`.
  - `tests/phase2a_exchange_inspector.test.js`: Connects to `flowden_test` and tests real ZIP extraction.
  - `tests/phase2b_exchange_importer.test.js`: Connects to `flowden_test` and tests real transactional import.

### 2. The Truth About Test 9 / Universal Search
The user specifically asked: *"Whether Test 9 / Universal Search still fails."*

**Verdict: YES, Test 9 in `foundation.test.js` fails when run against real MySQL.**

#### Root Cause Demonstration:
1. In `foundation.test.js`, Test 6 creates a new project via `POST /api/v1/projects`:
   `title: 'Cognitive Architecture Engine'`
2. `Project.create()` inserts a row into `projects` table (and `boards`, `project_members`). **It does NOT insert into `entities`**.
3. In Test 9, `GET /api/v1/search?q=Cognitive` calls `SearchService.universalSearch()`.
4. In real MySQL (`db.isConnectedToMySQL === true`), `SearchService.universalSearch` executes:
   `SELECT ... FROM entities e WHERE ... AND MATCH(e.title, e.search_text) AGAINST ('Cognitive' ...)`
5. Because `Cognitive Architecture Engine` was never inserted into `entities`, the query returns **0 rows**.
6. The assertion `assert(searchRes.data.total >= 1)` fails!
7. **Why it previously passed:** When MySQL is disconnected or when tests run against `flowden_store.json`, `search.js` falls back to querying `projects` table directly with `p.title.toLowerCase().includes('cognitive')`, masking this critical production defect!

### 3. Test Database Isolation Warning
- The test database is **NOT isolated** from the workspace development database.
- Both `.env` (`DB_NAME=flowden_test`) and test scripts share the identical database.
- Running tests populates `flowden_test` with fixture users (`sec_user_a_*`, `importer_user_a_*`, `designer_*`), which explains why `flowden_test.users` has over 130 accounts and `projects` has 228 rows.

---

## G. Critical Blockers

The following items are critical blockers preventing FKF Phase 1A finalization and Phase 1B implementation:

1. **`schema-target.sql` Schema Drift (BLOCKER 1):**
   - Developers and agents reading `schema-target.sql` believe `file_uploads`, `knowledge_import_jobs`, and `knowledge_exchange_tickets` do not exist.
   - Any architectural design based on `schema-target.sql` is working against a stale fantasy rather than reality.
   - *Resolution:* `schema-target.sql` must be synchronized to mirror the live MySQL 8.4 schema.
2. **Missing Unified Entities Registration on Project / Research CRUD (BLOCKER 2):**
   - Normal application CRUD for Projects and Research documents fails to register records in `entities`.
   - Only 14 of 228 projects exist in `entities`. This breaks Universal Search and causes Test 9 to fail on real MySQL.
   - *Resolution:* Implement `EntitySyncService.syncProjectEntity()` and `EntitySyncService.syncResearchEntity()` and invoke them in `Project.create()` and `research.js`.
3. **No Standalone `.fkf` Ingress Route or Adapter (BLOCKER 3):**
   - Existing exchange infrastructure only accepts `.flowden.zip` multipart uploads.
   - Standalone JSON payloads from NotebookLM cannot be ingested.
   - *Resolution:* Implement `fkfCanonicalParser.js` capable of normalizing standalone `.fkf` JSON and staged `.flowden.zip` into `CanonicalKnowledgePackage`.
4. **PDF Extraction Crash (`pdfParse is not a function`) (BLOCKER 4):**
   - `server/routes/research.js` line 56 crashes on PDF uploads due to `pdf-parse` v2 export shape mismatch.
   - Corrupts research text and bridged vault notes with error strings.
   - *Resolution:* Update PDF extraction to instantiate `new PDFParse()` per v2 API.

---

## H. Recommended Decisions

### Safe Technical Decisions (Engineering Consensus)
1. **Ratify `notes.content` as Canonical:** Keep `notes.content LONGTEXT` as the single authoritative Markdown storage column. Never add a second markdown column to `notes`.
2. **Synchronize `schema-target.sql`:** Update `schema-target.sql` to include `file_uploads`, `knowledge_import_jobs`, `knowledge_exchange_tickets`, `notes.attachments_json`, and research columns so documentation matches live MySQL 8.4.
3. **Retain Raw SQL Transaction Pattern in Importer:** Keep the direct `conn.query()` execution in `KnowledgeExchangeService`. Do not attempt to refactor domain models during Phase 1; transactional atomicity across 10 entity types is already proven.
4. **Decouple Spatial Board Projection Cards:** Ensure `board_items.content` contains plain-text excerpts (max 140–160 chars), add `Vault Note` badge, and implement direct `"Open in Vault"` action.

### Unresolved User Preferences (Requires User Guidance)
1. **Ingress Endpoint Architecture:**
   - *Choice A:* Overload `POST /api/v1/exchange/inspect` to detect `Content-Type: application/json` vs `multipart/form-data`.
   - *Choice B:* Dedicated endpoint `POST /api/v1/exchange/inspect-json` alongside file inspect.
2. **Existing Broken PDF Re-extraction:**
   - Whether to provide a one-click "Re-extract literature" tool in Research Center to repair existing research documents contaminated by `pdfParse is not a function`.
3. **Test Database Separation:**
   - Whether to configure a dedicated ephemeral test database (e.g., `flowden_unit_test`) separate from `flowden_test` to prevent test fixture accumulation.

---

## I. Final Status Assessment

- **Environment & MySQL 8.4 Connection:** `CONFIRMED` (MySQL 8.4.13 Community Server active on `flowden_test`).
- **Live Database Schema:** `CONFIRMED` (All 29 tables and 19 FKF-critical tables inspected and verified).
- **Domain Service & Authorization Rules:** `CONFIRMED` (Access predicates, ownership, and project membership verified).
- **Import Infrastructure:** `CONFIRMED` (Two-phase ticketed state machine and write-ahead journaling verified; `.fkf` ingress missing).
- **Test 9 / Universal Search Status:** `CONFIRMED FAILING` on real MySQL due to missing `entities` registration in `Project.create()`.
- **Claude Independent Review:** `CONFIRMED ABSENT` (`docs/reports/flowden-fkf2-independent-review.md` does not exist).
- **Overall Phase 0 Audit Status:** **`DONE-VERIFIED`**

---
*Report produced strictly via read-only inspection. Zero source code or database records were modified.*

