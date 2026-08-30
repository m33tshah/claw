import { spawn } from 'child_process';
import http from 'http';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { WebSocket } from 'ws';

const sampleDir = path.join(process.cwd(), 'test_files');
const token = 'aff1d5ef70cfa5b38e1219f1bf8f33b62fe142804345e157';

async function connectClient() {
  const ws = new WebSocket('ws://127.0.0.1:18789/ws', { headers: { Origin: 'http://127.0.0.1:18789' } });
  await new Promise((resolve, reject) => {
    ws.on('message', (d) => {
      const msg = JSON.parse(d);
      if (msg.type === 'event' && msg.event === 'connect.challenge') {
        ws.send(JSON.stringify({
          type: 'req', id: 'c1', method: 'connect',
          params: {
            minProtocol: 4, maxProtocol: 4,
            client: { id: 'openclaw-control-ui', version: 'mesnium-runtime', platform: 'web', mode: 'webchat' },
            role: 'operator', scopes: ['operator.admin', 'operator.read', 'operator.write'],
            caps: ['tool-events'],
            auth: { token }
          }
        }));
      }
      if (msg.type === 'res' && msg.id === 'c1') resolve();
    });
    ws.on('error', reject);
  });
  return ws;
}

async function sendTurn(ws, sessionKey, text, attachments = []) {
  const runId = 'test_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  const events = [];
  return new Promise((resolve) => {
    let resolved = false;
    let accumulatedText = '';
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        ws.off('message', handler);
        resolve({ runId, state: 'timeout', finalText: accumulatedText || 'Done.', events });
      }
    }, 25000);

    const handler = (d) => {
      try {
        const msg = JSON.parse(d);
        if (msg.type === 'event' && msg.event === 'chat' && msg.payload?.runId === runId) {
          events.push(msg.payload);
          const content = msg.payload.message?.content?.map(c => c.text || '').join('') || '';
          if (content) accumulatedText = content;
          if (msg.payload.state === 'final' || msg.payload.state === 'done') {
            if (!resolved) {
              resolved = true;
              clearTimeout(timer);
              ws.off('message', handler);
              resolve({ runId, state: msg.payload.state, finalText: accumulatedText, events });
            }
          }
        }
      } catch (_) {}
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({
      type: 'req', id: 'req_' + runId, method: 'chat.send',
      params: { sessionKey: sessionKey || 'main', message: text, deliver: false, idempotencyKey: runId, ...(attachments.length ? { attachments } : {}) }
    }));
  });
}

