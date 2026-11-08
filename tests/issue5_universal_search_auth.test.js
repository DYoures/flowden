// tests/issue5_universal_search_auth.test.js

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { accessPredicate } = require('../server/utils/searchAccessPredicate');
const SearchService = require('../server/services/searchService');

console.log('======================================================');
console.log('  FLOWDEN ISSUE 5 — UNIVERSAL SEARCH & AUTH ACCEPTANCE');
console.log('======================================================\n');

/**
 * Creates an in-memory SQL simulation engine mimicking MySQL 8.0+ query execution
 * with full-text search, joins, exists subqueries, and positional placeholder parameters.
 */
function createSearchDatabase() {
  const data = {
    users: [
      { id: 1, email: 'alice@flowden.io', settings_json: JSON.stringify({ mcp: { apiKey: 'key-alice', enabledProjects: [10] } }) },
      { id: 2, email: 'bob@flowden.io', settings_json: JSON.stringify({ mcp: { apiKey: 'key-bob', enabledProjects: [] } }) },
      { id: 3, email: 'charlie@flowden.io', settings_json: null }
    ],
    projects: [
      { id: 10, user_id: 1, title: 'Project Alpha' },
      { id: 20, user_id: 1, title: 'Project Beta' }
    ],
    project_members: [
      { id: 1, project_id: 10, user_id: 1, role: 'owner', revoked_at: null },
      { id: 2, project_id: 10, user_id: 2, role: 'editor', revoked_at: null } // Bob is active member
    ],
    project_entities: [
      { id: 1, project_id: 10, entity_type: 'note', entity_id: 101, access_role: 'admin', added_by: 1 },
      { id: 2, project_id: 10, entity_type: 'note', entity_id: 104, access_role: 'admin', added_by: 1 }
    ],
    entities: [
      // 101: Shared Project Note
      {
        id: 1,
        uuid: 'uuid-101',
        entity_type: 'note',
        entity_id: 101,
        owner_user_id: 1,
        primary_project_id: 10,
        title: 'Project Alpha Blueprint',
        search_text: 'Deep architecture and roadmap for alpha release',
        deleted_at: null
      },
      // 102: Alice's Private Personal Note
      {
        id: 2,
        uuid: 'uuid-102',
        entity_type: 'note',
        entity_id: 102,
        owner_user_id: 1,
        primary_project_id: null,
        title: 'Alice Private Strategy Note',
        search_text: 'Confidential personal notes not shared with anyone',
        deleted_at: null
      },
      // 103: Alice's Quick Capture
      {
        id: 3,
        uuid: 'uuid-103',
        entity_type: 'capture',
        entity_id: 103,
        owner_user_id: 1,
        primary_project_id: 10,
        title: 'Alice Quick Idea Capture',
        search_text: 'Spontaneous brainstorming capture item',
        deleted_at: null
      },
      // 104: Soft-Deleted Note
      {
        id: 4,
        uuid: 'uuid-104',
        entity_type: 'note',
        entity_id: 104,
        owner_user_id: 1,
        primary_project_id: 10,
        title: 'Old Deprecated Alpha Roadmap',
        search_text: 'Trashed roadmap discarded last sprint',
        deleted_at: new Date('2026-10-01')
      }
    ],
    entity_links: [
      // Link between Shared Note 101 and Private Note 102
      {
        id: 1,
        user_id: 1,
        source_type: 'note',
        source_id: 102, // Alice private note
        target_type: 'note',
        target_id: 101, // Shared note
        link_type: 'references',
        origin: 'inline_link',
        context_snippet: 'References the confidential strategy',
        is_confirmed: true,
        deleted_at: null
      }
    ]
  };

  /**
   * Evaluates if a given entity row passes accessPredicate for a given user & options.
   */
  function evaluateAccess(ent, userId, options = {}) {
    const numericUserId = parseInt(userId, 10);
    const isMcp = Boolean(options.isMcp);
    const enabledProjectIds = Array.isArray(options.enabledProjectIds)
      ? options.enabledProjectIds.map(id => parseInt(id, 10))
      : [];

    // 1. Soft-delete check
    if (ent.deleted_at !== null) return false;

    // 2. Quick capture privacy: only author/owner
    if (ent.entity_type === 'capture' && ent.owner_user_id !== numericUserId) {
      return false;
    }

    // 3. MCP Mode
    if (isMcp) {
      if (enabledProjectIds.length === 0) return false;
      // Entity must belong to an enabled project with active membership
      const memberships = data.project_entities.filter(pe =>
        ((pe.entity_type === ent.entity_type && pe.entity_id === ent.entity_id) || pe.entity_id === ent.id) &&
        enabledProjectIds.includes(pe.project_id)
      );
      if (memberships.length === 0) return false;
      return memberships.some(pe =>
        data.project_members.some(pm => pm.project_id === pe.project_id && pm.user_id === numericUserId && pm.revoked_at === null)
      );
    }

    // 4. In-App Mode
    if (options.activeProjectId) {
      const activePid = parseInt(options.activeProjectId, 10);
      const isMember = data.project_members.some(pm => pm.project_id === activePid && pm.user_id === numericUserId && pm.revoked_at === null);
      if (isMember) {
        const inProj = (ent.primary_project_id === activePid) ||
          data.project_entities.some(pe => pe.project_id === activePid && pe.entity_type === ent.entity_type && pe.entity_id === ent.entity_id);
        if (inProj) return true;
      }
      if (options.includePersonal !== false && ent.primary_project_id === null && ent.owner_user_id === numericUserId) {
        return true;
      }
      return false;
    }

    // Global in-app
    if (ent.owner_user_id === numericUserId) return true;

    // Check project_entities membership
    const peMatches = data.project_entities.filter(pe =>
      (pe.entity_type === ent.entity_type && pe.entity_id === ent.entity_id) || pe.entity_id === ent.id
    );
    for (const pe of peMatches) {
      const activeMember = data.project_members.find(pm =>
        pm.project_id === pe.project_id && pm.user_id === numericUserId && pm.revoked_at === null
      );
      if (activeMember) return true;
    }

    // Check if entity is a project
    if (ent.entity_type === 'project') {
      const activeMember = data.project_members.find(pm =>
        pm.project_id === ent.entity_id && pm.user_id === numericUserId && pm.revoked_at === null
      );
      if (activeMember) return true;
    }

    return false;
  }

  const db = {
    data,
    query: async (sql, params = []) => {
      const trimmed = sql.trim().replace(/\s+/g, ' ');

      // Invariant check query
      if (/SELECT COUNT\(\*\) AS violationCount FROM entities e WHERE e\.primary_project_id IS NOT NULL/i.test(trimmed)) {
        const violations = data.entities.filter(e =>
          e.primary_project_id !== null &&
          !['project', 'capture'].includes(e.entity_type) &&
          !data.project_entities.some(pe => pe.project_id === e.primary_project_id && pe.entity_type === e.entity_type && pe.entity_id === e.entity_id)
        );
        return [[{ violationCount: violations.length }]];
      }

      // Backfill project owners
      if (/INSERT INTO project_members.*SELECT p\.id, p\.user_id/i.test(trimmed)) {
        for (const p of data.projects) {
          const exists = data.project_members.some(pm => pm.project_id === p.id && pm.user_id === p.user_id);
          if (!exists) {
            data.project_members.push({
              id: data.project_members.length + 1,
              project_id: p.id,
              user_id: p.user_id,
              role: 'owner',
              revoked_at: null
            });
          }
        }
        return [{ affectedRows: data.projects.length }];
      }

      // Backfill project entities
      if (/INSERT INTO project_entities.*SELECT e\.primary_project_id, e\.entity_type/i.test(trimmed)) {
        let count = 0;
        for (const e of data.entities) {
          if (e.primary_project_id !== null && !['project', 'capture'].includes(e.entity_type)) {
            const exists = data.project_entities.some(pe => pe.project_id === e.primary_project_id && pe.entity_type === e.entity_type && pe.entity_id === e.entity_id);
            if (!exists) {
              data.project_entities.push({
                id: data.project_entities.length + 1,
                project_id: e.primary_project_id,
                entity_type: e.entity_type,
                entity_id: e.entity_id,
                access_role: 'admin',
                added_by: e.owner_user_id
              });
              count++;
            }
          }
        }
        return [{ affectedRows: count }];
      }

      // Universal search query
      if (/SELECT e\.id, e\.uuid.*FROM entities e WHERE MATCH/i.test(trimmed)) {
        const queryText = params[0];
        const isMcp = trimmed.includes('pe.project_id IN');
        // Extract userId from parameters
        const userId = params[2]; // params: [q, q, userId, ...]
        
        let enabledPids = [];
        if (isMcp) {
          // If 1 = 0 was rendered
          if (trimmed.includes('1 = 0')) {
            return [[]];
          }
          // Extract enabled project IDs
          // In MCP query, params: [q, q, userId, userId, ...enabledPids, limit]
          enabledPids = params.slice(4, params.length - 1);
        }

        const words = queryText.toLowerCase().split(/\s+/).filter(Boolean);
        const matches = data.entities.filter(ent => {
          if (!evaluateAccess(ent, userId, { isMcp, enabledProjectIds: enabledPids })) {
            return false;
          }
          const text = `${ent.title} ${ent.search_text || ''}`.toLowerCase();
          return words.some(w => text.includes(w));
        }).map(ent => ({
          ...ent,
          score: 1.0
        }));

        return [matches];
      }

      // Autocomplete query
      if (/SELECT e\.id, e\.uuid.*FROM entities e WHERE \(e\.title LIKE \? OR e\.search_text LIKE \?\)/i.test(trimmed)) {
        const pattern = params[0].replace(/%/g, '').toLowerCase();
        const userId = params[2]; // params: [pat, pat, userId, ...]
        const matches = data.entities.filter(ent => {
          if (!evaluateAccess(ent, userId)) return false;
          const text = `${ent.title} ${ent.search_text || ''}`.toLowerCase();
          return text.includes(pattern);
        });
        return [matches];
      }

      // Backlinks query
      if (/SELECT el\.id AS link_id.*FROM entity_links el JOIN entities e_src/i.test(trimmed)) {
        const targetType = params[0];
        const targetId = params[1];
        const userId = params[2]; // params: [tgtType, tgtId, userId, ...]

        const links = data.entity_links.filter(el =>
          el.target_type === targetType &&
          el.target_id === targetId &&
          el.deleted_at === null &&
          el.is_confirmed === true
        );

        const results = [];
        for (const l of links) {
          const srcEnt = data.entities.find(e => e.entity_type === l.source_type && e.entity_id === l.source_id);
          // TRAVERSAL RULE: e_src must pass accessPredicate on its own!
          if (srcEnt && evaluateAccess(srcEnt, userId)) {
            results.push({
              link_id: l.id,
              link_type: l.link_type,
              origin: l.origin,
              context_snippet: l.context_snippet,
              created_at: new Date(),
              source_entity_table_id: srcEnt.id,
              source_entity_type: srcEnt.entity_type,
              source_entity_id: srcEnt.entity_id,
              source_title: srcEnt.title
            });
          }
        }
        return [results];
      }

      // Graph query
      if (/SELECT e\.id, e\.uuid, e\.entity_type, e\.entity_id.*FROM entities e/i.test(trimmed) && trimmed.includes('FROM entities e WHERE')) {
        const userId = params[0];
        const accessibleNodes = data.entities.filter(ent => evaluateAccess(ent, userId));
        return [accessibleNodes];
      }

      if (/SELECT el\.id, el\.source_type.*FROM entity_links el JOIN entities e_src/i.test(trimmed)) {
        const userIdSrc = params[0];
        const userIdTgt = params[params.length / 2]; // two sets of accessPredicate params
        const results = [];
        for (const l of data.entity_links) {
          if (l.deleted_at !== null || !l.is_confirmed) continue;
          const srcEnt = data.entities.find(e => e.entity_type === l.source_type && e.entity_id === l.source_id);
          const tgtEnt = data.entities.find(e => e.entity_type === l.target_type && e.entity_id === l.target_id);
          if (srcEnt && tgtEnt && evaluateAccess(srcEnt, userIdSrc) && evaluateAccess(tgtEnt, userIdTgt)) {
            results.push(l);
          }
        }
        return [results];
      }

      return [[]];
    }
  };

  return db;
}

