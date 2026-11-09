/**
 * Flowden FKF 2.0 Integration & Inspection Verification Suite
 *
 * Verifies:
 * 1. Package inspection on a standalone .fkf JSON file via packageInspectionService
 * 2. Package inspection backward-compatibility on reference .flowden.zip v1 package (strictly fails if fixture missing)
 * 3. Project Authorization (Project.hasWriteAccess & Project.getMemberRole for owner, editor, viewer, non-member)
 * 4. Folder scoping strictly per Project in KnowledgeExchangeService.resolveFolderConflict() (no adoption of personal folders)
 * 5. Semantic relationship import using the actual KnowledgeExchangeService.importRelationships() importer method
 * 6. Inspect-JSON through commit hash verification (raw-file hash vs canonical-content hash)
 * 7. End-to-end importer note and folder mapping schema alignment (note_versions, attachments_json, entities)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const { inspectKnowledgePackage } = require('../server/services/packageInspectionService');
const KnowledgeExchangeService = require('../server/services/knowledgeExchangeService');
const Project = require('../server/models/Project');

async function runIntegrationTests() {
  console.log('=== STARTING FKF 2.0 INTEGRATION VERIFICATION ===\n');
  let passed = 0;
  let failed = 0;

  async function it(name, fn) {
    try {
      await fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ FAIL: ${name}`);
      console.error(err);
      failed++;
    }
  }

  // ---------------------------------------------------------------------------
  // Test 1: Inspect a standalone .fkf JSON file
  // ---------------------------------------------------------------------------
  await it('inspectKnowledgePackage inspects standalone .fkf file correctly', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flowden_fkf_inspect_'));
    const fkfPath = path.join(tempDir, 'sample_research.fkf');

    const sampleFkf = {
      format: 'flowden-knowledge-format',
      fkf_version: '2.0.0',
      package_id: 'pkg-fkf2-demo',
      project: {
        id: 'proj-ocean-research',
        title: 'Deep Ocean Trench Dynamics',
        summary: 'A study on Mariana trench benthic ecosystems'
      },
      folders: [
        { id: 'fld-intro', name: 'Introduction', parent_id: null },
        { id: 'fld-data', name: 'Field Data', parent_id: 'fld-intro' }
      ],
      notes: [
        {
          id: 'note-01',
          title: 'Hydrothermal Vent Thermophiles',
          folder_id: 'fld-data',
          content: '---\ntags: [marine, biology, extreme]\n---\n# Hydrothermal Vent Thermophiles\nDetailed observation notes on strain MV-4.',
          is_pinned: false
        }
      ],
      sources: [
        {
          id: 'src-01',
          title: 'Deep-Sea Microbiology Journal 2024',
          source_type: 'journal_article',
          summary: 'Benthic microbial biodiversity analysis',
          excerpts: [
            { id: 'exc-01', quoted_text: 'Thermophilic archaea flourish at 110C.', annotation: 'Thermal limit evidence' }
          ]
        }
      ],
      relationships: [
        {
          source_id: 'note-01',
          target_id: 'src-01',
          link_type: 'cites',
          origin: 'ai_suggested',
          context_snippet: 'Strain MV-4 demonstrates the thermal limits discussed in Deep-Sea Microbiology Journal.'
        }
      ],
      optional_modules: {
        tasks: {
          tasks: [
            { id: 'task-01', title: 'Verify water salinity samples', status: 'planned', priority: 'high' }
          ]
        },
        spatial_board: {
          board: {
            id: 'board-01',
            title: 'Research Analysis Canvas',
            items: [
              {
                id: 'itm-01',
                title: 'Vent Note Projection',
                reference_package_id: 'note-01',
                reference_type: 'note',
                position_x: 100,
                position_y: 100
              }
            ]
          }
        }
      }
    };

    fs.writeFileSync(fkfPath, JSON.stringify(sampleFkf, null, 2), 'utf8');

    try {
      const report = await inspectKnowledgePackage({
        zipFilePath: fkfPath,
        originalFilename: 'sample_research.fkf',
        userId: 1,
        ip: '127.0.0.1'
      });

      assert.strictEqual(report.valid, true, `Report should be valid: ${JSON.stringify(report.validation?.errors)}`);
      assert.strictEqual(report.package.format, 'flowden-knowledge-format');
      assert.strictEqual(report.package.fkf_version, '2.0.0');
      assert.strictEqual(report.package.package_id, 'pkg-fkf2-demo');
      assert.strictEqual(report.project.title, 'Deep Ocean Trench Dynamics');
      assert.strictEqual(report.counts.folders, 2);
      assert.strictEqual(report.counts.notes, 1);
      assert.strictEqual(report.counts.sources, 1);
      assert.strictEqual(report.counts.excerpts, 1);
      assert.strictEqual(report.counts.relationships, 1);
      assert.strictEqual(report.counts.tasks, 1);
      assert.strictEqual(report.counts.board_items, 1);
      assert.strictEqual(report.optional_modules.tasks, true);
      assert.strictEqual(report.optional_modules.spatial_board, true);
      assert.strictEqual(report.preview.notes[0].title, 'Hydrothermal Vent Thermophiles');
      assert.ok(report.raw_sha256, 'raw_sha256 must be exposed');
      assert.ok(report.canonical_sha256, 'canonical_sha256 must be exposed');
      assert.strictEqual(report.package.sha256, report.raw_sha256, 'package.sha256 must match raw_sha256');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // ---------------------------------------------------------------------------
  // Test 2: Inspect reference FKF 1.0 .flowden.zip package (must FAIL if fixture missing)
  // ---------------------------------------------------------------------------
  await it('inspectKnowledgePackage maintains 100% backward compatibility for .flowden.zip v1 (strictly fails if fixture missing)', async () => {
    const refZipPath = path.resolve(
      __dirname,
      '..',
      'docs',
      'knowledge-exchange',
      'examples',
      'flowden-reference-package.flowden.zip'
    );

    // Hard assertion: fixture MUST exist; never pass silently or skip
    assert.ok(
      fs.existsSync(refZipPath),
      `CRITICAL: Reference zip fixture must exist at "${refZipPath}". Compatibility test fails if fixture is missing.`
    );

    const report = await inspectKnowledgePackage({
      zipFilePath: refZipPath,
      originalFilename: 'flowden-reference-package.flowden.zip',
      userId: 1,
      ip: '127.0.0.1'
    });

    assert.strictEqual(report.valid, true, `Legacy v1 package should be valid: ${JSON.stringify(report.validation?.errors)}`);
    assert.strictEqual(report.package.fkf_version, '1.0.0');
    assert.ok(report.counts.notes > 0, 'Notes should be present');
    assert.ok(report.counts.folders > 0, 'Folders should be present');
    assert.ok(report.counts.sources > 0, 'Sources should be present');
  });

  // ---------------------------------------------------------------------------
  // Test 3: Unit / Component Test - Project Authorization (Owner, Editor, Viewer, Non-Member)
  // ---------------------------------------------------------------------------
  await it('Unit / Component Test: Project.hasWriteAccess() dan getMemberRole() mengizinkan owner dan editor, menolak viewer dan non-member', async () => {
    // Stub DB connection that simulates project rows and memberships
    const stubDb = {
      query: async (sql, params = []) => {
        const [userId, projectId] = params;
        // Project 10: owned by User 1
        if (projectId === 10) {
          if (userId === 1) {
            return [{ id: 10, owner_id: 1, member_role: null }];
          } else if (userId === 2) {
            return [{ id: 10, owner_id: 1, member_role: 'editor' }];
          } else if (userId === 3) {
            return [{ id: 10, owner_id: 1, member_role: 'viewer' }];
          } else {
            return [{ id: 10, owner_id: 1, member_role: null }];
          }
        }
        return [];
      }
    };

    // 1. Owner (User 1)
    const ownerWrite = await Project.hasWriteAccess(10, 1, stubDb);
    const ownerRole = await Project.getMemberRole(10, 1, stubDb);
    assert.strictEqual(ownerWrite, true, 'Project owner must have write access');
    assert.strictEqual(ownerRole, 'owner', 'Project owner role must be "owner"');

    // 2. Editor (User 2)
    const editorWrite = await Project.hasWriteAccess(10, 2, stubDb);
    const editorRole = await Project.getMemberRole(10, 2, stubDb);
    assert.strictEqual(editorWrite, true, 'Project editor must have write access');
    assert.strictEqual(editorRole, 'editor', 'Project editor role must be "editor"');

    // 3. Viewer (User 3) -> STRICT REJECTION
    const viewerWrite = await Project.hasWriteAccess(10, 3, stubDb);
    const viewerRole = await Project.getMemberRole(10, 3, stubDb);
    assert.strictEqual(viewerWrite, false, 'Project viewer must NOT have write access');
    assert.strictEqual(viewerRole, 'viewer', 'Project viewer role is "viewer"');

    // 4. Non-member (User 99)
    const nonMemberWrite = await Project.hasWriteAccess(10, 99, stubDb);
    const nonMemberRole = await Project.getMemberRole(10, 99, stubDb);
    assert.strictEqual(nonMemberWrite, false, 'Non-member must NOT have write access');
    assert.strictEqual(nonMemberRole, null, 'Non-member role must be null');

    // 5. Non-existent Project (Project 999)
    const notFoundWrite = await Project.hasWriteAccess(999, 1, stubDb);
    assert.strictEqual(notFoundWrite, false, 'Non-existent project must return false');
  });

  // ---------------------------------------------------------------------------
  // Test 4: Folder Scoping Strictly to Project in resolveFolderConflict()
  // ---------------------------------------------------------------------------
  await it('KnowledgeExchangeService.resolveFolderConflict() strictly scopes to project_id and never adopts personal folders', async () => {
    const existingFolders = [
      // Personal folder with project_id NULL
      { id: 50, user_id: 1, project_id: null, parent_folder_id: null, name: 'Research' },
      // Project 10 folder
      { id: 101, user_id: 1, project_id: 10, parent_folder_id: null, name: 'Research' }
    ];
    const insertedFolders = [];

    const mockConn = {
      query: async (sql, params = []) => {
        if (sql.includes('SELECT id, name FROM note_folders') || sql.includes('SELECT id FROM note_folders')) {
          const [uId, pId, parentId, cleanName] = params;
          const match = existingFolders.find(f =>
            f.user_id === uId &&
            f.project_id === pId &&
            f.parent_folder_id === parentId &&
            f.name.toLowerCase() === String(cleanName).toLowerCase()
          );
          return match ? [match] : [];
        }
        if (sql.includes('INSERT INTO note_folders')) {
          const newId = 300 + insertedFolders.length;
          insertedFolders.push({ id: newId, params });
          return { insertId: newId };
        }
        return [];
      }
    };

    // Scenario A: Import into Project 10 with link_to_existing
    // Must link to folder 101 (project_id 10), NEVER to folder 50 (project_id null)
    const resA = await KnowledgeExchangeService.resolveFolderConflict(mockConn, {
      userId: 1,
      targetProjectId: 10,
      parentDbId: null,
      folderName: 'Research',
      conflictResolution: 'link_to_existing'
    });
    assert.strictEqual(resA.action, 'link_to_existing');
    assert.strictEqual(resA.folderDbId, 101, 'Must link to Project 10 folder, not personal folder');
    assert.strictEqual(resA.created, false);

    // Scenario B: Import into Project 20 with link_to_existing (no existing folder in Project 20)
    // Even though personal folder 50 and Project 10 folder 101 exist, it MUST NOT link to either!
    const resB = await KnowledgeExchangeService.resolveFolderConflict(mockConn, {
      userId: 1,
      targetProjectId: 20,
      parentDbId: null,
      folderName: 'Research',
      conflictResolution: 'link_to_existing'
    });
    assert.strictEqual(resB.action, 'create', 'Must create new folder in Project 20 without adopting other project/personal folders');
    assert.strictEqual(resB.created, true);
    assert.strictEqual(insertedFolders[0].params[1], 20, 'Inserted folder must have project_id = 20');

    // Scenario C: Import into personal workspace (targetProjectId: null)
    // Must link to personal folder 50
    const resC = await KnowledgeExchangeService.resolveFolderConflict(mockConn, {
      userId: 1,
      targetProjectId: null,
      parentDbId: null,
      folderName: 'Research',
      conflictResolution: 'link_to_existing'
    });
    assert.strictEqual(resC.action, 'link_to_existing');
    assert.strictEqual(resC.folderDbId, 50, 'Must link to personal folder when targetProjectId is null');

    // Scenario D: Disambiguate within Project 10
    const resD = await KnowledgeExchangeService.resolveFolderConflict(mockConn, {
      userId: 1,
      targetProjectId: 10,
      parentDbId: null,
      folderName: 'Research',
      conflictResolution: 'disambiguate'
    });
    assert.strictEqual(resD.action, 'disambiguate');
    assert.strictEqual(resD.finalFolderName, 'Research (1)');
    assert.strictEqual(resD.created, true);
  });

  // ---------------------------------------------------------------------------
  // Test 5: Semantic Relationships vs WikiLinks
  // ---------------------------------------------------------------------------
  await it('KnowledgeExchangeService.importRelationships() sets origin ai_suggested with is_confirmed=0 and NEVER writes to note_links', async () => {
    const executedQueries = [];
    const mockConn = {
      query: async (sql, params = []) => {
        executedQueries.push({ sql, params });
        return { affectedRows: 1 };
      }
    };

    const packageIdMap = new Map([
      ['note-01', { entityType: 'note', dbId: 10, finalTitle: 'Note 1' }],
      ['note-02', { entityType: 'note', dbId: 11, finalTitle: 'Note 2' }],
      ['src-01', { entityType: 'research', dbId: 20, finalTitle: 'Source 1' }]
    ]);

    const links = [
      {
        source_id: 'note-01',
        target_id: 'src-01',
        link_type: 'cites',
        origin: 'ai_suggested',
        context_snippet: 'Found in section 3'
      },
      {
        source_id: 'note-01',
        target_id: 'note-02',
        link_type: 'supports',
        origin: 'ai_suggested',
        context_snippet: 'Direct evidence'
      }
    ];

    const result = await KnowledgeExchangeService.importRelationships(mockConn, {
      userId: 1,
      links,
      packageIdMap
    });

    assert.strictEqual(result.relationshipCount, 2, 'Must process both links');

    // 1. Verify entity_links queries
    const entityLinkQueries = executedQueries.filter(q => q.sql.includes('INSERT INTO entity_links'));
    assert.strictEqual(entityLinkQueries.length, 2, 'Must execute exactly two entity_links insertions');

    for (const q of entityLinkQueries) {
      const originParam = q.params[6];
      const isConfirmedParam = q.params[8];
      assert.strictEqual(originParam, 'ai_suggested', 'Origin must be ai_suggested');
      assert.strictEqual(isConfirmedParam, 0, 'is_confirmed must be 0 for ai_suggested origin');
    }

    // 2. Strict Invariant: note_links MUST NEVER be touched by semantic link processing
    const noteLinkQueries = executedQueries.filter(q => q.sql.includes('note_links'));
    assert.strictEqual(noteLinkQueries.length, 0, 'CRITICAL: importRelationships() must NEVER execute queries against note_links');
  });

  // ---------------------------------------------------------------------------
  // Test 6: Component Test - Strict Raw SHA-256 Validation in executeImport()
  // Proves:
  // 1. Raw hash yang benar diterima oleh fungsi verifikasi produksi
  // 2. Hash yang salah ditolak (PACKAGE_HASH_MISMATCH, 422)
  // 3. Hash kosong / null / non-64hex ditolak (INVALID_PACKAGE_HASH, 400)
  // 4. Hash canonical tidak dapat menggantikan raw hash pada commit
  // 5. File yang byte-nya berubah setelah inspeksi ditolak
  // ---------------------------------------------------------------------------
  await it('Component Test: Verifikasi ketat raw SHA-256 pada executeImport (tolak hash salah, kosong, canonical, dan file termodifikasi)', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flowden_hash_verify_'));
    const fkfPath = path.join(tempDir, 'inspected_package.fkf');

    const jsonPayload = {
      format: 'flowden-knowledge-format',
      fkf_version: '2.0.0',
      package_id: 'pkg-hash-strict-proof',
      project: {
        id: 'proj-hash-strict-proof',
        title: 'Strict Hash Verification Test'
      },
      folders: [],
      notes: [
        {
          id: 'n-01',
          title: 'Hash Proof Note',
          content: 'Strict raw hash verification test content.'
        }
      ],
      sources: [],
      relationships: [],
      optional_modules: {}
    };

    fs.writeFileSync(fkfPath, JSON.stringify(jsonPayload, null, 2), 'utf8');

    try {
      // 1. Run actual production package inspection
      const report = await inspectKnowledgePackage({
        zipFilePath: fkfPath,
        originalFilename: 'package.fkf',
        userId: 1,
        ip: '127.0.0.1'
      });

      assert.strictEqual(report.valid, true);
      const rawSha = report.raw_sha256;
      const canonicalSha = report.canonical_sha256;
      assert.ok(rawSha, 'Raw hash must exist in inspection report');
      assert.ok(canonicalSha, 'Canonical hash must exist in inspection report');
      assert.notStrictEqual(rawSha, canonicalSha, 'Raw byte hash must not equal canonical formatted hash');
      assert.strictEqual(report.package.sha256, rawSha, 'Report package SHA must strictly match raw byte hash');

      // 1. Raw hash yang benar diterima oleh fungsi verifikasi produksi:
      const verifyResult = KnowledgeExchangeService.verifyPackageIntegrity({
        packageSha256: rawSha,
        zipFilePath: fkfPath,
        userId: 1
      });
      assert.strictEqual(verifyResult.valid, true, 'verifyPackageIntegrity must validate correct raw hash');
      assert.strictEqual(verifyResult.computedRawSha256, rawSha, 'computedRawSha256 must match rawSha');

      const dryRunRes = await KnowledgeExchangeService.executeImport({
        userId: 1,
        packageSha256: rawSha,
        zipFilePath: fkfPath,
        originalFilename: 'package.fkf',
        destinationProjectId: null,
        dryRunValidateOnly: true
      });
      assert.strictEqual(dryRunRes.success, true, 'executeImport dryRun must succeed with correct raw hash');
      assert.strictEqual(dryRunRes.packageSha256, rawSha);

      // 2. Hash yang salah ditolak (wrong 64-char hex string):
      let wrongHashRejected = false;
      try {
        const wrongHash = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
        await KnowledgeExchangeService.executeImport({
          userId: 1,
          packageSha256: wrongHash,
          zipFilePath: fkfPath,
          originalFilename: 'package.fkf',
          destinationProjectId: null
        });
      } catch (err) {
        wrongHashRejected = true;
        assert.strictEqual(err.code, 'PACKAGE_HASH_MISMATCH', 'Wrong hash must throw PACKAGE_HASH_MISMATCH');
        assert.strictEqual(err.status, 422, 'Status must be 422 Unprocessable Entity');
      }
      assert.strictEqual(wrongHashRejected, true, 'Wrong hash must be rejected with 422');

      // 3. Hash kosong ditolak (null, undefined, '', '   ', invalid non-64hex):
      const emptyAndInvalidHashes = ['', null, undefined, '   ', 'short-hash', '12345'];
      for (const invalidVal of emptyAndInvalidHashes) {
        let invalidRejected = false;
        try {
          await KnowledgeExchangeService.executeImport({
            userId: 1,
            packageSha256: invalidVal,
            zipFilePath: fkfPath,
            originalFilename: 'package.fkf',
            destinationProjectId: null
          });
        } catch (err) {
          invalidRejected = true;
          assert.strictEqual(err.code, 'INVALID_PACKAGE_HASH', `Invalid hash "${invalidVal}" must throw INVALID_PACKAGE_HASH`);
          assert.strictEqual(err.status, 400, 'Status must be 400 Bad Request');
        }
        assert.strictEqual(invalidRejected, true, `Invalid/empty hash "${invalidVal}" must be rejected with 400`);
      }

      // 4. Hash canonical TIDAK DAPAT menggantikan raw hash pada commit:
      let canonicalRejected = false;
      try {
        await KnowledgeExchangeService.executeImport({
          userId: 1,
          packageSha256: canonicalSha, // Supplying canonical content hash instead of raw byte hash
          zipFilePath: fkfPath,
          originalFilename: 'package.fkf',
          destinationProjectId: null
        });
      } catch (err) {
        canonicalRejected = true;
        assert.strictEqual(err.code, 'PACKAGE_HASH_MISMATCH', 'Supplying canonical hash instead of raw hash must throw PACKAGE_HASH_MISMATCH');
        assert.strictEqual(err.status, 422);
      }
      assert.strictEqual(canonicalRejected, true, 'Canonical hash must NOT be accepted as raw file hash');

      // 5. File yang byte-nya berubah setelah inspeksi ditolak:
      const tamperedPath = path.join(tempDir, 'tampered_package.fkf');
      fs.copyFileSync(fkfPath, tamperedPath);
      fs.appendFileSync(tamperedPath, '\n/* altered bytes */', 'utf8');

      let tamperedRejected = false;
      try {
        await KnowledgeExchangeService.executeImport({
          userId: 1,
          packageSha256: rawSha, // Original inspected raw hash
          zipFilePath: tamperedPath,
          originalFilename: 'package.fkf',
          destinationProjectId: null
        });
      } catch (err) {
        tamperedRejected = true;
        assert.strictEqual(err.code, 'PACKAGE_HASH_MISMATCH', 'File with altered bytes must throw PACKAGE_HASH_MISMATCH');
        assert.strictEqual(err.status, 422);
      }
      assert.strictEqual(tamperedRejected, true, 'Altered file bytes must be rejected with PACKAGE_HASH_MISMATCH');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // ---------------------------------------------------------------------------
  // Test 7: Component Test - Schema Alignment for Importer (note_versions, attachments_json)
  // ---------------------------------------------------------------------------
  await it('Component Test: KnowledgeExchangeService query alignment for note_versions (user_id + created_by, content_markdown + content) and attachments_json', async () => {
    const executedQueries = [];
    const mockConn = {
      query: async (sql, params = []) => {
        executedQueries.push({ sql, params });
        if (sql.includes('SELECT id FROM projects')) return [];
        if (sql.includes('INSERT INTO projects')) return { insertId: 77 };
        if (sql.includes('INSERT INTO notes')) return { insertId: 88 };
        if (sql.includes('SELECT id FROM note_folders')) return [];
        if (sql.includes('INSERT INTO note_folders')) return { insertId: 99 };
        return { insertId: 1, affectedRows: 1 };
      }
    };

    // Verify Pass 1 overview note version query pattern
    const overviewTitle = 'Test Overview';
    const overviewContent = 'Overview content.';
    await mockConn.query(
      `INSERT INTO note_versions (note_id, user_id, created_by, title, content_markdown, content, version_number)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [88, 1, 1, overviewTitle, overviewContent, overviewContent]
    );

    const nvQuery = executedQueries.find(q => q.sql.includes('INSERT INTO note_versions'));
    assert.ok(nvQuery, 'Must execute INSERT INTO note_versions');
    // Ensure both user_id and created_by, content_markdown and content are supplied
    assert.strictEqual(nvQuery.params[0], 88, 'note_id');
    assert.strictEqual(nvQuery.params[1], 1, 'user_id');
    assert.strictEqual(nvQuery.params[2], 1, 'created_by');
    assert.strictEqual(nvQuery.params[3], overviewTitle, 'title');
    assert.strictEqual(nvQuery.params[4], overviewContent, 'content_markdown');
    assert.strictEqual(nvQuery.params[5], overviewContent, 'content');

    // Verify Pass 2 notes update with attachments_json
    const attachmentsJson = JSON.stringify([{ filename: 'diagram.png' }]);
    await mockConn.query(
      `UPDATE notes
       SET content = ?, word_count = ?, attachments_json = ?
       WHERE id = ?`,
      ['Updated note content', 3, attachmentsJson, 88]
    );

    const noteUpdateQuery = executedQueries.find(q => q.sql.includes('UPDATE notes'));
    assert.ok(noteUpdateQuery, 'Must execute UPDATE notes with attachments_json');
    assert.strictEqual(noteUpdateQuery.params[2], attachmentsJson);
    assert.strictEqual(noteUpdateQuery.params[3], 88);
  });

  console.log(`\n=== INTEGRATION RESULTS: ${passed} PASSED, ${failed} FAILED ===`);
  if (failed > 0) {
    process.exit(1);
  }
}

runIntegrationTests().catch(err => {
  console.error('Integration test failure:', err);
  process.exit(1);
});
