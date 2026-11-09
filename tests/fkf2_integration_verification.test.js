/**
 * Flowden FKF 2.0 Integration & Inspection Verification Suite
 *
 * Verifies:
 * 1. Package inspection on a standalone .fkf JSON file via packageInspectionService
 * 2. Package inspection backward-compatibility on reference .flowden.zip v1 package (fails if fixture missing)
 * 3. Folder conflict resolution using the actual KnowledgeExchangeService.resolveFolderConflict() importer method
 * 4. Semantic relationship import using the actual KnowledgeExchangeService.importRelationships() importer method
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { inspectKnowledgePackage } = require('../server/services/packageInspectionService');
const KnowledgeExchangeService = require('../server/services/knowledgeExchangeService');

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
  // Test 3: Actual KnowledgeExchangeService.resolveFolderConflict() importer method
  // ---------------------------------------------------------------------------
  await it('KnowledgeExchangeService.resolveFolderConflict() resolves all policies: disambiguate, skip, link_to_existing', async () => {
    const existingDbFolders = [
      { id: 101, name: 'Background Research', parent_folder_id: null, project_id: 1 }
    ];
    const insertedRows = [];

    // Recorded spy mock connection
    const mockConn = {
      query: async (sql, params = []) => {
        if (sql.includes('SELECT id, name FROM note_folders') || sql.includes('SELECT id FROM note_folders')) {
          const nameParam = params[params.length - 1];
          const parentParam = params[params.length - 2];
          const match = existingDbFolders.find(
            f => (f.parent_folder_id === parentParam || (f.parent_folder_id === null && parentParam === null)) &&
                 f.name.toLowerCase() === String(nameParam).toLowerCase()
          );
          return match ? [match] : [];
        }
        if (sql.includes('INSERT INTO note_folders')) {
          const newId = 200 + insertedRows.length;
          insertedRows.push({ id: newId, sql, params });
          return { insertId: newId };
        }
        return [];
      }
    };

    // 1. Policy: link_to_existing (re-use existing folder id 101)
    const resLink = await KnowledgeExchangeService.resolveFolderConflict(mockConn, {
      userId: 1,
      targetProjectId: 1,
      parentDbId: null,
      folderName: 'Background Research',
      conflictResolution: 'link_to_existing'
    });
    assert.strictEqual(resLink.action, 'link_to_existing');
    assert.strictEqual(resLink.folderDbId, 101);
    assert.strictEqual(resLink.created, false);

    // 2. Policy: skip (re-map to parent/root)
    const resSkip = await KnowledgeExchangeService.resolveFolderConflict(mockConn, {
      userId: 1,
      targetProjectId: 1,
      parentDbId: null,
      folderName: 'Background Research',
      conflictResolution: 'skip'
    });
    assert.strictEqual(resSkip.action, 'skip');
    assert.strictEqual(resSkip.folderDbId, null);
    assert.strictEqual(resSkip.created, false);

    // 3. Policy: disambiguate (creates "Background Research (1)")
    const resDis = await KnowledgeExchangeService.resolveFolderConflict(mockConn, {
      userId: 1,
      targetProjectId: 1,
      parentDbId: null,
      folderName: 'Background Research',
      conflictResolution: 'disambiguate'
    });
    assert.strictEqual(resDis.action, 'disambiguate');
    assert.strictEqual(resDis.finalFolderName, 'Background Research (1)');
    assert.strictEqual(resDis.created, true);

    // 4. No collision: creates clean folder
    const resNew = await KnowledgeExchangeService.resolveFolderConflict(mockConn, {
      userId: 1,
      targetProjectId: 1,
      parentDbId: null,
      folderName: 'Experimental Labs',
      conflictResolution: 'disambiguate'
    });
    assert.strictEqual(resNew.action, 'create');
    assert.strictEqual(resNew.finalFolderName, 'Experimental Labs');
    assert.strictEqual(resNew.created, true);
  });

  // ---------------------------------------------------------------------------
  // Test 4: Actual KnowledgeExchangeService.importRelationships() importer method
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
      // Params index 6: origin, index 8: is_confirmed
      const originParam = q.params[6];
      const isConfirmedParam = q.params[8];
      assert.strictEqual(originParam, 'ai_suggested', 'Origin must be ai_suggested');
      assert.strictEqual(isConfirmedParam, 0, 'is_confirmed must be 0 for ai_suggested origin');
    }

    // 2. Strict Invariant: note_links MUST NEVER be touched by semantic link processing
    const noteLinkQueries = executedQueries.filter(q => q.sql.includes('note_links'));
    assert.strictEqual(noteLinkQueries.length, 0, 'CRITICAL: importRelationships() must NEVER execute queries against note_links');
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
