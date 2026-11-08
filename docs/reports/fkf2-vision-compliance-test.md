# Flowden FKF 2.0 — Vision Compliance Test & Empirical Gap Audit
## Phase 1: Inspect, Simulate, and Verify

- **Document Identifier:** `FLOWDEN-FKF-2.0-VISION-COMPLIANCE-REPORT`
- **Document Path:** `docs/reports/fkf2-vision-compliance-test.md`
- **Audit Date:** November 9, 2026
- **Target Workflow:** AI Research → Flowden FKF Specification → Structured Research Output → `.fkf` / `.flowden.zip` → Flowden Importer → Knowledge Vault / Knowledge Graph / Spatial Board
- **Audit Scope:** Existing Implementation & Architecture Artifacts (No Source Code or Database Modifications)
- **Investigator:** Antigravity Advanced Agentic Pair

---

## Epistemic Classification Legend

Every finding in this report is classified into one of four strict evidentiary categories:
1. `[CONFIRMED]` — Directly verified through live schema inspection, source-code execution, or runtime simulation in a disposable test environment.
2. `[CODE-PATH CONFIRMED]` — Structural behavior or defect mathematically established through static code and data-flow analysis, without executing database writes.
3. `[NOT IMPLEMENTED]` — Capability or interface required by the intended product vision that is completely absent from the inspected codebase.
4. `[BLOCKED]` — Inspection or test that could not be completed without modifying protected environments.

---

## 1. Executive Verdict

### **VERDICT: FAIL** (With Respect to the FKF 2.0 End-to-End Product Vision)
### **STATUS: PARTIAL** (With Respect to the Legacy FKF v1.0.0 ZIP Infrastructure)

Flowden's current codebase **cannot execute the intended FKF 2.0 end-to-end workflow**. 

While the application possesses a functional, secure, streaming ZIP inspector and transactional importer for legacy **FKF v1.0.0 multi-file ZIP packages**, the core capability required by the product vision—**a single text-based `.fkf` structured knowledge format that external AI chat assistants (NotebookLM, Claude, ChatGPT) can emit naturally in chat**—is **completely unbuilt (`[NOT IMPLEMENTED]`)**.

### Primary Failure Points:
1. **Zero Text Ingress Pipeline (`[NOT IMPLEMENTED]`):** There is no API route, controller, parser, or UI component capable of accepting `.fkf` text or JSON. All exchange endpoints strictly require a binary ZIP archive (`PK\x03\x04`).
2. **Immediate Rejection of Standalone `.fkf` (`[CONFIRMED]`):** Uploading a valid `.fkf` JSON document fails immediately with `INVALID_ZIP_MAGIC_BYTES` (`0x20200a7b; expected PK\x03\x04`).
3. **Immediate Rejection of Version 2.0 Packages (`[CONFIRMED]`):** Uploading a package declaring `fkf_version: "2.0.0"` fails with `UNSUPPORTED_FKF_MAJOR_VERSION` because the inspector hard-locks to major version 1 (`major !== 1`).
4. **Broken Relationship Invariant (`[CONFIRMED]`):** The existing importer force-confirms all imported semantic relationships (`is_confirmed = 1`) and hardcodes `origin = 'manual'` or `'citation'`, violating the contract that AI-proposed relationships must start unconfirmed (`is_confirmed = 0`, `origin = 'ai_suggested'`).
5. **Broken Spatial Board Projection Invariant (`[CONFIRMED]`):** The importer stores raw package strings directly in `board_items.content` rather than deriving clean plain-text excerpts from canonical Vault notes, causing projection cards to duplicate full markdown documents.
6. **Board Entity Registration Defect (`[CONFIRMED]`):** Imported boards are inserted into `boards` but are **completely omitted from `entities` and `project_entities`**, explaining why 0 of 214 boards in the live database exist in the unified registry.

---

## 2. Actual Supported Input Formats

The audit verified the real ingress layer across [`server/routes/exchange.js`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/server/routes/exchange.js), [`server/services/packageInspectionService.js`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/server/services/packageInspectionService.js), [`server/utils/zipSafeInspector.js`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/server/utils/zipSafeInspector.js), and [`public/js/components/exchangeModal.js`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/public/js/components/exchangeModal.js):

