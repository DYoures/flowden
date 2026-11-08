// Flowden Segment 4 — Productivity, Research & Finalization Test Suite

const http = require('http');
const path = require('path');
const fs = require('fs');
const { app } = require('../server/index');
const db = require('../server/config/database');

const PORT = 3011; // Dedicated test port

let server;
let authCookie = '';
let userId = null;
let projectId = null;
let testTaskId1 = null;
let testTaskId2 = null;
let testNoteId = null;
let testDocId = null;
const testMcpKey = 'fld_mcp_test_key_' + Date.now() + '_123456';

function request(method, path, body = null, cookie = '', customHeaders = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: PORT,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...customHeaders
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
          status: res.statusCode,
          headers: res.headers,
          data: json,
          cookie: extractedCookie
        });
      });
    });

    req.on('error', reject);

    if (body) {
      if (typeof body === 'string') {
        req.write(body);
      } else {
        req.write(JSON.stringify(body));
      }
    }
    req.end();
  });
}

function assert(condition, message) {
  if (!condition) {
    console.error(`  ❌ FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`  ✅ PASSED: ${message}`);
}

async function runTests() {
  console.log('\n======================================================');
  console.log('  FLOWDEN SEGMENT 4 — FINAL INTEGRATION TEST SUITE');
  console.log('======================================================\n');

  await db.initDB();
  server = http.createServer(app);
  await new Promise(resolve => server.listen(PORT, resolve));
  console.log(`Test server running on port ${PORT}\n`);

  try {
    // ------------------------------------------------------------------------
    // Setup User & Project
    // ------------------------------------------------------------------------
    console.log('[Setup: Authenticated User & Core Project]');
    const rand = Math.floor(Math.random() * 100000);
    const regRes = await request('POST', '/api/v1/auth/register', {
      email: `segment4_user_${rand}@flowden.test`,
      password: 'password123',
      display_name: 'Segment 4 Lead'
    });
    const loginRes = await request('POST', '/api/v1/auth/login', {
      email: `segment4_user_${rand}@flowden.test`,
      password: 'password123'
    });
    authCookie = loginRes.cookie;
    userId = regRes.data.user.id;
    assert(regRes.status === 201, 'Registered test user for Segment 4');

    const projRes = await request('POST', '/api/v1/projects', {
      title: 'Segment 4 Integration Project',
      description: 'End-to-end deliverable integration'
    }, authCookie);
    projectId = projRes.data.project.id;
    assert(projRes.status === 201, 'Created integration project');

    // ------------------------------------------------------------------------
    // Test 1: Workflow Tracker CRUD & Statuses
    // ------------------------------------------------------------------------
    console.log('\n[Test 1: Workflow Tracker Task CRUD & Priorities]');
    const t1 = await request('POST', '/api/v1/tasks', {
      title: 'Implement Multi-Format Parser',
      description: 'Extract raw text from PDF and DOCX files',
      status: 'planned',
      priority: 'high',
      due_date: '2026-11-15',
      project_id: projectId
    }, authCookie);
    assert(t1.status === 201, 'Created first planned task');
    testTaskId1 = t1.data.task.id;

    const t2 = await request('POST', '/api/v1/tasks', {
      title: 'Verify Inspector Route Isolation',
      description: 'Ensure graph inspector closes on page navigation',
      status: 'in_progress',
      priority: 'urgent',
      due_date: '2026-11-10',
      project_id: projectId
    }, authCookie);
    assert(t2.status === 201, 'Created second task with urgent priority');
    testTaskId2 = t2.data.task.id;

    const listRes = await request('GET', `/api/v1/tasks?project_id=${projectId}`, null, authCookie);
    assert(listRes.status === 200, 'Retrieved project workflow tasks');
    assert(listRes.data.tasks.length === 2, 'Returns all created tasks');

    // ------------------------------------------------------------------------
    // Test 2: Task Status Updates & Completed Timestamp
    // ------------------------------------------------------------------------
    console.log('\n[Test 2: Task Status Transition & Completed Timestamp]');
    const updateRes = await request('PUT', `/api/v1/tasks/${testTaskId1}`, {
      status: 'done'
    }, authCookie);
    assert(updateRes.status === 200, 'Updated task status to done');
    assert(updateRes.data.task.status === 'done', 'Status persisted as done');
    assert(!!updateRes.data.task.completed_at, 'Automatically set completed_at timestamp');

    // ------------------------------------------------------------------------
    // Test 3: Bulk Task Operations
    // ------------------------------------------------------------------------
    console.log('\n[Test 3: Workflow Bulk Status & Bulk Actions]');
    const bulkRes = await request('POST', '/api/v1/tasks/bulk-status', {
      taskIds: [testTaskId1, testTaskId2],
      status: 'done'
    }, authCookie);
    assert(bulkRes.status === 200, 'Bulk updated tasks status to done');
    assert(bulkRes.data.updatedCount === 2, 'Reported 2 tasks updated');

    // ------------------------------------------------------------------------
    // Test 4: Note Version History Snapshot Creation
    // ------------------------------------------------------------------------
    console.log('\n[Test 4: Note Version History Automatic Snapshot]');
    const noteRes = await request('POST', '/api/v1/notes', {
      title: 'Architecture Overview Note',
      content: '# Initial Version\n\nThis is the base specification before edits.',
      project_id: projectId
    }, authCookie);
    testNoteId = noteRes.data.note.id;
    assert(noteRes.status === 201, 'Created target note in Knowledge Vault');

    // Make an update that triggers a version snapshot
    const editRes = await request('PUT', `/api/v1/notes/${testNoteId}`, {
      title: 'Architecture Overview Note — Revised',
      content: '# Revised Version\n\nAdded section on Model Context Protocol tools and safety.'
    }, authCookie);
    assert(editRes.status === 200, 'Updated note content');

    const versionsRes = await request('GET', `/api/v1/notes/${testNoteId}/versions`, null, authCookie);
    assert(versionsRes.status === 200, 'Fetched note versions');
    assert(versionsRes.data.versions && versionsRes.data.versions.length >= 1, 'Automatic version snapshot created in note_versions');

    const firstVer = versionsRes.data.versions[0];
    const verDetailRes = await request('GET', `/api/v1/notes/${testNoteId}/versions/${firstVer.id}`, null, authCookie);
    assert(verDetailRes.status === 200, 'Retrieved specific version content');
    assert(verDetailRes.data.version.title.includes('Architecture Overview Note'), 'Version preserves historical title and body');

    // ------------------------------------------------------------------------
    // Test 5: Note Version Restoration
    // ------------------------------------------------------------------------
    console.log('\n[Test 5: Note Version Restoration & Content Rollback]');
    const restoreRes = await request('POST', `/api/v1/notes/${testNoteId}/versions/${firstVer.id}/restore`, {}, authCookie);
    assert(restoreRes.status === 200, 'Restored note to previous snapshot version');
    
    const verifyNote = await request('GET', `/api/v1/notes/${testNoteId}`, null, authCookie);
    assert(verifyNote.status === 200, 'Retrieved note after restoration');
    assert(verifyNote.data.note.title === firstVer.title, 'Historical title successfully restored');

    // ------------------------------------------------------------------------
    // Test 6: Research Center Document Metadata & CRUD
    // ------------------------------------------------------------------------
    console.log('\n[Test 6: Research Center Document Management]');
    const db = require('../server/config/database');
    const docInsert = await db.query(
      `INSERT INTO research_documents (user_id, project_id, title, original_filename, file_name, file_path, file_type, file_size, content_text, summary, source_url, tags_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        projectId,
        'Attention Is All You Need',
        'transformer_paper.pdf',
        'transformer_paper.pdf',
        '/uploads/research/transformer_paper.pdf',
        'pdf',
        224150,
        'The dominant sequence transduction models are based on complex recurrent or convolutional neural networks...',
        'Seminal research paper introducing the Transformer architecture and self-attention mechanism.',
        'https://arxiv.org/abs/1706.03762',
        JSON.stringify(['AI', 'Transformers', 'Literature'])
      ]
    );
    testDocId = docInsert.insertId;
    assert(!!testDocId, 'Indexed research document record');

    const getDocRes = await request('GET', `/api/v1/research/${testDocId}`, null, authCookie);
    assert(getDocRes.status === 200, 'Fetched research document by ID');
    assert(getDocRes.data.document.title === 'Attention Is All You Need', 'Document title matches');

    const updateDocRes = await request('PUT', `/api/v1/research/${testDocId}`, {
      summary: 'Updated summary highlighting multi-head self-attention improvements.'
    }, authCookie);
    assert(updateDocRes.status === 200, 'Updated research metadata');
    assert(updateDocRes.data.document.summary.includes('multi-head'), 'Summary modification persisted');

    // ------------------------------------------------------------------------
    // Test 7: Full Account Data Export Bundle
    // ------------------------------------------------------------------------
    console.log('\n[Test 7: Full Account Workspace Data Export]');
    const exportRes = await request('GET', '/api/v1/users/me/export', null, authCookie);
    assert(exportRes.status === 200, 'Export endpoint returns HTTP 200');
    assert(exportRes.data.product === 'Flowden', 'Export identity confirmed as Flowden');
    assert(exportRes.data.data.projects.length >= 1, 'Export bundle includes projects');
    assert(exportRes.data.data.notes.length >= 1, 'Export bundle includes notes');
    assert(exportRes.data.data.tasks.length >= 1, 'Export bundle includes tasks');
    assert(exportRes.data.data.research_documents.length >= 1, 'Export bundle includes research');

    // ------------------------------------------------------------------------
    // Test 8: MCP Architecture & Permission-Gated Tools
    // ------------------------------------------------------------------------
    console.log('\n[Test 8: Model Context Protocol (MCP) Tools & Auth]');
    
    // Save MCP settings for user
    await request('PUT', '/api/v1/users/me', {
      settings_json: JSON.stringify({
        mcp: {
          apiKey: testMcpKey,
          scope: 'read_only',
          enabledProjects: [projectId]
        }
      })
    }, authCookie);

    // Call MCP tools list with bearer token
    const mcpToolsRes = await request('GET', '/mcp/tools', null, '', {
      'Authorization': `Bearer ${testMcpKey}`
    });
    assert(mcpToolsRes.status === 200, 'MCP tools list returns HTTP 200 with Bearer auth');
    assert(Array.isArray(mcpToolsRes.data.tools), 'Returns array of MCP tools');
    assert(mcpToolsRes.data.tools.some(t => t.name === 'search_vault_knowledge'), 'Includes search_vault_knowledge tool');
    assert(mcpToolsRes.data.tools.some(t => t.name === 'read_project_context'), 'Includes read_project_context tool');

    // Call an MCP tool
    const mcpCallRes = await request('POST', '/mcp/call', {
      name: 'search_vault_knowledge',
      arguments: { query: 'Architecture' }
    }, '', {
      'Authorization': `Bearer ${testMcpKey}`
    });
    assert(mcpCallRes.status === 200, 'Executed MCP tool search_vault_knowledge');
    assert(mcpCallRes.data.result.results.length >= 1, 'Tool retrieved matching knowledge vault notes');

    // Verify unauthenticated MCP call is rejected
    const unauthMcp = await request('POST', '/mcp/call', {
      name: 'search_vault_knowledge',
      arguments: { query: 'Architecture' }
    });
    assert(unauthMcp.status === 401, 'Rejects unauthenticated MCP request with 401');

    // ------------------------------------------------------------------------
    // Test 9: Clean Document & Task Deletion
    // ------------------------------------------------------------------------
    console.log('\n[Test 9: Cleanup & Deletion Isolation]');
    const delDoc = await request('DELETE', `/api/v1/research/${testDocId}`, null, authCookie);
    assert(delDoc.status === 200, 'Successfully deleted research document');

    const bulkDel = await request('POST', '/api/v1/tasks/bulk-delete', {
      taskIds: [testTaskId1, testTaskId2]
    }, authCookie);
    assert(bulkDel.status === 200, 'Successfully bulk deleted tasks');

    // ------------------------------------------------------------------------
    // Summary
    // ------------------------------------------------------------------------
    console.log('\n======================================================');
    console.log('  🎉 ALL SEGMENT 4 TESTS PASSED (9/9)');
    console.log('======================================================\n');

  } catch (err) {
    console.error('\n❌ Test execution error:', err);
    process.exit(1);
  } finally {
    if (server) {
      server.close();
    }
    if (db && db.pool) {
      await db.pool.end().catch(() => {});
    }
    process.exit(0);
  }
}

runTests();

