# Flowden — Video Evidence Analysis & Issue Timeline (`fix.mp4`)

**Document:** `docs/reports/flowden-fix-video-evidence-analysis.md`  
**Recording Inspected:** `C:\Users\Sod\.gemini\antigravity\scratch\flowden\rev\fix.mp4`  
**File Size:** 79,623,107 bytes (~75.9 MB)  
**Total Duration:** 01:21 (81 seconds)  
**Inspection Date:** November 8, 2026  
**Auditor:** Antigravity (Advanced Agentic Architecture Pair)

---

## 1. Executive Summary of Video Evidence

A comprehensive second-by-second inspection of `fix.mp4` reveals the entire lifecycle of user actions, data flow, and visual failure modes across four core Flowden modules:

1. **Research Center Document Ingestion (00:00 – 00:16):**
   - The user drags a 49.5 KB research PDF (`The_Secrets_of_Earths_Oceans_Research_Report.pdf`) into the Research Center dropzone.
   - Text extraction fails silently on the backend, but rather than returning an honest error or failing gracefully, the backend catches the exception and returns the string `"[PDF Text Extraction Unavailable: pdfParse is not a function]"`.
   - This exact error string is saved into `research_documents.summary` and `research_documents.content_text`.
   - The UI displays this error as the document's executive summary on the card and in the Inspection modal.
   - When the user clicks "Bridge to Vault Note", this error message is injected directly into the newly generated note's body.

2. **Knowledge Vault Reading & Formatting Degradation (00:17 – 00:35):**
   - The newly bridged note displays the error string under `### Abstract`.
   - The Note list on the left sidebar is flooded with duplicate notes, orphan `"Untitled Note"` records, and unstructured titles.
   - Another research note (`Research: roblox vfx ai research`) shows collapsed, single-paragraph unformatted text where markdown headings (such as `### Main Question`) are rendered inline on the same line as body text without paragraph separation.
   - There is no distinction between a single giant raw markdown document and multiple modular knowledge atoms.

3. **Spatial Board Projection & Rendering Breakdown (00:36 – 01:05):**
   - The user opens a project Spatial Board and uses "+ Add Card" -> "Add Existing Vault Note".
   - The note selection dropdown reveals a severe data contamination issue: dozens of empty `"Untitled Note"` options, `"SS"`, `"s"`, and unassigned notes clutter the selector.
   - When the Vault note is projected onto the board, the card does NOT show a concise excerpt or note preview. Instead, it dumps the entire raw Markdown string (`# Title > quote ## Abstract ...`) into a tiny 11px text box with raw Markdown syntax characters (`#`, `>`).
   - The user has to drag the card resize handle across the entire canvas to attempt to read it, completely defeating the purpose of a spatial card projection.

4. **Knowledge Graph Clutter & Semantic Disconnect (01:06 – 01:21):**
   - The Knowledge Graph displays a massive constellation of orphan, disconnected green `"Untitled Note"` nodes floating around the outer rim of the graph.
   - Duplicate nodes exist for the same research document.
   - Mysterious nodes titled `"SS"` and `"s"` appear without context.
   - While the graph appearance modal and physics layout work, the underlying data represented in the graph is heavily contaminated and disconnected from the intended semantic architecture.

---

## 2. Chronological Issue Timeline

