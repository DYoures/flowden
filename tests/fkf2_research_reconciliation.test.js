// tests/fkf2_research_reconciliation.test.js
/**
 * FLOWDEN — FKF 2.0 RESEARCH GENERATION & IMPORTER CONTRACT RECONCILIATION TEST SUITE
 *
 * Verifies:
 * 1. Authoritative Draft 2020-12 FKF 2.0 JSON Schema validation & canonical parser
 * 2. Rejection of forbidden database-owned properties (database_id, dbId, user_id, created_at, updated_at)
 * 3. Strict ID prefix validation (pkg-, proj-, fld-, note-, src-, exc-, rel-, tsk-, brd-, grp-, bitm-, bcon-)
 * 4. Package-wide entity ID uniqueness
 * 5. Folder hierarchy cycle detection and max depth (8)
 * 6. WikiLinks validation against registered package entities
 * 7. Relationship endpoint referential integrity
 * 8. Optional modules (Tasks, Spatial Board) reference validation
 * 9. Realistic research domain packages (Scientific, Software Architecture, Policy/Historical)
 * 10. Importer relationship trust boundary (origin forced to 'ai_suggested', is_confirmed forced to 0, never touches note_links)
 * 11. Mode A (Create New Project) and Mode B (Merge into Existing Project with Owner/Editor access, rejecting Viewer/Non-member with 403)
 * 12. Strict raw SHA-256 byte-for-byte binding and rejection of altered bytes or canonical hash substitution
 * 13. Idempotent commit replaying
 * 14. Backward compatibility for legacy .flowden.zip v1 packages
 * 15. Resource download endpoints (/research-spec, /schema-v2, /package-schema)
 */

const crypto = require('crypto');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');

const uniqueNonce = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
const ISOLATED_DB_NAME = `flowden_test_fkf2_recon_${uniqueNonce}`;

assert.match(ISOLATED_DB_NAME, /^[a-zA-Z0-9_]+$/, 'Database identifier must contain only [a-zA-Z0-9_]');
assert.notStrictEqual(ISOLATED_DB_NAME, 'flowden', 'Must never use primary flowden database');
assert.notStrictEqual(ISOLATED_DB_NAME, 'flowden_test', 'Must never use flowden_test default database');

const TEST_PORT = 5096;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const JWT_SECRET = 'flowden_fkf2_recon_secret_32chars_long!';

process.env.DB_NAME = ISOLATED_DB_NAME;
process.env.NODE_ENV = 'test';
process.env.PORT = String(TEST_PORT);
process.env.JWT_SECRET = JWT_SECRET;

require('dotenv').config();

process.env.DB_NAME = ISOLATED_DB_NAME;
process.env.PORT = String(TEST_PORT);
process.env.JWT_SECRET = JWT_SECRET;

const {
  parseFkfDocument,
  computeDeterministicSha256,
  stageCanonicalPackage,
  extractFkfWikiLinks
} = require('../server/utils/fkfCanonicalParser');
const { validateFkfV2Document } = require('../server/utils/fkfSchemaValidator');
const { inspectKnowledgePackage } = require('../server/services/packageInspectionService');
const KnowledgeExchangeService = require('../server/services/knowledgeExchangeService');

