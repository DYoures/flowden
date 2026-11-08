// tests/phase3a_assistant_ui.test.js
/**
 * FLOWDEN KNOWLEDGE EXCHANGE — PHASE 3A
 * AI Assistant Knowledge Exchange Interface & Documentation Verification Suite
 *
 * Verifies:
 * 1. Allowlisted static resource download endpoints (200 OK, exact byte match, MIME types, security headers)
 * 2. Path traversal rejection & 404 behavior for non-allowlisted resource requests
 * 3. Frontend structure, sticky anchor navigation, dual introductory cards
 * 4. 100% preservation of MCP tools catalog, configuration form, and 7 security/privacy subsections
 * 5. Complete presence of all 8 Knowledge Exchange documentation subsections & download triggers
 * 6. Zero-emoji compliance and responsive design token adherence
 * 7. In-memory DOM execution test of renderAssistantPage()
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const db = require('../server/config/database');
const serverModule = require('../server/index');

const TEST_PORT = 3038;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

const SPEC_PATH = path.resolve(__dirname, '..', 'docs', 'knowledge-exchange', 'FLOWDEN_RESEARCH_SPEC.md');
const SCHEMA_PATH = path.resolve(__dirname, '..', 'docs', 'knowledge-exchange', 'flowden-package.schema.json');
const REF_ZIP_PATH = path.resolve(__dirname, '..', 'docs', 'knowledge-exchange', 'examples', 'flowden-reference-package.flowden.zip');
const ASSISTANT_JS_PATH = path.resolve(__dirname, '..', 'public', 'js', 'pages', 'assistant.js');

let total = 0;
let passed = 0;
let failed = 0;

function record(name, condition, extraInfo) {
  total += 1;
  if (condition) {
    passed += 1;
    console.log(`  ✅ [PASS] #${total} ${name}${extraInfo ? ` (${extraInfo})` : ''}`);
  } else {
    failed += 1;
    console.error(`  ❌ [FAIL] #${total} ${name}${extraInfo ? ` (${extraInfo})` : ''}`);
  }
}

function fetchHttp(urlStr, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const req = http.request(url, options, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve({
          status: res.statusCode,
          headers: res.headers,
          buffer,
          text: buffer.toString('utf8')
        });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

(async () => {
  let serverInstance = null;

  try {
    console.log('\n================================================================');
    console.log('FLOWDEN KNOWLEDGE EXCHANGE — PHASE 3A VERIFICATION SUITE');
    console.log('================================================================');

    await db.initDB();
    const app = serverModule.app || serverModule;
    await new Promise((resolve) => {
      serverInstance = app.listen(TEST_PORT, () => {
        console.log(`Test server running at ${BASE_URL}`);
        resolve();
      });
    });

    // -------------------------------------------------------------------------
    // SECTION 1: ALLOWLISTED STATIC RESOURCE DOWNLOADS
    // -------------------------------------------------------------------------
    console.log('\n[Section 1: Fixed Allowlisted Static Resource Endpoints]');

    const expectedSpecBuf = fs.readFileSync(SPEC_PATH);
    const expectedSchemaBuf = fs.readFileSync(SCHEMA_PATH);
    const expectedRefZipBuf = fs.readFileSync(REF_ZIP_PATH);

    // Test 1: GET research-spec
    const resSpec = await fetchHttp(`${BASE_URL}/api/v1/exchange/resources/research-spec`);
    record(
      'Download FLOWDEN_RESEARCH_SPEC.md returns HTTP 200 with exact byte match',
      resSpec.status === 200 &&
        resSpec.buffer.equals(expectedSpecBuf) &&
        resSpec.headers['content-type'].includes('text/markdown') &&
        resSpec.headers['content-disposition'].includes('FLOWDEN_RESEARCH_SPEC.md') &&
        resSpec.headers['x-content-type-options'] === 'nosniff',
      `size=${resSpec.buffer.length} bytes, ct=${resSpec.headers['content-type']}`
    );

    // Test 2: GET package-schema
    const resSchema = await fetchHttp(`${BASE_URL}/api/v1/exchange/resources/package-schema`);
    record(
      'Download flowden-package.schema.json returns HTTP 200 with exact byte match',
      resSchema.status === 200 &&
        resSchema.buffer.equals(expectedSchemaBuf) &&
        resSchema.headers['content-type'].includes('application/schema+json') &&
        resSchema.headers['content-disposition'].includes('flowden-package.schema.json'),
      `size=${resSchema.buffer.length} bytes, ct=${resSchema.headers['content-type']}`
    );

    // Test 3: GET reference-package
    const resRef = await fetchHttp(`${BASE_URL}/api/v1/exchange/resources/reference-package`);
    record(
      'Download flowden-reference-package.flowden.zip returns HTTP 200 with exact byte match',
      resRef.status === 200 &&
        resRef.buffer.equals(expectedRefZipBuf) &&
        resRef.headers['content-type'].includes('application/zip') &&
        resRef.headers['content-disposition'].includes('flowden-reference-package.flowden.zip'),
      `size=${resRef.buffer.length} bytes, ct=${resRef.headers['content-type']}`
    );

    // Test 4: Resource endpoints require no Bearer authentication (accessible by standard browser download links)
    const unauthCheck = await fetchHttp(`${BASE_URL}/api/v1/exchange/resources/research-spec`);
    record(
      'Resource download endpoints work without Bearer header (clean browser <a> download)',
      unauthCheck.status === 200,
      `status=${unauthCheck.status}`
    );

    // Test 5: Unknown resource key returns 404
    const resUnknown = await fetchHttp(`${BASE_URL}/api/v1/exchange/resources/non-existent-artifact`);
    record(
      'Non-allowlisted resource key returns HTTP 404 Not Found',
      resUnknown.status === 404,
      `status=${resUnknown.status}`
    );

    // Test 6: Path traversal attempt is safely rejected
    const resTraversal = await fetchHttp(`${BASE_URL}/api/v1/exchange/resources/..%2F..%2Fpackage.json`);
    record(
      'Path traversal attempt via resourceKey returns HTTP 404 (strictly blocked)',
      resTraversal.status === 404,
      `status=${resTraversal.status}`
    );

    // -------------------------------------------------------------------------
    // SECTION 2: FRONTEND ASSISTANT.JS ARCHITECTURAL INSPECTION
    // -------------------------------------------------------------------------
    console.log('\n[Section 2: Frontend Assistant Page Architectural Inspection]');

    const assistantJsContent = fs.readFileSync(ASSISTANT_JS_PATH, 'utf8');

    // Test 7: Sticky anchor navigation bar contains required anchor targets
    const hasStickyNav = assistantJsContent.includes('id="assistant-sticky-nav"') &&
      assistantJsContent.includes('href="#ai-overview"') &&
      assistantJsContent.includes('href="#mcp-integration"') &&
      assistantJsContent.includes('href="#knowledge-exchange"');
    record(
      'Sticky anchor navigation bar implemented with #ai-overview, #mcp-integration, #knowledge-exchange',
      hasStickyNav
    );

    // Test 8: Dual feature introduction cards at top of overview
    const hasDualCards = assistantJsContent.includes('MCP Integration') &&
      assistantJsContent.includes('Live Contextual Bridge') &&
      assistantJsContent.includes('Knowledge Exchange') &&
      assistantJsContent.includes('FKF v1.0.0 Standard');
    record(
      'Dual introductory cards present side-by-side for MCP Integration & Knowledge Exchange',
      hasDualCards
    );

    // Test 9: MCP tool catalog preserved with 6 core tools
    const mcpTools = [
      'read_project_context',
      'search_vault_knowledge',
      'get_research_sources',
      'get_workflow_tasks',
      'get_knowledge_connections',
      'create_vault_note'
    ];
    const hasAllMcpTools = mcpTools.every(tool => assistantJsContent.includes(tool));
    record(
      'MCP Standard Primitives Catalog preserved with all 6 tools',
      hasAllMcpTools,
      `tools=${mcpTools.length}`
    );

    // Test 10: MCP Configuration Form and IDs preserved
    const mcpFormIds = [
      'security-commitments-section',
      'form-mcp-config',
      'mcp-server-url',
      'mcp-api-key',
      'mcp-scope-select',
      'btn-generate-mcp-key',
      'btn-save-mcp-settings',
      'btn-test-mcp-connection',
      'mcp-test-results'
    ];
    const hasAllMcpFormIds = mcpFormIds.every(id => assistantJsContent.includes(`id="${id}"`));
    record(
      'MCP Configuration form, inputs, and action buttons 100% preserved',
      hasAllMcpFormIds
    );

    // Test 11: All 7 Security, Privacy & Responsible AI Subsections preserved
    const secSubsections = [
      '1. Workspace Access Protection',
      '2. MCP Permission Boundaries',
      '3. Data & Secret Protection',
      '4. Secure File Handling',
      '5. AI & Prompt Injection Protection',
      '6. Responsible Use Policy',
      '7. Security Monitoring & Accountability'
    ];
    const hasAllSecSubsections = secSubsections.every(sub => assistantJsContent.includes(sub));
    record(
      'All 7 Security, Privacy & Responsible AI subsections preserved with exact headings',
      hasAllSecSubsections,
      `count=${secSubsections.length}`
    );

    // Test 12: Knowledge Exchange 8 required subsections
    const keSubsections = [
      '1. Transforming External AI Research into Connected Knowledge',
      '2. Why Structured Research?',
      '3. How It Works',
      '4. Downloadable Specification & Reference Assets',
      '5. Flowden Knowledge Format (FKF v1.0.0) Architecture',
      '6. Safe Pre-Inspection & Transactional Commit Pipeline',
      '7. Optional Modules & Advanced Projections',
      '8. LLM Compatibility, Limitations & FAQ'
    ];
    const hasAllKeSubsections = keSubsections.every(title => assistantJsContent.includes(title));
    record(
      'All 8 required Knowledge Exchange documentation subsections present',
      hasAllKeSubsections,
      `count=${keSubsections.length}`
    );

    // Test 13: Implemented backend and interactive frontend importer status clearly labeled (no outdated planning wording)
    const hasAccurateStatus = assistantJsContent.includes('Backend Importer: Implemented') &&
      assistantJsContent.includes('Frontend Importer: Implemented & Available') &&
      assistantJsContent.includes('Interactive Frontend Importer');
    const hasNoOutdatedPlanning = !assistantJsContent.includes('Planned Phase 3B') &&
      !assistantJsContent.includes('Planned Frontend Integration') &&
      !assistantJsContent.includes('Frontend Upload UI: Planned') &&
      !assistantJsContent.includes('Phase 3A Available');
    record(
      'Accurate status: Backend Importer Implemented, Frontend Importer Implemented & Available (zero stale planning language)',
      hasAccurateStatus && hasNoOutdatedPlanning,
      `accurate=${hasAccurateStatus}, noOutdated=${hasNoOutdatedPlanning}`
    );

    // Test 14: All 3 downloadable resources referenced with download buttons
    const hasSpecDownload = assistantJsContent.includes('data-resource="research-spec"') && assistantJsContent.includes('FLOWDEN_RESEARCH_SPEC.md');
    const hasSchemaDownload = assistantJsContent.includes('data-resource="package-schema"') && assistantJsContent.includes('flowden-package.schema.json');
    const hasRefZipDownload = assistantJsContent.includes('data-resource="reference-package"') && assistantJsContent.includes('flowden-reference-package.flowden.zip');
    record(
      'All 3 downloadable resources have direct download triggers in UI',
      hasSpecDownload && hasSchemaDownload && hasRefZipDownload
    );

    // Test 15: Zero emoji icons in UI markup
    // Emoji ranges regex: \p{Extended_Pictographic}
    const emojiRegex = /[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    const emojiMatches = assistantJsContent.match(emojiRegex);
    record(
      'Zero emoji interface icons used (Lucide-style SVG icons only)',
      !emojiMatches,
      emojiMatches ? `found: ${emojiMatches[0]}` : 'clean'
    );

    // Test 16: Check responsive and layout styling classes
    const hasResponsiveContainer = assistantJsContent.includes('assistant-page-container') &&
      assistantJsContent.includes('max-width: 1040px') &&
      assistantJsContent.includes('grid-template-columns: repeat(auto-fit');
    record(
      'Responsive design tokens, grid auto-fit, and max-width layout constraints applied',
      hasResponsiveContainer
    );

    // Test 17: Phase 3A.1 FKF v1.0.0 specification contract consistency check
    const hasFoldersRoot = assistantJsContent.includes('folders.json') && !assistantJsContent.includes('project/folders.json');
    const hasSourcesIndex = assistantJsContent.includes('sources/index.json') && !assistantJsContent.includes('sources.json');
    const hasRelationshipsLinks = assistantJsContent.includes('relationships/links.json') && !assistantJsContent.includes('connections.json');
    const hasOptionalTasks = assistantJsContent.includes('optional/tasks.json');
    const hasOptionalSpatialBoard = assistantJsContent.includes('optional/spatial-board.json');
    const hasExportsReport = assistantJsContent.includes('exports/research-report.pdf') && !assistantJsContent.includes('companion-report.pdf');
    const hasFkfVersion = assistantJsContent.includes('fkf_version: "1.0.0"') && !assistantJsContent.includes('package_version: "1.0.0"');
    const hasFkfWikiLink = assistantJsContent.includes('[[fkf:&lt;note-id&gt;|Display Title]]') || assistantJsContent.includes('[[fkf:<note-id>|Display Title]]');

    const contractConsistent = hasFoldersRoot &&
      hasSourcesIndex &&
      hasRelationshipsLinks &&
      hasOptionalTasks &&
      hasOptionalSpatialBoard &&
      hasExportsReport &&
      hasFkfVersion &&
      hasFkfWikiLink;

    record(
      'FKF v1.0.0 Contract: folders.json, sources/index.json, relationships/links.json, optional/tasks.json, optional/spatial-board.json, exports/research-report.pdf & fkf_version match canonical schema',
      contractConsistent,
      `foldersRoot=${hasFoldersRoot}, sourcesIndex=${hasSourcesIndex}, relLinks=${hasRelationshipsLinks}, optTasks=${hasOptionalTasks}, optBoard=${hasOptionalSpatialBoard}, reportPdf=${hasExportsReport}, fkfVer=${hasFkfVersion}, wikiLink=${hasFkfWikiLink}`
    );

    // -------------------------------------------------------------------------
    // SECTION 3: IN-MEMORY DOM EXECUTION TEST
    // -------------------------------------------------------------------------
    console.log('\n[Section 3: Simulated DOM Execution Test]');

    // Create a mock browser DOM environment
    const mockElements = {};
    const mockContainer = {
      innerHTML: '',
      querySelectorAll: (sel) => {
        // Simple mock returning empty array or elements
        return [];
      }
    };

    // Evaluate assistant.js in sandbox
    const vm = require('vm');
    const mockWindow = {
      FlowdenIcons: {
        getIcon: (name) => `<svg data-icon="${name}"></svg>`
      },
      Auth: {
        getUser: () => ({ id: 1, email: 'test@flowden.local', settings_json: '{}' })
      },
      API: {
        get: async (url) => {
          if (url.includes('/users/me')) return { user: { id: 1, email: 'test@flowden.local' } };
          if (url.includes('/projects')) return { projects: [{ id: 10, title: 'Test Project' }] };
          if (url.includes('/security-events')) return { events: [] };
          return {};
        },
        post: async () => ({}),
        put: async () => ({})
      },
      location: { origin: 'http://localhost:3000' },
      document: {
        getElementById: (id) => ({
          value: '',
          addEventListener: () => {},
          style: {}
        }),
        querySelectorAll: () => [],
        createElement: () => ({ setAttribute: () => {}, style: {} }),
        body: { appendChild: () => {}, removeChild: () => {} }
      }
    };
    mockWindow.window = mockWindow;

    vm.createContext(mockWindow);
    vm.runInContext(assistantJsContent, mockWindow);

    record(
      'assistant.js compiles cleanly in JS sandbox and defines window.renderAssistantPage',
      typeof mockWindow.renderAssistantPage === 'function' && typeof mockWindow.AssistantPage === 'function'
    );

    // Execute renderAssistantPage with mockContainer
    await mockWindow.renderAssistantPage(mockContainer);

    record(
      'renderAssistantPage executes asynchronously without error and populates container',
      typeof mockContainer.innerHTML === 'string' && mockContainer.innerHTML.length > 5000,
      `htmlLength=${mockContainer.innerHTML.length}`
    );

    console.log('\n================================================================');
    console.log(`PHASE 3A TEST SUMMARY: ${passed} / ${total} PASSED (${failed} FAILED)`);
    console.log('================================================================\n');

    if (failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (err) {
    console.error('Fatal error running Phase 3A test suite:', err);
    process.exit(1);
  } finally {
    if (serverInstance) {
      serverInstance.close();
    }
  }
})();