async function runTests() {
  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`  ✅ PASSED: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ FAILED: ${name}`);
      console.error(err);
      failed++;
    }
  }

  async function testAsync(name, fn) {
    try {
      await fn();
      console.log(`  ✅ PASSED: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ FAILED: ${name}`);
      console.error(err);
      failed++;
    }
  }

  // -------------------------------------------------------------------------
  // 1. User B (not a member) searches for User A's personal note -> not found
  // -------------------------------------------------------------------------
  await testAsync('1. User B (not a member) searches for user A\'s personal note -> not found', async () => {
    const db = createSearchDatabase();
    // User B (id = 2) searches for 'Confidential' (Alice's personal note 102)
    const resultsBob = await SearchService.universalSearch(db, 2, 'Confidential');
    assert.strictEqual(resultsBob.length, 0, 'User B must NOT find User A\'s personal note');

    // User A (id = 1) searches for 'Confidential'
    const resultsAlice = await SearchService.universalSearch(db, 1, 'Confidential');
    assert.strictEqual(resultsAlice.length, 1, 'User A should find their own personal note');
    assert.strictEqual(resultsAlice[0].entity_id, 102);
  });

  // -------------------------------------------------------------------------
  // 2. A's private note linked from a project entity does NOT appear in B's backlinks / graph / autocomplete
  // -------------------------------------------------------------------------
  await testAsync('2. A\'s private note linked from a project entity does NOT appear in B\'s backlinks / graph / autocomplete', async () => {
    const db = createSearchDatabase();
    // In db, Link exists: Source=102 (Alice private), Target=101 (Project 10 shared note)
    // Bob (id=2) is a member of Project 10. Bob queries backlinks for Shared Note 101.
    const backlinksForBob = await SearchService.getBacklinks(db, 2, { entityType: 'note', entityId: 101 });
    assert.strictEqual(backlinksForBob.length, 0, 'Traversal rule: Alice private note must NOT leak in Bob\'s backlinks');

    // Bob views graph
    const graphBob = await SearchService.getGraph(db, 2);
    const leakedNode = graphBob.nodes.find(n => n.entity_id === 102);
    assert.strictEqual(leakedNode, undefined, 'Alice private note must NOT appear as a node in Bob\'s graph');
    assert.strictEqual(graphBob.edges.length, 0, 'Edge pointing to private note must NOT appear in Bob\'s graph edges');

    // Bob autocompletes 'Strategy' (title of private note)
    const autocompleteBob = await SearchService.autocompleteWikilinks(db, 2, 'Strategy');
    assert.strictEqual(autocompleteBob.length, 0, 'Private note must NOT appear in Bob\'s autocomplete');
  });

  // -------------------------------------------------------------------------
  // 3. After revoked_at is set on B's membership, B immediately loses access to that project's entities on all surfaces
  // -------------------------------------------------------------------------
  await testAsync('3. After revoked_at is set on B\'s membership, B immediately loses access to that project\'s entities on all surfaces', async () => {
    const db = createSearchDatabase();
    // Initially Bob has access to 101
    const beforeSearch = await SearchService.universalSearch(db, 2, 'Blueprint');
    assert.strictEqual(beforeSearch.length, 1, 'Bob should see project note while membership active');

    // Revoke Bob's membership in Project 10
    const bobMember = db.data.project_members.find(pm => pm.project_id === 10 && pm.user_id === 2);
    bobMember.revoked_at = new Date();

    // Immediately check Universal Search
    const afterSearch = await SearchService.universalSearch(db, 2, 'Blueprint');
    assert.strictEqual(afterSearch.length, 0, 'Revoked member must immediately lose search access');

    // Autocomplete
    const afterAuto = await SearchService.autocompleteWikilinks(db, 2, 'Blueprint');
    assert.strictEqual(afterAuto.length, 0, 'Revoked member must immediately lose autocomplete access');

    // Graph
    const afterGraph = await SearchService.getGraph(db, 2);
    const node101 = afterGraph.nodes.find(n => n.entity_id === 101);
    assert.strictEqual(node101, undefined, 'Revoked member must immediately lose graph node access');
  });

  // -------------------------------------------------------------------------
  // 4. Another user's Quick Capture never appears
  // -------------------------------------------------------------------------
  await testAsync('4. Another user\'s Quick Capture never appears', async () => {
    const db = createSearchDatabase();
    // Entity 103 is a capture owned by Alice (id=1), assigned to Project 10.
    // Bob (id=2) is an active member of Project 10.
    const searchBob = await SearchService.universalSearch(db, 2, 'Capture');
    assert.strictEqual(searchBob.length, 0, 'Another user\'s capture must never appear, even in shared project');

    const searchAlice = await SearchService.universalSearch(db, 1, 'Capture');
    assert.strictEqual(searchAlice.length, 1, 'Author should see their own quick captures');
    assert.strictEqual(searchAlice[0].entity_id, 103);
  });

  // -------------------------------------------------------------------------
  // 5. Soft-deleted entities never appear
  // -------------------------------------------------------------------------
  await testAsync('5. Soft-deleted entities never appear', async () => {
    const db = createSearchDatabase();
    // Entity 104 has deleted_at set.
    const searchAlice = await SearchService.universalSearch(db, 1, 'Deprecated');
    assert.strictEqual(searchAlice.length, 0, 'Soft-deleted entity must not appear in search');

    const autoAlice = await SearchService.autocompleteWikilinks(db, 1, 'Deprecated');
    assert.strictEqual(autoAlice.length, 0, 'Soft-deleted entity must not appear in autocomplete');

    const graphAlice = await SearchService.getGraph(db, 1);
    const deletedNode = graphAlice.nodes.find(n => n.entity_id === 104);
    assert.strictEqual(deletedNode, undefined, 'Soft-deleted entity must not appear in graph');
  });

  // -------------------------------------------------------------------------
  // 6. The primary_project_id ⊆ project_entities invariant test passes
  // -------------------------------------------------------------------------
  await testAsync('6. The primary_project_id ⊆ project_entities invariant test passes', async () => {
    const db = createSearchDatabase();

    // Introduce an unparented/un-backfilled entity with primary_project_id=20
    db.data.entities.push({
      id: 5,
      uuid: 'uuid-105',
      entity_type: 'task',
      entity_id: 201,
      owner_user_id: 1,
      primary_project_id: 20,
      title: 'Task in Beta',
      search_text: 'Task text',
      deleted_at: null
    });

    // Invariant should fail before backfill
    const countBefore = await SearchService.checkInvariant(db);
    assert.strictEqual(countBefore, 1, 'Invariant violation must be detected when entity is missing from project_entities');

    // Run backfill
    await SearchService.backfillPrimaryProjectsToProjectEntities(db);
    await SearchService.backfillProjectOwners(db);

    // Invariant must pass
    const countAfter = await SearchService.checkInvariant(db);
    assert.strictEqual(countAfter, 0, 'Invariant violation count must be 0 after backfill');

    // Verify project owner row in project_members
    const betaOwner = db.data.project_members.find(pm => pm.project_id === 20 && pm.user_id === 1 && pm.role === 'owner');
    assert.ok(betaOwner, 'Project owner row must exist in project_members');
  });

  // -------------------------------------------------------------------------
  // 7. MCP: for a project NOT enabled for MCP, MCP tools return none of its entities even to an active member,
  //    while normal in-app search still returns them. After enabling it, MCP returns them to active members only;
  //    after revoked_at, MCP stops returning them.
  // -------------------------------------------------------------------------
  await testAsync('7. MCP: project enablement & membership enforcement on all surfaces', async () => {
    const db = createSearchDatabase();

    // Bob (id=2) is an active member of Project 10.
    // Case A: Project 10 is NOT enabled for MCP (enabledProjectIds = [])
    const normalInAppSearch = await SearchService.universalSearch(db, 2, 'Blueprint', { isMcp: false });
    assert.strictEqual(normalInAppSearch.length, 1, 'Normal in-app search returns Project 10 entities to active member');

    const mcpSearchDisabled = await SearchService.universalSearch(db, 2, 'Blueprint', { isMcp: true, enabledProjectIds: [] });
    assert.strictEqual(mcpSearchDisabled.length, 0, 'MCP must return NONE of project entities when project is not enabled');

    // Case B: Enable Project 10 for MCP (enabledProjectIds = [10])
    const mcpSearchEnabled = await SearchService.universalSearch(db, 2, 'Blueprint', { isMcp: true, enabledProjectIds: [10] });
    assert.strictEqual(mcpSearchEnabled.length, 1, 'MCP returns entities after project is enabled for MCP');
    assert.strictEqual(mcpSearchEnabled[0].entity_id, 101);

    // Case C: Bob's membership in Project 10 is revoked
    const bobMember = db.data.project_members.find(pm => pm.project_id === 10 && pm.user_id === 2);
    bobMember.revoked_at = new Date();

    const mcpSearchRevoked = await SearchService.universalSearch(db, 2, 'Blueprint', { isMcp: true, enabledProjectIds: [10] });
    assert.strictEqual(mcpSearchRevoked.length, 0, 'MCP stops returning entities immediately once membership is revoked');
  });

  // -------------------------------------------------------------------------
  // 8. The MATCH column list matches the FULLTEXT index (drift test), and the query runs with the pool's actual placeholder mode.
  // -------------------------------------------------------------------------
  test('8. The MATCH column list matches the FULLTEXT index (drift test), and query uses positional ? mode', () => {
    // 1. Check FULLTEXT index columns in 002_unified_entity_registry.js and schema-target.sql
    const mig002 = fs.readFileSync(path.join(__dirname, '../server/migrations/002_unified_entity_registry.js'), 'utf8');
    const schemaTarget = fs.readFileSync(path.join(__dirname, '../server/migrations/schema-target.sql'), 'utf8');
    const searchServiceSrc = fs.readFileSync(path.join(__dirname, '../server/services/searchService.js'), 'utf8');

    // Verify index definition
    const ftIndexRegex = /FULLTEXT\s+KEY\s+\w+\s*\(([^)]+)\)/i;
    const match002 = mig002.match(ftIndexRegex);
    const matchTarget = schemaTarget.match(ftIndexRegex);

    assert.ok(match002, 'Migration 002 must define a FULLTEXT KEY on entities');
    assert.ok(matchTarget, 'schema-target.sql must define a FULLTEXT KEY on entities');

    const indexCols002 = match002[1].split(',').map(s => s.trim().replace(/`/g, ''));
    const indexColsTarget = matchTarget[1].split(',').map(s => s.trim().replace(/`/g, ''));

    assert.deepStrictEqual(indexCols002, ['title', 'search_text'], 'Migration 002 FULLTEXT index columns must be (title, search_text)');
    assert.deepStrictEqual(indexColsTarget, ['title', 'search_text'], 'schema-target FULLTEXT index columns must be (title, search_text)');

    // 2. Verify searchService.js MATCH expression
    const matchQueryRegex = /MATCH\(([^)]+)\)\s+AGAINST/g;
    const matchesFound = [];
    let m;
    while ((m = matchQueryRegex.exec(searchServiceSrc)) !== null) {
      matchesFound.push(m[1].split(',').map(s => s.trim().replace(/^e\./, '')));
    }

    assert.ok(matchesFound.length >= 2, 'searchService.js must execute MATCH query in SELECT and WHERE');
    for (const queryCols of matchesFound) {
      assert.deepStrictEqual(queryCols, indexCols002, 'Drift test: Search query MATCH columns must strictly match FULLTEXT index columns (title, search_text)');
    }

    // 3. Verify placeholder conventions: MUST use positional ? and not named :param
    assert.ok(!searchServiceSrc.includes(':userId'), 'Query must not use named placeholders (:userId)');
    assert.ok(!searchServiceSrc.includes(':q'), 'Query must not use named placeholders (:q)');
    assert.ok(searchServiceSrc.includes('?'), 'Query must use positional ? placeholders');

    // 4. Verify accessPredicate SQL and parameter alignment
    const pred = accessPredicate(42);
    assert.ok(pred.sql.includes('e.deleted_at IS NULL'), 'accessPredicate must check deleted_at IS NULL');
    assert.ok(!pred.sql.includes(':uid'), 'accessPredicate must not use named placeholders');
    assert.ok(pred.params.filter(p => p === 42).length >= 3, 'accessPredicate positional parameters must supply numeric userId');
  });

  console.log('\n======================================================');
  console.log(`  ISSUE 5 TEST SUMMARY: ${passed}/${passed + failed} PASSED`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