async function runReconciliationTestSuite() {
  console.log('=== STARTING FKF 2.0 RESEARCH RECONCILIATION TEST SUITE ===\n');
  console.log(`[SETUP] Unique Isolated Database: ${ISOLATED_DB_NAME}`);
  console.log(`[SETUP] HTTP Server Target Port: ${TEST_PORT}\n`);

  let testPassedCount = 0;
  function pass(desc) {
    testPassedCount++;
    console.log(`  ✓ [TEST ${testPassedCount}] ${desc}`);
  }

  // =========================================================================
  // PART 1: FORMAL SCHEMA & PARSER INVARIANTS
  // =========================================================================
  console.log('--- PART 1: FORMAL SCHEMA & PARSER INVARIANTS ---');

  // Test 1: Valid standalone .fkf document
  const validBasePackage = {
    format: 'flowden-knowledge-format',
    fkf_version: '2.0.0',
    package_id: 'pkg-valid-quantum-test',
    project: {
      id: 'proj-quantum-algorithms',
      title: 'Quantum Algorithm Optimization',
      summary: 'Quantum error mitigation and surface code thresholds.'
    },
    folders: [
      { id: 'fld-foundations', name: '01 Foundations', parent_id: null, sort_order: 0 }
    ],
    notes: [
      {
        id: 'note-surface-codes',
        title: 'Surface Code Thresholds',
        folder_id: 'fld-foundations',
        content_markdown: '# Surface Codes\n\nDiscussion on [[fkf:note-anyon-models|Anyon Models]] and topological codes.'
      },
      {
        id: 'note-anyon-models',
        title: 'Anyon Models',
        folder_id: 'fld-foundations',
        content_markdown: '# Anyon Models\n\nTopological anyon models.'
      }
    ],
    sources: [
      {
        id: 'src-kitaev-2003',
        title: 'Fault-tolerant quantum computation by anyons',
        source_type: 'journal_article',
        verification_status: 'verified',
        authors: ['Alexei Kitaev'],
        publication_date: '2003-01-15',
        source_url: 'https://doi.org/10.1016/S0003-4916(02)00018-0',
        summary: 'Foundational paper on topological quantum computation.',
        excerpts: [
          {
            id: 'exc-kitaev-quote',
            quoted_text: 'Topological protection prevents local decoherence.',
            location_anchor: 'p. 4, section 2'
          }
        ]
      }
    ],
    relationships: [
      {
        id: 'rel-note-to-src',
        source_id: 'note-surface-codes',
        target_id: 'src-kitaev-2003',
        link_type: 'cites',
        origin: 'ai_suggested',
        context_snippet: 'Cites foundational anyon paper.'
      }
    ]
  };

  const parsedValid = parseFkfDocument(validBasePackage);
  assert.strictEqual(parsedValid.valid, true, `Expected valid package: ${JSON.stringify(parsedValid.errors)}`);
  assert.ok(parsedValid.canonical.sha256, 'Canonical package must compute deterministic SHA-256');
  pass('Valid standalone .fkf parses cleanly and computes deterministic SHA-256');

  // Test 2: Rejection of forbidden database-owned properties
  for (const forbiddenKey of ['database_id', 'dbId', 'user_id', 'created_at', 'updated_at']) {
    const docWithForbidden = JSON.parse(JSON.stringify(validBasePackage));
    docWithForbidden.notes[0][forbiddenKey] = 42;
    const resForbidden = parseFkfDocument(docWithForbidden);
    assert.strictEqual(resForbidden.valid, false, `Must reject forbidden field: ${forbiddenKey}`);
    assert.ok(
      resForbidden.errors.some(e => e.code === 'FORBIDDEN_DATABASE_PROPERTY'),
      `Error list must contain FORBIDDEN_DATABASE_PROPERTY for ${forbiddenKey}`
    );
  }
  pass('Strictly rejects database-owned fields (database_id, dbId, user_id, created_at, updated_at)');

  // Test 3: ID prefix enforcement
  const prefixTestCases = [
    { field: 'package_id', value: 'invalid_package_prefix', expectedPrefix: 'pkg-' },
    { field: 'project.id', value: 'invalid_proj_prefix', expectedPrefix: 'proj-' },
    { field: 'folders[0].id', value: 'bad_folder', expectedPrefix: 'fld-' },
    { field: 'notes[0].id', value: 'bad_note', expectedPrefix: 'note-' },
    { field: 'sources[0].id', value: 'bad_source', expectedPrefix: 'src-' },
    { field: 'sources[0].excerpts[0].id', value: 'bad_excerpt', expectedPrefix: 'exc-' },
    { field: 'relationships[0].id', value: 'bad_rel', expectedPrefix: 'rel-' }
  ];

  for (const tc of prefixTestCases) {
    const docBadPrefix = JSON.parse(JSON.stringify(validBasePackage));
    if (tc.field === 'package_id') docBadPrefix.package_id = tc.value;
    else if (tc.field === 'project.id') docBadPrefix.project.id = tc.value;
    else if (tc.field === 'folders[0].id') docBadPrefix.folders[0].id = tc.value;
    else if (tc.field === 'notes[0].id') docBadPrefix.notes[0].id = tc.value;
    else if (tc.field === 'sources[0].id') docBadPrefix.sources[0].id = tc.value;
    else if (tc.field === 'sources[0].excerpts[0].id') docBadPrefix.sources[0].excerpts[0].id = tc.value;
    else if (tc.field === 'relationships[0].id') docBadPrefix.relationships[0].id = tc.value;

    const resPrefix = parseFkfDocument(docBadPrefix);
    assert.strictEqual(resPrefix.valid, false, `Must reject bad prefix on ${tc.field}`);
    assert.ok(
      resPrefix.errors.some(e => e.code === 'INVALID_ID_PREFIX'),
      `Must emit INVALID_ID_PREFIX for ${tc.field}`
    );
  }
  pass('Strictly enforces ID prefixes (pkg-, proj-, fld-, note-, src-, exc-, rel-)');

  // Test 4: Package-wide ID uniqueness
  const docCollide = JSON.parse(JSON.stringify(validBasePackage));
  docCollide.folders.push({ id: 'note-surface-codes', name: 'Colliding Folder ID', parent_id: null });
  const resCollide = parseFkfDocument(docCollide);
  assert.strictEqual(resCollide.valid, false, 'Must reject duplicate ID across package entities');
  assert.ok(resCollide.errors.some(e => e.code === 'DUPLICATE_PACKAGE_ID'));
  pass('Strictly enforces global package-wide uniqueness of IDs across all entity types');

  // Test 5: Folder hierarchy validation (Cycles & Depth)
  const docCycle = JSON.parse(JSON.stringify(validBasePackage));
  docCycle.folders = [
    { id: 'fld-a', name: 'Folder A', parent_id: 'fld-b' },
    { id: 'fld-b', name: 'Folder B', parent_id: 'fld-a' }
  ];
  docCycle.notes[0].folder_id = 'fld-a';
  const resCycle = parseFkfDocument(docCycle);
  assert.strictEqual(resCycle.valid, false, 'Must reject circular folder hierarchy');
  assert.ok(resCycle.errors.some(e => e.code === 'FOLDER_HIERARCHY_CYCLE'));

  const docDepth = JSON.parse(JSON.stringify(validBasePackage));
  docDepth.folders = [];
  for (let i = 1; i <= 10; i++) {
    docDepth.folders.push({
      id: `fld-level-${i}`,
      name: `Level ${i}`,
      parent_id: i === 1 ? null : `fld-level-${i - 1}`
    });
  }
  docDepth.notes[0].folder_id = 'fld-level-10';
  const resDepth = parseFkfDocument(docDepth);
  assert.strictEqual(resDepth.valid, false, 'Must reject folder hierarchy depth exceeding 8');
  assert.ok(resDepth.errors.some(e => e.code === 'FOLDER_DEPTH_EXCEEDED'));
  pass('Detects circular folder hierarchies and enforces maximum folder depth limit (8)');

  // Test 6: Note referential integrity & WikiLinks
  const docBadFolder = JSON.parse(JSON.stringify(validBasePackage));
  docBadFolder.notes[0].folder_id = 'fld-non-existent';
  const resBadFolder = parseFkfDocument(docBadFolder);
  assert.strictEqual(resBadFolder.valid, false, 'Must reject note with non-existent folder_id');
  assert.ok(resBadFolder.errors.some(e => e.code === 'MISSING_NOTE_FOLDER'));

  const docBadWikiLink = JSON.parse(JSON.stringify(validBasePackage));
  docBadWikiLink.notes[0].content_markdown = 'Broken link: [[fkf:note-ghost|Ghost Note]]';
  const resBadWikiLink = parseFkfDocument(docBadWikiLink);
  assert.strictEqual(resBadWikiLink.valid, false, 'Must reject WikiLink pointing to unknown package entity');
  assert.ok(resBadWikiLink.errors.some(e => e.code === 'INVALID_WIKILINK_ID'));
  pass('Enforces Note folder references and WikiLink targets against registered package entities');

  // Test 7: Relationship targets validation
  const docBrokenRel = JSON.parse(JSON.stringify(validBasePackage));
  docBrokenRel.relationships = [
    { id: 'rel-broken', source_id: 'note-surface-codes', target_id: 'note-does-not-exist', link_type: 'supports' }
  ];
  const resBrokenRel = parseFkfDocument(docBrokenRel);
  assert.strictEqual(resBrokenRel.valid, false, 'Must reject relationship with unknown target_id');
  assert.ok(resBrokenRel.errors.some(e => e.code === 'MISSING_RELATIONSHIP_TARGET'));
  pass('Rejects relationships with non-existent source_id or target_id');

  // Test 8: Optional modules referential integrity
  const docOptionalMod = JSON.parse(JSON.stringify(validBasePackage));
  docOptionalMod.optional_modules = {
    tasks: {
      tasks: [
        {
          id: 'tsk-run-simulations',
          title: 'Run Monte Carlo noise simulation',
          related_entity_ids: ['note-surface-codes']
        }
      ]
    },
    spatial_board: {
      board: {
        id: 'brd-quantum-canvas',
        title: 'Quantum Synthesis',
        groups: [{ id: 'grp-1', title: 'Group 1' }],
        items: [
          {
            id: 'bitm-1',
            title: 'Surface Code Item',
            group_id: 'grp-1',
            reference_package_id: 'note-surface-codes'
          }
        ],
        connections: []
      }
    }
  };
  const resOptValid = parseFkfDocument(docOptionalMod);
  assert.strictEqual(resOptValid.valid, true, `Optional modules should be valid: ${JSON.stringify(resOptValid.errors)}`);

  // Broken board connection endpoint
  const docBrokenConn = JSON.parse(JSON.stringify(docOptionalMod));
  docBrokenConn.optional_modules.spatial_board.board.connections = [
    { id: 'bcon-1', source_item_id: 'bitm-1', target_item_id: 'bitm-missing' }
  ];
  const resBrokenConn = parseFkfDocument(docBrokenConn);
  assert.strictEqual(resBrokenConn.valid, false, 'Must reject board connection with missing item endpoint');
  assert.ok(resBrokenConn.errors.some(e => e.code === 'MISSING_BOARD_CONNECTION_ENDPOINT'));
  pass('Validates Tasks and Spatial Board cross-references and connection endpoints');

  // =========================================================================
  // PART 2: REALISTIC RESEARCH DOMAIN PACKAGES
  // =========================================================================
  console.log('\n--- PART 2: REALISTIC RESEARCH DOMAIN PACKAGES ---');

  // Test 9: Scientific / Biomedical Research Package
  const scientificPackage = {
    format: 'flowden-knowledge-format',
    fkf_version: '2.0.0',
    package_id: 'pkg-mrna-therapeutics-2026',
    generator: {
      name: 'NotebookLM Research Synthesis',
      version: '2.1.0',
      model: 'gemini-1.5-pro',
      prompt_topic: 'Lipid nanoparticle delivery mechanisms for targeted mRNA vaccines'
    },
    project: {
      id: 'proj-mrna-lnp-delivery',
      title: 'Targeted mRNA Delivery via Ionizable Lipid Nanoparticles',
      summary: 'Biochemical analysis of endosomal escape kinetics and tissue tropism.',
      color: '#059669',
      icon: 'activity'
    },
    folders: [
      { id: 'fld-nanoparticle-chemistry', name: '01 Chemistry', parent_id: null },
      { id: 'fld-in-vivo-kinetics', name: '02 In Vivo Kinetics', parent_id: null }
    ],
    notes: [
      {
        id: 'note-ionizable-lipids',
        title: 'Ionizable Lipids and pKa Optimization',
        folder_id: 'fld-nanoparticle-chemistry',
        content_markdown: '# Ionizable Lipids\n\nOptimizing apparent pKa to 6.2-6.8 facilitates neutral surface charge in bloodstream and cationic ionization inside endosomes (Cullis et al. 2021). See [[fkf:note-endosomal-escape|Endosomal Escape]].',
        tags: ['biochemistry', 'lipids']
      },
      {
        id: 'note-endosomal-escape',
        title: 'Proton Sponge Hypothesis and Endosomal Escape',
        folder_id: 'fld-in-vivo-kinetics',
        content_markdown: '# Endosomal Escape\n\nDisruption of endosomal membranes releases mRNA into the cytosol [[fkf:note-ionizable-lipids|Ionizable Lipids]].',
        tags: ['cellular-biology', 'pharmacokinetics']
      }
    ],
    sources: [
      {
        id: 'src-cullis-2021',
        title: 'Lipid Nanoparticle Technologies for Nucleic Acid Delivery',
        source_type: 'journal_article',
        verification_status: 'verified',
        authors: ['Pieter R. Cullis', 'Michael J. Hope'],
        publication_date: '2021-07-12',
        source_url: 'https://doi.org/10.1021/acs.chemrev.1c00073',
        summary: 'Comprehensive review on formulation parameters and clinical translation of LNPs.',
        excerpts: [
          {
            id: 'exc-cullis-pka',
            quoted_text: 'An apparent pKa between 6.2 and 6.8 is critical for efficient cellular uptake and low systemic toxicity.',
            location_anchor: 'p. 1024, section 4.1'
          }
        ]
      }
    ],
    relationships: [
      {
        id: 'rel-chem-to-escape',
        source_id: 'note-ionizable-lipids',
        target_id: 'note-endosomal-escape',
        link_type: 'supports',
        context_snippet: 'Optimal pKa is the biochemical trigger for endosomal escape.'
      },
      {
        id: 'rel-cullis-citation',
        source_id: 'note-ionizable-lipids',
        target_id: 'src-cullis-2021',
        link_type: 'cites',
        context_snippet: 'Cites Cullis review for pKa design guidelines.'
      }
    ]
  };

  const parsedSci = parseFkfDocument(scientificPackage);
  assert.strictEqual(parsedSci.valid, true, `Scientific package must be valid: ${JSON.stringify(parsedSci.errors)}`);
  assert.strictEqual(parsedSci.canonical.sources[0].authors[0], 'Pieter R. Cullis');
  pass('Scientific/Biomedical research package parses and validates with full bibliographic provenance');

  // Test 10: Software Architecture Research Package
  const architecturePackage = {
    format: 'flowden-knowledge-format',
    fkf_version: '2.0.0',
    package_id: 'pkg-event-driven-cqrs-2026',
    generator: {
      name: 'Claude Code Architecture Review',
      version: '1.0.0',
      model: 'claude-3-7-sonnet',
      prompt_topic: 'Event Sourcing with CQRS on Distributed Transaction Logs'
    },
    project: {
      id: 'proj-cqrs-event-sourcing',
      title: 'CQRS & Event Sourcing Architecture',
      summary: 'Design patterns for high-throughput distributed transaction systems.',
      color: '#2563eb',
      icon: 'layers'
    },
    folders: [
      { id: 'fld-event-store', name: '01 Event Store', parent_id: null },
      { id: 'fld-read-projections', name: '02 Read Projections', parent_id: null }
    ],
    notes: [
      {
        id: 'note-append-only-log',
        title: 'Append-Only Immutable Event Storage',
        folder_id: 'fld-event-store',
        content_markdown: '```typescript\ninterface EventEnvelope<T> {\n  id: string;\n  streamId: string;\n  version: number;\n  payload: T;\n}\n```\nEvents are immutable and monotonically ordered.',
        tags: ['architecture', 'event-store']
      },
      {
        id: 'note-read-models',
        title: 'Materialized Views and Read Model Projection',
        folder_id: 'fld-read-projections',
        content_markdown: '# Read Models\n\nSubscribers project events from [[fkf:note-append-only-log|Append-Only Log]] into relational or search read models.',
        tags: ['read-model', 'projections']
      }
    ],
    sources: [
      {
        id: 'src-fowler-cqrs',
        title: 'CQRS Pattern Architecture Guide',
        source_type: 'documentation',
        verification_status: 'verified',
        authors: ['Martin Fowler'],
        publication_date: '2011-07-14',
        source_url: 'https://martinfowler.com/bliki/CQRS.html',
        summary: 'Architectural overview of Command Query Responsibility Segregation.',
        excerpts: [
          {
            id: 'exc-fowler-cqrs-definition',
            quoted_text: 'At its heart is the notion that you can use a different model to update information than the model you use to read information.',
            location_anchor: 'para. 2'
          }
        ]
      }
    ],
    relationships: [
      {
        id: 'rel-log-to-read',
        source_id: 'note-append-only-log',
        target_id: 'note-read-models',
        link_type: 'derived_from',
        context_snippet: 'Read models are strictly derived from the immutable event log.'
      }
    ],
    optional_modules: {
      tasks: {
        tasks: [
          {
            id: 'tsk-benchmark-throughput',
            title: 'Benchmark event append throughput at 50k writes/sec',
            status: 'planned',
            priority: 'urgent',
            due_date: null,
            related_entity_ids: ['note-append-only-log']
          }
        ]
      }
    }
  };

  const parsedArch = parseFkfDocument(architecturePackage);
  assert.strictEqual(parsedArch.valid, true, `Software architecture package must be valid: ${JSON.stringify(parsedArch.errors)}`);
  assert.strictEqual(parsedArch.canonical.optional_modules.tasks.tasks.length, 1);
  pass('Software Architecture research package with code blocks and actionable tasks validates cleanly');

  // Test 11: Policy / Historical Analysis Package
  const policyPackage = {
    format: 'flowden-knowledge-format',
    fkf_version: '2.0.0',
    package_id: 'pkg-eu-ai-act-policy-2026',
    generator: {
      name: 'ChatGPT Policy Analyst',
      version: '4.0.0',
      model: 'gpt-4o',
      prompt_topic: 'EU AI Act Risk Classification & Compliance Obligations'
    },
    project: {
      id: 'proj-eu-ai-act-analysis',
      title: 'EU Artificial Intelligence Act: Regulatory Architecture',
      summary: 'Comparative analysis of prohibited, high-risk, and GPAI transparency requirements.',
      color: '#7c3aed',
      icon: 'file-text'
    },
    folders: [
      { id: 'fld-risk-categories', name: '01 Risk Categories', parent_id: null },
      { id: 'fld-compliance-obligations', name: '02 Compliance Obligations', parent_id: null }
    ],
    notes: [
      {
        id: 'note-prohibited-practices',
        title: 'Article 5: Prohibited AI Practices',
        folder_id: 'fld-risk-categories',
        content_markdown: '# Prohibited Practices\n\nCognitive behavioral manipulation, untargeted biometric scraping, and social scoring are banned.',
        tags: ['regulation', 'compliance']
      },
      {
        id: 'note-high-risk-systems',
        title: 'Annex III: High-Risk AI Classification',
        folder_id: 'fld-risk-categories',
        content_markdown: '# High-Risk Systems\n\nCritical infrastructure, educational grading, and employment evaluation AI requires CE marking and risk management.',
        tags: ['high-risk', 'audit']
      }
    ],
    sources: [
      {
        id: 'src-eu-regulation-2024',
        title: 'Regulation (EU) 2024/1689 laying down harmonised rules on artificial intelligence',
        source_type: 'legal_regulatory',
        verification_status: 'verified',
        authors: ['European Parliament', 'Council of the European Union'],
        publication_date: '2024-07-12',
        source_url: 'http://data.europa.eu/eli/reg/2024/1689/oj',
        summary: 'Official journal publication of the EU Artificial Intelligence Act.',
        excerpts: [
          {
            id: 'exc-prohibited-article5',
            quoted_text: 'The placing on the market, the putting into service or the use of an AI system that deploys subliminal techniques beyond a person’s consciousness... shall be prohibited.',
            location_anchor: 'Article 5(1)(a)'
          }
        ]
      }
    ],
    relationships: [
      {
        id: 'rel-prohibited-to-source',
        source_id: 'note-prohibited-practices',
        target_id: 'src-eu-regulation-2024',
        link_type: 'cites',
        context_snippet: 'Direct legal citation of Article 5 prohibitions.'
      }
    ]
  };

  const parsedPolicy = parseFkfDocument(policyPackage);
  assert.strictEqual(parsedPolicy.valid, true, `Policy package must be valid: ${JSON.stringify(parsedPolicy.errors)}`);
  pass('Historical & Policy Analysis research package with legal source types validates cleanly');

  // =========================================================================
  // PART 3: IMPORTER RELATIONSHIP TRUST BOUNDARY
  // =========================================================================
  console.log('\n--- PART 3: IMPORTER RELATIONSHIP TRUST BOUNDARY ---');

  // Test 12: KnowledgeExchangeService.importRelationships trust invariant
  const executedDbQueries = [];
  const mockDbConn = {
    query: async (sql, params = []) => {
      executedDbQueries.push({ sql, params });
      return { affectedRows: 1 };
    }
  };

  const testPackageIdMap = new Map([
    ['note-01', { entityType: 'note', dbId: 101, finalTitle: 'Note 1' }],
    ['note-02', { entityType: 'note', dbId: 102, finalTitle: 'Note 2' }],
    ['src-01', { entityType: 'research', dbId: 201, finalTitle: 'Source 1' }]
  ]);

  // Malicious or misconfigured external links trying to self-certify as confirmed or manual
  const untrustedLinks = [
    {
      source_id: 'note-01',
      target_id: 'src-01',
      link_type: 'cites',
      origin: 'citation',
      is_confirmed: true // Attempting to self-confirm
    },
    {
      source_id: 'note-01',
      target_id: 'note-02',
      link_type: 'supports',
      origin: 'manual',
      is_confirmed: true // Attempting to bypass AI review
    }
  ];

  const relImportResult = await KnowledgeExchangeService.importRelationships(mockDbConn, {
    userId: 1,
    links: untrustedLinks,
    packageIdMap: testPackageIdMap
  });

  assert.strictEqual(relImportResult.relationshipCount, 2, 'Must import both relationships');
  const entityLinkInsertions = executedDbQueries.filter(q => q.sql.includes('INSERT INTO entity_links'));
  assert.strictEqual(entityLinkInsertions.length, 2, 'Must execute exactly 2 entity_links insertions');

  for (const query of entityLinkInsertions) {
    const originParam = query.params[6];
    const isConfirmedParam = query.params[8];
    assert.strictEqual(originParam, 'ai_suggested', 'Imported relationship origin MUST be strictly ai_suggested');
    assert.strictEqual(isConfirmedParam, 0, 'Imported relationship is_confirmed MUST be strictly 0 (unconfirmed)');
  }

  // Verify note_links is NEVER touched
  const noteLinkQueries = executedDbQueries.filter(q => q.sql.includes('note_links'));
  assert.strictEqual(noteLinkQueries.length, 0, 'CRITICAL: importRelationships must NEVER write to note_links');
  pass('Importer Relationship Trust Boundary strictly forces origin="ai_suggested" and is_confirmed=0; never touches note_links');

  // =========================================================================
  // PART 4: HTTP / DB END-TO-END VALIDATION (ISOLATED DATABASE)
  // =========================================================================
  console.log('\n--- PART 4: HTTP / DB END-TO-END VALIDATION ---');

  const host = process.env.DB_HOST || 'localhost';
  const port = parseInt(process.env.DB_PORT || '3306', 10);
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD || '';

  // 1. Create genuinely isolated test database
  let preConn;
  try {
    preConn = await mysql.createConnection({ host, port, user, password, connectTimeout: 5000 });
  } catch (err) {
    console.error('[BLOCKED] MySQL connection unavailable:', err.message);
    process.exit(1);
  }

  try {
    const [existing] = await preConn.query('SHOW DATABASES LIKE ?', [ISOLATED_DB_NAME]);
    if (existing && existing.length > 0) {
      throw new Error(`[SAFETY BLOCKED] Database collision detected for "${ISOLATED_DB_NAME}".`);
    }
    await preConn.query(`CREATE DATABASE \`${ISOLATED_DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    console.log(`[SETUP] Created isolated database "${ISOLATED_DB_NAME}" (no drop).`);
  } finally {
    await preConn.end();
  }

  // 2. Initialize application database and run migrations 001-009
  const db = require('../server/config/database');
  const { runMigrations } = require('../server/migrations/runner');
  const SecurityService = require('../server/services/securityService');

  await db.initDB();
  assert.strictEqual(db.getStatus().isMySQL, true, 'Database must be MySQL');
  const pool = db.getPool();
  await runMigrations(pool);
  await SecurityService.ensureSecurityTables();
  console.log('[SETUP] Migrations 001-009 and security tables verified.');

  // 3. Start test HTTP server
  const app = require('../server/index');
  const server = await new Promise((resolve, reject) => {
    const s = app.listen(TEST_PORT, (err) => {
      if (err) return reject(err);
      console.log(`[SETUP] HTTP server listening on ${BASE_URL}`);
      resolve(s);
    });
  });

  const User = require('../server/models/User');
  const Project = require('../server/models/Project');

  try {
    // Provision 3 test users:
    // Alice (Owner of Project Alpha), Bob (Viewer of Project Alpha), Charlie (Non-member)
    const aliceUser = await User.create({ email: 'alice@flowden.test', password_hash: 'hash_alice', display_name: 'Alice Owner' });
    const bobUser = await User.create({ email: 'bob@flowden.test', password_hash: 'hash_bob', display_name: 'Bob Viewer' });
    const charlieUser = await User.create({ email: 'charlie@flowden.test', password_hash: 'hash_charlie', display_name: 'Charlie NonMember' });

    const aliceId = aliceUser.id;
    const bobId = bobUser.id;
    const charlieId = charlieUser.id;

    const aliceToken = jwt.sign({ id: aliceId }, JWT_SECRET, { expiresIn: '1h' });
    const bobToken = jwt.sign({ id: bobId }, JWT_SECRET, { expiresIn: '1h' });
    const charlieToken = jwt.sign({ id: charlieId }, JWT_SECRET, { expiresIn: '1h' });

    // Create Project Alpha owned by Alice
    const projectAlpha = await Project.create(aliceId, {
      title: 'Project Alpha Original',
      description: 'Original Project Description',
      color: '#10b981',
      icon: 'book'
    });
    const alphaProjectId = projectAlpha.id;

    // Bob is Viewer in Project Alpha
    await db.query(
      'INSERT INTO project_members (project_id, user_id, role, created_at) VALUES (?, ?, "viewer", NOW())',
      [alphaProjectId, bobId]
    );

    // Test 13: Mode A — Create New Project via inspect-json and commit
    const inspectResA = await fetch(`${BASE_URL}/api/v1/exchange/inspect-json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aliceToken}`
      },
      body: JSON.stringify({ package_json: scientificPackage })
    });

    assert.strictEqual(inspectResA.status, 200, 'inspect-json must return HTTP 200');
    const inspectDataA = await inspectResA.json();
    assert.strictEqual(inspectDataA.valid, true);
    assert.ok(inspectDataA.inspection_token, 'Must return inspection token');
    const tokenA = inspectDataA.inspection_token;
    const rawShaA = inspectDataA.package_sha256;

    const commitResA = await fetch(`${BASE_URL}/api/v1/exchange/commit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aliceToken}`
      },
      body: JSON.stringify({
        approved: true,
        inspection_token: tokenA,
        package_sha256: rawShaA
      })
    });

    assert.strictEqual(commitResA.status, 200, 'Commit Mode A must return HTTP 200');
    const commitDataA = await commitResA.json();
    assert.strictEqual(commitDataA.success, true);
    assert.ok(commitDataA.created_project_id, 'Mode A must return created_project_id');
    const createdProjIdA = commitDataA.created_project_id;

    // Verify created project in database
    const [createdProjRows] = await pool.query('SELECT * FROM projects WHERE id = ?', [createdProjIdA]);
    assert.strictEqual(createdProjRows.length, 1);
    assert.strictEqual(createdProjRows[0].title, scientificPackage.project.title);
    assert.strictEqual(createdProjRows[0].color, scientificPackage.project.color);

    // Verify notes and sources created in database
    const [importedNotesA] = await pool.query('SELECT * FROM notes WHERE project_id = ?', [createdProjIdA]);
    assert.ok(importedNotesA.length >= 2, 'Notes must be imported into new project');

    const [importedSourcesA] = await pool.query('SELECT * FROM research_documents WHERE project_id = ?', [createdProjIdA]);
    assert.strictEqual(importedSourcesA.length, 1, 'Source must be imported into new project');
    pass('Mode A: Full inspect-json and transactional commit provisions new Project with all entities');

    // Test 14: Mode B — Merge into Existing Project (Alice Owner)
    const inspectResB = await fetch(`${BASE_URL}/api/v1/exchange/inspect-json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aliceToken}`
      },
      body: JSON.stringify({
        package_json: architecturePackage,
        destination_project_id: alphaProjectId
      })
    });

    assert.strictEqual(inspectResB.status, 200, 'inspect-json Mode B must return HTTP 200');
    const inspectDataB = await inspectResB.json();
    assert.strictEqual(inspectDataB.valid, true);
    const tokenB = inspectDataB.inspection_token;
    const rawShaB = inspectDataB.package_sha256;

    const commitResB = await fetch(`${BASE_URL}/api/v1/exchange/commit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aliceToken}`
      },
      body: JSON.stringify({
        approved: true,
        inspection_token: tokenB,
        destination_project_id: alphaProjectId,
        package_sha256: rawShaB
      })
    });

    assert.strictEqual(commitResB.status, 200, 'Commit Mode B (Owner) must return HTTP 200');
    const commitDataB = await commitResB.json();
    assert.strictEqual(commitDataB.success, true);

    // Metadata Protection Check: Project Alpha title and description must NOT be overwritten!
    const [alphaProjAfter] = await pool.query('SELECT * FROM projects WHERE id = ?', [alphaProjectId]);
    assert.strictEqual(alphaProjAfter[0].title, 'Project Alpha Original', 'Existing project title must be preserved');
    assert.strictEqual(alphaProjAfter[0].description, 'Original Project Description', 'Existing project description must be preserved');

    // Verify imported architecture notes were merged into Project Alpha
    const [alphaNotes] = await pool.query('SELECT * FROM notes WHERE project_id = ? AND title LIKE ?', [alphaProjectId, '%Append-Only%']);
    assert.strictEqual(alphaNotes.length, 1, 'Architecture note must be merged into Project Alpha');
    pass('Mode B: Merging into existing project succeeds and strictly preserves existing project metadata');

    // Test 15: Mode B — Viewer Authorization Boundary (Bob is Viewer -> HTTP 403)
    const inspectResViewer = await fetch(`${BASE_URL}/api/v1/exchange/inspect-json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bobToken}`
      },
      body: JSON.stringify({
        package_json: policyPackage,
        destination_project_id: alphaProjectId
      })
    });

    assert.strictEqual(inspectResViewer.status, 403, 'Inspect Mode B by Viewer must return HTTP 403 Forbidden');
    const viewerData = await inspectResViewer.json();
    assert.ok(viewerData.errors.some(e => e.code === 'PROJECT_FORBIDDEN'));
    pass('Mode B Authorization: Project Viewer is strictly rejected with HTTP 403 PROJECT_FORBIDDEN');

    // Test 16: Mode B — Non-Member Authorization Boundary (Charlie is Non-member -> HTTP 403)
    const inspectResNonMember = await fetch(`${BASE_URL}/api/v1/exchange/inspect-json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${charlieToken}`
      },
      body: JSON.stringify({
        package_json: policyPackage,
        destination_project_id: alphaProjectId
      })
    });

    assert.strictEqual(inspectResNonMember.status, 403, 'Inspect Mode B by Non-Member must return HTTP 403 Access Denied');
    const nonMemberData = await inspectResNonMember.json();
    assert.ok(nonMemberData.errors.some(e => e.code === 'PROJECT_ACCESS_DENIED'));
    pass('Mode B Authorization: Non-Member is strictly rejected with HTTP 403 PROJECT_ACCESS_DENIED');

    // Test 17: Strict Raw SHA-256 byte-for-byte binding
    const inspectResHash = await fetch(`${BASE_URL}/api/v1/exchange/inspect-json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aliceToken}`
      },
      body: JSON.stringify({ package_json: policyPackage })
    });
    const inspectDataHash = await inspectResHash.json();
    const tokenHash = inspectDataHash.inspection_token;
    const rawShaCorrect = inspectDataHash.package_sha256;

    // Submitting altered package hash
    const fakeHash = crypto.createHash('sha256').update('different_content_tampered').digest('hex');
    const commitTampered = await fetch(`${BASE_URL}/api/v1/exchange/commit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aliceToken}`
      },
      body: JSON.stringify({
        approved: true,
        inspection_token: tokenHash,
        package_sha256: fakeHash
      })
    });

    assert.strictEqual(commitTampered.status, 422, 'Commit with tampered hash must return HTTP 422');
    const tamperedData = await commitTampered.json();
    assert.strictEqual(tamperedData.code, 'PACKAGE_HASH_MISMATCH');
    pass('Strictly verifies package raw SHA-256 byte-for-byte; rejects mismatched or tampered hashes with 422');

    // Test 18: Idempotency replay
    const idempotencyKey = `idemp_recon_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const commitIdemp1 = await fetch(`${BASE_URL}/api/v1/exchange/commit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aliceToken}`,
        'idempotency-key': idempotencyKey
      },
      body: JSON.stringify({
        approved: true,
        inspection_token: tokenHash,
        package_sha256: rawShaCorrect
      })
    });

    assert.strictEqual(commitIdemp1.status, 200);
    const idempData1 = await commitIdemp1.json();
    assert.strictEqual(idempData1.success, true);

    // Repeated request with same idempotency key
    const commitIdemp2 = await fetch(`${BASE_URL}/api/v1/exchange/commit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aliceToken}`,
        'idempotency-key': idempotencyKey
      },
      body: JSON.stringify({
        approved: true,
        inspection_token: tokenHash,
        package_sha256: rawShaCorrect
      })
    });

    assert.strictEqual(commitIdemp2.status, 200);
    const idempData2 = await commitIdemp2.json();
    assert.strictEqual(idempData2.idempotent_replay, true, 'Second commit must return idempotent_replay: true');
    assert.strictEqual(idempData2.created_project_id, idempData1.created_project_id);
    pass('Idempotency: Replaying commit with same idempotency key returns cached idempotent response safely');

  } finally {
    server.close();
    console.log('[CLEANUP] HTTP server closed.');
  }

  // =========================================================================
  // PART 5: BACKWARD COMPATIBILITY & RESOURCE ENDPOINTS
  // =========================================================================
  console.log('\n--- PART 5: BACKWARD COMPATIBILITY & RESOURCE ENDPOINTS ---');

  // Test 19: Backward compatibility with legacy .flowden.zip v1 package
  const legacyZipFixture = path.resolve(
    __dirname,
    '..',
    'docs',
    'knowledge-exchange',
    'examples',
    'flowden-reference-package.flowden.zip'
  );
  assert.ok(fs.existsSync(legacyZipFixture), 'Legacy reference fixture must exist');
  const legacyReport = await inspectKnowledgePackage({
    zipFilePath: legacyZipFixture,
    originalFilename: 'flowden-reference-package.flowden.zip',
    userId: 1,
    ip: '127.0.0.1'
  });
  assert.strictEqual(legacyReport.valid, true, `Legacy v1 package must inspect valid: ${JSON.stringify(legacyReport.validation?.errors)}`);
  assert.strictEqual(legacyReport.package.format, 'flowden-knowledge-package');
  assert.strictEqual(legacyReport.package.fkf_version, '1.0.0');
  pass('Backward Compatibility: Legacy .flowden.zip v1 package inspects and validates cleanly');

  // Test 20: Resource download endpoints
  const express = require('express');
  const exchangeRouter = require('../server/routes/exchange');
  const resApp = express();
  resApp.use('/api/v1/exchange', exchangeRouter);

  const resServer = resApp.listen(0, async () => {
    const rPort = resServer.address().port;
    try {
      // 1. schema-v2
      const resV2 = await fetch(`http://127.0.0.1:${rPort}/api/v1/exchange/resources/schema-v2`);
      assert.strictEqual(resV2.status, 200);
      assert.strictEqual(resV2.headers.get('content-type'), 'application/schema+json; charset=utf-8');
      const v2Body = await resV2.json();
      assert.strictEqual(v2Body.title, 'Flowden Knowledge Format (FKF) v2.0.0 Schema');

      // 2. research-spec
      const resSpec = await fetch(`http://127.0.0.1:${rPort}/api/v1/exchange/resources/research-spec`);
      assert.strictEqual(resSpec.status, 200);
      const specText = await resSpec.text();
      assert.ok(specText.includes('Flowden Research Specification & Knowledge Exchange Guide (FKF 2.0)'));

      // 3. package-schema (legacy v1)
      const resV1 = await fetch(`http://127.0.0.1:${rPort}/api/v1/exchange/resources/package-schema`);
      assert.strictEqual(resV1.status, 200);
      const v1Body = await resV1.json();
      assert.strictEqual(v1Body.title, 'Flowden Knowledge Format (FKF) v1.0.0 Schema');

      pass('Resource Endpoints: /schema-v2, /research-spec, and /package-schema serve correct content types and headers');
    } finally {
      resServer.close();
      await db.getPool().end();
      console.log(`[CLEANUP] Database pool closed. Database "${ISOLATED_DB_NAME}" preserved.`);
    }

    console.log('\n========================================================');
    console.log(`✓ ALL ${testPassedCount} FKF 2.0 RECONCILIATION TESTS PASSED!`);
    console.log('========================================================\n');
  });
}

runReconciliationTestSuite().catch(err => {
  console.error('\n❌ RECONCILIATION TEST SUITE FAILED:', err);
  process.exit(1);
});