| # | Timestamp | Page / Component | User Action | Actual Behavior | Expected Behavior | Severity | Investigation Target | Verification Method |
|---|---|---|---|---|---|---|---|---|
| **VID-01** | **00:00 – 00:09** | **Research Center** (`#/research`) | Drag-and-drops PDF `The_Secrets_of_Earths_Oceans_Research_Report.pdf` (49.5 KB) into literature dropzone | Document card is created, but summary displays: `[PDF Text Extraction Unavailable: pdfParse is not a function]` | Text-based PDF should be parsed cleanly; title, abstract, and text extracted without errors | **CRITICAL** | `server/routes/research.js` line 56-62; `pdf-parse` v2 module export shape (`{ PDFParse }` class vs callable v1 function) | Upload test PDF and verify `content_text` and `summary` contain genuine extracted prose |
| **VID-02** | **00:10 – 00:16** | **Research Center** -> Inspect Modal | Clicks "Inspect" (eye icon) and reviews extracted text; clicks "Bridge to Vault Note" | Modal displays error string as the entire 61-character extracted text. Clicking "Bridge to Vault Note" persists this corrupt error string as note content | Inspect modal should show real extracted paragraphs; Bridge button should generate note from genuine extracted knowledge | **HIGH** | `server/routes/research.js` (`POST /:id/bridge-vault`), `public/js/pages/research.js` | Inspect bridged note in database and UI to verify authentic research content |
| **VID-03** | **00:17 – 00:26** | **Knowledge Vault** (`#/vault`) | Opens bridged note in Knowledge Vault editor | Note title is prefixed with `Research:` and body contains `# The Secrets of Earths Oceans Research Report > Source Document: ... ### Abstract [PDF Text Extraction Unavailable...]` | Clear document hierarchy with actual research content, metadata badges, and clean reading presentation | **HIGH** | `public/js/pages/vault.js`, `public/js/components/vaultEditor.js`, `server/models/Note.js` | Open bridged note in Vault, verify formatting in Edit and Read modes |
| **VID-04** | **00:27 – 00:35** | **Knowledge Vault** -> Note List & Reader | Switches Edit/Read tabs; clicks `Research: roblox vfx ai research` in note list | Markdown text is squashed: `### Main Question` is inlined without linebreaks; multiple duplicate notes and `Untitled Note` items populate the sidebar | Independent, well-formatted notes with distinct headings, paragraphs, and no phantom untitled notes | **HIGH** | `public/js/pages/vault.js` (Markdown renderer and note listing), `server/models/Note.js` (`create` / `findAll`) | Render multi-heading markdown document in Vault; verify clean paragraph and heading breaks |
| **VID-05** | **00:45 – 00:53** | **Spatial Board** (`#/boards/:id`) | Clicks "+ Add Card" -> "Add Existing Vault Note", opens selection modal | Modal dropdown shows dozens of `Untitled Note`, `SS`, `s`, and cross-project notes without filtering or project scoping | Dropdown should only show meaningful, titled notes relevant to the current project/workspace, excluding empty untitled drafts | **HIGH** | `public/js/pages/board.js` (`openProjectNotePicker`), `server/routes/notes.js` (`GET /api/v1/notes`) | Open picker on board; verify only relevant, valid project notes appear |
| **VID-06** | **00:54 – 01:05** | **Spatial Board** -> Card Canvas | Adds Vault Note projection to board; resizes card | The entire raw Markdown text with `#` and `>` syntax is dumped into the card body. Card requires massive resizing across the canvas to read | Projection card must display a clean title, note type badge, short readable excerpt (strip markdown / snippet), and "Open Note in Vault" action — NOT a raw markdown document dump | **CRITICAL** | `public/js/pages/board.js` (`renderCards`, lines 938-942 and `openProjectNotePicker` lines 1838-1848) | Project a long note onto Spatial Board; verify card shows concise excerpt and clear Vault link without giant raw text |
| **VID-07** | **01:06 – 01:21** | **Knowledge Graph** (`#/graph`) | Navigates to Knowledge Graph; clicks "Auto Arrange"; inspects nodes | Graph is littered with a swarm of disconnected, orphan `Untitled Note` nodes on the perimeter; duplicate research nodes; phantom `SS` and `s` nodes | Graph should represent genuine semantic connections (`entity_links`, project membership, wikilinks) without leaking empty orphan drafts or duplicates | **HIGH** | `server/routes/graph.js` (`GET /api/v1/graph`, lines 46-95), `notes.deleted_at IS NULL` missing, global unauthenticated `note_links` query | Open Graph with filtered project; verify zero orphan untitled notes, clean node labels, and correct edges |

---

## 3. Correlation with Real Codebase & Root Cause Analysis

### 3.1 PDF Extraction Failure (`VID-01`, `VID-02`)
- **Code Location:** `server/routes/research.js` lines 56–63:
  ```javascript
  const pdfParse = require('pdf-parse');
  const dataBuffer = fs.readFileSync(filePath);
  const data = await pdfParse(dataBuffer);
  return data.text || '';
  ```
- **Confirmed Root Cause:**
  `package.json` installs `"pdf-parse": "^2.4.5"`. In `pdf-parse` v2, the CommonJS export is NOT a callable function (`typeof p === 'object'`). It exports `{ PDFParse: class ... }`.
  Executing `pdfParse(dataBuffer)` throws `TypeError: pdfParse is not a function`.
  The error handler caught this and silently returned `"[PDF Text Extraction Unavailable: pdfParse is not a function]"` as the extracted text, corrupting the database and every downstream consumer (Research Center, Vault Note Bridge, Spatial Board, and Knowledge Graph).
