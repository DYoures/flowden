// tests/markdown_import.test.js
/**
 * FLOWDEN KNOWLEDGE EXCHANGE — MARKDOWN IMPORT & PROMPT VERIFICATION SUITE
 *
 * Verifies:
 * 1. Markdown parser splits single .md file into multiple distinct Notes (not one giant Note)
 * 2. Markdown metadata (folders, tags, wikilinks, sources, relationships) correctly parsed
 * 3. Inspect -> Preview -> Commit pipeline with .md file
 * 4. Database persistence: distinct notes, note_folders, research_documents, entity_links in MySQL
 * 5. Authorization boundaries: non-members and viewers rejected, owner/editor accepted
 * 6. Universal Research Prompt exact string match in assistant.js preview and copy handler
 * 7. FKF 2.0 schema card removed from UI while backend endpoint remains functional
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const db = require('../server/config/database');
const SecurityService = require('../server/services/securityService');
const serverModule = require('../server/index');
const Project = require('../server/models/Project');
const { parseMarkdownDocument, isMarkdownFile } = require('../server/utils/markdownKnowledgeParser');
const { inspectKnowledgePackage } = require('../server/services/packageInspectionService');

const TEST_PORT = 3097;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

let passCount = 0;
let failCount = 0;

function record(name, condition, details = '') {
  if (condition) {
    passCount++;
    console.log(`  ✅ [PASS] #${passCount} ${name} ${details ? '(' + details + ')' : ''}`);
  } else {
    failCount++;
    console.error(`  ❌ [FAIL] #${passCount + failCount} ${name} ${details ? '(' + details + ')' : ''}`);
  }
}

const SAMPLE_MD_DOCUMENT = `---
project: Distributed Consensus in Byzantine Networks
summary: A deep-dive exploration of consensus algorithms in distributed systems under Byzantine failure modes.
tags: [consensus, distributed-systems, fault-tolerance]
---

# Distributed Consensus in Byzantine Networks

## Note: Fundamentals of Byzantine Fault Tolerance
folder: Core Concepts
tags: [bft, fundamentals]

Byzantine Fault Tolerance (BFT) is the property of a distributed system to reach consensus even when components fail or act maliciously.

As demonstrated in [[Practical Byzantine Fault Tolerance]], safety is guaranteed provided fewer than one-third of nodes are faulty. See also [[Proof of Stake Consensus]].

---

## Note: Practical Byzantine Fault Tolerance
folder: Protocols / Classical
tags: [pbft, castro-liskov]

Practical Byzantine Fault Tolerance (PBFT), introduced by Castro and Liskov in 1999, provides high-performance state machine replication.

PBFT operates in three distinct phases:
1. Pre-prepare
2. Prepare
3. Commit

It connects closely with [[Fundamentals of Byzantine Fault Tolerance]].

---

## Note: Proof of Stake Consensus
folder: Protocols / Modern
tags: [pos, modern]

Modern Proof-of-Stake protocols utilize economic incentives alongside cryptographic validator selection to achieve finality.

Validators stake tokens and are subject to slashing upon equivocating. This contrasts with classical PBFT described in [[Practical Byzantine Fault Tolerance]].

---

## Sources

### Source: Castro & Liskov 1999
type: paper
url: https://pmg.csail.mit.edu/papers/osdi99.pdf
description: Seminal paper introducing Practical Byzantine Fault Tolerance.

> "A new, polynomial-time algorithm for Byzantine-fault-tolerant state-machine replication."

---

## Relationships

- [[Fundamentals of Byzantine Fault Tolerance]] -> [[Practical Byzantine Fault Tolerance]] : explains
- [[Proof of Stake Consensus]] -> [[Practical Byzantine Fault Tolerance]] : compares_with
`;

(async () => {
  let serverInstance = null;
  const tempFiles = [];

  try {
    console.log('\n================================================================');
    console.log('FLOWDEN KNOWLEDGE EXCHANGE — MARKDOWN IMPORT VERIFICATION');
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

    // -------------------------------------------------------------------------
    // SECTION 1: MARKDOWN PARSER UNIT TESTS
    // -------------------------------------------------------------------------
    console.log('\n[Section 1: Markdown Knowledge Parser]');

    const parseResult = parseMarkdownDocument(SAMPLE_MD_DOCUMENT, 'consensus-research.md');
    record('Markdown parser validates valid structured document', parseResult.valid === true);
    record('Identifies exactly 3 distinct Notes (not one giant Note)', parseResult.canonical.notes.length === 3, `count=${parseResult.canonical.notes.length}`);

    const noteTitles = parseResult.canonical.notes.map(n => n.title);
    record('Extracted all 3 note titles correctly',
      noteTitles.includes('Fundamentals of Byzantine Fault Tolerance') &&
      noteTitles.includes('Practical Byzantine Fault Tolerance') &&
      noteTitles.includes('Proof of Stake Consensus')
    );

    record('Folders correctly detected from note metadata',
      parseResult.canonical.folders.length >= 2,
      `folders=${parseResult.canonical.folders.map(f => f.name).join(', ')}`
    );

    record('Sources and excerpts extracted',
      parseResult.canonical.sources.length === 1 && parseResult.canonical.sources[0].excerpts.length >= 1,
      `sources=${parseResult.canonical.sources.length}, excerpts=${parseResult.canonical.sources[0]?.excerpts?.length}`
    );

    record('Explicit relationships extracted',
      parseResult.canonical.relationships.length >= 2,
      `relationships=${parseResult.canonical.relationships.length}`
    );

    // Verify WikiLink resolution
    const note1 = parseResult.canonical.notes.find(n => n.title.includes('Fundamentals'));
    record('WikiLinks resolved to canonical [[fkf:<id>|<title>]] syntax',
      note1.content_markdown.includes('[[fkf:')
    );

    // -------------------------------------------------------------------------
    // SECTION 2: END-TO-END HTTP INSPECT & COMMIT PIPELINE
    // -------------------------------------------------------------------------
    console.log('\n[Section 2: HTTP Markdown Import Pipeline]');

    // Register test user
    const userEmail = `md_tester_${Date.now()}@flowden.test`;
    const regRes = await fetch(`${BASE_URL}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ display_name: 'MD Tester', email: userEmail, password: 'Password123!Safe' })
    });
    const regData = await regRes.json();
    const authToken = regData.token;
    const userId = regData.user.id;
    record('Registered test user for Markdown import', Boolean(authToken && userId), `userId=${userId}`);

    // Create a temporary .md file
    const tempMdPath = path.join(__dirname, `test_research_${Date.now()}.md`);
    fs.writeFileSync(tempMdPath, SAMPLE_MD_DOCUMENT, 'utf8');
    tempFiles.push(tempMdPath);

    // Inspect .md file
    const formData = new FormData();
    const mdBlob = new Blob([fs.readFileSync(tempMdPath)], { type: 'text/markdown' });
    formData.append('file', mdBlob, 'consensus-research.md');

    const inspectRes = await fetch(`${BASE_URL}/api/v1/exchange/inspect`, {
      method: 'POST',
      headers: {
        'Origin': BASE_URL,
        'Authorization': `Bearer ${authToken}`,
        'Cookie': `flowden_token=${authToken}`
      },
      body: formData
    });

    const inspectData = await inspectRes.json();
    record('POST /api/v1/exchange/inspect accepts .md and returns 200', inspectRes.status === 200);
    record('Inspection ticket reports valid with token',
      inspectData.valid === true && Boolean(inspectData.inspection_token)
    );
    record('Inspection counts report 3 distinct notes and 1 source',
      inspectData.counts?.notes === 3 && inspectData.counts?.sources === 1,
      `notes=${inspectData.counts?.notes}, sources=${inspectData.counts?.sources}`
    );

    const inspectionToken = inspectData.inspection_token;
    const packageSha256 = inspectData.package_sha256;

    // Commit .md package to MySQL
    const commitBody = new FormData();
    commitBody.append('inspection_token', inspectionToken);
    commitBody.append('package_sha256', packageSha256);
    commitBody.append('import_mode', 'new_project');
    commitBody.append('approved', 'true');
    commitBody.append('idempotency_key', `idem_${Date.now()}_${Math.random().toString(36).slice(2)}`);

    const commitRes = await fetch(`${BASE_URL}/api/v1/exchange/commit`, {
      method: 'POST',
      headers: {
        'Origin': BASE_URL,
        'Authorization': `Bearer ${authToken}`,
        'Cookie': `flowden_token=${authToken}`
      },
      body: commitBody
    });

    const commitData = await commitRes.json();
    record('POST /api/v1/exchange/commit imports .md package returning 200',
      commitRes.status === 200 && commitData.success === true,
      `status=${commitRes.status}`
    );

    const createdProjectId = commitData.created_project_id || commitData.project_id || commitData.project?.id;
    record('Commit returned newly created project ID', Boolean(createdProjectId), `projectId=${createdProjectId}`);

    // Verify entities in MySQL database
    const dbNotes = await db.query('SELECT id, title, folder_id FROM notes WHERE project_id = ?', [createdProjectId]);
    record('MySQL: Distinct note records created in notes table (at least 3 notes + project overview)',
      dbNotes.length >= 3,
      `found=${dbNotes.length}`
    );

    const dbFolders = await db.query('SELECT id, name FROM note_folders WHERE project_id = ?', [createdProjectId]);
    record('MySQL: Hierarchical folders created in note_folders',
      dbFolders.length >= 2,
      `folders=${dbFolders.map(f => f.name).join(', ')}`
    );

    const dbSources = await db.query('SELECT id, title FROM research_documents WHERE project_id = ?', [createdProjectId]);
    record('MySQL: Source created in research_documents table',
      dbSources.length === 1,
      `sources=${dbSources.map(s => s.title).join(', ')}`
    );

    const dbLinks = await db.query('SELECT id, link_type FROM entity_links WHERE user_id = ? AND origin = "ai_suggested"', [userId]);
    record('MySQL: Semantic relationship links created in entity_links',
      dbLinks.length >= 2,
      `count=${dbLinks.length}`
    );

    // -------------------------------------------------------------------------
    // SECTION 3: AUTHORIZATION BOUNDARY VERIFICATION
    // -------------------------------------------------------------------------
    console.log('\n[Section 3: Authorization Boundary Verification]');

    // Register second user (non-member)
    const otherUserRes = await fetch(`${BASE_URL}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ display_name: 'Other User', email: `other_${Date.now()}@flowden.test`, password: 'Password123!Safe' })
    });
    const otherUserData = await otherUserRes.json();
    const otherToken = otherUserData.token;
    const otherUserId = otherUserData.user.id;

    // Non-member attempts to inspect with destination_project_id = createdProjectId
    const unauthInspectForm = new FormData();
    unauthInspectForm.append('file', new Blob([fs.readFileSync(tempMdPath)], { type: 'text/markdown' }), 'test.md');
    unauthInspectForm.append('destination_project_id', String(createdProjectId));

    const unauthInspectRes = await fetch(`${BASE_URL}/api/v1/exchange/inspect`, {
      method: 'POST',
      headers: {
        'Origin': BASE_URL,
        'Authorization': `Bearer ${otherToken}`,
        'Cookie': `flowden_token=${otherToken}`
      },
      body: unauthInspectForm
    });
    record('Non-member inspecting into restricted project is rejected with 403',
      unauthInspectRes.status === 403,
      `status=${unauthInspectRes.status}`
    );

    // Add other user as Viewer to project
    await db.query(
      'INSERT INTO project_members (project_id, user_id, role, created_at) VALUES (?, ?, "viewer", NOW())',
      [createdProjectId, otherUserId]
    );

    // Viewer attempts to inspect into project (should be rejected from importing)
    const viewerInspectForm = new FormData();
    viewerInspectForm.append('file', new Blob([fs.readFileSync(tempMdPath)], { type: 'text/markdown' }), 'test.md');
    viewerInspectForm.append('destination_project_id', String(createdProjectId));

    const viewerInspectRes = await fetch(`${BASE_URL}/api/v1/exchange/inspect`, {
      method: 'POST',
      headers: {
        'Origin': BASE_URL,
        'Authorization': `Bearer ${otherToken}`,
        'Cookie': `flowden_token=${otherToken}`
      },
      body: viewerInspectForm
    });
    record('Viewer member is rejected with 403 write permission check',
      viewerInspectRes.status === 403,
      `status=${viewerInspectRes.status}`
    );

    // Promote other user to Editor
    await db.query(
      'UPDATE project_members SET role = "editor" WHERE project_id = ? AND user_id = ?',
      [createdProjectId, otherUserId]
    );

    const editorInspectRes = await fetch(`${BASE_URL}/api/v1/exchange/inspect`, {
      method: 'POST',
      headers: {
        'Origin': BASE_URL,
        'Authorization': `Bearer ${otherToken}`,
        'Cookie': `flowden_token=${otherToken}`
      },
      body: viewerInspectForm
    });
    record('Editor member is permitted to inspect into destination project',
      editorInspectRes.status === 200,
      `status=${editorInspectRes.status}`
    );

    // -------------------------------------------------------------------------
    // SECTION 4: UNIVERSAL RESEARCH PROMPT & UI VERIFICATION
    // -------------------------------------------------------------------------
    console.log('\n[Section 4: Universal Research Prompt & UI Verification]');

    const assistantJsContent = fs.readFileSync(path.resolve(__dirname, '../public/js/pages/assistant.js'), 'utf8');

    const EXPECTED_PROMPT = `Research this topic thoroughly. Follow the attached FLOWDEN_RESEARCH_SPEC.md exactly. Organize the findings into multiple focused, interconnected Notes using Flowden's required Markdown structure. Preserve reliable sources, citations, and relationships. Deliver one downloadable structured \`.md\` document or a complete \`.flowden.zip\` package.

Topic: [INSERT RESEARCH TOPIC]`;

    // Extract UNIVERSAL_RESEARCH_PROMPT from assistant.js
    const promptMatch = assistantJsContent.match(/const UNIVERSAL_RESEARCH_PROMPT = `([\s\S]*?)`;/);
    const actualPrompt = promptMatch ? promptMatch[1] : null;

    const normalizedActual = actualPrompt ? actualPrompt.replace(/\\`/g, '`').replace(/\r\n/g, '\n').trim() : '';
    const normalizedExpected = EXPECTED_PROMPT.replace(/\r\n/g, '\n').trim();

    record('UNIVERSAL_RESEARCH_PROMPT matches exact short prompt',
      normalizedActual === normalizedExpected,
      actualPrompt ? `length=${normalizedActual.length}` : 'not found'
    );

    // Verify copy button handler uses the exact same constant
    const hasCopyHandlerUsingPrompt = assistantJsContent.includes('navigator.clipboard.writeText(UNIVERSAL_RESEARCH_PROMPT)');
    record('Copy button handler copies UNIVERSAL_RESEARCH_PROMPT to clipboard',
      hasCopyHandlerUsingPrompt
    );

    // Verify preview code element displays UNIVERSAL_RESEARCH_PROMPT
    const hasPreviewElement = assistantJsContent.includes('<code id="universal-prompt-preview">${esc(UNIVERSAL_RESEARCH_PROMPT)}</code>');
    record('Preview code block uses exact UNIVERSAL_RESEARCH_PROMPT',
      hasPreviewElement
    );

    // Verify FKF 2.0 schema card is removed from assistant.js
    const schemaCardRemoved = !assistantJsContent.includes('flowden-knowledge-format-v2.schema.json') &&
      !assistantJsContent.includes('data-resource="schema-v2"');
    record('FKF 2.0 Schema download card is removed from assistant.js',
      schemaCardRemoved
    );

    // Verify backend route for schema-v2 is still functional
    const schemaRouteRes = await fetch(`${BASE_URL}/api/v1/exchange/resources/schema-v2`);
    record('Backend schema-v2 endpoint is retained and functional',
      schemaRouteRes.status === 200,
      `status=${schemaRouteRes.status}`
    );

    // Verify exchangeModal.js modal text
    const modalJsContent = fs.readFileSync(path.resolve(__dirname, '../public/js/components/exchangeModal.js'), 'utf8');
    const modalHasMd = modalJsContent.includes('.md') &&
      modalJsContent.includes('Structured Markdown document containing multiple Notes');
    const modalHasZip = modalJsContent.includes('.flowden.zip') &&
      modalJsContent.includes('Complete knowledge package');
    const modalHasSize = modalJsContent.includes('Maximum file size:') && modalJsContent.includes('100 MB');

    record('exchangeModal.js guidance contains .md, .flowden.zip, and 100 MB limit',
      modalHasMd && modalHasZip && modalHasSize
    );

    // -------------------------------------------------------------------------
    // SECTION 5: REAL-WORLD REGRESSION FIXTURE — solar-system-research.md
    // -------------------------------------------------------------------------
    console.log('\n[Section 5: Real-World Regression Fixture — solar-system-research.md]');

    const solarMdPath = path.resolve(__dirname, '../docs/knowledge-exchange/examples/solar-system-research.md');
    record('Regression fixture exists on disk', fs.existsSync(solarMdPath), `path=${solarMdPath}`);

    const solarRawContent = fs.readFileSync(solarMdPath, 'utf8');
    const solarParse = parseMarkdownDocument(solarRawContent, 'solar-system-research.md');

    record('solar-system-research.md parses valid without errors',
      solarParse.valid === true && solarParse.errors.length === 0,
      `valid=${solarParse.valid}, errors=${solarParse.errors.length}`
    );

    record('solar-system-research.md has exactly 17 Notes',
      solarParse.canonical?.notes?.length === 17,
      `count=${solarParse.canonical?.notes?.length}`
    );

    record('solar-system-research.md has exactly 6 Folder categories',
      solarParse.canonical?.folders?.length === 6,
      `folders=${solarParse.canonical?.folders?.map(f => f.name).join(', ')}`
    );

    record('solar-system-research.md has exactly 16 Sources and 2 Excerpts',
      solarParse.canonical?.sources?.length === 16 &&
      solarParse.canonical.sources.reduce((sum, s) => sum + (s.excerpts?.length || 0), 0) === 2,
      `sources=${solarParse.canonical?.sources?.length}, excerpts=${solarParse.canonical?.sources?.reduce((sum, s) => sum + (s.excerpts?.length || 0), 0)}`
    );

    record('solar-system-research.md has exactly 20 Relationships',
      solarParse.canonical?.relationships?.length === 20,
      `count=${solarParse.canonical?.relationships?.length}`
    );

    // Verify WikiLink resolution in Note 1
    const solarNote1 = solarParse.canonical.notes.find(n => n.title === 'Solar System Overview');
    record('Internal WikiLinks resolved into Flowden format [[fkf:note-...|...]]',
      Boolean(solarNote1 && solarNote1.content_markdown.includes('[[fkf:note-scale-structure-regions|Scale, Structure & Regions]]')),
      'found resolved link'
    );

    // Verify citations preserved
    record('Citations preserved in notes (e.g. [src-3])',
      Boolean(solarNote1 && solarNote1.content_markdown.includes('[src-3]')),
      'citation [src-3] present'
    );

    // Verify parenthesized years preserved in sources
    const src3 = solarParse.canonical.sources.find(s => s.id === 'src-3');
    record('Source publication year and details preserved without stripping parentheses',
      Boolean(src3 && src3.title.includes('(2010)')),
      `src3 title=${src3?.title}`
    );

    // Now test real Inspect endpoint for solar-system-research.md
    const solarInspectForm = new FormData();
    solarInspectForm.append('file', new Blob([fs.readFileSync(solarMdPath)], { type: 'text/markdown' }), 'solar-system-research.md');

    const solarInspectRes = await fetch(`${BASE_URL}/api/v1/exchange/inspect`, {
      method: 'POST',
      headers: {
        'Origin': BASE_URL,
        'Authorization': `Bearer ${authToken}`,
        'Cookie': `flowden_token=${authToken}`
      },
      body: solarInspectForm
    });

    const solarInspectData = await solarInspectRes.json();
    record('POST /api/v1/exchange/inspect accepts solar-system-research.md (200 OK)',
      solarInspectRes.status === 200 && solarInspectData.valid === true,
      `status=${solarInspectRes.status}`
    );

    record('solar-system-research.md inspect counts report 17 notes, 6 folders, 16 sources, 20 relationships',
      solarInspectData.counts?.notes === 17 &&
      solarInspectData.counts?.folders === 6 &&
      solarInspectData.counts?.sources === 16 &&
      solarInspectData.counts?.relationships === 20,
      `notes=${solarInspectData.counts?.notes}, folders=${solarInspectData.counts?.folders}, sources=${solarInspectData.counts?.sources}, rels=${solarInspectData.counts?.relationships}`
    );

    record('solar-system-research.md preview contains all 17 Notes (not truncated to 10)',
      solarInspectData.preview?.notes?.length === 17 && Array.isArray(solarInspectData.preview.notes[0]?.tags),
      `preview_notes=${solarInspectData.preview?.notes?.length}`
    );

    record('solar-system-research.md preview contains all 6 Folders',
      solarInspectData.preview?.folders?.length === 6,
      `preview_folders=${solarInspectData.preview?.folders?.length}`
    );

    record('solar-system-research.md preview contains all 16 Sources with URLs (not truncated to 10)',
      solarInspectData.preview?.sources?.length === 16 && Boolean(solarInspectData.preview.sources[0]?.source_url),
      `preview_sources=${solarInspectData.preview?.sources?.length}, url=${solarInspectData.preview?.sources[0]?.source_url}`
    );

    record('solar-system-research.md preview contains all 20 Relationships (not truncated to 10)',
      solarInspectData.preview?.relationships?.length === 20 && Boolean(solarInspectData.preview.relationships[0]?.link_type),
      `preview_rels=${solarInspectData.preview?.relationships?.length}`
    );

    // Commit solar-system-research.md into database
    const solarCommitForm = new FormData();
    solarCommitForm.append('inspection_token', solarInspectData.inspection_token);
    solarCommitForm.append('package_sha256', solarInspectData.package_sha256);
    solarCommitForm.append('import_mode', 'new_project');
    solarCommitForm.append('approved', 'true');
    solarCommitForm.append('idempotency_key', `solar_idem_${Date.now()}_${Math.random().toString(36).slice(2)}`);

    const solarCommitRes = await fetch(`${BASE_URL}/api/v1/exchange/commit`, {
      method: 'POST',
      headers: {
        'Origin': BASE_URL,
        'Authorization': `Bearer ${authToken}`,
        'Cookie': `flowden_token=${authToken}`
      },
      body: solarCommitForm
    });

    const solarCommitData = await solarCommitRes.json();
    record('POST /api/v1/exchange/commit commits solar-system-research.md with 200 OK',
      solarCommitRes.status === 200 && solarCommitData.success === true,
      `status=${solarCommitRes.status}`
    );

    const solarProjectId = solarCommitData.created_project_id || solarCommitData.project_id;
    record('Created project ID for solar system research', Boolean(solarProjectId), `projectId=${solarProjectId}`);

    // Verify database entities for solar system project
    const solarDbNotes = await db.query('SELECT id, title, folder_id FROM notes WHERE project_id = ?', [solarProjectId]);
    record('MySQL: 18 note records created in notes table (17 research notes + 1 overview note)',
      solarDbNotes.length === 18,
      `count=${solarDbNotes.length}`
    );

    const solarDbFolders = await db.query('SELECT id, name FROM note_folders WHERE project_id = ?', [solarProjectId]);
    record('MySQL: 6 note folders created in note_folders table',
      solarDbFolders.length === 6,
      `count=${solarDbFolders.length}`
    );

    const solarDbSources = await db.query('SELECT id, title FROM research_documents WHERE project_id = ?', [solarProjectId]);
    record('MySQL: 16 source records created in research_documents table',
      solarDbSources.length === 16,
      `count=${solarDbSources.length}`
    );

    const solarDbExcerpts = await db.query(
      'SELECT id FROM research_excerpts WHERE project_id = ?',
      [solarProjectId]
    );
    record('MySQL: 2 research excerpts created in research_excerpts table',
      solarDbExcerpts.length === 2,
      `count=${solarDbExcerpts.length}`
    );

    // -------------------------------------------------------------------------
    // SECTION 6: SPECIFIC VALIDATION ERROR RESPONSES
    // -------------------------------------------------------------------------
    console.log('\n[Section 6: Specific Validation Error Responses]');

    // Test 1: Empty file
    const emptyForm = new FormData();
    emptyForm.append('file', new Blob(['   \n\n  '], { type: 'text/markdown' }), 'empty.md');
    const emptyRes = await fetch(`${BASE_URL}/api/v1/exchange/inspect`, {
      method: 'POST',
      headers: { 'Origin': BASE_URL, 'Authorization': `Bearer ${authToken}`, 'Cookie': `flowden_token=${authToken}` },
      body: emptyForm
    });
    const emptyData = await emptyRes.json();
    record('Empty .md file returns HTTP 422 with specific code EMPTY_DOCUMENT',
      emptyRes.status === 422 && emptyData.valid === false && emptyData.errors?.some(e => e.code === 'EMPTY_DOCUMENT'),
      `code=${emptyData.errors?.[0]?.code}, message=${emptyData.errors?.[0]?.message}`
    );
    record('Empty .md returns informative top-level error message instead of generic VALIDATION_FAILED',
      Boolean(emptyData.error && !emptyData.error.startsWith('VALIDATION_FAILED') && emptyData.error.includes('empty')),
      `error="${emptyData.error}"`
    );

    // Test 2: Binary / Null byte file
    const nullByteForm = new FormData();
    nullByteForm.append('file', new Blob([Buffer.from('# Title\x00BinaryData', 'utf8')], { type: 'text/markdown' }), 'binary.md');
    const nullByteRes = await fetch(`${BASE_URL}/api/v1/exchange/inspect`, {
      method: 'POST',
      headers: { 'Origin': BASE_URL, 'Authorization': `Bearer ${authToken}`, 'Cookie': `flowden_token=${authToken}` },
      body: nullByteForm
    });
    const nullByteData = await nullByteRes.json();
    record('Binary .md file returns HTTP 422 with specific code BINARY_CONTENT_NOT_ALLOWED',
      nullByteRes.status === 422 && nullByteData.valid === false && nullByteData.errors?.some(e => e.code === 'BINARY_CONTENT_NOT_ALLOWED'),
      `code=${nullByteData.errors?.[0]?.code}`
    );

    // Test 3: JSON file passed with .md extension
    const jsonForm = new FormData();
    jsonForm.append('file', new Blob([JSON.stringify({ not: 'markdown' })], { type: 'text/markdown' }), 'invalid.md');
    const jsonRes = await fetch(`${BASE_URL}/api/v1/exchange/inspect`, {
      method: 'POST',
      headers: { 'Origin': BASE_URL, 'Authorization': `Bearer ${authToken}`, 'Cookie': `flowden_token=${authToken}` },
      body: jsonForm
    });
    const jsonData = await jsonRes.json();
    record('JSON file in .md format returns HTTP 422 with specific code INVALID_MARKDOWN_FORMAT',
      jsonRes.status === 422 && jsonData.valid === false && jsonData.errors?.some(e => e.code === 'INVALID_MARKDOWN_FORMAT'),
      `code=${jsonData.errors?.[0]?.code}`
    );

    // Test 4: Notes with completely empty body
    const emptyNotesForm = new FormData();
    emptyNotesForm.append('file', new Blob([`# Project\n\n## Note: Title 1\n\n## Note: Title 2\n`], { type: 'text/markdown' }), 'nobodies.md');
    const emptyNotesRes = await fetch(`${BASE_URL}/api/v1/exchange/inspect`, {
      method: 'POST',
      headers: { 'Origin': BASE_URL, 'Authorization': `Bearer ${authToken}`, 'Cookie': `flowden_token=${authToken}` },
      body: emptyNotesForm
    });
    const emptyNotesData = await emptyNotesRes.json();
    record('Notes without content return HTTP 422 with specific code EMPTY_NOTE_CONTENT',
      emptyNotesRes.status === 422 && emptyNotesData.valid === false && emptyNotesData.errors?.some(e => e.code === 'EMPTY_NOTE_CONTENT'),
      `code=${emptyNotesData.errors?.[0]?.code}`
    );

    // -------------------------------------------------------------------------
    // SECTION 7: LEGACY .FLOWDEN.ZIP BACKWARD COMPATIBILITY
    // -------------------------------------------------------------------------
    console.log('\n[Section 7: Legacy .flowden.zip Backward Compatibility]');

    const refZipPath = path.resolve(__dirname, '../docs/knowledge-exchange/examples/flowden-reference-package.flowden.zip');
    record('Reference .flowden.zip fixture exists', fs.existsSync(refZipPath), `path=${refZipPath}`);

    const zipInspectForm = new FormData();
    zipInspectForm.append('file', new Blob([fs.readFileSync(refZipPath)], { type: 'application/zip' }), 'flowden-reference-package.flowden.zip');

    const zipInspectRes = await fetch(`${BASE_URL}/api/v1/exchange/inspect`, {
      method: 'POST',
      headers: { 'Origin': BASE_URL, 'Authorization': `Bearer ${authToken}`, 'Cookie': `flowden_token=${authToken}` },
      body: zipInspectForm
    });

    const zipInspectData = await zipInspectRes.json();
    record('Legacy .flowden.zip inspect returns HTTP 200 with valid: true',
      zipInspectRes.status === 200 && zipInspectData.valid === true,
      `status=${zipInspectRes.status}`
    );

    record('Legacy .flowden.zip format recognized as FKF 1.0.0',
      zipInspectData.fkf_version === '1.0.0',
      `version=${zipInspectData.fkf_version}`
    );

    // Commit legacy zip package
    const zipCommitForm = new FormData();
    zipCommitForm.append('inspection_token', zipInspectData.inspection_token);
    zipCommitForm.append('package_sha256', zipInspectData.package_sha256);
    zipCommitForm.append('import_mode', 'new_project');
    zipCommitForm.append('approved', 'true');
    zipCommitForm.append('idempotency_key', `zip_idem_${Date.now()}_${Math.random().toString(36).slice(2)}`);

    const zipCommitRes = await fetch(`${BASE_URL}/api/v1/exchange/commit`, {
      method: 'POST',
      headers: { 'Origin': BASE_URL, 'Authorization': `Bearer ${authToken}`, 'Cookie': `flowden_token=${authToken}` },
      body: zipCommitForm
    });

    const zipCommitData = await zipCommitRes.json();
    record('Legacy .flowden.zip commits successfully returning HTTP 200',
      zipCommitRes.status === 200 && zipCommitData.success === true,
      `status=${zipCommitRes.status}`
    );

  } catch (err) {
    console.error('\nUNHANDLED ERROR IN VERIFICATION SUITE:', err);
    failCount++;
  } finally {
    for (const f of tempFiles) {
      try {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      } catch (_) {}
    }
    if (serverInstance) {
      serverInstance.close();
    }
    console.log('\n================================================================');
    console.log(`MARKDOWN IMPORT SUMMARY: ${passCount} PASSED, ${failCount} FAILED`);
    console.log('================================================================\n');
    process.exit(failCount > 0 ? 1 : 0);
  }
})();
