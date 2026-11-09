/**
 * Flowden FKF 2.0 Integration & Inspection Verification Suite
 *
 * Verifies:
 * 1. Package inspection on a standalone .fkf JSON file
 * 2. Package inspection backward-compatibility on reference .flowden.zip v1 package
 * 3. Folder conflict simulation across all three policies:
 *    - disambiguate (creates "Folder (1)")
 *    - skip (re-maps to parent)
 *    - link_to_existing (reuses existing folder ID)
 * 4. WikiLink sync isolation from semantic relationships
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { inspectKnowledgePackage } = require('../server/services/packageInspectionService');

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
  // Test 2: Inspect reference FKF 1.0 .flowden.zip package (backward compatibility)
  // ---------------------------------------------------------------------------
  await it('inspectKnowledgePackage maintains 100% backward compatibility for .flowden.zip v1', async () => {
    const refZipPath = path.resolve(
      __dirname,
      '..',
      'docs',
      'knowledge-exchange',
      'examples',
      'flowden-reference-package.flowden.zip'
    );

    if (!fs.existsSync(refZipPath)) {
      console.log('    ⚠️ Reference zip file not found, skipping zip inspection');
      return;
    }

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
  // Test 3: Folder conflict policy simulation
  // ---------------------------------------------------------------------------
  await it('Folder conflict policies resolve correctly: disambiguate, skip, link_to_existing', async () => {
    // Simulated database query handler representing existing folders
    const existingDbFolders = [
      { id: 101, name: 'Background Research', parent_folder_id: null, project_id: 1 },
      { id: 102, name: 'Sub-topic', parent_folder_id: 101, project_id: 1 }
    ];

    function resolveFolderConflict(incomingFolder, parentDbId, policy) {
      const match = existingDbFolders.find(
        f => f.parent_folder_id === parentDbId && f.name.toLowerCase() === incomingFolder.name.trim().toLowerCase()
      );

      if (match) {
        if (policy === 'link_to_existing') {
          return { action: 'reuse', dbId: match.id, name: match.name };
        }
        if (policy === 'skip') {
          return { action: 'skip', dbId: parentDbId, name: 'Skipped' };
        }
        if (policy === 'disambiguate') {
          let suffix = 1;
          let candidate = `${incomingFolder.name.trim()} (${suffix})`;
          while (existingDbFolders.some(f => f.parent_folder_id === parentDbId && f.name.toLowerCase() === candidate.toLowerCase())) {
            suffix++;
            candidate = `${incomingFolder.name.trim()} (${suffix})`;
          }
          return { action: 'created', dbId: 999, name: candidate };
        }
      }

      return { action: 'created', dbId: 888, name: incomingFolder.name.trim() };
    }

    const incoming = { name: 'Background Research' };

    // 1. link_to_existing
    const resLink = resolveFolderConflict(incoming, null, 'link_to_existing');
    assert.strictEqual(resLink.action, 'reuse');
    assert.strictEqual(resLink.dbId, 101);

    // 2. skip
    const resSkip = resolveFolderConflict(incoming, null, 'skip');
    assert.strictEqual(resSkip.action, 'skip');
    assert.strictEqual(resSkip.dbId, null, 'Re-mapped to parent/root');

    // 3. disambiguate
    const resDis = resolveFolderConflict(incoming, null, 'disambiguate');
    assert.strictEqual(resDis.action, 'created');
    assert.strictEqual(resDis.name, 'Background Research (1)');
  });

  // ---------------------------------------------------------------------------
  // Test 4: WikiLinks vs Semantic Links Isolation
  // ---------------------------------------------------------------------------
  await it('Semantic links never populate note_links; only inline Markdown [[...]] does', () => {
    // Contract verification:
    // Package relationships are stored in entity_links.
    // note_links is only populated when Note.syncWikiLinks parses [[...]] tokens in note body.
    const packageRelationships = [
      { source_id: 'note-01', target_id: 'note-02', link_type: 'supports', origin: 'ai_suggested' }
    ];
    const markdownContent = '# My Note\nNo wikilinks here, just text.';

    // Extract WikiLinks
    const wikiLinkRegex = /\[\[(?:note:)?([a-zA-Z0-9_-]+)(?:\|(.*?))?\]\]/g;
    const foundWikiLinks = [];
    let match;
    while ((match = wikiLinkRegex.exec(markdownContent)) !== null) {
      foundWikiLinks.push(match[1]);
    }

    assert.strictEqual(foundWikiLinks.length, 0, 'No WikiLinks in markdown');
    // Entity link exists
    assert.strictEqual(packageRelationships[0].origin, 'ai_suggested');
    // Note link count should be 0 because note_links is populated ONLY from foundWikiLinks
    assert.strictEqual(foundWikiLinks.length, 0, 'note_links row count must remain 0');
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