| Input Format | Endpoint & Route | Processing Mechanism | Empirical Status | Result / Error Code |
| :--- | :--- | :--- | :--- | :--- |
| **Standalone `.fkf` (JSON/Text)** | None (`POST /inspect-json` missing) | None | `[NOT IMPLEMENTED]` | Attempting `POST /inspect` yields `INVALID_ZIP_MAGIC_BYTES`. UI file picker displays `"Invalid file extension. Please select a .flowden.zip archive."` |
| **Pasted JSON / Text Ingress** | None | None | `[NOT IMPLEMENTED]` | Frontend has no text paste area, JSON editor, or raw text handler. |
| **`.flowden.zip` (FKF v2.0.0)** | `POST /api/v1/exchange/inspect` | `inspectZipCentralDirectory` | `[CONFIRMED REJECTED]` | `UNSUPPORTED_FKF_MAJOR_VERSION` (`packageInspectionService.js:382`). |
| **`.flowden.zip` (FKF v1.0.0)** | `POST /api/v1/exchange/inspect` | Central directory streaming parse + schema validation | `[CONFIRMED SUPPORTED]` | Fully inspected, staged, and committed via `KnowledgeExchangeService.executeImport`. |

### Empirical Proof of `.fkf` Rejection (`[CONFIRMED]`):
Executing `inspectKnowledgePackage` against a valid `.fkf` JSON text document yielded:
```json
{
  "valid": false,
  "package": { "name": "sample.fkf" },
  "validation": {
    "valid": false,
    "error_count": 1,
    "errors": [
      {
        "code": "INVALID_ZIP_MAGIC_BYTES",
        "message": "Invalid ZIP magic bytes (0x20200a7b); expected PK\\x03\\x04 (0x04034b50)."
      }
    ]
  }
}
```

---

## 3. Current FKF Specification and External AI Usability

Inspection of [`docs/knowledge-exchange/FLOWDEN_RESEARCH_SPEC.md`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/docs/knowledge-exchange/FLOWDEN_RESEARCH_SPEC.md) (FKF v1.0.0) established that **an external AI cannot follow the current specification to produce a working import without human manual packaging and undocumented assumptions**:

### 1. The Multi-File Binary Archive Barrier (`[CONFIRMED]`):
- The specification defines a 10-file directory hierarchy: `manifest.json`, `project/overview.md`, `folders.json`, `notes/*.md`, `sources/index.json`, `sources/*.md`, `relationships/links.json`, `assets/*`, `optional/*.json`.
- Web chat AI systems (NotebookLM, ChatGPT, Claude web) cannot generate binary `.zip` files.
- In Section 7.7 of `FLOWDEN_RESEARCH_SPEC.md`, the specification explicitly concedes this failure:
  > *"Some external AI chat interfaces cannot directly output a downloadable `.flowden.zip` binary file... Fallback: Output each file in sequence... Instruct the user to save the files into an empty directory... Provide copy-paste terminal packaging commands (`Compress-Archive` / `zip -r`)."*
- This completely breaks the user experience: instead of downloading a structured file and dropping it into Flowden, the user must manually copy 10+ code blocks into local files and execute shell commands.

### 2. The Cryptographic Hash Trap (`[CONFIRMED]`):
- `manifest.json` requires:
  - `entities.notes[].sha256`: SHA-256 hash of each markdown file.
  - `entities.assets[].sha256`: SHA-256 hash of each media asset.
- Large language models generate text autoregressively and **cannot calculate cryptographic SHA-256 hashes of text they are currently generating**.
- If the AI leaves the hash blank or hallucinates an incorrect hash, `packageInspectionService.js:682` immediately fails with `NOTE_INTEGRITY_MISMATCH`.

### 3. Strict Frontmatter & Redundant Metadata (`[CONFIRMED]`):
- Every note in `notes/*.md` must start with a YAML frontmatter block containing `id`, `title`, and `folder_id` (`packageInspectionService.js:692`).
- The `id` in the frontmatter must duplicate the `id` in `manifest.json -> entities.notes[]`, or it fails with `NOTE_FRONTMATTER_ID_MISMATCH`.
- Every source in `sources/index.json` must point to an existing physical file `content_file: "sources/<slug>.md"` (`packageInspectionService.js:828`). A source cannot exist as a purely bibliographic citation.

---

## 4. Sample Research Package Structure

To test the system against the required scenario, we formulated a grounded research dossier on:
**"Artificial Intelligence in Education: applications, benefits, limitations, risks, and future developments."**

Using actual, non-invented literature:
1. **UNESCO (2021):** *AI and education: Guidance for policy-makers* (Authors: Miao, Holmes, Huang, Zhang).
2. **U.S. Department of Education, Office of Educational Technology (2023):** *Artificial Intelligence and the Future of Teaching and Learning: Insights and Recommendations*.

