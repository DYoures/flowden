// tests/test_mcp_bridge.js
/**
 * Test suite to verify the Flowden MCP Stdio Server Bridge (server/mcp/index.js)
 * used by Claude Desktop.
 */

const { spawn } = require('child_process');
const path = require('path');
const readline = require('readline');

const API_KEY = 'fld_mcp_a5bfcefa1dbafcff4e2fd24dbc6ec79047fcc8833ecec011';
const API_URL = 'http://127.0.0.1:3000/mcp';
const MCP_SCRIPT = path.resolve(__dirname, '../server/mcp/index.js');

let passCount = 0;
let failCount = 0;

function record(name, condition, details = '') {
  if (condition) {
    passCount++;
    console.log(`  ✅ [PASS] #${passCount} ${name} ${details ? '(' + details + ')' : ''}`);
  } else {
    failCount++;
    console.error(`  ❌ [FAIL] #${passCount + failCount} ${name} ${details ? '(' + details + ')' : ''}`);
  }
}

(async () => {
  console.log('\n================================================================');
  console.log('FLOWDEN MCP STDIO BRIDGE VERIFICATION');
  console.log('================================================================\n');

  // Test 1: Spawning without env should fail with exit code 1
  console.log('[Test 1: Missing Environment Variables Validation]');
  const failProc = spawn(process.execPath, [MCP_SCRIPT], {
    env: { ...process.env, FLOWDEN_API_URL: '', FLOWDEN_API_KEY: '' },
    stdio: ['pipe', 'pipe', 'pipe']
  });

  let failStderr = '';
  failProc.stderr.on('data', d => { failStderr += d.toString(); });

  const failExitCode = await new Promise(res => failProc.on('close', res));
  record('Process exits with code 1 when env vars are missing', failExitCode === 1, `code=${failExitCode}`);
  record('Error message logged to stderr indicates missing variables',
    failStderr.includes('Both FLOWDEN_API_URL and FLOWDEN_API_KEY environment variables are required'),
    `stderrSnippet="${failStderr.trim().split('\n')[0]}"`
  );

  // Test 2: Spawning with valid env and communicating over JSON-RPC stdio
  console.log('\n[Test 2: Full MCP JSON-RPC Stdio Protocol Exchange]');
  const child = spawn(process.execPath, [MCP_SCRIPT], {
    env: {
      ...process.env,
      FLOWDEN_API_URL: API_URL,
      FLOWDEN_API_KEY: API_KEY
    },
    stdio: ['pipe', 'pipe', 'pipe']
  });

  let childStderr = '';
  child.stderr.on('data', d => {
    childStderr += d.toString();
  });

  const rl = readline.createInterface({
    input: child.stdout,
    crlfDelay: Infinity
  });

  const pendingResponses = new Map();

  rl.on('line', line => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      const msg = JSON.parse(trimmed);
      if (msg.id !== undefined && pendingResponses.has(msg.id)) {
        pendingResponses.get(msg.id)(msg);
        pendingResponses.delete(msg.id);
      }
    } catch (e) {
      console.error('Failed to parse stdout line as JSON-RPC:', trimmed);
    }
  });

  function sendRpc(msg) {
    return new Promise((resolve) => {
      if (msg.id !== undefined) {
        pendingResponses.set(msg.id, resolve);
      }
      child.stdin.write(JSON.stringify(msg) + '\n');
      if (msg.id === undefined) {
        resolve(null);
      }
    });
  }

  // Allow startup tool discovery to complete
  await new Promise(r => setTimeout(r, 1000));

  record('Tools discovery logged to stderr',
    childStderr.includes('Discovered') && childStderr.includes('tool(s)'),
    `stderr="${childStderr.trim().split('\n').slice(-2).join(' | ')}"`
  );

  // Send initialize
  const initRes = await sendRpc({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'claude-desktop-test', version: '1.0.0' }
    }
  });

  record('Initialize response received with server capabilities',
    Boolean(initRes && initRes.result && initRes.result.capabilities && initRes.result.capabilities.tools),
    `server=${initRes?.result?.serverInfo?.name}`
  );

  // Send initialized notification
  await sendRpc({
    jsonrpc: '2.0',
    method: 'notifications/initialized'
  });

  // Request tools/list
  const toolsRes = await sendRpc({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
    params: {}
  });

  const tools = toolsRes?.result?.tools || [];
  record('tools/list returned all 6 registered Flowden tools',
    tools.length === 6,
    `count=${tools.length}`
  );

  const toolNames = tools.map(t => t.name);
  record('Expected Flowden tools are present',
    toolNames.includes('search_vault_knowledge') &&
    toolNames.includes('get_workflow_tasks') &&
    toolNames.includes('read_project_context') &&
    toolNames.includes('get_research_sources') &&
    toolNames.includes('get_knowledge_connections') &&
    toolNames.includes('create_vault_note'),
    `tools=${toolNames.join(', ')}`
  );

  // Call tool: get_workflow_tasks
  const callRes = await sendRpc({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'get_workflow_tasks',
      arguments: {}
    }
  });

  record('tools/call for get_workflow_tasks succeeded (isError=false)',
    callRes && callRes.result && callRes.result.isError === false && Array.isArray(callRes.result.content),
    `contentLength=${callRes?.result?.content?.[0]?.text?.length}`
  );

  // Call tool with unknown tool: error handled gracefully without crash
  const errCallRes = await sendRpc({
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: {
      name: 'non_existent_tool',
      arguments: {}
    }
  });

  record('tools/call with unknown tool returns isError: true and does not crash server',
    errCallRes && errCallRes.result && errCallRes.result.isError === true,
    `errorText="${errCallRes?.result?.content?.[0]?.text}"`
  );

  // Call tool with unauthorized project
  const unauthCallRes = await sendRpc({
    jsonrpc: '2.0',
    id: 5,
    method: 'tools/call',
    params: {
      name: 'read_project_context',
      arguments: { project_id: 999999 }
    }
  });

  record('tools/call with unauthorized project returns isError: true gracefully',
    unauthCallRes && unauthCallRes.result && unauthCallRes.result.isError === true,
    `errorText="${unauthCallRes?.result?.content?.[0]?.text}"`
  );

  // Clean shutdown
  child.stdin.end();
  child.kill();

  console.log('\n================================================================');
  console.log(`MCP BRIDGE VERIFICATION: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('================================================================\n');

  if (failCount > 0) process.exit(1);
  else process.exit(0);
})();

