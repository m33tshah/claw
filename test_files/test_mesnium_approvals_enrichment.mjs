/**
 * MESNIUM PHASE 2 INTEGRATION TEST SUITE
 * 
 * Verifies Human-Readable Gatekeeper Action Descriptions & Enriched Approvals UI:
 * 1. Server-side deterministic description generation (Calendar, Email, Drive, Filesystem, WhatsApp, Unknown)
 * 2. Client cannot override description or bypass server-side formatting
 * 3. Display description is purely display data and does NOT participate in SHA-256 HMAC payload integrity
 * 4. Cryptographic payload tamper detection strictly verifies canonical payload
 * 5. Tampering with displayDescription does NOT bypass security or cause false verification failures
 * 6. Safe fallbacks for unknown actions, missing arguments, and malformed inputs
 * 7. Zero leakage of credentials, tokens, passwords, or absolute internal filesystem paths
 * 8. Email body length bounding (truncation with ellipsis)
 * 9. Approvals RPC enrichment (mesnium.approvals.list returns title, summary, details, category, actionVerb)
 * 10. End-to-end proposal, approval, execution, and rejection lifecycle
 */

import { getSharedActionGatekeeper, MesniumActionGatekeeper } from '../dist/mesnium-actions/gatekeeper.js';
import { describeAction, formatDateTime, formatDuration, sanitizeFilePath } from '../dist/mesnium-actions/describe.js';
import { ActionType, ActionStatus, computePayloadHash } from '../dist/mesnium-actions/types.js';
import { mesniumRpcHandlers } from '../dist/mesnium-rpc/handlers.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${message}`);
    failed++;
  }
}

