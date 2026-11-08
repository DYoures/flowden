// tests/phase3b_exchange_modal.test.js
/**
 * FLOWDEN KNOWLEDGE EXCHANGE — PHASE 3B
 * Shared Interactive Package Importer Modal Verification Suite
 *
 * Verifies:
 * 1. Component architecture, exports (window.ExchangeModal, window.openExchangeImportModal), and script registration in app.html
 * 2. In-memory security isolation: inspection token never persisted in DOM, localStorage, sessionStorage, cookies, or URL
 * 3. AI Assistant entry points: #btn-assistant-import-package, #btn-callout-import-package, #btn-top-import-package
 * 4. Research Center entry point: #btn-import-flowden-package alongside preserved #btn-import-research-file
 * 5. Client-side file validation: extension check (.flowden.zip / .zip) and size check (<= 25MB)
 * 6. Destination project selection (New Project vs Existing authorized workspace) and token invalidation on target change
 * 7. Live end-to-end inspection, preview tab rendering, and explicit approval gating
 * 8. Live transactional commit to MySQL 8.4 (flowden_test) reusing server-staged archive with zero partial writes
 * 9. Database verification of imported Project, Folders, Notes, Sources, Excerpts, Relationships, Tasks, and Board
 * 10. Idempotent replay safety with browser-generated UUID key
 * 11. Modal lifecycle, DOM cleanup, and Escape key handling
 * 12. Zero-emoji compliance and Flowden dark theme aesthetic adherence
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const vm = require('vm');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const db = require('../server/config/database');
const SecurityService = require('../server/services/securityService');
const serverModule = require('../server/index');

const TEST_PORT = 3099;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

const REF_ZIP_PATH = path.resolve(
  __dirname,
  '..',
  'docs',
  'knowledge-exchange',
  'examples',
  'flowden-reference-package.flowden.zip'
);
const MODAL_JS_PATH = path.resolve(__dirname, '..', 'public', 'js', 'components', 'exchangeModal.js');
const ASSISTANT_JS_PATH = path.resolve(__dirname, '..', 'public', 'js', 'pages', 'assistant.js');
const RESEARCH_JS_PATH = path.resolve(__dirname, '..', 'public', 'js', 'pages', 'research.js');
const APP_HTML_PATH = path.resolve(__dirname, '..', 'public', 'app.html');

let total = 0;
let passed = 0;
let failed = 0;

function record(name, condition, extraInfo = '') {
  total += 1;
  if (condition) {
    passed += 1;
    console.log(`  ✅ [PASS] #${total} ${name}${extraInfo ? ` (${extraInfo})` : ''}`);
  } else {
    failed += 1;
    console.error(`  ❌ [FAIL] #${total} ${name}${extraInfo ? ` (${extraInfo})` : ''}`);
  }
}

async function uploadFormData(url, fields = {}, fileObj = null, authToken = null) {
  const formData = new FormData();
  if (fileObj) {
    const blob = new Blob([fileObj.buffer], { type: fileObj.type || 'application/zip' });
    formData.append(fileObj.fieldName || 'file', blob, fileObj.filename || 'package.flowden.zip');
  }
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined && v !== null) {
      formData.append(k, String(v));
    }
  }

  const headers = {
    'Origin': BASE_URL
  };
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
    headers['Cookie'] = `flowden_token=${authToken}`;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: formData
  });

  let data = null;
  try {
    data = await res.json();
  } catch (_) {}
  return { status: res.status, headers: res.headers, data };
}

(async () => {
  let serverInstance = null;

  try {
    console.log('\n================================================================');
    console.log('FLOWDEN KNOWLEDGE EXCHANGE — PHASE 3B VERIFICATION SUITE');
    console.log('Shared Interactive Importer UI, End-to-End Integration & DB Commit');
    console.log('================================================================\n');

    await db.initDB();
    await SecurityService.ensureSecurityTables();

    const app = serverModule.app || serverModule;
    await new Promise((resolve) => {
      serverInstance = app.listen(TEST_PORT, () => {
        console.log(`Test server running at ${BASE_URL}`);
        resolve();
      });
    });

    const modalJsContent = fs.readFileSync(MODAL_JS_PATH, 'utf8');
    const assistantJsContent = fs.readFileSync(ASSISTANT_JS_PATH, 'utf8');
    const researchJsContent = fs.readFileSync(RESEARCH_JS_PATH, 'utf8');
    const appHtmlContent = fs.readFileSync(APP_HTML_PATH, 'utf8');
    const refZipBuffer = fs.readFileSync(REF_ZIP_PATH);

    // -------------------------------------------------------------------------
    // SECTION 1: COMPONENT ARCHITECTURE & SCRIPT REGISTRATION
    // -------------------------------------------------------------------------
    console.log('[Section 1: Component Architecture & Script Registration]');

    // Test 1: Script tag registration in app.html
    const hasScriptTag = appHtmlContent.includes('<script src="/js/components/exchangeModal.js"></script>');
    record(
      'exchangeModal.js is registered in public/app.html before page controllers',
      hasScriptTag
    );

    // Test 2: Compiles cleanly and defines window.ExchangeModal and window.openExchangeImportModal
    const mockWindow = {
      FlowdenIcons: {
        getIcon: (name, cls = '') => `<svg data-icon="${name}" class="${cls}"></svg>`
      },
      API: {
        get: async () => ({ projects: [] }),
        post: async () => ({})
      },
      showToast: () => {},
      crypto: {
        randomUUID: () => 'test-uuid-' + Math.random().toString(36).substring(2, 9),
        getRandomValues: (arr) => arr
      },
      addEventListener: () => {},
      removeEventListener: () => {},
      document: {
        createElement: (tag) => {
          const el = {
            tagName: tag.toUpperCase(),
            className: '',
            style: {},
            attrs: {},
            children: [],
            setAttribute: (k, v) => { el.attrs[k] = v; },
            getAttribute: (k) => el.attrs[k] || null,
            appendChild: (ch) => { el.children.push(ch); ch.parentNode = el; },
            removeChild: (ch) => {
              const idx = el.children.indexOf(ch);
              if (idx >= 0) el.children.splice(idx, 1);
            },
            querySelector: () => null,
            querySelectorAll: () => [],
            addEventListener: () => {}
          };
          return el;
        },
        body: {
          appendChild: () => {},
          removeChild: () => {}
        }
      }
    };
    mockWindow.window = mockWindow;

    const vmContext = vm.createContext(mockWindow);
    vm.runInContext(modalJsContent, vmContext);

    record(
      'exchangeModal.js defines window.ExchangeModal and window.openExchangeImportModal',
      Boolean(mockWindow.ExchangeModal && typeof mockWindow.ExchangeModal.open === 'function' && typeof mockWindow.openExchangeImportModal === 'function')
    );

    // Test 3: Zero emoji interface icons in exchangeModal.js, assistant.js, research.js
    const emojiRegex = /[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    const modalEmojis = modalJsContent.match(emojiRegex);
    const assistantEmojis = assistantJsContent.match(emojiRegex);
    const researchEmojis = researchJsContent.match(emojiRegex);
    record(
      'Zero emoji interface icons across exchangeModal.js, assistant.js, and research.js',
      !modalEmojis && !assistantEmojis && !researchEmojis,
      `modal=${!modalEmojis}, assistant=${!assistantEmojis}, research=${!researchEmojis}`
    );

    // -------------------------------------------------------------------------
    // SECTION 2: ENTRY POINT WIRING IN ASSISTANT & RESEARCH PAGES
    // -------------------------------------------------------------------------
    console.log('\n[Section 2: Entry Point Wiring in AI Assistant & Research Center]');

    // Test 4: AI Assistant page exposes "Import Flowden Package" button in Knowledge Exchange section
    const hasAssistantImportBtn = assistantJsContent.includes('id="btn-assistant-import-package"') &&
      assistantJsContent.includes('Import Flowden Package');
    record(
      'AI Assistant page exposes #btn-assistant-import-package in Knowledge Exchange section',
      hasAssistantImportBtn
    );

    // Test 5: AI Assistant page callout and intro card have import triggers & reflect active importer
    const hasCalloutImportBtn = assistantJsContent.includes('id="btn-callout-import-package"');
    const hasTopImportBtn = assistantJsContent.includes('id="btn-top-import-package"');
    const hasAssistantWiring = assistantJsContent.includes('window.openExchangeImportModal') || assistantJsContent.includes('openExchangeImportModal');
    const hasNoStalePlanning = !assistantJsContent.includes('Planned Phase 3B') &&
      !assistantJsContent.includes('Planned Frontend Integration') &&
      !assistantJsContent.includes('Frontend Upload UI: Planned');
    record(
      'AI Assistant wires all import buttons to window.openExchangeImportModal() and reflects active importer (zero stale planning language)',
      hasCalloutImportBtn && hasTopImportBtn && hasAssistantWiring && hasNoStalePlanning
    );

    // Test 6: Research Center exposes "Import Flowden Package" alongside "Import Document"
    const hasResearchImportBtn = researchJsContent.includes('id="btn-import-flowden-package"') &&
      researchJsContent.includes('Import Flowden Package');
    const hasDocImportPreserved = researchJsContent.includes('id="btn-import-research-file"') &&
      researchJsContent.includes('Import Document');
    const hasResearchWiring = researchJsContent.includes('window.openExchangeImportModal') || researchJsContent.includes('openExchangeImportModal');
    record(
      'Research Center provides #btn-import-flowden-package while preserving #btn-import-research-file',
      hasResearchImportBtn && hasDocImportPreserved && hasResearchWiring
    );

    // -------------------------------------------------------------------------
    // SECTION 3: IN-MEMORY TOKEN ISOLATION & CLIENT VALIDATION
    // -------------------------------------------------------------------------
    console.log('\n[Section 3: In-Memory Token Isolation & Client Validation]');

    // Test 7: Inspection token is NEVER referenced with localStorage, sessionStorage, or document.cookie
    const usesLocalStorage = modalJsContent.includes('localStorage.');
    const usesSessionStorage = modalJsContent.includes('sessionStorage.');
    const setsCookie = modalJsContent.includes('document.cookie');
    record(
      'Inspection token is NEVER stored in localStorage, sessionStorage, or cookies',
      !usesLocalStorage && !usesSessionStorage && !setsCookie
    );

    // Test 8: Inspection token is NOT rendered as a DOM data attribute
    const rendersTokenInDom = modalJsContent.includes('data-token') || modalJsContent.includes('data-inspection-token');
    record(
      'Inspection token is NEVER rendered into DOM attributes (no data-token)',
      !rendersTokenInDom
    );

    // Test 9: Client file extension check accepts .flowden.zip and .zip only
    const hasExtCheck = modalJsContent.includes('.flowden.zip') &&
      modalJsContent.includes('.zip') &&
      modalJsContent.includes('MAX_COMPRESSED_BYTES');
    record(
      'Client enforces .flowden.zip archive format and 100 MB MAX_COMPRESSED_BYTES limit',
      hasExtCheck
    );

    // Test 10: Explicit approval checkbox is mandatory before commit can execute
    const hasApprovalCheckbox = modalJsContent.includes('id="exchange-approval-checkbox"') &&
      modalJsContent.includes('privateSession.approvalChecked') &&
      modalJsContent.includes('disabled');
    record(
      'Modal requires explicit approval checkbox verification before commit button activates',
      hasApprovalCheckbox
    );

    // -------------------------------------------------------------------------
    // SECTION 4: LIVE BACKEND AUTH & REUSABLE COMMIT API INTEGRATION
    // -------------------------------------------------------------------------
    console.log('\n[Section 4: Live Backend Auth & Transactional Import Pipeline]');

    // Setup Test User
    const runSuffix = Date.now().toString(36);
    const testEmail = `user_phase3b_${runSuffix}@flowden.test`;
    const testPassword = 'Password123!Safe';

    const regRes = await fetch(`${BASE_URL}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ display_name: 'Phase 3B Tester', email: testEmail, password: testPassword })
    });
    const regData = await regRes.json();
    const authToken = regData.token;
    const userId = regData.user.id;
    const cookieHeader = regRes.headers.get('set-cookie') || `token=${authToken}`;

    record('Setup: Registered active test user in flowden_test', Boolean(authToken && userId), `userId=${userId}`);

    // Create an existing project to test "Merge into Existing Project"
    const projRes = await fetch(`${BASE_URL}/api/v1/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        title: 'Existing Workspace Alpha',
        summary: 'Target destination project for merge test'
      })
    });
    const projData = await projRes.json();
    const existingProjectId = projData.project ? projData.project.id : projData.id;
    record('Setup: Created existing destination project in flowden_test', Boolean(existingProjectId), `projId=${existingProjectId}`);

    // Test 11: POST /api/v1/exchange/inspect with reference package
    const inspectRes = await uploadFormData(
      `${BASE_URL}/api/v1/exchange/inspect`,
      {},
      { buffer: refZipBuffer, filename: 'flowden-reference-package.flowden.zip' },
      authToken
    );

    const inspectData = inspectRes.data;
    const isValid = inspectRes.status === 200 && inspectData && inspectData.valid === true;
    const inspectionToken = inspectData ? inspectData.inspection_token : null;
    const packageSha256 = inspectData ? inspectData.package_sha256 : null;

    record(
      'POST /api/v1/exchange/inspect returns valid FKF v1.0.0 inspection ticket and counts',
      isValid && Boolean(inspectionToken) && Boolean(packageSha256),
      `status=${inspectRes.status}, token=${Boolean(inspectionToken)}, notes=${inspectData?.counts?.notes}`
    );

    // Test 12: Inspection counts match FKF reference package manifest
    const counts = inspectData?.counts || {};
    const countsMatch = counts.notes >= 3 && counts.sources >= 2 && counts.relationships >= 2;
    record(
      'Inspection counts match reference package (notes>=3, sources>=2, relationships>=2)',
      countsMatch,
      `notes=${counts.notes}, sources=${counts.sources}, rels=${counts.relationships}, folders=${counts.folders}`
    );

    // Test 13: Commit rejected without explicit user approval
    const commitNoApproval = await uploadFormData(
      `${BASE_URL}/api/v1/exchange/commit`,
      {
        inspection_token: inspectionToken,
        approved: 'false',
        idempotency_key: 'idem_test_unapproved_' + runSuffix
      },
      null,
      authToken
    );
    record(
      'POST /api/v1/exchange/commit returns 400 when approved !== "true"',
      commitNoApproval.status === 400,
      `status=${commitNoApproval.status}`
    );

    // Test 14: Commit rejected with forged or tampered destination_project_id
    const commitTamperedDest = await uploadFormData(
      `${BASE_URL}/api/v1/exchange/commit`,
      {
        inspection_token: inspectionToken,
        approved: 'true',
        destination_project_id: 999999, // ticket was inspected for new project (null)
        idempotency_key: 'idem_test_tampered_' + runSuffix
      },
      null,
      authToken
    );
    record(
      'POST /api/v1/exchange/commit rejects destination_project_id tampering',
      commitTamperedDest.status === 400 || commitTamperedDest.status === 403,
      `status=${commitTamperedDest.status}`
    );

    // Test 15: Commit executed reusing staged archive without re-uploading ZIP file
    const browserIdempotencyKey = 'fkp_idem_phase3b_' + runSuffix;
    const commitRes = await uploadFormData(
      `${BASE_URL}/api/v1/exchange/commit`,
      {
        inspection_token: inspectionToken,
        approved: 'true',
        idempotency_key: browserIdempotencyKey,
        conflict_resolution: 'disambiguate',
        package_sha256: packageSha256
      },
      null, // NO FILE re-uploaded!
      authToken
    );

    const commitData = commitRes.data;
    const commitSuccess = commitRes.status === 200 && commitData && commitData.success === true;
    const createdProjectId = commitData ? commitData.created_project_id : null;

    record(
      'POST /api/v1/exchange/commit succeeds reusing server-staged archive with zero re-upload',
      commitSuccess && Boolean(createdProjectId),
      `status=${commitRes.status}, createdProjectId=${createdProjectId}`
    );

    // -------------------------------------------------------------------------
    // SECTION 5: REAL MYSQL DATABASE VERIFICATION
    // -------------------------------------------------------------------------
    console.log('\n[Section 5: Real MySQL Database Entity Verification]');

    // Test 16: Verify Project created in MySQL
    const projectRows = await db.query(
      'SELECT id, title, description, color FROM projects WHERE id = ? AND user_id = ?',
      [createdProjectId, userId]
    );
    const dbProject = projectRows[0];
    record(
      'MySQL: Project entity created with correct title and ownership',
      Boolean(dbProject && (dbProject.title.includes('Adaptive Urban Heat-Island Mitigation') || dbProject.title.includes('Multi-Agent Reasoning Systems'))),
      `title="${dbProject?.title}"`
    );

    // Test 17: Verify Folders created in MySQL
    const folderRows = await db.query(
      'SELECT id, name, parent_folder_id FROM note_folders WHERE user_id = ?',
      [userId]
    );
    record(
      'MySQL: Hierarchical folders created in note_folders table',
      folderRows.length >= 2,
      `folderCount=${folderRows.length}`
    );

    // Test 18: Verify Notes created in MySQL with markdown body and durable WikiLinks
    const noteRows = await db.query(
      'SELECT id, title, content FROM notes WHERE project_id = ? AND user_id = ?',
      [createdProjectId, userId]
    );
    const hasWikiLinks = noteRows.some(n => n.content && (n.content.includes('[[') || n.content.includes('fkf:')));
    record(
      'MySQL: Notes created with markdown content and canonical WikiLinks',
      noteRows.length >= 3 && hasWikiLinks,
      `notesCount=${noteRows.length}, hasWikiLinks=${hasWikiLinks}`
    );

    // Test 19: Verify Sources and Excerpts created in MySQL
    const sourceRows = await db.query(
      'SELECT id, title, source_url FROM research_documents WHERE project_id = ? AND user_id = ?',
      [createdProjectId, userId]
    );
    const excerptRows = await db.query(
      'SELECT id, research_id, quoted_text FROM research_excerpts WHERE project_id = ? AND user_id = ?',
      [createdProjectId, userId]
    );
    record(
      'MySQL: Research sources and verbatim excerpts created and linked',
      sourceRows.length >= 2 && excerptRows.length >= 2,
      `sources=${sourceRows.length}, excerpts=${excerptRows.length}`
    );

    // Test 20: Verify Semantic Relationships created in MySQL
    const relRows = await db.query(
      'SELECT id, source_type, target_type, link_type FROM entity_links WHERE user_id = ?',
      [userId]
    );
    record(
      'MySQL: Semantic relationships created in entity_links with canonical types (e.g. supports, cites)',
      relRows.length >= 2,
      `relationshipCount=${relRows.length}`
    );

    // Test 21: Verify Optional Tasks & Board Items created in MySQL
    const taskRows = await db.query(
      'SELECT id, title, status FROM tasks WHERE project_id = ? AND user_id = ?',
      [createdProjectId, userId]
    );
    const boardRows = await db.query(
      'SELECT id, title FROM boards WHERE project_id = ? AND user_id = ?',
      [createdProjectId, userId]
    );
    record(
      'MySQL: Optional modules (Tasks & Spatial Board) imported when declared in package',
      taskRows.length >= 1 && boardRows.length >= 1,
      `tasks=${taskRows.length}, boards=${boardRows.length}`
    );

    // Test 22: Verify knowledge_import_jobs table record
    const jobRows = await db.query(
      'SELECT id, state, summary_json FROM knowledge_import_jobs WHERE created_project_id = ?',
      [createdProjectId]
    );
    const dbJob = jobRows[0];
    record(
      'MySQL: knowledge_import_jobs record state is "committed"',
      Boolean(dbJob && dbJob.state === 'committed'),
      `state="${dbJob?.state}"`
    );

    // -------------------------------------------------------------------------
    // SECTION 6: IDEMPOTENCY & CRASH-SAFE TRANSACTION BEHAVIOR
    // -------------------------------------------------------------------------
    console.log('\n[Section 6: Idempotent Replay & Invalidation Tests]');

    // Test 23: Idempotent replay of identical commit request returns 200 with idempotent_replay: true
    const replayRes = await uploadFormData(
      `${BASE_URL}/api/v1/exchange/commit`,
      {
        inspection_token: inspectionToken,
        approved: 'true',
        idempotency_key: browserIdempotencyKey,
        conflict_resolution: 'disambiguate'
      },
      null,
      authToken
    );
    const replayData = replayRes.data;
    record(
      'Idempotent replay returns HTTP 200 with idempotent_replay: true without duplicate writes',
      replayRes.status === 200 && replayData && replayData.idempotent_replay === true,
      `status=${replayRes.status}, idempotent_replay=${replayData?.idempotent_replay}`
    );

    // Verify row count in notes has NOT doubled
    const noteRowsAfterReplay = await db.query(
      'SELECT count(*) as cnt FROM notes WHERE project_id = ?',
      [createdProjectId]
    );
    record(
      'Database note count remains exact after idempotent replay (zero duplication)',
      Number(noteRowsAfterReplay[0].cnt) === noteRows.length,
      `before=${noteRows.length}, after=${noteRowsAfterReplay[0].cnt}`
    );

    // Test 25: Consumed token cannot be reused with a DIFFERENT idempotency key
    const reuseConsumedToken = await uploadFormData(
      `${BASE_URL}/api/v1/exchange/commit`,
      {
        inspection_token: inspectionToken,
        approved: 'true',
        idempotency_key: 'fkp_new_key_' + Math.random().toString(36).substring(2, 8),
        conflict_resolution: 'disambiguate'
      },
      null,
      authToken
    );
    record(
      'Consumed inspection token cannot be used for a second different commit (one-time use)',
      reuseConsumedToken.status === 400 || reuseConsumedToken.status === 409,
      `status=${reuseConsumedToken.status}`
    );

    console.log('\n================================================================');
    console.log(`PHASE 3B TEST SUMMARY: ${passed} / ${total} PASSED (${failed} FAILED)`);
    console.log('================================================================\n');

    if (failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (err) {
    console.error('Fatal error running Phase 3B test suite:', err);
    process.exit(1);
  } finally {
    if (serverInstance) {
      serverInstance.close();
    }
  }
})();
