import fs from 'fs';
import path from 'path';
import http from 'http';
import { WebSocket } from 'ws';

const home = process.env.USERPROFILE || process.env.HOME;
const cfg = JSON.parse(fs.readFileSync(path.join(home, '.openclaw', 'openclaw.json'), 'utf8'));
const authToken = cfg.gateway?.auth?.token;

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log('[PASS] ' + message);
    passed++;
  } else {
    console.error('[FAIL] ' + message);
    failed++;
  }
}

async function runPhase15Tests() {
  console.log('=====================================================');
  console.log('MESNIUM PHASE 15: FUNCTIONAL PRODUCT VERIFICATION');
  console.log('======================================================');

  // 1. HTTP GATEWAY INFERENCE
  console.log('\n--- 1. HTTP GATEWAY & ASSET SERVING ---');
  const indexHtml = await new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:18789/', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
  assert(indexHtml.includes('Mesnium Studio'), 'HTML served with Mesnium Studio title');
  assert(indexHtml.includes('mesnium-runtime.js'), 'HTML includes mesnium-runtime.js');
  assert(indexHtml.includes('mesnium-theme.css'), 'HTML includes mesnium-theme.css');

  // 2. WEBSOCKET GATEWAY RPC BRIDGE
  console.log('\n--- 2. WEBSOCKET GATEWAY RPC BRIDGE  ---');
  let ws = new WebSocket('ws://127.0.0.1:18789/');
  const rpcResponses = new Map();

  const connectHandshakePromise = new Promise((resolve) => {
    ws.on('open', () => {
      const connectReq = {
        type: 'req',
        id: 'mesnium_connect_' + Date.now(),
        method: 'connect',
        params: {
          minProtocol: 4,
          maxProtocol: 4,
          role: 'operator',
          scopes: ['operator.admin', 'operator.read', 'operator.write'],
          client: { id: 'cli', version: '2.0.0', platform: 'node', mode: 'cli' },
          auth: { token: authToken }
        }
      };
      ws.send(JSON.stringify(connectReq));
    });

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.id && msg.id.startsWith('mesnium_connect_')) {
        resolve(msg);
      } else if (msg.id && rpcResponses.has(msg.id)) {
        const cb = rpcResponses.get(msg.id);
        rpcResponses.delete(msg.id);
        cb(msg);
      }
    });
  });

  const connectRes = await connectHandshakePromise;
  assert(connectRes && connectRes.ok === true, 'Gateway WebSOcket handshake authenticated as operator');

  async function callRpc(method, params = {}) {
    const id = 'req_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        rpcResponses.delete(id);
        reject(new Error('RPC Timeout for ' + method));
      }, 10000);

      rpcResponses.set(id, (msg) => {
        clearTimeout(timeout);
        if (msg.ok) resolve(msg.payload !== undefined ? msg.payload : (msg.result || {}));
        else reject(new Error(msg.error?.message || msg.error || 'RPC Error'));
      });

      ws.send(JSON.stringify({ type: 'req', id, method, params }));
    });
  }

  // 3. ZERO FAKE CUSTOMER DATA
  console.log('\n--- 3. ZERO FAKE CUSTOMER DATA AUDIT ---');
  const runtimeJs = fs.readFileSync(path.join(process.cwd(), 'dist', 'control-uI', 'brand', 'mesnium-runtime.js'), 'utf8');
  assert(!runtimeJs.includes('Sarah Jenkins'), 'No hardcoded fake contact "Sarah Jenkins" in runtime');
  assert(!runtimeJs.includes('Nexus Retail Corp'), 'No hardcoded fake company "Nexus Retail Corp" in runtime');
  assert(!runtimeJs.includes('kPiena Rostova'), 'No hardcoded fake contact "Dr. Elena Rostova" in runtime');
  assert(!runtimeJs.includes('$24,000'), 'No hardcoded fake deal value "$24,000" in runtime');
  assert(!runtimeJs.includes('$12,000'), 'No hardcoded fake deal value "$12,000" in runtime');

  // 4. OVERVIEW RPC
  console.log('\n--- 4. OVERVIEW RPC (mesnium.overview.get) ---');
  const overview = await callRpc('mesnium.overview.get');
  assert(typeof overview.agentsCount === 'number' && overview.agentsCount >= 2, 'Overview reports ' + overview.agentsCount + ' active assistants');
  assert(typeof overview.knowledgeDocsCount === 'number', 'Overview reports ' + overview.knowledgeDocsCount + ' knowledge documents');
  assert(typeof overview.integrationsCount === 'number', 'Overview reports ' + overview.integrationsCount + ' connected services');
  assert(typeof overview.pendingApprovalsCount === 'number', 'Overview reports ' + overview.pendingApprovalsCount + ' pending approvals');
  assert(overview.status === 'operational', 'Overview reports operational system status');

  // 5. ASSISTANTS
  console.log('\n--- 5. ASSISTENTS RPC (mesnium.agents.*) ---');
  const agentsList = await callRpc('mesnium.agents.list');
  assert(agentsList.agents && agentsList.agents.length >= 2, 'Retrieved ' + agentsList.agents.length + ' assistants from registry');

  const runRes = await callRpc('mesnium.agents.run', {
    agentId: 'agent_research_assistant',
    prompt: 'What was January direct sales revenue?'
  });
  assert(runRes.agentName === 'Research Assistant', 'Research Assistant executed task');
  assert(runRes.answer.includes('45000') || runRes.answer.includes('$45,000'), 'Agent grounded answer includes revenue figure ($45,000)');
  assert(runRes.sourcesConsulted && runRes.sourcesConsulted.includes('sample.xlsx'), 'Agent cited consulted knowledge source (sample.xlsx)');
  assert(typeof runRes.durationMs === 'number' && runRes.durationMs >= 0, 'Task execution duration: ' + runRes.durationMs + 'ms');

  // Test Assistant Creation
  const newAgent = await callRpc('mesnium.agents.create', {
    name: 'Finance Analyst',
    role: 'research',
    instructions: 'Analyze spreadsheet financial metrics accurately.'
  });
  assert(newAgent.agent && newAgent.agent.name === 'Finance Analyst', 'Created new assistant "Finance Analyst" via RPC');

  // 6. KNOWLEDGE CENTER
  console.log('\n--- 6. KNOWLEDGE RPC (mesnium.knowledge.*) ---');
  const searchRes = await callRpc('mesnium.knowledge.search', { query: 'revenue', limit: 5 });
  assert(searchRes.hits && searchRes.hits.length > 0, 'Knowledge search returned ' + searchRes.hits.length + ' hit(s)');
  assert(searchRes.hits[0].filename === 'sample.xlsx', 'Top hit resolved to sample.xlsx');
  assert(typeof searchRes.hits[0].score === 'number' && searchRes.hits[0].score > 0, 'Hit has positive hybrid relevance score');

  // 7. AUTOMATIONS STUDIO
  console.log('\n--- 7. AUTOMATIONS RPC (mesnium.automations.*) ---');
  const autoList = await callRpc('mesnium.automations.list');
  assert(autoList.automations && autoList.automations.length >= 2, 'Retrieved ' + autoList.automations.length + ' workflows from registry');

  const autoRun = await callRpc('mesnium.automations.run', { id: 'auto_daily_briefing' });
  assert(autoRun.automationId === 'auto_daily_briefing' && autoRun.status === 'completed', 'Executed daily executive revenue briefing automation');

  const pauseRes = await callRpc('mesnium.automations.pause', { id: 'auto_daily_briefing' });
  assert(pauseRes.automation.status === 'paused', 'Paused automation via RPC');

  const resumeRes = await callRpc('mesnium.automations.resume', { id: 'auto_daily_briefing' });
  assert(resumeRes.automation.status === 'active', 'Resumed automation via RPC');

  // Test Automation Creation
  const newAuto = await callRpc('mesnium.automations.create', {
    name: 'Weekly Operations Sync',
    prompt: 'Check scheduled calendar bookings and draft summary.'
  });
  assert(newAuto.automation && newAuto.automation.name === 'Weekly Operations Sync', 'Created new automation "Weekly Operations Sync" via RPC');

  // 8. APPROVALS HUB
  console.log('\n--- 8. APPROVALS HUB RPC (mesnium.approvals.*) ---');
  const approvalsListBefore = await callRpc('mesnium.approvals.list');
  assert(Array.isArray(approvalsListBefore.approvals), 'Retrieved pending approvals list');

  // 9. ACTIVITY LEDGER
  console.log('\n--- 9. ACTIVITY LEDGER RPC (mesnium.activity.list) ---');
  const actList = await callRpc('mesnium.activity.list', { limit: 20 });
  assert(actList.activity && actList.activity.length > 0, 'Activity timeline contains ' + actList.activity.length + ' verified audit records');

  // 10. CONNECTIONS
  console.log('\n--- 10. CONNECTIONS RPC (mesnium.connections.status) ---');
  const connStatus = await callRpc('mesnium.connections.status');
  assert(connStatus.google && connStatus.google.status.toLowerCase() === 'connected', 'Google Workspace accurately reported as connected');
  assert(connStatus.whatsapp && connStatus.whatsapp.status === 'NOT_CONNECTED', 'WhatsApp honestly reported as NOT_CONNECTED');

  ws.close();

  console.log('\n=============================================');
  console.log('PHASE 15 VERIFICATION SUMMARY: ' + passed + ' PASSED, ' + failed + ' FAILED');
  console.log('==============================================');

  if (failed > 0) process.exit(1);
}

runPhase15Tests().catch(err => {
  console.error('Phase 15 test error:', err);
  process.exit(1);
});