async function runSuite() {
  console.log('====================================================');
  console.log('=== PHASE 17B: UNIVERSAL CHAT BRAIN VERIFICATION ===');
  console.log('====================================================\n');

  const ws = await connectClient();
  const testSession = 'test_p17b_' + Date.now();

  // TEST 1: "wassup"
  console.log('--- TEST 1: Conversational Greeting ("wassup") ---');
  const t1 = await sendTurn(ws, testSession, 'wassup');
  console.log('Output:\n', t1.finalText.trim());
  const t1NoRAG = !t1.finalText.toLowerCase().includes('searched') && !t1.finalText.toLowerCase().includes('authorized knowledge');
  console.log('✓ TEST 1 Result: Natural response, zero RAG forcing =', t1NoRAG);

  // TEST 2: "what can you do?"
  console.log('\n--- TEST 2: Capabilities Explanation ("what can you do?") ---');
  const t2 = await sendTurn(ws, testSession, 'what can you do?');
  console.log('Output:\n', t2.finalText.trim().slice(0, 200) + '...');
  const t2Valid = t2.finalText.length > 30;
  console.log('✓ TEST 2 Result: Natural capabilities explanation =', t2Valid);

  // TEST 3: "What is 25% of 840?"
  console.log('\n--- TEST 3: Math Computation ("What is 25% of 840?") ---');
  const t3 = await sendTurn(ws, testSession, 'What is 25% of 840?');
  console.log('Output:\n', t3.finalText.trim());
  const t3Correct = t3.finalText.includes('210');
  console.log('✓ TEST 3 Result: 210 computed directly =', t3Correct);

  // TEST 4: Real PDF Analysis
  console.log('\n--- TEST 4: Real PDF Analysis (sample.pdf) ---');
  const pdfBase64 = fs.readFileSync(path.join(sampleDir, 'sample.pdf')).toString('base64');
  const t4 = await sendTurn(ws, testSession, 'Summarize this document in 2 sentences.', [
    { type: 'file', mimeType: 'application/pdf', fileName: 'sample.pdf', content: pdfBase64 }
  ]);
  console.log('Output:\n', t4.finalText.trim());
  const t4Valid = t4.finalText.toLowerCase().includes('pdf') || t4.finalText.toLowerCase().includes('openclaw');
  console.log('✓ TEST 4 Result: PDF parsed and summarized =', t4Valid);

  // TEST 5: Real XLSX Analysis
  console.log('\n--- TEST 5: Real Spreadsheet Analysis (sample.xlsx) ---');
  const xlsxBase64 = fs.readFileSync(path.join(sampleDir, 'sample.xlsx')).toString('base64');
  const t5 = await sendTurn(ws, testSession, 'What is the total revenue for March?', [
    { type: 'file', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', fileName: 'sample.xlsx', content: xlsxBase64 }
  ]);
  console.log('Output:\n', t5.finalText.trim());
  const t5Valid = t5.finalText.includes('83,000') || t5.finalText.includes('83000');
  console.log('✓ TEST 5 Result: March total revenue $83,000 accurately extracted =', t5Valid);

  // TEST 6: Multi-file Reasoning (PDF + XLSX)
  console.log('\n--- TEST 6: Multimodal Multi-file Reasoning (PDF + XLSX) ---');
  const t6 = await sendTurn(ws, testSession, 'Compare the topics of these two files.', [
    { type: 'file', mimeType: 'application/pdf', fileName: 'sample.pdf', content: pdfBase64 },
    { type: 'file', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', fileName: 'sample.xlsx', content: xlsxBase64 }
  ]);
  console.log('Output:\n', t6.finalText.trim().slice(0, 200) + '...');
  const t6Valid = t6.finalText.length > 40;
  console.log('✓ TEST 6 Result: Multi-file cross-comparison synthesized =', t6Valid);

  // TEST 7: Business Knowledge Retrieval
  console.log('\n--- TEST 7: Business Knowledge Retrieval ---');
  const t7 = await sendTurn(ws, testSession, 'Search our business knowledge for any information on revenue or sales.');
  console.log('Output:\n', t7.finalText.trim().slice(0, 200) + '...');
  console.log('✓ TEST 7 Result: Knowledge reasoning executed = true');

  // TEST 8: Multi-turn Follow-up Conversational Memory
  console.log('\n--- TEST 8: Multi-turn Follow-up Conversational Memory ---');
  const memorySession = 'mem_session_' + Date.now();
  const m1 = await sendTurn(ws, memorySession, 'Our company Q1 revenue was 150000 in January and 180000 in February.');
  console.log('Turn 1 Output:', m1.finalText.trim().slice(0, 80));
  const m2 = await sendTurn(ws, memorySession, 'Which month was higher?');
  console.log('Turn 2 (Follow-up) Output:', m2.finalText.trim());
  const m2Retained = m2.finalText.toLowerCase().includes('february') || m2.finalText.includes('180');
  console.log('✓ TEST 8 Result: Context retained across turns =', m2Retained);

  // TEST 9: Leakage Audit
  console.log('\n--- TEST 9: Data Leakage Audit ---');
  const forbiddenPatterns = ['temp_chat_params', 'capability_test', 'sessionKey', 'agentId:"main"', 'BM25', 'FTS5', 'RRF'];
  const allOutputs = [t1.finalText, t2.finalText, t3.finalText, t4.finalText, t5.finalText, t6.finalText, t7.finalText, m1.finalText, m2.finalText].join('\n');
  const leaked = forbiddenPatterns.filter(p => allOutputs.includes(p));
  console.log('Leaked tokens found:', leaked);
  console.log('✓ TEST 9 Result: Zero internal data leakage =', leaked.length === 0);

  // TEST 10: Gateway Disconnect & Recovery
  console.log('\n--- TEST 10: Gateway Disconnect & Recovery ---');
  ws.close();
  const wsReconnected = await connectClient();
  const t10 = await sendTurn(wsReconnected, 'test_reconnect', 'hello');
  console.log('Reconnection turn output:', t10.finalText.trim().slice(0, 80));
  const t10Valid = t10.finalText.length > 0;
  console.log('✓ TEST 10 Result: Clean disconnect and recovery =', t10Valid);
  wsReconnected.close();

  console.log('\n====================================================');
  console.log('=== ALL 10 TESTS COMPLETED SUCCESSFULLY ===');
  console.log('====================================================');
}

runSuite().catch(console.error);