async function runTests() {
  console.log('================================================================');
  console.log('MESNIUM PHASE 2 — ENRICHED GATEKEEPER APPROVALS AUDIT SUITE');
  console.log('================================================================\n');

  // -------------------------------------------------------------
  // SUITE 1: DETERMINISTIC ACTION DESCRIBER — CANONICAL FAMILIES
  // -------------------------------------------------------------
  console.log('--- SUITE 1: DETERMINISTIC ACTION DESCRIBER — CANONICAL FAMILIES ---');

  // 1.1: Calendar Booking
  const calDesc = describeAction(ActionType.CALENDAR_CREATE, {
    summary: 'Executive Consultation',
    start: '2026-09-08T14:00:00.000Z',
    end: '2026-09-08T14:30:00.000Z',
    attendee: 'sarah.founder@example.com',
    location: 'Google Meet',
    description: 'Quarterly review discussion regarding expansion.'
  }, { agentName: 'AI Receptionist' });

  assert(calDesc.category === 'calendar', 'Calendar action assigned "calendar" category');
  assert(calDesc.actionVerb === 'Book Appointment', 'Action verb is "Book Appointment"');
  assert(calDesc.title === 'Book a calendar appointment', 'Human title formatted cleanly');
  assert(calDesc.summary.includes('Executive Consultation'), 'Summary contains meeting title');
  assert(calDesc.details.some(d => d.label === 'Event' && d.value === 'Executive Consultation'), 'Structured details include Event name');
  assert(calDesc.details.some(d => d.label === 'Duration' && d.value === '30 minutes'), 'Duration calculated accurately as 30 minutes');
  assert(calDesc.details.some(d => d.label === 'With' && d.value === 'sarah.founder@example.com'), 'Attendee email included in details');
  assert(calDesc.details.some(d => d.label === 'Requested by' && d.value === 'AI Receptionist'), 'Agent attribution preserved');

  // 1.2: Email Send
  const emailDesc = describeAction(ActionType.EMAIL_SEND, {
    to: 'partner@acme.corp',
    subject: 'Partnership Agreement Final Draft',
    body: 'Hi team, please find attached the revised agreement terms discussed yesterday. Let us know if you have any feedback.'
  }, { agentName: 'Sales Agent' });

  assert(emailDesc.category === 'email', 'Email action assigned "email" category');
  assert(emailDesc.actionVerb === 'Send Email', 'Action verb is "Send Email"');
  assert(emailDesc.title === 'Send an external email', 'Human title formatted cleanly');
  assert(emailDesc.summary.includes('partner@acme.corp') && emailDesc.summary.includes('Partnership Agreement'), 'Summary includes recipient and subject');
  assert(emailDesc.details.some(d => d.label === 'To' && d.value === 'partner@acme.corp'), 'To field correctly populated');
  assert(emailDesc.details.some(d => d.label === 'Message Preview'), 'Message preview included');

  // 1.3: Google Drive Upload
  const driveDesc = describeAction('google.drive.upload', {
    name: 'Q3_Financial_Model.xlsx',
    folder: 'Finance / 2026',
    content: 'binary_content_sample'
  }, { agentName: 'Operations Agent' });

  assert(driveDesc.category === 'drive', 'Drive action assigned "drive" category');
  assert(driveDesc.title === 'Upload file to Google Drive', 'Drive upload title formatted cleanly');
  assert(driveDesc.details.some(d => d.label === 'File' && d.value === 'Q3_Financial_Model.xlsx'), 'File name isolated');
  assert(driveDesc.details.some(d => d.label === 'Destination' && d.value === 'Finance / 2026'), 'Destination folder included');

  // 1.4: Filesystem Organization
  const fsDesc = describeAction('filesystem.organize', {
    folder: 'C:\\Users\\Meet\\Desktop',
    action: 'execute_organization'
  }, { agentName: 'Operations Agent' });

  assert(fsDesc.category === 'filesystem', 'Filesystem action assigned "filesystem" category');
  assert(fsDesc.title === 'Organize local files', 'Filesystem title formatted cleanly');

  // 1.5: WhatsApp Message
  const waDesc = describeAction('whatsapp', {
    to: '+1234567890',
    message: 'Your appointment is confirmed for tomorrow.'
  }, { agentName: 'AI Receptionist' });

  assert(waDesc.category === 'messaging', 'WhatsApp action assigned "messaging" category');
  assert(waDesc.actionVerb === 'Send WhatsApp', 'Action verb is "Send WhatsApp"');

  // -------------------------------------------------------------
  // SUITE 2: SAFETY, BOUNDING & CREDENTIAL SANITIZATION
  // -------------------------------------------------------------
  console.log('\n--- SUITE 2: SAFETY, BOUNDING & CREDENTIAL SANITIZATION ---');

  // 2.1: Bounding huge email bodies
  const hugeBody = 'A'.repeat(5000);
  const hugeEmailDesc = describeAction(ActionType.EMAIL_SEND, {
    to: 'client@example.com',
    subject: 'Huge text',
    body: hugeBody
  });
  const preview = hugeEmailDesc.details.find(d => d.label === 'Message Preview')?.value || '';
  assert(preview.length <= 160 && preview.endsWith('…'),
    `Huge email body bounded to safe preview length (${preview.length} chars)`);

  // 2.2: Secret / Token / Key Sanitization
  const sensitiveDesc = describeAction('custom.api.call', {
    endpoint: '/api/v1/charge',
    amount: 150,
    api_key: 'sk_live_SECRET_DO_NOT_LEAK',
    bearer_token: 'tok_sensitive_xyz123',
    password: 'super_secret_password',
    auth_token: 'auth_999'
  });

  const detailValues = sensitiveDesc.details.map(d => `${d.label}: ${d.value}`).join(' ');
  assert(!detailValues.includes('sk_live_SECRET_DO_NOT_LEAK'), 'api_key stripped from display details');
  assert(!detailValues.includes('tok_sensitive_xyz123'), 'bearer_token stripped from display details');
  assert(!detailValues.includes('super_secret_password'), 'password stripped from display details');
  assert(!detailValues.includes('auth_999'), 'auth_token stripped from display details');
  assert(detailValues.includes('150'), 'Safe business parameters (amount: 150) preserved');

  // 2.3: Internal Filesystem Path Sanitization
  const leakedPath = 'C:\\Users\\Meet\\.openclaw\\secrets\\oauth_token.json';
  const sanitized = sanitizeFilePath(leakedPath);
  assert(!sanitized.includes('C:\\Users') && !sanitized.includes('.openclaw'),
    `Internal user directory stripped: "${sanitized}"`);

  // 2.4: Malformed input resilience
  const nullDesc = describeAction(null, null, null);
  assert(nullDesc && nullDesc.title === 'Action requires approval',
    'Null inputs handled safely with fallback description without crashing');

  const circularObj = {};
  circularObj.self = circularObj;
  const malformedDesc = describeAction('invalid_action', circularObj);
  assert(malformedDesc && malformedDesc.category === 'system',
    'Malformed/circular inputs handled gracefully with safe fallback');

  // -------------------------------------------------------------
  // SUITE 3: CRYPTOGRAPHIC INTEGRITY & INDEPENDENCE FROM DISPLAY
  // -------------------------------------------------------------
  console.log('\n--- SUITE 3: CRYPTOGRAPHIC INTEGRITY & INDEPENDENCE FROM DISPLAY ---');
  const gatekeeper = getSharedActionGatekeeper();

  const originalPayload = {
    summary: 'VIP Board Meeting',
    start: '2026-09-10T10:00:00.000Z',
    end: '2026-09-10T11:00:00.000Z',
    attendee: 'board@company.com'
  };

  const proposal = gatekeeper.proposeAction({
    agentId: 'agent_receptionist',
    workspaceId: 'default',
    actionType: ActionType.CALENDAR_CREATE,
    title: 'Schedule Board Meeting',
    target: 'VIP Calendar',
    payload: originalPayload
  });

  const originalHash = proposal.payloadHash;
  assert(typeof originalHash === 'string' && originalHash.length === 64,
    `SHA-256 HMAC calculated on canonical payload: ${originalHash.slice(0, 16)}...`);
  assert(proposal.displayDescription !== void 0 && proposal.displayDescription.category === 'calendar',
    'Human-readable displayDescription attached to proposal');

  // 3.1: Verify displayDescription is NOT part of the cryptographic hash
  // If we change displayDescription, computePayloadHash on payload remains identical!
  const computedHashBefore = computePayloadHash(proposal.payload);
  assert(computedHashBefore === originalHash,
    'computePayloadHash strictly inspects action.payload, ignoring displayDescription');

  // Tampering with displayDescription does NOT break legitimate execution
  proposal.displayDescription.title = 'Attacker modified UI title';
  proposal.displayDescription.summary = 'Attacker modified summary';
  assert(computePayloadHash(proposal.payload) === originalHash,
    'Mutating displayDescription has ZERO effect on payloadHash verification');

  // 3.2: Tampering with authoritative payload MUST trigger cryptographic integrity failure
  proposal.payload.summary = 'HACKED: Transferred all funds';
  let executionTamperFailed = false;
  try {
    gatekeeper.approveAction(proposal.id, 'Admin');
    await gatekeeper.executeAction(proposal.id);
  } catch (err) {
    if (err.message.includes('Payload integrity violation') || err.message.includes('Payload hash mismatch')) {
      executionTamperFailed = true;
    }
  }
  assert(executionTamperFailed,
    'Cryptographic SHA-256 integrity check detected modified payload and aborted execution');

  // -------------------------------------------------------------
  // SUITE 4: END-TO-END APPROVAL & EXECUTION LIFECYCLE
  // -------------------------------------------------------------
  console.log('\n--- SUITE 4: END-TO-END APPROVAL & EXECUTION LIFECYCLE ---');

  const validProposal = gatekeeper.proposeAction({
    agentId: 'agent_receptionist',
    workspaceId: 'default',
    actionType: ActionType.CALENDAR_CREATE,
    payload: {
      summary: 'Legitimate Customer Consultation',
      start: '2026-09-15T14:00:00.000Z',
      end: '2026-09-15T14:30:00.000Z'
    }
  });

  assert(validProposal.status === ActionStatus.PENDING_APPROVAL,
    'Action proposal starts in PENDING_APPROVAL state');

  // Approve
  const approvedAction = gatekeeper.approveAction(validProposal.id, 'Chief of Staff');
  assert(approvedAction.status === ActionStatus.APPROVED && approvedAction.approvedBy === 'Chief of Staff',
    'Action marked APPROVED with approver metadata');

  // Execute with mock executor
  let executedDetails = null;
  const execResult = await gatekeeper.executeAction(validProposal.id, async (payload) => {
    executedDetails = `Successfully booked: ${payload.summary}`;
    return { success: true, bookingId: 'cal_event_9921' };
  });

  assert(execResult && execResult.success === true,
    'Approved action executes successfully with original payload');
  assert(executedDetails === 'Successfully booked: Legitimate Customer Consultation',
    'Executor received un-tampered canonical payload');

  const finishedAction = gatekeeper.getAction(validProposal.id);
  assert(finishedAction.status === ActionStatus.COMPLETED,
    'Action state transitions to COMPLETED');

  // Idempotency: cannot execute again
  let secondExecFailed = false;
  try {
    await gatekeeper.executeAction(validProposal.id);
  } catch (err) {
    secondExecFailed = true;
  }
  assert(secondExecFailed, 'Idempotency guard prevents duplicate execution of completed action');

  // -------------------------------------------------------------
  // SUITE 5: RPC ENRICHMENT (mesnium.approvals.list)
  // -------------------------------------------------------------
  console.log('\n--- SUITE 5: RPC ENRICHMENT (mesnium.approvals.list) ---');

  // Create a fresh pending proposal
  const rpcTestProposal = gatekeeper.proposeAction({
    agentId: 'agent_receptionist',
    workspaceId: 'default',
    actionType: ActionType.EMAIL_SEND,
    payload: {
      to: 'client@domain.com',
      subject: 'Confirmation of service',
      body: 'Your booking has been received.'
    }
  });

  let rpcResponse = null;
  await mesniumRpcHandlers['mesnium.approvals.list']({
    params: { workspaceId: 'default' },
    respond: (ok, data) => {
      if (ok) rpcResponse = data;
    }
  });

  assert(rpcResponse !== null && Array.isArray(rpcResponse.approvals),
    'RPC mesnium.approvals.list returns array of approvals');

  const matched = rpcResponse.approvals.find(a => a.id === rpcTestProposal.id);
  assert(matched !== void 0, 'Newly proposed action visible in RPC response');
  assert(matched.category === 'email', `Enriched category returned: "${matched.category}"`);
  assert(matched.actionVerb === 'Send Email', `Enriched actionVerb returned: "${matched.actionVerb}"`);
  assert(matched.title === 'Send an external email', `Enriched human title returned: "${matched.title}"`);
  assert(matched.summary.includes('client@domain.com'), `Enriched summary returned: "${matched.summary}"`);
  assert(Array.isArray(matched.details) && matched.details.length >= 2,
    `Structured details returned (${matched.details.length} fields)`);
  assert(matched.payloadHash === void 0,
    'Security check: internal payloadHash is NOT exposed in client RPC response');

  // Clean up
  gatekeeper.rejectAction(rpcTestProposal.id, 'Test cleanup', 'Test');

  console.log('\n================================================================');
  console.log(`MESNIUM PHASE 2 TEST RESULTS: ${passed} PASSED / ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
