/**
 * MESNIUM PUBLIC INBOUND GATEWAY (PHASE 1 INTEGRATION)
 * 
 * Secure HTTP request router for external website visitors and the embeddable chat widget.
 * 
 * Endpoints:
 * - GET  /widget/mesnium-widget.js         -> Serves standalone embeddable chat widget
 * - GET  /public/widget/mesnium-widget.js  -> Alias for widget script
 * - GET  /public/chat/:publicId/status     -> Returns { available: boolean }
 * - POST /public/chat/:publicId            -> Inbound customer message handling
 * - OPTIONS for all endpoints              -> CORS preflight
 * 
 * Enforces:
 * - Rate limiting (IP and session)
 * - Request validation & size caps
 * - Opaque public tenant resolution
 * - Visitor session continuity
 * - Receptionist execution restricted to public-safe tools
 * - Authoritative Gatekeeper preservation
 * - Customer-safe error sanitization
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSharedPublicTenantManager } from './tenants.js';
import { getSharedVisitorConversationManager } from './conversations.js';
import { getSharedPublicRateLimiter } from './ratelimit.js';
import {
  PUBLIC_SECURITY_CONSTANTS,
  validatePublicInboundRequest,
  frameUntrustedVisitorMessage,
  formatCustomerSafeResponse
} from './security.js';
import { getSharedAgentRuntime } from '../mesnium-agents/runtime.js';
import { getSharedActivityLedger } from '../mesnium-agents/activity.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WIDGET_SCRIPT_PATH = path.resolve(__dirname, '../control-ui/widget/mesnium-widget.js');

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function sendJson(res, statusCode, data) {
  setCorsHeaders(res);
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.end(JSON.stringify(data));
}

function getClientIp(req, trustedProxies = [], allowRealIpFallback = false) {
  if (allowRealIpFallback && req.headers['x-real-ip']) {
    return String(req.headers['x-real-ip']).trim();
  }
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded && typeof forwarded === 'string') {
    const ips = forwarded.split(',').map(s => s.trim());
    if (ips.length > 0 && ips[0]) return ips[0];
  }
  return req.socket?.remoteAddress || '127.0.0.1';
}

function readJsonBody(req, maxBytes = PUBLIC_SECURITY_CONSTANTS.MAX_PAYLOAD_BYTES) {
  return new Promise((resolve, reject) => {
    let raw = '';
    let bytes = 0;

    req.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        const err = new Error('Payload Too Large');
        err.statusCode = 413;
        reject(err);
        req.destroy();
        return;
      }
      raw += chunk;
    });

    req.on('end', () => {
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        resolve(parsed);
      } catch (err) {
        const parseErr = new Error('Malformed JSON payload');
        parseErr.statusCode = 400;
        reject(parseErr);
      }
    });

    req.on('error', err => reject(err));
  });
}

/**
 * Main HTTP request handler for the Mesnium Public Inbound Gateway.
 * Returns true if the request was handled, or false to pass to next gateway stage.
 */