- **Required Fix:** Update `extractTextFromPDF` to instantiate `new PDFParse({ data: dataBuffer })` (or filepath), call `await parser.getText()`, and extract `text.text`. Add fallback for legacy/v1 shapes if ever loaded.

### 3.2 Knowledge Vault Note Clutter & Untitled Spawns (`VID-04`, `VID-05`, `VID-07`)
- **Code Locations:**
  - `public/js/pages/vault.js` line 2771: Clicking "+ New Note" immediately fires `POST /api/v1/notes` with `{ title: 'Untitled Note', content: '' }`.
  - `server/routes/graph.js` lines 46–52: Queries `SELECT id, title, project_id, folder_id FROM notes WHERE user_id = ?` without checking `deleted_at IS NULL` and without filtering out abandoned empty notes.
  - `server/routes/graph.js` line 80: Queries `SELECT source_note_id, target_note_id FROM note_links` globally without filtering by `user_id` or active project!
  - `public/js/pages/board.js` line 1793: Calls `GET /notes` without passing `project_id`, displaying all notes across all projects, including empty untitled drafts.
- **Confirmed Root Cause:**
  Empty note drafts are created enthusiastically on the backend upon clicking "+ New Note". If the user never types in them, they remain forever in MySQL as `title = 'Untitled Note', content = ''`.
  Downstream components (Board picker, Graph) blindly select all notes including these abandoned empty records.

### 3.3 Spatial Board Raw Document Dump (`VID-06`)
- **Code Locations:**
  - `public/js/pages/board.js` lines 1838–1848: When creating a projection card, it posts `{ title: chosen.title, content: chosen.content || '' }` copying the ENTIRE canonical markdown body into the card item.
  - `public/js/pages/board.js` line 940: `renderCards` renders `item.content` directly inside `<div class="card-body">` with only `SmartLinkHandler.renderMarkdownLinks(item.content)`, which only replaces `[[wikilinks]]` and leaves raw markdown `#` headers, blockquotes, and unformatted text crammed into the card body.
- **Confirmed Root Cause:**
  Spatial Board is violating the core invariant defined in Section 6.1:
  *"A projection card should display: Note title, Short useful excerpt or summary, Note type, Optional source information, Clear action to open the original Vault note. Do not display the entire Markdown document inside the card."*
  Instead of rendering an excerpt/summary, it dumped the full raw markdown string and failed to render markdown properly.

### 3.4 Single Giant Markdown vs. Modular FKF Knowledge Structure
- **Context:**
  When research is imported via Research Center or bridged to Vault, it currently becomes one single monolithic note with unformatted text.
  NotebookLM produces research across multiple topics, citations, and relationships. Flowden lacks the structured interchange mechanism to accept an FKF declaration and construct:
  - Multiple distinct Knowledge Vault notes
  - Explicit folders
  - Structured research sources with URLs and metadata
  - Semantic relationships (`entity_links`)
  - Spatial Board groups, cards, and visual wires (`board_item_connections`)
  - Optional tasks

---

## 4. Architectural Impact on Subsequent Phases

1. **Phase 1 (FKF 2.0 Specification & Shared Parser):**
   Must define a single canonical schema supported by both `.fkf` (standalone single-file JSON/textual format) and `.flowden.zip` (full archive). Must support explicit notes, sources, semantic relationships, board groups, cards, and visual connections.
2. **Phase 2 (Real FKF End-to-End Proof of Concept):**
   Must build and import a real research package (8+ notes, 5+ sources, 8+ relationships, 3+ board groups, 6+ cards, 5+ wires, 1+ task) and prove that Vault, Board, and Graph reconstruct accurately.
3. **Phase 3 (Document Import Reliability):**
   Directly resolve the `pdfParse is not a function` bug using the correct `pdf-parse` v2 API, test PDF, DOCX, MD, and TXT, and ensure failed extractions never generate corrupted notes.
4. **Phase 4 (Knowledge Vault Experience):**
   Clean up note listing, prevent empty `Untitled Note` pollution, and ensure Markdown rendering in both Edit and Read modes provides clean typography and comfortable linebreaks.
5. **Phase 5 (Spatial Board & Knowledge Graph Integration):**
   Fix Spatial Board projection cards so they show clean excerpts/summaries, badges, and "Open in Vault" links rather than giant raw markdown dumps. Fix Knowledge Graph so it filters out deleted and empty orphan records and respects project scoping.

---
*Report generated and verified against `fix.mp4`.*

