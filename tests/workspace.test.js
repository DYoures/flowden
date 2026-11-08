// Flowden Segment 3 Workspace & Knowledge System Test Suite

const http = require('http');
const { app } = require('../server/index');
const db = require('../server/config/database');

const PORT = 3010; // Dedicated test port

let server;
let authCookie = '';
let userId = null;
let projectId = null;
let boardId = null;
let card1Id = null;
let card2Id = null;
let note1Id = null;
let note2Id = null;

function request(method, path, body = null, cookie = '') {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: PORT,
      path,
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (cookie) {
      options.headers['Cookie'] = cookie;
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (e) {
          json = data;
        }

        const setCookie = res.headers['set-cookie'];
        let extractedCookie = '';
        if (setCookie && setCookie.length > 0) {
          extractedCookie = setCookie[0].split(';')[0];
        }

        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: json,
          cookie: extractedCookie
        });
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

function assert(condition, message) {
  if (!condition) {
    console.error(`  ❌ FAILED: ${message}`);
    throw new Error(message);
  } else {
    console.log(`  ✅ PASSED: ${message}`);
  }
}

async function runTests() {
  console.log('\n======================================================');
  console.log('  FLOWDEN SEGMENT 3 — WORKSPACE & KNOWLEDGE TEST SUITE');
  console.log('======================================================\n');

  await db.initDB();
  await new Promise((resolve) => {
    server = app.listen(PORT, resolve);
  });
  console.log(`Test server running on port ${PORT}\n`);

  try {
    // 0. Setup User & Project
    console.log('[Setup: User & Core Project]');
    const testEmail = `workspace.architect.${Date.now()}@flowden.io`;
    const reg = await request('POST', '/api/v1/auth/register', {
      email: testEmail,
      password: 'StrongPassword2026!',
      display_name: 'Elena Architect'
    });
    const loginRes = await request('POST', '/api/v1/auth/login', {
      email: testEmail,
      password: 'StrongPassword2026!'
    });
    authCookie = loginRes.cookie;
    userId = (reg.data && reg.data.user) ? reg.data.user.id : (loginRes.data && loginRes.data.user ? loginRes.data.user.id : null);

    const pRes = await request('POST', '/api/v1/projects', {
      title: 'Distributed Knowledge System',
      description: 'Unified spatial research and knowledge infrastructure.',
      color: '#7c5cbf'
    }, authCookie);
    projectId = pRes.data.project.id;
    assert(projectId !== undefined, 'Core project created');

    // 1. Workspace Board & Modular Cards
    console.log('\n[Test 1: Workspace Board & Modular Cards]');
    const bRes = await request('GET', `/api/v1/boards/project/${projectId}`, null, authCookie);
    assert(bRes.statusCode === 200, 'Board retrieved');
    boardId = bRes.data.boards[0].id;

    // Viewport persistence
    const vpRes = await request('PUT', `/api/v1/boards/${boardId}/viewport`, {
      zoom_level: 1.25,
      viewport_x: 100,
      viewport_y: 50,
      grid_size: 20
    }, authCookie);
    assert(vpRes.statusCode === 200, 'Viewport state updated');
    assert(vpRes.data.board.zoom_level === 1.25, 'Zoom level persisted');

    // Create Note Card
    const card1Res = await request('POST', `/api/v1/boards/${boardId}/items`, {
      item_type: 'note',
      title: 'System Topology',
      content: 'Peer-to-peer data synchronization network.',
      position_x: 80,
      position_y: 120,
      width: 260,
      height: 180,
      color: '#7c5cbf'
    }, authCookie);
    assert(card1Res.statusCode === 201, 'Created Note Card on board');
    card1Id = card1Res.data.item.id;

    // Create Idea Card
    const card2Res = await request('POST', `/api/v1/boards/${boardId}/items`, {
      item_type: 'idea',
      title: 'Vector Embedding Index',
      content: 'Near-instant semantic similarity lookups.',
      position_x: 420,
      position_y: 120,
      width: 240,
      height: 160,
      color: '#5b8fd9'
    }, authCookie);
    assert(card2Res.statusCode === 201, 'Created Idea Card on board');
    card2Id = card2Res.data.item.id;

    // Update Card Properties
    const cardUpdateRes = await request('PUT', `/api/v1/boards/${boardId}/items/${card1Id}`, {
      title: 'Distributed Topology v2',
      width: 280
    }, authCookie);
    assert(cardUpdateRes.statusCode === 200, 'Card properties updated');
    assert(cardUpdateRes.data.item.title === 'Distributed Topology v2', 'Title persisted');

    // Batch position update
    const batchRes = await request('PUT', `/api/v1/boards/${boardId}/items/batch`, {
      positions: [
        { id: card1Id, position_x: 100, position_y: 140 },
        { id: card2Id, position_x: 440, position_y: 140 }
      ]
    }, authCookie);
    assert(batchRes.statusCode === 200, 'Batch card positions updated successfully');

    // 2. Board Groups & Visual Connections
    console.log('\n[Test 2: Board Groups & Visual Connections]');
    const groupRes = await request('POST', `/api/v1/boards/${boardId}/groups`, {
      title: 'Infrastructure Cluster',
      color: '#7c5cbf',
      position_x: 60,
      position_y: 80,
      width: 660,
      height: 300
    }, authCookie);
    assert(groupRes.statusCode === 201, 'Board group created');
    const groupId = groupRes.data.group.id;

    // Visual Connection
    const connRes = await request('POST', `/api/v1/boards/${boardId}/connections`, {
      source_item_id: card1Id,
      target_item_id: card2Id,
      connection_type: 'supports',
      label: 'powers'
    }, authCookie);
    assert(connRes.statusCode === 201, 'Visual connection wire created between cards');
    assert(connRes.data.connection.label === 'powers', 'Connection label persisted');

    // Retrieve full board with groups and connections
    const fullBoardRes = await request('GET', `/api/v1/boards/${boardId}`, null, authCookie);
    assert(fullBoardRes.data.board.items.length === 2, 'Full board returns all cards');
    assert(fullBoardRes.data.board.groups.length === 1, 'Full board returns groups');
    assert(fullBoardRes.data.board.connections.length === 1, 'Full board returns connections');

    // 3. Knowledge Vault: Folders, Tags & Notes
    console.log('\n[Test 3: Knowledge Vault Folders, Tags & Notes]');
    const folderRes = await request('POST', '/api/v1/notes/folders', {
      name: 'System Architecture'
    }, authCookie);
    assert(folderRes.statusCode === 201, 'Created folder in Knowledge Vault');
    const folderId = folderRes.data.folder.id;

    // Create Note 1 (Target Note)
    const n1Res = await request('POST', '/api/v1/notes', {
      title: 'Event Sourcing Patterns',
      content: '# Event Sourcing\n\nImmutable ledger of all state transitions.',
      folder_id: folderId,
      tags: ['architecture', 'storage']
    }, authCookie);
    assert(n1Res.statusCode === 201, 'Created target Note 1 with tags');
    note1Id = n1Res.data.note.id;
    assert(n1Res.data.note.tags.length === 2, 'Tags mapped to note');

    // Create Note 2 linking to Note 1 via [[Event Sourcing Patterns]]
    const n2Res = await request('POST', '/api/v1/notes', {
      title: 'Command Query Responsibility Segregation',
      content: '# CQRS\n\nSeparates read models from write models. Interacts with [[Event Sourcing Patterns]].',
      folder_id: folderId,
      tags: ['patterns']
    }, authCookie);
    assert(n2Res.statusCode === 201, 'Created Note 2 containing wiki link [[Event Sourcing Patterns]]');
    note2Id = n2Res.data.note.id;

    // 4. Bi-directional Wiki Links, Backlinks, & Unlinked Mentions
    console.log('\n[Test 4: Bi-directional Links, Backlinks & Unlinked Mentions]');
    const n1Detail = await request('GET', `/api/v1/notes/${note1Id}`, null, authCookie);
    assert(n1Detail.data.note.backlinks && n1Detail.data.note.backlinks.length >= 1, 'Note 1 reports incoming backlink from Note 2');
    assert(n1Detail.data.note.backlinks[0].title === 'Command Query Responsibility Segregation', 'Backlink source matches');

    // Create Note 3 that mentions "Event Sourcing Patterns" without wiki brackets
    await request('POST', '/api/v1/notes', {
      title: 'Microservices Overview',
      content: 'A survey of modern distributed designs including Event Sourcing Patterns and saga patterns.'
    }, authCookie);

    const n1WithUnlinked = await request('GET', `/api/v1/notes/${note1Id}`, null, authCookie);
    assert(n1WithUnlinked.data.note.unlinked_mentions.length >= 1, 'Note 1 detects unlinked mention in Microservices Overview');

    // 5. Note Markdown Import & Export
    console.log('\n[Test 5: Note Markdown Import & Export]');
    const exportRes = await request('GET', `/api/v1/notes/${note1Id}/export`, null, authCookie);
    assert(exportRes.statusCode === 200, 'Markdown export returns HTTP 200');
    assert(exportRes.data.includes('Immutable ledger'), 'Export contains note markdown body');

    const importRes = await request('POST', '/api/v1/notes/import', {
      title: 'Imported Protocol Spec',
      content: '# Protocol Specification\n\nBinary framing format for spatial nodes.'
    }, authCookie);
    assert(importRes.statusCode === 201, 'Imported markdown note');
    assert(importRes.data.note.title === 'Imported Protocol Spec', 'Imported title matches');

    // 6. Smart Connections (Typed Relationships)
    console.log('\n[Test 6: Smart Connections]');
    const smartConn = await request('POST', '/api/v1/connections', {
      source_type: 'note',
      source_id: note1Id,
      target_type: 'project',
      target_id: projectId,
      relationship: 'supports'
    }, authCookie);
    assert(smartConn.statusCode === 201, 'Created typed Smart Connection: "supports"');
    assert(smartConn.data.connection.relationship === 'supports', 'Relationship type persisted');

    // 7. Knowledge Graph Data Aggregation
    console.log('\n[Test 7: Knowledge Graph Data Aggregation]');
    const graphRes = await request('GET', '/api/v1/graph', null, authCookie);
    assert(graphRes.statusCode === 200, 'Graph endpoint returns HTTP 200');
    assert(graphRes.data.nodes.length >= 3, 'Aggregates nodes across projects and notes');
    assert(graphRes.data.edges.length >= 2, 'Aggregates edges across wiki links and smart connections');

    // Filter by project
    const projGraph = await request('GET', `/api/v1/graph?project_id=${projectId}`, null, authCookie);
    assert(projGraph.statusCode === 200, 'Project-specific graph query successful');

    // 8. Decision Log (ADR)
    console.log('\n[Test 8: Project Decision Log (ADR)]');
    const decRes = await request('POST', '/api/v1/decision-logs', {
      project_id: projectId,
      title: 'Adopt Bi-Directional Graph Links',
      context: 'Need high-fidelity cross-referencing between research and execution.',
      decision: 'Implement explicit typed smart connections and automatic backlink detection.',
      outcome: 'Full traceability across all workspace modules.'
    }, authCookie);
    assert(decRes.statusCode === 201, 'Logged architectural decision');
    const decId = decRes.data.decision_log.id;

    const listDec = await request('GET', `/api/v1/decision-logs/project/${projectId}`, null, authCookie);
    assert(listDec.data.decision_logs.length >= 1, 'Decision logs retrieved for project');

    // 9. Project Templates
    console.log('\n[Test 9: Project Templates Instantiation]');
    const tplList = await request('GET', '/api/v1/templates', null, authCookie);
    assert(tplList.data.templates.length >= 2, 'System templates available');

    const appliedTpl = await request('POST', '/api/v1/templates/sys_research_synthesis/apply', {
      title: 'Literature Review: Spatial Interfaces'
    }, authCookie);
    assert(appliedTpl.statusCode === 201, 'Applied template to instantiate new project');
    assert(appliedTpl.data.project.title === 'Literature Review: Spatial Interfaces', 'Template project title created');

    // Verify template created default board & items
    const tplBoards = await request('GET', `/api/v1/boards/project/${appliedTpl.data.project.id}`, null, authCookie);
    const tplFullBoard = await request('GET', `/api/v1/boards/${tplBoards.data.boards[0].id}`, null, authCookie);
    assert(tplFullBoard.data.board.groups.length >= 2, 'Template provisioned spatial board groups');
    assert(tplFullBoard.data.board.items.length >= 2, 'Template provisioned starter spatial cards');

    // 10. Quick Capture Processing
    console.log('\n[Test 10: Quick Capture Processing Engine]');
    const capRes = await request('POST', '/api/v1/quick-captures', {
      content: 'Investigate graph layout performance with >500 nodes',
      capture_type: 'text'
    }, authCookie);
    assert(capRes.statusCode === 201, 'Created quick capture');
    const capId = capRes.data.capture.id;

    // Convert capture to task
    const procRes = await request('POST', `/api/v1/quick-captures/${capId}/process`, {
      target_type: 'task',
      project_id: projectId,
      title: 'Benchmark Graph Rendering Engine'
    }, authCookie);
    assert(procRes.statusCode === 200, 'Processed quick capture into workflow task');
    assert(procRes.data.entity.title === 'Benchmark Graph Rendering Engine', 'Task entity generated from capture');

    console.log('\n======================================================');
    console.log('  🎉 ALL SEGMENT 3 WORKSPACE TESTS PASSED (10/10)');
    console.log('======================================================\n');
  } catch (err) {
    console.error('\n❌ Test suite stopped due to error:', err);
    process.exitCode = 1;
  } finally {
    if (server) {
      server.close();
    }
    if (db && db.getPool()) {
      try {
        await db.getPool().end();
      } catch (e) {}
    }
    process.exit(process.exitCode || 0);
  }
}

runTests();