export async function handleMesniumPublicInboundRequest(req, res, opts = {}) {
  const urlRaw = req.url || '/';
  let pathname = '';
  try {
    pathname = new URL(urlRaw, 'http://localhost').pathname;
  } catch (_) {
    return false;
  }

  // 1. Widget Script Serving
  if (pathname === '/widget/mesnium-widget.js' || pathname === '/public/widget/mesnium-widget.js') {
    if (req.method === 'OPTIONS') {
      setCorsHeaders(res);
      res.statusCode = 204;
      res.end();
      return true;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.statusCode = 405;
      res.setHeader('Allow', 'GET, HEAD, OPTIONS');
      res.end('Method Not Allowed');
      return true;
    }

    try {
      if (fs.existsSync(WIDGET_SCRIPT_PATH)) {
        const content = fs.readFileSync(WIDGET_SCRIPT_PATH, 'utf8');
        setCorsHeaders(res);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.end(content);
        return true;
      }
    } catch (err) {
      console.error('[mesnium-public] Error reading widget script:', err);
    }
    res.statusCode = 404;
    res.end('Widget script not found');
    return true;
  }

  // 2. Chat API Path Matching
  // Matches: /public/chat/:publicId/status or /api/v1/public/chat/:publicId/status
  const statusMatch = /^(?:\/api\/v1)?\/public\/chat\/([^/]+)\/status\/?$/.exec(pathname);
  if (statusMatch) {
    const publicId = decodeURIComponent(statusMatch[1]);
    if (req.method === 'OPTIONS') {
      setCorsHeaders(res);
      res.statusCode = 204;
      res.end();
      return true;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.statusCode = 405;
      res.setHeader('Allow', 'GET, HEAD, OPTIONS');
      res.end('Method Not Allowed');
      return true;
    }

    const tenantManager = getSharedPublicTenantManager();
    const tenant = tenantManager.getTenantByPublicId(publicId);
    // Always 200 with available boolean so attackers cannot enumerate valid public IDs
    sendJson(res, 200, {
      available: Boolean(tenant && tenant.enabled)
    });
    return true;
  }

  // Matches: /public/chat/:publicId or /api/v1/public/chat/:publicId
  const chatMatch = /^(?:\/api\/v1)?\/public\/chat\/([^/]+)\/?$/.exec(pathname);
  if (chatMatch) {
    const publicId = decodeURIComponent(chatMatch[1]);
    if (req.method === 'OPTIONS') {
      setCorsHeaders(res);
      res.statusCode = 204;
      res.end();
      return true;
    }
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.setHeader('Allow', 'POST, OPTIONS');
      res.end('Method Not Allowed');
      return true;
    }

    const clientIp = getClientIp(req, opts.trustedProxies, opts.allowRealIpFallback);
    const tenantManager = getSharedPublicTenantManager();
    const conversationManager = getSharedVisitorConversationManager();
    const rateLimiter = getSharedPublicRateLimiter();

    // Verify Public Tenant
    const tenant = tenantManager.getTenantByPublicId(publicId);
    if (!tenant || !tenant.enabled) {
      sendJson(res, 404, {
        error: "This chat is not available."
      });
      return true;
    }

    // Read and parse request payload
    let rawBody;
    try {
      rawBody = await readJsonBody(req);
    } catch (err) {
      sendJson(res, err.statusCode || 400, {
        error: err.message || 'Malformed request body.'
      });
      return true;
    }

    // Validate request structure and message
    const validation = validatePublicInboundRequest(rawBody);
    if (!validation.valid) {
      sendJson(res, validation.statusCode, {
        error: validation.error
      });
      return true;
    }

    // Rate Limiting Check
    const rateCheck = rateLimiter.checkRateLimit({
      ip: clientIp,
      conversationToken: validation.conversationToken
    });
    if (!rateCheck.allowed) {
      res.setHeader('Retry-After', String(rateCheck.retryAfterSeconds || 30));
      sendJson(res, 429, {
        error: "You're sending messages a bit too quickly. Please wait a moment and try again."
      });
      return true;
    }

    // Resolve or initialize visitor conversation session
    const session = conversationManager.getOrCreateSession(
      publicId,
      tenant.workspaceId,
      validation.conversationToken
    );

    // Enforce conversation length cap to prevent token exhaustion attacks
    if (session.turnCount >= PUBLIC_SECURITY_CONSTANTS.MAX_TURNS_PER_CONVERSATION) {
      sendJson(res, 429, {
        error: "This chat has reached the maximum message limit. Please start a new conversation or contact the team directly."
      });
      return true;
    }

    // Frame untrusted visitor input with security instructions
    const framedPrompt = frameUntrustedVisitorMessage(validation.message, session);

    // Execute the Receptionist with strictly restricted tools
    const agentRuntime = getSharedAgentRuntime();
    let agentResult;

    try {
      agentResult = await agentRuntime.runAgent('agent_receptionist', framedPrompt, {
        workspaceId: tenant.workspaceId,
        allowedTools: PUBLIC_SECURITY_CONSTANTS.ALLOWED_PUBLIC_TOOLS,
        actor: 'public_visitor',
        visitorId: session.visitorId,
        conversationId: session.id,
        maxSteps: 4
      });
    } catch (agentErr) {
      const errMsg = agentErr?.message || String(agentErr);

      // Gracefully handle unconfigured / billing-required AI providers without leaking internal provider details
      if (
        errMsg.includes('MODEL_PROVIDER_REQUIRES_SETUP') ||
        errMsg.includes('billing') ||
        errMsg.includes('No active AI model') ||
        errMsg.includes('authentication failed')
      ) {
        console.warn(`[mesnium-public] AI Provider setup pending for tenant ${publicId}:`, errMsg);
        const safeReply = "Our chat assistant is currently undergoing scheduled maintenance. Please contact our office directly or try again shortly.";
        conversationManager.addTurn(session.conversationToken, validation.message, safeReply);
        sendJson(res, 200, {
          reply: safeReply,
          conversation_token: session.conversationToken
        });
        return true;
      }

      console.error('[mesnium-public] Execution failure in receptionist runtime:', agentErr);
      sendJson(res, 503, {
        error: "Sorry — our chat isn't available right now. Please try again shortly.",
        conversation_token: session.conversationToken
      });
      return true;
    }

    // Format clean, customer-safe response (stripping internal IDs and checksums)
    const formattedResponse = formatCustomerSafeResponse(agentResult, session);

    // Save turn in conversation store
    conversationManager.addTurn(
      session.conversationToken,
      validation.message,
      formattedResponse.reply
    );

    // Record public interaction in activity ledger
    try {
      const activity = getSharedActivityLedger();
      if (activity && typeof activity.recordRun === 'function') {
        activity.recordRun({
          agentId: 'agent_receptionist',
          agentName: 'AI Receptionist',
          prompt: `Public Chat [${session.visitorId}]: ${validation.message.slice(0, 60)}...`,
          status: 'completed',
          startedAt: Date.now(),
          completedAt: Date.now()
        });
      }
    } catch (_) {}

    sendJson(res, 200, formattedResponse);
    return true;
  }

  return false;
}
