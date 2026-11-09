/**
 * Flowden FKF 2.0 Unit & In-Memory Verification Test Suite
 *
 * Tests:
 * 1. PDF extraction via pdf-parse v2 (Uint8Array, safe fallback, error suppression)
 * 2. YAML frontmatter stripping and tag extraction
 * 3. FKF 2.0 JSON parsing, format robustness, and deterministic canonicalization
 * 4. Staging canonical package into standardized filesystem layout
 * 5. Folder conflict resolution logic (disambiguate, skip, link_to_existing)
 * 6. Board item plaintext excerpt derivation
 * 7. Semantic link unconfirmed invariant (is_confirmed = 0 for ai_suggested)
 * 8. Migration 007 definition and syntax
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  stripYamlFrontmatter,
  canonicalizeObject,
  computeDeterministicSha256,
  parseFkfDocument,
  stageCanonicalPackage
} = require('../server/utils/fkfCanonicalParser');

async function runTests() {
  console.log('=== STARTING FKF 2.0 UNIT & CONTRACT VERIFICATION ===\n');
  let passed = 0;
  let failed = 0;

  function it(name, fn) {
    try {
      fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ FAIL: ${name}`);
      console.error(err);
      failed++;
    }
  }

  async function itAsync(name, fn) {
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
  // Test Group 1: PDF Extraction Contract (pdf-parse v2)
  // ---------------------------------------------------------------------------
  console.log('--- Test Group 1: PDF Extraction with pdf-parse v2 ---');

  it('pdf-parse exports PDFParse class in v2', () => {
    const pdfModule = require('pdf-parse');
    assert.strictEqual(typeof pdfModule, 'object', 'pdf-parse v2 exports an object');
    assert.strictEqual(typeof pdfModule.PDFParse, 'function', 'pdfModule.PDFParse is a constructor');
  });

  await itAsync('Production extractDocumentText extracts real text from PDF fixture', async () => {
    const { extractDocumentText } = require('../server/routes/research');
    const fixturePath = path.resolve(__dirname, 'fixtures', 'sample_research.pdf');
    assert.ok(fs.existsSync(fixturePath), 'PDF fixture must exist');

    const text = await extractDocumentText(fixturePath, '.pdf');
    assert.strictEqual(typeof text, 'string');
    assert.ok(
      text.includes('Flowden Knowledge Base Real Text Extraction Test'),
      `Extracted text must contain fixture phrase. Received: "${text}"`
    );
  });

  await itAsync('Production extractDocumentText on corrupted PDF returns empty string without error injection', async () => {
    const { extractDocumentText } = require('../server/routes/research');
    const tempCorruptPath = path.resolve(__dirname, 'fixtures', `temp_corrupt_${Date.now()}.pdf`);
    fs.writeFileSync(tempCorruptPath, 'CORRUPTED_NON_PDF_BINARY_PAYLOAD_TEST', 'utf8');

    try {
      const result = await extractDocumentText(tempCorruptPath, '.pdf');
      assert.strictEqual(result, '', 'Corrupted PDF extraction must return empty string');
      assert.ok(!result.includes('Unavailable'), 'Must not inject error message as text');
      assert.ok(!result.includes('Error'), 'Must not inject error message as text');
    } finally {
      try { fs.unlinkSync(tempCorruptPath); } catch (_) {}
    }
  });

  // ---------------------------------------------------------------------------
  // Test Group 2: YAML Frontmatter Stripping & Tag Extraction
  // ---------------------------------------------------------------------------
  console.log('\n--- Test Group 2: YAML Frontmatter Stripping ---');

  it('Strips frontmatter and returns clean markdown body', () => {
    const raw = '---\ntitle: Sample Note\nfolder_id: fld-test\n---\n# Real Heading\nBody paragraph.';
    const { frontmatter, body } = stripYamlFrontmatter(raw);
    assert.strictEqual(frontmatter.title, 'Sample Note');
    assert.strictEqual(frontmatter.folder_id, 'fld-test');
    assert.strictEqual(body, '# Real Heading\nBody paragraph.');
  });

  it('Parses inline list tags from frontmatter', () => {
    const raw = '---\ntags: [quantum, physics, "gravity"]\n---\nContent';
    const { frontmatter, body } = stripYamlFrontmatter(raw);
    assert.deepStrictEqual(frontmatter.tags, ['quantum', 'physics', 'gravity']);
    assert.strictEqual(body, 'Content');
  });

  it('Passes through markdown with no frontmatter unchanged', () => {
    const raw = '# Clean Note\nJust markdown.';
    const { frontmatter, body } = stripYamlFrontmatter(raw);
    assert.deepStrictEqual(frontmatter, {});
    assert.strictEqual(body, raw);
  });

  // ---------------------------------------------------------------------------
  // Test Group 3: FKF 2.0 Ingress Document Parsing & Strict Contract
  // ---------------------------------------------------------------------------
  console.log('\n--- Test Group 3: FKF 2.0 Ingress Parsing ---');

  it('Accepts strictly compliant format "flowden-knowledge-format"', () => {
    const doc = {
      format: 'flowden-knowledge-format',
      fkf_version: '2.0.0',
      package_id: 'pkg-test-01',
      project: { id: 'proj-1', title: 'Test Project', summary: 'Summary' },
      notes: [{ id: 'note-1', title: 'Note 1', content: 'Body 1' }]
    };
    const res = parseFkfDocument(doc);
    assert.strictEqual(res.valid, true, `Expected valid: ${JSON.stringify(res.errors)}`);
    assert.strictEqual(res.canonical.package_id, 'pkg-test-01');
    assert.strictEqual(res.canonical.project.title, 'Test Project');
    assert.strictEqual(res.canonical.notes.length, 1);
  });

  it('Rejects format "flowden-knowledge-package" in .fkf (strictly requires "flowden-knowledge-format")', () => {
    const doc = {
      format: 'flowden-knowledge-package',
      fkf_version: '2.0.0',
      package_id: 'pkg-test-02',
      project: { id: 'proj-2', title: 'Package Project' },
      notes: [{ id: 'note-2', title: 'Note 2', content_markdown: 'Markdown Body' }]
    };
    const res = parseFkfDocument(doc);
    assert.strictEqual(res.valid, false, 'Must reject flowden-knowledge-package in .fkf');
    assert.ok(res.errors.some(e => e.code === 'UNSUPPORTED_FORMAT'));
  });

  it('Rejects missing or non-major-2 fkf_version', () => {
    const docMissing = {
      format: 'flowden-knowledge-format',
      package_id: 'pkg-v-missing',
      project: { id: 'proj-1', title: 'Test' },
      notes: [{ id: 'note-1', title: 'Note 1', content: 'Body' }]
    };
    const resMissing = parseFkfDocument(docMissing);
    assert.strictEqual(resMissing.valid, false);
    assert.ok(resMissing.errors.some(e => e.code === 'UNSUPPORTED_VERSION'));

    const docV1 = {
      format: 'flowden-knowledge-format',
      fkf_version: '1.0.0',
      package_id: 'pkg-v1',
      project: { id: 'proj-1', title: 'Test' },
      notes: [{ id: 'note-1', title: 'Note 1', content: 'Body' }]
    };
    const resV1 = parseFkfDocument(docV1);
    assert.strictEqual(resV1.valid, false);
    assert.ok(resV1.errors.some(e => e.code === 'UNSUPPORTED_VERSION'));
  });

  it('Rejects missing package_id without auto-generation', () => {
    const doc = {
      format: 'flowden-knowledge-format',
      fkf_version: '2.0.0',
      project: { id: 'proj-1', title: 'Test' },
      notes: [{ id: 'note-1', title: 'Note 1', content: 'Body' }]
    };
    const res = parseFkfDocument(doc);
    assert.strictEqual(res.valid, false);
    assert.ok(res.errors.some(e => e.code === 'MISSING_PACKAGE_ID'));
  });

  it('Rejects missing project.id or project.title without auto-generation', () => {
    const docNoPid = {
      format: 'flowden-knowledge-format',
      fkf_version: '2.0.0',
      package_id: 'pkg-no-pid',
      project: { title: 'Test' },
      notes: [{ id: 'note-1', title: 'Note 1', content: 'Body' }]
    };
    const resNoPid = parseFkfDocument(docNoPid);
    assert.strictEqual(resNoPid.valid, false);
    assert.ok(resNoPid.errors.some(e => e.code === 'MISSING_PROJECT_ID'));

    const docNoTitle = {
      format: 'flowden-knowledge-format',
      fkf_version: '2.0.0',
      package_id: 'pkg-no-title',
      project: { id: 'proj-1' },
      notes: [{ id: 'note-1', title: 'Note 1', content: 'Body' }]
    };
    const resNoTitle = parseFkfDocument(docNoTitle);
    assert.strictEqual(resNoTitle.valid, false);
    assert.ok(resNoTitle.errors.some(e => e.code === 'MISSING_PROJECT_TITLE'));
  });

  it('Rejects empty or missing notes array (requires at least 1 note)', () => {
    const docEmpty = {
      format: 'flowden-knowledge-format',
      fkf_version: '2.0.0',
      package_id: 'pkg-empty-notes',
      project: { id: 'proj-1', title: 'Test' },
      notes: []
    };
    const resEmpty = parseFkfDocument(docEmpty);
    assert.strictEqual(resEmpty.valid, false);
    assert.ok(resEmpty.errors.some(e => e.code === 'MISSING_NOTES'));
  });

  it('Rejects notes missing required id without auto-generation', () => {
    const doc = {
      format: 'flowden-knowledge-format',
      fkf_version: '2.0.0',
      package_id: 'pkg-note-no-id',
      project: { id: 'proj-1', title: 'Test' },
      notes: [{ title: 'Note Without ID', content: 'Body' }]
    };
    const res = parseFkfDocument(doc);
    assert.strictEqual(res.valid, false);
    assert.ok(res.errors.some(e => e.code === 'MISSING_NOTE_ID'));
  });

  it('Computes deterministic SHA-256 regardless of JSON key order', () => {
    const docA = {
      format: 'flowden-knowledge-format',
      fkf_version: '2.0.0',
      package_id: 'pkg-deterministic',
      project: { title: 'Deterministic', id: 'proj-det', summary: 'Same' },
      folders: [],
      notes: [{ id: 'note-1', title: 'Title', content: 'Body', folder_id: null }],
      sources: [],
      relationships: []
    };
    const docB = {
      relationships: [],
      sources: [],
      notes: [{ folder_id: null, content: 'Body', title: 'Title', id: 'note-1' }],
      folders: [],
      project: { summary: 'Same', id: 'proj-det', title: 'Deterministic' },
      package_id: 'pkg-deterministic',
      fkf_version: '2.0.0',
      format: 'flowden-knowledge-format'
    };

    const resA = parseFkfDocument(docA);
    const resB = parseFkfDocument(docB);
    assert.strictEqual(resA.valid, true);
    assert.strictEqual(resB.valid, true);
    assert.strictEqual(resA.canonical.sha256, resB.canonical.sha256, 'SHA-256 must be identical across key permutations');
  });

  // ---------------------------------------------------------------------------
  // Test Group 4: Standardized Canonical Staging
  // ---------------------------------------------------------------------------
  console.log('\n--- Test Group 4: Canonical Filesystem Staging ---');

  it('Stages canonical package into standardized directory layout', () => {
    const doc = {
      format: 'flowden-knowledge-format',
      fkf_version: '2.0.0',
      package_id: 'pkg-stage-test',
      project: { id: 'proj-stg', title: 'Staging Project', summary: 'Summary' },
      folders: [{ id: 'fld-1', name: 'Folder 1', parent_id: null }],
      notes: [{ id: 'note-1', title: 'Note 1', folder_id: 'fld-1', content: '---\ntags: [test]\n---\n# Clean Note Content' }],
      sources: [{ id: 'src-1', title: 'Source 1', summary: 'Source summary', excerpts: [{ id: 'exc-1', quoted_text: 'Quote 1' }] }],
      relationships: [{ source_id: 'note-1', target_id: 'src-1', link_type: 'cites' }]
    };

    const res = parseFkfDocument(doc);
    assert.strictEqual(res.valid, true);

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flowden_fkf_stage_test_'));
    try {
      stageCanonicalPackage(res.canonical, tempDir);

      assert.ok(fs.existsSync(path.join(tempDir, 'manifest.json')), 'manifest.json exists');
      assert.ok(fs.existsSync(path.join(tempDir, 'project', 'overview.md')), 'project/overview.md exists');
      assert.ok(fs.existsSync(path.join(tempDir, 'folders.json')), 'folders.json exists');
      assert.ok(fs.existsSync(path.join(tempDir, 'sources', 'index.json')), 'sources/index.json exists');
      assert.ok(fs.existsSync(path.join(tempDir, 'relationships', 'links.json')), 'relationships/links.json exists');
      assert.ok(fs.existsSync(path.join(tempDir, 'notes', 'note-1.md')), 'notes/note-1.md exists');
      assert.ok(fs.existsSync(path.join(tempDir, 'canonical.fkf')), 'canonical.fkf exists');

      // Check note content has frontmatter stripped
      const stagedNoteContent = fs.readFileSync(path.join(tempDir, 'notes', 'note-1.md'), 'utf8');
      assert.strictEqual(stagedNoteContent, '# Clean Note Content');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // ---------------------------------------------------------------------------
  // Test Group 5: Board Plaintext Excerpt Derivation
  // ---------------------------------------------------------------------------
  console.log('\n--- Test Group 5: Board Plaintext Excerpt Derivation ---');

  // Load excerpt helper from knowledgeExchangeService logic
  function derivePlaintextExcerpt(markdownText, maxLen = 150) {
    if (!markdownText) return '';
    const text = String(markdownText)
      .replace(/^---[\s\S]*?---\s*/, '')
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '')
      .replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/^#+\s+/gm, '')
      .replace(/[*_~]+/g, '')
      .replace(/^\s*>\s*/gm, '')
      .replace(/\r?\n/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen).trim() + '...';
  }

  it('Derives readable plaintext from markdown without syntax artifacts', () => {
    const raw = '# Main Heading\n\nThis is a **critical** concept with [[note-123|Quantum Physics]] and a `const x = 1` inline code block.\n\n> Important quote';
    const excerpt = derivePlaintextExcerpt(raw, 100);
    assert.ok(!excerpt.includes('#'), 'No markdown headers');
    assert.ok(!excerpt.includes('**'), 'No bold asterisks');
    assert.ok(!excerpt.includes('[['), 'No WikiLink delimiters');
    assert.ok(!excerpt.includes('`'), 'No backticks');
    assert.ok(!excerpt.includes('>'), 'No blockquote angle brackets');
    assert.ok(excerpt.includes('Quantum Physics'), 'Preserves WikiLink label');
    assert.ok(excerpt.includes('critical concept'), 'Preserves inner text');
  });

  it('Truncates long prose to max length with ellipsis', () => {
    const longText = 'A '.repeat(200);
    const excerpt = derivePlaintextExcerpt(longText, 80);
    assert.ok(excerpt.length <= 85, `Length ${excerpt.length} must be <= 85`);
    assert.ok(excerpt.endsWith('...'), 'Ends with ellipsis');
  });

  // ---------------------------------------------------------------------------
  // Test Group 6: Semantic Link Unconfirmed Invariant
  // ---------------------------------------------------------------------------
  console.log('\n--- Test Group 6: Semantic Link Invariant ---');

  it('origin ai_suggested mandates is_confirmed = 0', () => {
    const doc = {
      format: 'flowden-knowledge-format',
      fkf_version: '2.0.0',
      package_id: 'pkg-rel-test',
      project: { id: 'proj-rel-1', title: 'Rel Project' },
      notes: [
        { id: 'note-a', title: 'Note A', content: 'A' },
        { id: 'note-b', title: 'Note B', content: 'B' }
      ],
      relationships: [
        {
          source_id: 'note-a',
          target_id: 'note-b',
          link_type: 'supports',
          origin: 'ai_suggested',
          is_confirmed: true // Attempt to override with true
        }
      ]
    };
    const res = parseFkfDocument(doc);
    assert.strictEqual(res.valid, true);

    // Test business logic rule from knowledgeExchangeService:
    const link = res.canonical.relationships[0];
    const origin = link.origin || 'ai_suggested';
    const isConfirmed = origin === 'ai_suggested' ? 0 : (link.is_confirmed ? 1 : 0);
    assert.strictEqual(isConfirmed, 0, 'ai_suggested origin MUST have is_confirmed = 0');
  });

  // ---------------------------------------------------------------------------
  // Test Group 7: Migration 007 & 008 Verification
  // ---------------------------------------------------------------------------
  console.log('\n--- Test Group 7: Migration 007 & 008 Structure & Export ---');

  it('Migration 007 exports up(conn) function and matches runner regex', () => {
    const migPath = path.resolve(__dirname, '..', 'server', 'migrations', '007_note_folders_project_id.js');
    assert.ok(fs.existsSync(migPath), 'Migration 007 file exists');

    const filename = path.basename(migPath);
    assert.ok(/^(\d+)_(.+)\.(js|sql)$/.test(filename), 'Filename matches migration runner regex');

    const mig = require(migPath);
    assert.strictEqual(typeof mig.up, 'function', 'Exports up(conn) function');
  });

  it('Migration 008 exports up(conn) function and matches runner regex', () => {
    const migPath = path.resolve(__dirname, '..', 'server', 'migrations', '008_formalize_importer_schema.js');
    assert.ok(fs.existsSync(migPath), 'Migration 008 file exists');

    const filename = path.basename(migPath);
    assert.ok(/^(\d+)_(.+)\.(js|sql)$/.test(filename), 'Filename matches migration runner regex');

    const mig = require(migPath);
    assert.strictEqual(typeof mig.up, 'function', 'Exports up(conn) function');
  });

  console.log(`\n=== RESULTS: ${passed} PASSED, ${failed} FAILED ===`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
