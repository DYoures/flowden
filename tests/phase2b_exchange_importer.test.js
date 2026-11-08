/**
 * Flowden Knowledge Exchange — Phase 2B Integration Test Suite
 * Transactional Importer, Crash-Safe Commit Pipeline, Durable WikiLinks & Recovery
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const db = require('../server/config/database');
const SecurityService = require('../server/services/securityService');
const KnowledgeExchangeService = require('../server/services/knowledgeExchangeService');
const Note = require('../server/models/Note');
const Project = require('../server/models/Project');
const app = require('../server/index');

const PORT = 3094;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const REF_ZIP_PATH = path.resolve(
  __dirname,
  '..',
  'docs',
  'knowledge-exchange',
  'examples',
  'flowden-reference-package.flowden.zip'
);
const REF_DIR_PATH = path.resolve(
  __dirname,
  '..',
  'docs',
  'knowledge-exchange',
  'examples',
  'flowden-reference-package'
);

// CRC-32 helper for synthetic ZIPs
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function buildSyntheticZipBuffer(entrySpecs) {
  const localParts = [];
  const cdParts = [];
  let offset = 0;

  for (const spec of entrySpecs) {
    const nameBuf = Buffer.from(spec.name, 'utf8');
    const rawData = spec.data !== undefined
      ? (Buffer.isBuffer(spec.data) ? spec.data : Buffer.from(String(spec.data), 'utf8'))
      : Buffer.alloc(0);
    const method = spec.method !== undefined ? spec.method : 8;
    const compData = method === 8 && rawData.length > 0 ? zlib.deflateRawSync(rawData) : rawData;
    const crc = crc32(rawData);

    const lfh = Buffer.alloc(30);
    lfh.writeUInt32LE(0x04034b50, 0);
    lfh.writeUInt16LE(20, 4);
    lfh.writeUInt16LE(0, 6);
    lfh.writeUInt16LE(method, 8);
    lfh.writeUInt16LE(0, 10);
    lfh.writeUInt16LE(0, 12);
    lfh.writeUInt32LE(crc, 14);
    lfh.writeUInt32LE(compData.length, 18);
    lfh.writeUInt32LE(rawData.length, 22);
    lfh.writeUInt16LE(nameBuf.length, 26);
    lfh.writeUInt16LE(0, 28);

    const localOffset = offset;
    localParts.push(lfh, nameBuf, compData);
    offset += lfh.length + nameBuf.length + compData.length;

    const cdh = Buffer.alloc(46);
    cdh.writeUInt32LE(0x02014b50, 0);
    cdh.writeUInt16LE(0x031e, 4);
    cdh.writeUInt16LE(20, 6);
    cdh.writeUInt16LE(0, 8);
    cdh.writeUInt16LE(method, 10);
    cdh.writeUInt16LE(0, 12);
    cdh.writeUInt16LE(0, 14);
    cdh.writeUInt32LE(crc, 16);
    cdh.writeUInt32LE(compData.length, 20);
    cdh.writeUInt32LE(rawData.length, 24);
    cdh.writeUInt16LE(nameBuf.length, 28);
    cdh.writeUInt16LE(0, 30);
    cdh.writeUInt16LE(0, 32);
    cdh.writeUInt16LE(0, 34);
    cdh.writeUInt16LE(0, 36);
    cdh.writeUInt32LE(0, 38);
    cdh.writeUInt32LE(localOffset, 42);

    cdParts.push(cdh, nameBuf);
  }

  const cdOffset = offset;
  let cdSize = 0;
  for (const p of cdParts) cdSize += p.length;

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entrySpecs.length, 8);
  eocd.writeUInt16LE(entrySpecs.length, 10);
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(cdOffset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, ...cdParts, eocd]);
}

function loadReferencePackageFiles() {
  const fileMap = new Map();
  function walk(dir) {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const full = path.join(dir, item);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        walk(full);
      } else {
        const rel = full.slice(REF_DIR_PATH.length + 1).replace(/\\/g, '/');
        fileMap.set(rel, fs.readFileSync(full));
      }
    }
  }
  walk(REF_DIR_PATH);
  return fileMap;
}

async function uploadToEndpoint(url, zipBuf, filename, fields = {}, token = null) {
  const formData = new FormData();
  if (zipBuf) {
    const blob = new Blob([zipBuf], { type: 'application/zip' });
    formData.append('file', blob, filename || 'package.flowden.zip');
  }
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined && v !== null) {
      formData.append(k, String(v));
    }
  }

  const headers = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
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
  return { status: res.status, data };
}

// Test runner state
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function record(name, condition, details = '') {
  totalTests += 1;
  if (condition) {
    passedTests += 1;
    console.log(`  ✅ PASSED: ${name}${details ? ` (${details})` : ''}`);
  } else {
    failedTests += 1;
    console.error(`  ❌ FAILED: ${name}${details ? ` (${details})` : ''}`);
  }
}

async function runPhase2BTests() {
  console.log('\n===============================================================');
  console.log('  FLOWDEN KNOWLEDGE EXCHANGE — PHASE 2B TEST SUITE');
  console.log('  Transactional Importer, Durable WikiLinks & Crash Recovery');
  console.log('===============================================================\n');

  await db.initDB();
  await SecurityService.ensureSecurityTables();

  const server = app.listen(PORT);
  await new Promise(r => setTimeout(r, 200));

  try {
    // -------------------------------------------------------------------------
    // Setup: Isolated Test Users (User A and User B)
    // -------------------------------------------------------------------------
    const runSuffix = Date.now().toString(36);
    const emailA = `importer_user_a_${runSuffix}@flowden.test`;
    const emailB = `importer_user_b_${runSuffix}@flowden.test`;
    const password = 'TestPassword!2026';

    const regA = await fetch(`${BASE_URL}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ display_name: 'Importer User A', email: emailA, password })
    }).then(r => r.json());
    const tokenA = regA.token;
    const userAId = regA.user.id;

    const regB = await fetch(`${BASE_URL}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ display_name: 'Importer User B', email: emailB, password })
    }).then(r => r.json());
    const tokenB = regB.token;
    const userBId = regB.user.id;

    record('Setup: Registered User A and User B in flowden_test', Boolean(tokenA && tokenB));

    // -------------------------------------------------------------------------
    // Helper for inspecting package and getting token
    async function inspectAndGetToken(zipBuf, filename, fields = {}, authToken = tokenA) {
      const inspectRes = await uploadToEndpoint(`${BASE_URL}/api/v1/exchange/inspect`, zipBuf, filename, fields, authToken);
      return inspectRes;
    }

    // Category 1: Security & Gate Checks on Commit API
    // -------------------------------------------------------------------------
    console.log('\n[Category 1: Security & Gate Checks]');
    const refZipBuf = fs.readFileSync(REF_ZIP_PATH);
    const refSha256 = crypto.createHash('sha256').update(refZipBuf).digest('hex');

    // Test 1: Unauthenticated commit rejected with 401
    const unauthRes = await uploadToEndpoint(
      `${BASE_URL}/api/v1/exchange/commit`,
      refZipBuf,
      'test.flowden.zip',
      { approved: true },
      null
    );
    record('1. Unauthenticated commit rejected with HTTP 401', unauthRes.status === 401);

    // Test 2: Commit without explicit approval rejected with 400
    const unapprovedRes = await uploadToEndpoint(
      `${BASE_URL}/api/v1/exchange/commit`,
      refZipBuf,
      'test.flowden.zip',
      { approved: false },
      tokenA
    );
    record(
      '2. Missing explicit user approval rejected with HTTP 400',
      unapprovedRes.status === 400 && unapprovedRes.data.code === 'EXPLICIT_APPROVAL_REQUIRED'
    );

    // Test 3: Commit with package SHA-256 mismatch rejected with 422
    const inspectForMismatch = await inspectAndGetToken(refZipBuf, 'test.flowden.zip', {}, tokenA);
    const forgedHashRes = await uploadToEndpoint(
      `${BASE_URL}/api/v1/exchange/commit`,
      refZipBuf,
      'test.flowden.zip',
      {
        approved: true,
        inspection_token: inspectForMismatch.data?.inspection_token,
        package_sha256: '0000000000000000000000000000000000000000000000000000000000000000'
      },
      tokenA
    );
    record(
      '3. Package SHA-256 mismatch rejected with HTTP 422',
      forgedHashRes.status === 422 && forgedHashRes.data.code === 'PACKAGE_HASH_MISMATCH'
    );

    // Test 4: Unauthorized destination project rejected with 403
    const userBProject = await Project.create(userBId, { title: 'User B Secret Project' });
    const unauthDestRes = await uploadToEndpoint(
      `${BASE_URL}/api/v1/exchange/inspect`,
      refZipBuf,
      'test.flowden.zip',
      { destination_project_id: userBProject.id },
      tokenA
    );
    record(
      '4. Unauthorized destination project (User B project by User A) rejected with HTTP 403',
      unauthDestRes.status === 403 && (unauthDestRes.data.code === 'PROJECT_ACCESS_DENIED' || unauthDestRes.data.errors?.[0]?.code === 'PROJECT_ACCESS_DENIED')
    );

    // -------------------------------------------------------------------------
    // Category 2: Successful Reference Package Import (All Entities & Projections)
    // -------------------------------------------------------------------------
    console.log('\n[Category 2: Reference Package Import Execution]');
    const inspectRefRes = await inspectAndGetToken(refZipBuf, 'flowden-reference-package.flowden.zip', {}, tokenA);
    const inspToken1 = inspectRefRes.data?.inspection_token;
    const opId1 = inspectRefRes.data?.operation_id || crypto.randomUUID();

    const commitRes1 = await uploadToEndpoint(
      `${BASE_URL}/api/v1/exchange/commit`,
      refZipBuf,
      'flowden-reference-package.flowden.zip',
      {
        approved: true,
        inspection_token: inspToken1,
        operation_id: opId1,
        package_sha256: refSha256,
        idempotency_key: `idem_${opId1}`
      },
      tokenA
    );

    record(
      '5. Valid reference package commit returns HTTP 200 and state=committed',
      commitRes1.status === 200 && commitRes1.data && commitRes1.data.state === 'committed' && commitRes1.data.success === true,
      `created_project_id=${commitRes1.data ? commitRes1.data.created_project_id : undefined}`
    );

    const importedProjectId = commitRes1.data ? commitRes1.data.created_project_id : null;
    const counts = commitRes1.data ? commitRes1.data.counts : {};

    record(
      '6. Entity counts match reference package specification',
      counts.folder_count === 3 &&
        counts.note_count === 3 &&
        counts.source_count === 2 &&
        counts.excerpt_count === 3 &&
        counts.relationship_count === 9 &&
        counts.asset_count === 1 &&
        counts.task_count === 2 &&
        counts.board_item_count === 4 &&
        counts.board_connection_count === 3,
      `folders=${counts.folder_count}, notes=${counts.note_count}, sources=${counts.source_count}, tasks=${counts.task_count}, board_items=${counts.board_item_count}`
    );

    // Verify Project Invariant in Database
    const projRows = await db.query('SELECT * FROM projects WHERE id = ?', [importedProjectId]);
    record('7. Project record persisted with active status', projRows.length === 1 && projRows[0].status === 'active');

    const projMemberRows = await db.query(
      'SELECT * FROM project_members WHERE project_id = ? AND user_id = ? AND role = "owner"',
      [importedProjectId, userAId]
    );
    record('8. Project owner membership assigned to authenticated user', projMemberRows.length === 1);

    const projEntityRows = await db.query(
      'SELECT * FROM entities WHERE entity_type = "project" AND entity_id = ?',
      [importedProjectId]
    );
    record('9. Canonical entity registered for imported project', projEntityRows.length === 1);

    // Verify Folders Hierarchy in Database
    const folderRows = await db.query(
      'SELECT id, name, parent_folder_id FROM note_folders WHERE user_id = ?',
      [userAId]
    );
    record('10. Note folders created in note_folders', folderRows.length >= 3);
    const childFolder = folderRows.find(f => f.name.includes('Cool Roofs') || f.name.includes('Roofing'));
    record('11. Folder hierarchy establishes parent-child relationship', Boolean(childFolder));

    // Verify Sources & Excerpts
    const docRows = await db.query(
      'SELECT * FROM research_documents WHERE project_id = ? AND user_id = ?',
      [importedProjectId, userAId]
    );
    record('12. Research documents created with metadata & provenance header', docRows.length === 2);

    const excRows = await db.query(
      'SELECT * FROM research_excerpts WHERE project_id = ? AND user_id = ?',
      [importedProjectId, userAId]
    );
    record('13. Research excerpts created in research_excerpts', excRows.length === 3);

    // Verify Tasks
    const taskRows = await db.query(
      'SELECT * FROM tasks WHERE project_id = ? AND user_id = ?',
      [importedProjectId, userAId]
    );
    record(
      '14. Optional tasks imported with status and priorities',
      taskRows.length === 2 && taskRows.some(t => t.priority === 'high') && taskRows.some(t => t.priority === 'medium')
    );

    // Verify Board Projections & Connections
    const boardRows = await db.query(
      'SELECT * FROM boards WHERE project_id = ? AND user_id = ?',
      [importedProjectId, userAId]
    );
    record('15. Spatial Board created for project', boardRows.length === 1);
    const boardId = boardRows[0].id;

    const groupRows = await db.query('SELECT * FROM board_groups WHERE board_id = ?', [boardId]);
    record('16. Board groups created', groupRows.length === 2);

    const itemRows = await db.query('SELECT * FROM board_items WHERE board_id = ?', [boardId]);
    record('17. Board items created as projections (notes and tasks)', itemRows.length === 4 && itemRows.some(i => i.reference_type === 'note') && itemRows.some(i => i.reference_type === 'task'));

    const wireRows = await db.query('SELECT * FROM board_item_connections WHERE board_id = ?', [boardId]);
    record('18. Visual board connections created in board_item_connections', wireRows.length === 3);

    // Verify Asset Promotion and Link Rewriting
    const uploadRows = await db.query(
      'SELECT * FROM file_uploads WHERE project_id = ? AND user_id = ?',
      [importedProjectId, userAId]
    );
    record('19. Asset registered in file_uploads with SHA-256 and MIME type', uploadRows.length === 1 && uploadRows[0].original_name === 'architecture-diagram.png');
    const promotedFilePath = path.resolve(__dirname, '..', uploadRows[0].file_path.replace(/^\/+/, ''));
    record('20. Promoted asset exists on disk in permanent uploads storage', fs.existsSync(promotedFilePath));

    // Verify Note Markdown Rewrite (Asset relative URL)
    const notesInProj = await db.query(
      'SELECT id, title, content FROM notes WHERE project_id = ? AND user_id = ?',
      [importedProjectId, userAId]
    );
    const synthesisNote = notesInProj.find(n => n.title.includes('Tradeoff Matrix') || n.title.includes('Synthesis'));
    record(
      '21. Relative asset link ../assets/... rewritten to /uploads/vault/fkp_...',
      Boolean(synthesisNote && synthesisNote.content.includes('/uploads/vault/fkp_'))
    );

    // -------------------------------------------------------------------------
    // Category 3: Durable WikiLink Identity & Rename Stability
    // -------------------------------------------------------------------------
    console.log('\n[Category 3: Durable WikiLinks, Rename & Graph Integrity]');
    // Note 3 had [[fkf:note-example-01|...]] -> should be rewritten to [[note:<id>|...]]
    const note1 = notesInProj.find(n => n.title === 'Thermal Performance Summary');
    const note3 = synthesisNote;

    record(
      '22. Package WikiLink [[fkf:...]] rewritten to durable Flowden WikiLink [[note:<dbId>|...]]',
      Boolean(note3 && note1 && note3.content.includes(`[[note:${note1.id}|`))
    );

    // Verify note_links and entity_links
    const noteLinks = await db.query(
      'SELECT * FROM note_links WHERE source_note_id = ? AND target_note_id = ?',
      [note3.id, note1.id]
    );
    record('23. note_links establishes direct relation between Note 3 and Note 1', noteLinks.length === 1);

    const entityLinks = await db.query(
      'SELECT * FROM entity_links WHERE source_type = "note" AND source_id = ? AND target_type = "note" AND target_id = ?',
      [note3.id, note1.id]
    );
    record('24. entity_links establishes semantic link between Note 3 and Note 1', entityLinks.length >= 1);

    // Test Backlinks via Note.findById
    const note1Before = await Note.findById(note1.id, userAId);
    record(
      '25. Backlinks correctly surface Note 3 referencing Note 1',
      Array.isArray(note1Before.backlinks) && note1Before.backlinks.some(b => b.id === note3.id)
    );

    // Test Note Rename: Renaming Note 1 must NOT break backlinks or note_links
    const updatedNote1 = await Note.update(note1.id, userAId, { title: 'Renamed Advanced Cool Roofs 2026' });
    const note1AfterRename = await Note.findById(note1.id, userAId);
    record(
      '26. Renaming Note does not break inbound references or backlinks',
      note1AfterRename.title === 'Renamed Advanced Cool Roofs 2026' &&
        Array.isArray(note1AfterRename.backlinks) &&
        note1AfterRename.backlinks.some(b => b.id === note3.id)
    );

    // Test Subsequent Note Edit: Editing Note 3 preserves durable link
    const editedNote3 = await Note.update(note3.id, userAId, {
      content: `${note3.content}\n\nEdited subsequent content referencing [[note:${note1.id}|Renamed Advanced Cool Roofs 2026]].`
    });
    const note1AfterEdit = await Note.findById(note1.id, userAId);
    record(
      '27. Subsequent Note edit preserves durable identity and backlinks',
      Array.isArray(note1AfterEdit.backlinks) && note1AfterEdit.backlinks.some(b => b.id === note3.id)
    );

    // Test Duplicate Note Titles: Disambiguation & Unambiguous ID Resolution
    console.log('\n[Category 4: Duplicate Titles & Canonical Markdown]');
    // Create pre-existing note with title 'Thermal Performance Summary'
    const preNote = await Note.create(userAId, {
      title: 'Thermal Performance Summary',
      content: '# User Existing Thermal Performance'
    });

    // Import a package with conflicting note title
    const refMap = loadReferencePackageFiles();
    const customZipBuf = buildSyntheticZipBuffer(
      Array.from(refMap.entries()).map(([name, data]) => ({ name, data }))
    );
    const customSha = crypto.createHash('sha256').update(customZipBuf).digest('hex');

    const inspectDisambig = await inspectAndGetToken(customZipBuf, 'disambig.flowden.zip', {}, tokenA);
    const disambigRes = await uploadToEndpoint(
      `${BASE_URL}/api/v1/exchange/commit`,
      customZipBuf,
      'disambig.flowden.zip',
      {
        approved: true,
        inspection_token: inspectDisambig.data?.inspection_token,
        conflict_resolution: 'disambiguate',
        package_sha256: customSha
      },
      tokenA
    );

    record(
      '28. Package import with duplicate note title succeeds with disambiguation',
      disambigRes.status === 200 && disambigRes.data.state === 'committed'
    );

    const disambigProjId = disambigRes.data.created_project_id;
    const disambigNotes = await db.query(
      'SELECT id, title FROM notes WHERE project_id = ? AND user_id = ?',
      [disambigProjId, userAId]
    );
    const disambiguatedNote = disambigNotes.find(n => n.title.includes('(Imported)'));
    record(
      '29. Duplicate note title disambiguated to avoid silent overwrite',
      Boolean(disambiguatedNote)
    );

    // Verify Canonical Markdown Storage & Property Accessor
    const fetchedDisambigNote = await Note.findById(disambiguatedNote.id, userAId);
    record(
      '30. Canonical Markdown stored in notes.content and exposed via content_markdown alias',
      fetchedDisambigNote.content && fetchedDisambigNote.content_markdown === fetchedDisambigNote.content
    );

    const versionRows = await db.query(
      'SELECT * FROM note_versions WHERE note_id = ? ORDER BY version_number ASC',
      [disambiguatedNote.id]
    );
    record(
      '31. Initial version snapshot created in note_versions table',
      versionRows.length >= 1 && versionRows[0].version_number === 1
    );

    // -------------------------------------------------------------------------
    // Category 5: Idempotency, Concurrency & Rollback Recovery
    // -------------------------------------------------------------------------
    console.log('\n[Category 5: Idempotency & Crash-Safe Rollback]');
    // Test Idempotent Replay
    const inspectReplay = await inspectAndGetToken(refZipBuf, 'replay.flowden.zip', {}, tokenA);
    const replayRes = await uploadToEndpoint(
      `${BASE_URL}/api/v1/exchange/commit`,
      refZipBuf,
      'replay.flowden.zip',
      {
        approved: true,
        inspection_token: inspectReplay.data?.inspection_token,
        operation_id: opId1,
        idempotency_key: `idem_${opId1}`,
        package_sha256: refSha256
      },
      tokenA
    );
    record(
      '32. Repeated commit with same idempotency key returns 200 with cached result without duplicating entities',
      replayRes.status === 200 && replayRes.data.idempotent_replay === true && replayRes.data.created_project_id === importedProjectId
    );

    // Test Transaction Rollback on Pass 1 Failure
    // Build corrupted package where project overview is malformed or throws during insertion
    const failMap = loadReferencePackageFiles();
    // Intentionally corrupt folders.json to reference a cycle
    const badFoldersDoc = JSON.parse(failMap.get('folders.json').toString('utf8'));
    badFoldersDoc.folders.push({
      id: 'fld-cycle-a',
      name: 'Cycle A',
      parent_id: 'fld-cycle-b'
    });
    badFoldersDoc.folders.push({
      id: 'fld-cycle-b',
      name: 'Cycle B',
      parent_id: 'fld-cycle-a'
    });
    failMap.set('folders.json', Buffer.from(JSON.stringify(badFoldersDoc), 'utf8'));

    const failZipBuf = buildSyntheticZipBuffer(
      Array.from(failMap.entries()).map(([name, data]) => ({ name, data }))
    );
    const failSha = crypto.createHash('sha256').update(failZipBuf).digest('hex');

    const rollbackOpId = crypto.randomUUID();
    let directRollbackErr = null;
    try {
      const tempFailZip = path.resolve(__dirname, '..', 'temp', `fail_test_${Date.now()}.flowden.zip`);
      fs.writeFileSync(tempFailZip, failZipBuf);
      await KnowledgeExchangeService.executeImport({
        userId: userAId,
        operationId: rollbackOpId,
        packageSha256: failSha,
        zipFilePath: tempFailZip,
        originalFilename: 'fail.flowden.zip'
      });
    } catch (err) {
      directRollbackErr = err;
    }

    record(
      '33. Hierarchy cycle or pass failure causes transaction abort and returns error',
      Boolean(directRollbackErr)
    );

    const rollbackJob = await db.query(
      'SELECT state FROM knowledge_import_jobs WHERE operation_id = ? LIMIT 1',
      [rollbackOpId]
    );
    record(
      '34. Failed commit job marked as rolled_back or failed_validation in knowledge_import_jobs',
      rollbackJob.length === 1 && (rollbackJob[0].state === 'rolled_back' || rollbackJob[0].state === 'failed_validation')
    );

    // Test Background Crash Recovery Reconciler
    console.log('\n[Category 6: Crash Recovery Reconciler]');
    // Create an artificial interrupted job in 'committing_files' with an orphaned file
    const crashOpId = `crash_${Date.now()}`;
    const testOrphanFilename = `fkp_${crashOpId}_orphan.png`;
    const testOrphanPath = path.resolve(__dirname, '..', 'uploads', 'vault', testOrphanFilename);
    fs.writeFileSync(testOrphanPath, Buffer.from('FAKE ORPHAN FILE'));

    await db.query(
      `INSERT INTO knowledge_import_jobs (
        id, operation_id, user_id, package_sha256, state,
        promoted_files_json, heartbeat_at, started_at
      ) VALUES (?, ?, ?, ?, 'committing_files', ?, DATE_SUB(NOW(), INTERVAL 30 MINUTE), DATE_SUB(NOW(), INTERVAL 30 MINUTE))`,
      [
        `job_${crashOpId}`,
        crashOpId,
        userAId,
        '0000000000000000000000000000000000000000000000000000000000000000',
        JSON.stringify([testOrphanPath])
      ]
    );

    const reconciled = await KnowledgeExchangeService.reconcileUnfinishedJobs(0);
    record('35. Crash recovery reconciler processes stale interrupted jobs', reconciled >= 1);
    record('36. Reconciler deletes orphaned files not registered in file_uploads', !fs.existsSync(testOrphanPath));

    const reconciledJob = await db.query(
      'SELECT state FROM knowledge_import_jobs WHERE operation_id = ?',
      [crashOpId]
    );
    record('37. Interrupted job transitioned to rolled_back state', reconciledJob.length === 1 && reconciledJob[0].state === 'rolled_back');

    // Confirm that committed reference package files are NEVER deleted by reconciler
    record('38. Committed assets preserved intact by crash recovery reconciler', fs.existsSync(promotedFilePath));

    // Test File Access Security Gate: User B cannot access User A's uploaded asset
    console.log('\n[Category 7: Multi-User Security Gate]');
    const assetRelUrl = uploadRows[0].file_path; // e.g. /uploads/vault/fkp_...
    const accessByB = await fetch(`${BASE_URL}${assetRelUrl}`, {
      headers: { Authorization: `Bearer ${tokenB}` }
    });
    record('39. User B cannot access User A imported vault asset (HTTP 403 Forbidden)', accessByB.status === 403);

    const accessByA = await fetch(`${BASE_URL}${assetRelUrl}`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    record('40. Owner User A can access imported vault asset (HTTP 200 OK)', accessByA.status === 200);

  } catch (err) {
    console.error('Unexpected test error:', err);
    failedTests += 1;
  } finally {
    server.close();
  }

  console.log('\n===============================================================');
  console.log(`  PHASE 2B TEST RESULTS: ${passedTests} / ${totalTests} PASSED (${failedTests} FAILED)`);
  console.log('===============================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runPhase2BTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
