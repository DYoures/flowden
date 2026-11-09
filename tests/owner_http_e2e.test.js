// tests/owner_http_e2e.test.js
/**
 * Authoritative Owner HTTP E2E Test Suite for FKF 2.0.
 *
 * Verifies end-to-end via actual HTTP requests and an isolated MySQL database:
 * 1. Owner can inspect a valid FKF 2.0 package for their own Project (HTTP 200).
 * 2. Owner can successfully commit the package (HTTP 200).
 * 3. Direct MySQL queries verify notes, folders, entities, semantic links, board projections,
 *    and job/ticket records.
 */

const ISOLATED_DB_NAME = 'flowden_owner_http_e2e_20261109';
const TEST_PORT = 5077;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

process.env.DB_NAME = ISOLATED_DB_NAME;
process.env.NODE_ENV = 'test';
process.env.PORT = String(TEST_PORT);
process.env.JWT_SECRET = 'flowden_owner_e2e_secret_key_32chars_long!';

require('dotenv').config();
const mysql = require('mysql2/promise');
const assert = require('assert');

async function runOwnerE2ETest() {
  console.log('=== STARTING OWNER HTTP E2E VERIFICATION TEST ===\n');
  console.log(`[SETUP] Target Isolated Database: ${ISOLATED_DB_NAME}`);
  console.log(`[SETUP] Target Server Port: ${TEST_PORT}`);

  const host = process.env.DB_HOST || 'localhost';
  const port = parseInt(process.env.DB_PORT || '3306', 10);
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD || '';

  // 1. Setup isolated database cleanly
  const preConn = await mysql.createConnection({ host, port, user, password });
  try {
    await preConn.query(`DROP DATABASE IF EXISTS \`${ISOLATED_DB_NAME}\`;`);
    await preConn.query(`CREATE DATABASE \`${ISOLATED_DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    console.log(`[SETUP] Isolated database "${ISOLATED_DB_NAME}" initialized.`);
  } finally {
    await preConn.end();
  }

  // 2. Run migrations
  const db = require('../server/config/database');
  const { runMigrations } = require('../server/migrations/runner');
  const SecurityService = require('../server/services/securityService');

  await db.initDB();
  const pool = db.getPool();
  await runMigrations(pool);
  await SecurityService.ensureSecurityTables();
  console.log('[SETUP] Migrations 001-008 and security tables verified.');

  // 3. Start server
  const app = require('../server/index');
  const server = await new Promise((resolve, reject) => {
    const s = app.listen(TEST_PORT, (err) => {
      if (err) return reject(err);
      console.log(`[SETUP] HTTP server listening on ${BASE_URL}`);
      resolve(s);
    });
  });

  let passed = 0;

  try {
    async function apiRequest(endpoint, { method = 'GET', body = null, token = null } = {}) {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${BASE_URL}${endpoint}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : null
      });
      const data = await res.json().catch(() => null);
      return { status: res.status, ok: res.ok, data };
    }

    // Step 1: Register Project Owner
    console.log('[STEP 1] Registering Project Owner...');
    const ownerReg = await apiRequest('/api/v1/auth/register', {
      method: 'POST',
      body: {
        email: `project_owner_${Date.now()}@flowden.test`,
        password: 'Password123!@#',
        display_name: 'Authoritative Owner'
      }
    });
    assert.strictEqual(ownerReg.status, 201, 'Owner registration must return 201');
    const ownerToken = ownerReg.data.token;
    const ownerUser = ownerReg.data.user;
    passed++;
    console.log(`  ✅ PASS: Registered Owner account (user_id=${ownerUser.id})`);

    // Step 2: Create Destination Project
    console.log('[STEP 2] Owner creating destination Project...');
    const projRes = await apiRequest('/api/v1/projects', {
      method: 'POST',
      token: ownerToken,
      body: {
        title: 'Benthic Hadal Research Base',
        description: 'Owner-scoped destination project for FKF 2.0 import'
      }
    });
    assert.strictEqual(projRes.status, 201, 'Project creation must return 201');
    const destinationProjectId = projRes.data.project.id;
    passed++;
    console.log(`  ✅ PASS: Created Project (project_id=${destinationProjectId})`);

    // Step 3: Owner Inspecting valid FKF 2.0 payload
    console.log('[STEP 3] Owner inspecting FKF 2.0 package...');
    const packagePayload = {
      format: 'flowden-knowledge-format',
      fkf_version: '2.0.0',
      package_id: 'pkg-owner-hadal-survey',
      project: {
        id: 'proj-hadal-survey',
        title: 'Hadal Zone Bathymetry & Microbes',
        summary: 'Deep ocean exploration data'
      },
      folders: [
        { id: 'fld-reports', name: 'Survey Reports', parent_id: null },
        { id: 'fld-samples', name: 'Core Drill Samples', parent_id: 'fld-reports' }
      ],
      notes: [
        {
          id: 'note-hadal-01',
          title: 'Mariana Trench Sediment Analysis',
          folder_id: 'fld-samples',
          content: '# Mariana Trench Sediment Analysis\nExtracted deep trench sediment cores show microbial activity.'
        },
        {
          id: 'note-hadal-02',
          title: 'Hydrothermal Pressure Tolerance',
          folder_id: 'fld-reports',
          content: '# Hydrothermal Pressure Tolerance\nBiological adaptations to 1,000 atmospheres of hydrostatic pressure.'
        }
      ],
      sources: [
        {
          id: 'src-ocean-journal',
          title: 'Journal of Hadal Oceanography',
          source_type: 'journal_article',
          summary: 'Peer-reviewed hadal ecosystems literature',
          excerpts: [
            {
              id: 'exc-01',
              quoted_text: 'Barophilic organisms exhibit specialized cellular membrane compositions.',
              annotation: 'Key barophilic adaptation citation'
            }
          ]
        }
      ],
      relationships: [
        {
          source_id: 'note-hadal-01',
          target_id: 'src-ocean-journal',
          link_type: 'cites',
          origin: 'ai_suggested',
          context_snippet: 'Sediment analysis notes cite the Journal of Hadal Oceanography.'
        }
      ],
      optional_modules: {
        spatial_board: {
          board: {
            id: 'board-hadal',
            title: 'Hadal Exploration Canvas',
            items: [
              {
                id: 'card-sediment',
                title: 'Sediment Core Card',
                reference_package_id: 'note-hadal-01',
                reference_type: 'note',
                position_x: 150,
                position_y: 200
              }
            ]
          }
        }
      }
    };

    const inspectRes = await apiRequest('/api/v1/exchange/inspect-json', {
      method: 'POST',
      token: ownerToken,
      body: {
        destination_project_id: destinationProjectId,
        package_json: packagePayload
      }
    });
    assert.strictEqual(inspectRes.status, 200, `Owner inspect must return 200. Got: ${JSON.stringify(inspectRes.data)}`);
    assert.strictEqual(inspectRes.data.valid, true);
    assert.ok(inspectRes.data.inspection_token, 'Inspection token must be issued');
    assert.ok(inspectRes.data.package_sha256, 'package_sha256 must be present');
    const { inspection_token, package_sha256 } = inspectRes.data;
    passed++;
    console.log(`  ✅ PASS: Owner package inspection succeeded (HTTP 200 OK, token issued)`);

    // Step 4: Owner Committing package to destination project
    console.log('[STEP 4] Owner committing package to destination project...');
    const commitRes = await apiRequest('/api/v1/exchange/commit', {
      method: 'POST',
      token: ownerToken,
      body: {
        inspection_token,
        package_sha256,
        destination_project_id: destinationProjectId,
        conflict_resolution: 'disambiguate',
        approved: true
      }
    });
    assert.strictEqual(commitRes.status, 200, `Owner commit must return 200. Got: ${JSON.stringify(commitRes.data)}`);
    assert.strictEqual(commitRes.data.success, true);
    passed++;
    console.log(`  ✅ PASS: Owner package commit succeeded (HTTP 200 OK, success: true)`);

    // Step 5: Direct Database Verification
    console.log('[STEP 5] Asserting database rows for Owner commit...');

    // 1. Verify Notes
    const [notes] = await pool.query(
      'SELECT id, title, project_id, folder_id, content FROM notes WHERE project_id = ? ORDER BY id ASC',
      [destinationProjectId]
    );
    assert.ok(notes.length >= 2, 'Notes must be created in destination project');
    const sedimentNote = notes.find(n => n.title.includes('Mariana Trench Sediment Analysis'));
    const pressureNote = notes.find(n => n.title.includes('Hydrothermal Pressure Tolerance'));
    assert.ok(sedimentNote, 'Sediment note must exist');
    assert.ok(pressureNote, 'Pressure note must exist');
    passed++;
    console.log(`  ✅ PASS: Notes persisted and correctly scoped to project (${notes.length} notes)`);

    // 2. Verify Folders
    const [folders] = await pool.query(
      'SELECT id, name, parent_folder_id, project_id FROM note_folders WHERE project_id = ?',
      [destinationProjectId]
    );
    const parentFolder = folders.find(f => f.name === 'Survey Reports');
    const childFolder = folders.find(f => f.name === 'Core Drill Samples');
    assert.ok(parentFolder && childFolder);
    assert.strictEqual(parentFolder.parent_folder_id, null);
    assert.strictEqual(childFolder.parent_folder_id, parentFolder.id);
    assert.strictEqual(sedimentNote.folder_id, childFolder.id);
    assert.strictEqual(pressureNote.folder_id, parentFolder.id);
    passed++;
    console.log('  ✅ PASS: Folder hierarchy preserved and note assignments verified');

    // 3. Verify Entities and Project Entities
    const [entities] = await pool.query(
      'SELECT id, entity_type, entity_id, title FROM entities WHERE primary_project_id = ?',
      [destinationProjectId]
    );
    assert.ok(entities.length >= 5, 'Entities catalog must contain registered entries');
    const [projEnts] = await pool.query(
      'SELECT project_id, entity_type, entity_id FROM project_entities WHERE project_id = ?',
      [destinationProjectId]
    );
    assert.ok(projEnts.length >= 4, 'project_entities must associate contained entities');
    passed++;
    console.log(`  ✅ PASS: Entities catalog (${entities.length}) and project_entities (${projEnts.length}) verified`);

    // 4. Verify Semantic Links in entity_links and Zero Leakage in note_links
    const [entityLinks] = await pool.query(
      'SELECT link_type, origin, is_confirmed FROM entity_links WHERE user_id = ?',
      [ownerUser.id]
    );
    const citesLink = entityLinks.find(l => l.link_type === 'cites');
    assert.ok(citesLink);
    assert.strictEqual(citesLink.origin, 'ai_suggested');
    assert.strictEqual(citesLink.is_confirmed, 0);

    const [noteLinks] = await pool.query('SELECT COUNT(*) as count FROM note_links');
    assert.strictEqual(noteLinks[0].count, 0, 'Zero leakage in note_links');
    passed++;
    console.log('  ✅ PASS: Semantic relationships stored in entity_links with zero leakage to note_links');

    // 5. Verify Board Card Projection
    const [boardItems] = await pool.query(
      `SELECT bi.id, bi.title, bi.content, bi.reference_type, bi.reference_id
       FROM board_items bi
       JOIN boards b ON b.id = bi.board_id
       WHERE b.project_id = ?`,
      [destinationProjectId]
    );
    assert.ok(boardItems.length >= 1, 'Board card projection must exist');
    const card = boardItems[0];
    assert.strictEqual(card.reference_type, 'note');
    assert.strictEqual(card.reference_id, sedimentNote.id);
    assert.strictEqual(card.content.startsWith('# '), false, 'Markdown header prefix must be stripped');
    assert.ok(card.content.length <= 160);
    passed++;
    console.log(`  ✅ PASS: Board card projection verified: "${card.title}" -> "${card.content}"`);

    // 6. Verify Job & Ticket records
    const [jobs] = await pool.query(
      'SELECT state, destination_project_id FROM knowledge_import_jobs WHERE user_id = ?',
      [ownerUser.id]
    );
    assert.ok(jobs.length >= 1);
    assert.strictEqual(jobs[0].state, 'committed');

    const [tickets] = await pool.query(
      'SELECT is_consumed FROM knowledge_exchange_tickets WHERE user_id = ?',
      [ownerUser.id]
    );
    assert.ok(tickets.length >= 1);
    assert.strictEqual(tickets[0].is_consumed, 1);
    passed++;
    console.log('  ✅ PASS: knowledge_import_jobs state is "committed" and ticket is consumed');

    console.log(`\n=== ALL ${passed}/10 OWNER HTTP E2E ASSERTIONS PASSED ===\n`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    console.log('[CLEANUP] Server stopped.');
    await pool.end();
    console.log(`[CLEANUP] Database pool closed. Database "${ISOLATED_DB_NAME}" preserved.`);
  }
}

runOwnerE2ETest()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Owner E2E Test Failed:', err);
    process.exit(1);
  });