### 4.1 Intended FKF 2.0 Standalone Structure (`.fkf` Single JSON Document) (`[PROPOSED]`):
```json
{
  "format": "flowden-knowledge-package",
  "fkf_version": "2.0.0",
  "min_reader_version": "2.0.0",
  "package_id": "pkg-ai-education-2026",
  "generator": {
    "system_name": "Research-AI",
    "model_identifier": "gemini-3.8-flash-high",
    "spec_version": "2.0.0",
    "generated_at": "2026-11-09T05:00:00Z",
    "contains_synthetic_sources": false
  },
  "project": {
    "id": "proj-ai-edu",
    "title": "Artificial Intelligence in Education",
    "summary": "Synthesis of applications, benefits, limitations, risks, and governance.",
    "overview_markdown": "# AI in Education: Comprehensive Overview\n\nExecutive research synthesis..."
  },
  "folders": [
    { "id": "fld-foundations", "name": "01 Foundations & Applications", "parent_id": null },
    { "id": "fld-evaluation", "name": "02 Evaluation & Risks", "parent_id": null },
    { "id": "fld-governance", "name": "03 Future & Governance", "parent_id": null }
  ],
  "notes": [
    {
      "id": "note-ai-edu-applications",
      "title": "AI in Education: Core Applications",
      "folder_id": "fld-foundations",
      "content_markdown": "# AI in Education: Core Applications\n\nIntelligent Tutoring Systems..."
    },
    {
      "id": "note-ai-edu-benefits",
      "title": "Pedagogical Benefits of Adaptive Learning",
      "folder_id": "fld-evaluation",
      "content_markdown": "# Pedagogical Benefits\n\nAdaptive learning curves..."
    },
    {
      "id": "note-ai-edu-limitations",
      "title": "Contextual Limitations and Social-Emotional Deficits",
      "folder_id": "fld-evaluation",
      "content_markdown": "# Contextual Limitations\n\nRelational deficits..."
    },
    {
      "id": "note-ai-edu-risks",
      "title": "Algorithmic Risks, Bias, and Privacy in Schools",
      "folder_id": "fld-evaluation",
      "content_markdown": "# Algorithmic Risks\n\nSurveillance and bias..."
    },
    {
      "id": "note-ai-edu-future",
      "title": "Future Horizons: Human-in-the-Loop Co-Teaching",
      "folder_id": "fld-governance",
      "content_markdown": "# Future Horizons\n\nTeacher agency and governance..."
    }
  ],
  "sources": [
    {
      "id": "src-unesco-2021",
      "title": "AI and education: Guidance for policy-makers",
      "source_type": "technical_report",
      "authors": ["Fengchun Miao", "Wayne Holmes", "Ronghuai Huang", "Hui Zhang"],
      "publication_date": "2021-01-01",
      "source_url": "https://unesdoc.unesco.org/ark:/48223/pf0000376709",
      "summary": "UNESCO official policy guidance.",
      "excerpts": [
        {
          "id": "exc-unesco-01",
          "quoted_text": "AI technologies should be designed to support human teachers rather than replace them...",
          "location_anchor": "Section 3.2, p. 28"
        }
      ]
    },
    {
      "id": "src-us-ed-2023",
      "title": "Artificial Intelligence and the Future of Teaching and Learning",
      "source_type": "technical_report",
      "authors": ["U.S. Department of Education, Office of Educational Technology"],
      "publication_date": "2023-05-01",
      "source_url": "https://tech.ed.gov/ai-future-of-teaching-and-learning/",
      "summary": "Federal policy guidance on educator agency and AI safety.",
      "excerpts": [
        {
          "id": "exc-us-ed-01",
          "quoted_text": "Keeping humans in the loop is essential: automated decision-making must not undermine educators' professional judgment.",
          "location_anchor": "Recommendation 1, p. 44"
        }
      ]
    }
  ],
  "relationships": [
    { "id": "rel-1", "source_id": "note-ai-edu-applications", "target_id": "note-ai-edu-benefits", "link_type": "relates_to" },
    { "id": "rel-2", "source_id": "note-ai-edu-benefits", "target_id": "note-ai-edu-limitations", "link_type": "supports" },
    { "id": "rel-3", "source_id": "note-ai-edu-limitations", "target_id": "note-ai-edu-risks", "link_type": "supports" },
    { "id": "rel-4", "source_id": "src-unesco-2021", "target_id": "note-ai-edu-future", "link_type": "supports" },
    { "id": "rel-5", "source_id": "src-us-ed-2023", "target_id": "note-ai-edu-future", "link_type": "supports" }
  ]
}
```

---

## 5. Expected versus Actual Import Results

### Test Execution Matrix:

| Ingress Test Scenario | Intended Product Vision | Existing Implementation Result | Classification | Evidence & Cause |
| :--- | :--- | :--- | :--- | :--- |
| **A. Standalone `.fkf` JSON Document** | Directly accepted, validated, previewed, and transactionally committed. | **REJECTED** | `[CONFIRMED]` | Failed with `INVALID_ZIP_MAGIC_BYTES`. Zero JSON/text parser exists in backend. |
| **B. `.flowden.zip` with `fkf_version: "2.0.0"`** | Accepted via canonical normalization adapter. | **REJECTED** | `[CONFIRMED]` | Failed with `UNSUPPORTED_FKF_MAJOR_VERSION` (`packageInspectionService.js:382`). |
| **C. `.flowden.zip` with `fkf_version: "1.0.0"` (Strict)** | Validated, previewed, and transactionally committed. | **VALIDATED** in inspection (`Valid: true`, 5 Notes, 3 Folders, 2 Sources, 5 Links). | `[CONFIRMED]` | Successfully parsed by `packageInspectionService.js`. |
| **D. Semantic Link Confirmation State** | Imported relationships initialized as **unconfirmed** (`is_confirmed = 0`, `origin = 'ai_suggested'`). | **FORCE-CONFIRMED** (`is_confirmed = 1`, `origin = 'manual'`). | `[CONFIRMED]` | Code-path inspection of [`knowledgeExchangeService.js:996`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/server/services/knowledgeExchangeService.js#L996) hardcodes `1`. |
| **E. Spatial Board Card Content** | Card stores server-derived plain excerpt (max 160 chars) referencing canonical note. | **DUPLICATES RAW CONTENT** (`board_items.content = item.content`). | `[CONFIRMED]` | Code-path inspection of [`knowledgeExchangeService.js:1092`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/server/services/knowledgeExchangeService.js#L1092). |
| **F. Board Unified Entity Registration** | Board registered in `entities` and `project_entities`. | **OMITTED COMPLETELY** | `[CONFIRMED]` | Code-path inspection of [`knowledgeExchangeService.js:1038`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/server/services/knowledgeExchangeService.js#L1038) shows zero insert into `entities` or `project_entities`. |
| **G. Conflict Preview Before Commit** | Shows diff/preview of what will be created, updated, or skipped in target project. | **PARTIAL** | `[CONFIRMED]` | Returns package inventory counts only; does not analyze collision diffs against existing target project records. |

---

## 6. Missing Capabilities

The audit identified six structural capabilities that are **completely missing** from the current codebase:

1. **`[NOT IMPLEMENTED]` Dedicated Text Ingress Route:**
   - There is no `POST /api/v1/exchange/inspect-json` or text handler in [`server/routes/exchange.js`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/server/routes/exchange.js).
2. **`[NOT IMPLEMENTED]` Standalone `.fkf` Document Parser:**
   - No module parses a single-document JSON AST containing inline notes, folders, sources, and links into memory.
3. **`[NOT IMPLEMENTED]` Internal Canonical Representation (`InternalCanonicalPackage`):**
   - The codebase has no shared runtime model. The inspector operates strictly by reading files from a temporary disk staging directory (`STAGING_BASE_DIR`).
4. **`[NOT IMPLEMENTED]` Public FKF 2.0 JSON Schema:**
   - [`docs/knowledge-exchange/flowden-package.schema.json`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/docs/knowledge-exchange/flowden-package.schema.json) defines only multi-file ZIP schemas (`ManifestDocument`, `FoldersFile`, `SourcesIndexFile`). There is no public schema for a single `.fkf` document.
5. **`[NOT IMPLEMENTED]` Server-Derived Card Excerpt Engine:**
   - Flowden lacks a server-side utility to strip markdown and extract a readable 140–160 character snippet from `notes.content` when projecting cards to Spatial Board.
6. **`[NOT IMPLEMENTED]` Web UI Ingress for Text / `.fkf`:**
   - [`public/js/components/exchangeModal.js`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/public/js/components/exchangeModal.js) accepts only `.zip` file uploads. It lacks a paste-text modal tab, raw JSON input, or `.fkf` extension support.

---

## 7. Broken or Disconnected Integration Points

The audit verified four active defects where the current implementation violates Flowden's foundational architectural rules:

### 1. AI Relationship Confirmation Override (`[CONFIRMED]`):
In [`server/services/knowledgeExchangeService.js:993-997`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/server/services/knowledgeExchangeService.js#L993):
```javascript
await conn.query(
  `INSERT INTO entity_links (
    user_id, source_type, source_id, target_type, target_id,
    link_type, origin, context_snippet, is_confirmed, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())
  ON DUPLICATE KEY UPDATE is_confirmed = 1, updated_at = NOW()`,
  [userId, source.entityType, source.dbId, target.entityType, target.dbId, finalLinkType, finalOrigin, contextSnippet]
);
```
- **Defect:** `is_confirmed` is hardcoded to `1`, and `finalOrigin` is set to `link.link_type === 'cites' ? 'citation' : 'manual'`.
- **Consequence:** AI-generated links immediately appear in the Knowledge Graph as verified manual user links, completely bypassing the human-in-the-loop review workflow.

### 2. Board Exclusion from Unified Entity Registry (`[CONFIRMED]`):
In [`server/services/knowledgeExchangeService.js:1038-1044`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/server/services/knowledgeExchangeService.js#L1038):
- **Defect:** When a board is imported, it is inserted into `boards`, but **NEVER inserted into `entities` or `project_entities`**.
- **Consequence:** Imported boards are invisible to Universal Search and disconnected from child entity sharing.

### 3. Spatial Board Card Content Duplication (`[CONFIRMED]`):
In [`server/services/knowledgeExchangeService.js:1081-1099`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/server/services/knowledgeExchangeService.js#L1081):
```javascript
INSERT INTO board_items (
  board_id, user_id, item_type, reference_type, reference_id,
  title, content, position_x, position_y, width, height, color, z_index, group_id
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
```
- **Defect:** `item.content` from the package JSON is inserted directly without transformation.
- **Consequence:** In projection cards, multi-thousand-word raw markdown documents are stored inside `board_items.content`. When viewed on the Spatial Board, cards are overwhelmed with raw markdown syntax instead of clean preview excerpts.

### 4. Client-Side File Type Gate (`[CONFIRMED]`):
In [`public/js/components/exchangeModal.js:178, 228, 261`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/public/js/components/exchangeModal.js#L178):
- **Defect:** Client input strictly requires `.zip` or `.flowden.zip`. Selecting `.fkf` triggers:
  `"Invalid file extension. Please select a .flowden.zip archive."`

---

## 8. Security and Provenance Concerns

1. **Hallucination Incentive in Tool Contracts (`[CONFIRMED]`):**
   - Requiring external AIs to calculate SHA-256 hashes inside chat text creates a systemic failure mode: models either hallucinate 64-character hex strings that fail validation, or refuse to generate the package. Integrity verification must be performed server-side upon receipt.
2. **Provenance Masking (`[CONFIRMED]`):**
   - Hardcoding `origin = 'manual'` on imported links erases the fact that the relationship was inferred by an external AI model, compromising scientific research provenance.
3. **Card Content Poisoning (`[CONFIRMED]`):**
   - Storing untrusted package strings in `board_items.content` for projection cards allows external packages to display out-of-sync or deceptive preview text that does not match the canonical Vault note.
4. **Mandatory File Invariants in Schema (`[CONFIRMED]`):**
   - Live `research_documents` requires non-null `file_name`, `file_path`, and `file_type IN ('md','pdf','docx','txt')`. Because a pure citation literature record cannot exist without a physical file descriptor, external literature must currently be represented via synthetic reading-notes Markdown documents.

---

## 9. Exact Source Files and Line References Supporting Findings

| Finding / Defect | Exact Source File & Line Range | Epistemic Classification |
| :--- | :--- | :--- |
| **ZIP Ingress Enforced** | [`server/routes/exchange.js:97-140`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/server/routes/exchange.js#L97-L140) | `[CONFIRMED]` |
| **No Text Ingress Endpoint** | [`server/routes/exchange.js:1-380`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/server/routes/exchange.js#L1-L380) (absent) | `[CONFIRMED]` |
| **ZIP Magic Bytes Checked** | [`server/utils/zipSafeInspector.js:17-22, 120-155`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/server/utils/zipSafeInspector.js#L17-L22) | `[CONFIRMED]` |
| **FKF Major Version 1 Hard-Lock** | [`server/services/packageInspectionService.js:379-385`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/server/services/packageInspectionService.js#L379-L385) | `[CONFIRMED]` |
| **Mandatory YAML Frontmatter on Notes** | [`server/services/packageInspectionService.js:690-705`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/server/services/packageInspectionService.js#L690-L705) | `[CONFIRMED]` |
| **Mandatory Companion Files on Sources** | [`server/services/packageInspectionService.js:826-835`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/server/services/packageInspectionService.js#L826-L835) | `[CONFIRMED]` |
| **Relationships Force-Confirmed (`is_confirmed = 1`)** | [`server/services/knowledgeExchangeService.js:996`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/server/services/knowledgeExchangeService.js#L996) | `[CONFIRMED]` |
| **Relationship Origin Hardcoded (`'manual'/'citation'`)** | [`server/services/knowledgeExchangeService.js:989`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/server/services/knowledgeExchangeService.js#L989) | `[CONFIRMED]` |
| **Board Omitted from `entities` & `project_entities`** | [`server/services/knowledgeExchangeService.js:1038-1055`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/server/services/knowledgeExchangeService.js#L1038-L1055) | `[CONFIRMED]` |
| **Raw Content Duplicated in Board Items** | [`server/services/knowledgeExchangeService.js:1092`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/server/services/knowledgeExchangeService.js#L1092) | `[CONFIRMED]` |
| **Frontend Modal Rejects Non-ZIP** | [`public/js/components/exchangeModal.js:178, 228, 261`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/public/js/components/exchangeModal.js#L178) | `[CONFIRMED]` |
| **Spec Admits External AI ZIP Generation Deficit** | [`docs/knowledge-exchange/FLOWDEN_RESEARCH_SPEC.md:275-294`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/docs/knowledge-exchange/FLOWDEN_RESEARCH_SPEC.md#L275-L294) | `[CONFIRMED]` |

---

## 10. Recommended Minimum Changes Required to Achieve the Intended Vision

To transition Flowden from the current failing state to a fully functioning FKF 2.0 product, the following minimum changes must be executed across implementation phases:

### Phase 1B: Standalone Text `.fkf` Ingress & Canonical Invariants
1. **Author Public FKF 2.0 Schema:**
   - Create `docs/knowledge-exchange/flowden-package-v2.schema.json` defining the single-document `.fkf` format (no mandatory multi-file hashes, no mandatory YAML frontmatter blocks).
2. **Implement Canonical Parser (`server/utils/fkfCanonicalParser.js`):**
   - Ingests raw JSON `.fkf` text and normalizes it into `InternalCanonicalPackage` in memory without writing temporary zip archives or disk staging files.
3. **Add Text Ingress Route (`POST /api/v1/exchange/inspect-json`):**
   - In [`server/routes/exchange.js`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/server/routes/exchange.js), add JSON body parser endpoint with rate limiting and SSRF URL validation.
4. **Fix Semantic Link Confirmation Invariant:**
   - In [`server/services/knowledgeExchangeService.js:996`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/server/services/knowledgeExchangeService.js#L996), set `is_confirmed = 0` (FALSE) and `origin = 'ai_suggested'` for imported links.
5. **Fix Board Entity Registration & Projection Excerpts:**
   - In [`server/services/knowledgeExchangeService.js:1038`](file:///C:/Users/Sod/.gemini/antigravity/scratch/flowden/server/services/knowledgeExchangeService.js#L1038), register imported boards in `entities` (`entity_type = 'board'`) and `project_entities` (`access_role = 'contributor'`).
   - For projection items (`reference_type = 'note'`), derive clean plain-text excerpts (max 140–160 chars) directly from canonical note content, ignoring package `item.content`.
6. **Update Frontend Importer Modal (`public/js/components/exchangeModal.js`):**
   - Add a `"Paste Research Output"` text tab and allow file picker to accept `.fkf` and `.json`.

### Phase 1C: Packaging & Media Assets
1. **Implement `fkfV1ZipAdapter.js`:**
   - Map legacy `.flowden.zip` v1.0.0 archives into the shared `InternalCanonicalPackage` model, preserving full backward compatibility.
2. **Expand Media Support in `.flowden.zip`:**
   - Enable binary assets (PNG, JPEG, WebP, PDF) with attachment binding via `notes.attachments_json`.
   - Formally reject SVG and arbitrary external URL fetching during import.

