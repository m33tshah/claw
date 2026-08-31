/**
 * MESNIUM UNIVERSAL CAPABILITY & APP REGISTRY (PHASE 5 / V1.1 PRODUCTIZATION)
 * 
 * Aggregates all live systems, extensions, skills, external connectors, and MCP servers
 * into a single normalized discovery engine for the Mesnium workspace.
 */

import { getSharedCredentialManager, ProviderStatus } from '../credentials/manager.js';
import { getSharedMcpManager } from '../mcp/manager.js';
import { getSharedFilesystemManager } from '../filesystem/index.js';
import { getSharedSkillVetter } from '../mesnium-skills/vetter.js';
import { getSharedAutomationEngine } from '../automations/engine.js';

export const CapabilityCategory = {
  ALL: 'all',
  COMMUNICATION: 'communication',
  PRODUCTIVITY: 'productivity',
  AUTOMATION: 'automation',
  RESEARCH: 'research',
  AI_MEDIA: 'ai_media',
  DEVELOPER: 'developer',
  DEVICES: 'devices'
};

export class MesniumCapabilityRegistry {
  constructor(options = {}) {
    this.credManager = options.credManager || getSharedCredentialManager();
    this.mcpManager = options.mcpManager || getSharedMcpManager();
    this.fsManager = options.fsManager || getSharedFilesystemManager();
    this.vetter = options.vetter || getSharedSkillVetter();
    this.autoEngine = options.autoEngine || getSharedAutomationEngine();
  }

  async getAllCapabilities() {
    const providersStatus = await this.credManager.getAllProvidersStatus();
    const mcpServers = this.mcpManager.listServers();
    const authorizedFolders = this.fsManager.listAuthorizedFolders();
    const skills = this.vetter.listSkills();
    const automations = this.autoEngine.listAutomations();

    const capabilities = [];

    // 1. Google Workspace
    const googleStatus = providersStatus['google'];
    capabilities.push({
      id: 'cap_google_workspace',
      providerId: 'google',
      name: 'Google Workspace',
      category: CapabilityCategory.COMMUNICATION,
      description: 'Unified Gmail, Google Calendar, Google Drive, Docs, and Sheets.',
      status: googleStatus?.status || ProviderStatus.CONNECTED,
      connectedAccount: googleStatus?.email || 'm16bshah@gmail.com',
      services: ['Gmail Send & Read', 'Calendar Scheduling', 'Drive Storage', 'Docs & Sheets'],
      badge: 'Official',
      authType: 'oauth',
      actions: ['Disconnect', 'Sync Now', 'Open Inbox']
    });

    // 2. Local Filesystem Engine
    capabilities.push({
      id: 'cap_local_filesystem',
      providerId: 'filesystem',
      name: 'Local Business Filesystem',
      category: CapabilityCategory.PRODUCTIVITY,
      description: 'Anti-traversal sandboxed access to business folders, document analysis, and auto-organization.',
      status: ProviderStatus.CONNECTED,
      connectedAccount: `${authorizedFolders.length} Folders Authorized`,
      services: ['Document Search', 'File Organization', 'Project Linking', 'Text Extraction'],
      badge: 'Core',
      authType: 'local_permissions',
      actions: ['Manage Folders', 'Inspect Storage']
    });

    // 3. Persistent Server-Side Automation Engine
    capabilities.push({
      id: 'cap_automations_engine',
      providerId: 'automations',
      name: 'Mesnium Automations Engine',
      category: CapabilityCategory.AUTOMATION,
      description: 'Autonomous cron scheduling, proactive research monitors, lead outreach, and daily rhythm briefings.',
      status: ProviderStatus.CONNECTED,
      connectedAccount: `${automations.filter(a => a.enabled).length} Active Workflows`,
      services: ['Cron Scheduling', 'Proactive Monitors', 'Daily Rhythm Briefing', 'Event Triggers'],
      badge: 'Core',
      authType: 'built_in',
      actions: ['Open Work Studio', 'Run All Now']
    });

    // 4. DuckDuckGo / Live Web Research
    capabilities.push({
      id: 'cap_web_research',
      providerId: 'duckduckgo',
      name: 'DuckDuckGo Web Intelligence',
      category: CapabilityCategory.RESEARCH,
      description: 'Real-time live internet search, corporate research, news tracking, and deep web extraction.',
      status: ProviderStatus.CONNECTED,
      connectedAccount: 'Unlimited Queries',
      services: ['Live Search', 'Web Fetch', 'News Monitoring', 'Market Research'],
      badge: 'Built-in',
      authType: 'none',
      actions: ['Test Search']
    });

    // 5. Browser Automation (Chrome CDP)
    capabilities.push({
      id: 'cap_browser_automation',
      providerId: 'browser',
      name: 'Autonomous Browser Agent',
      category: CapabilityCategory.RESEARCH,
      description: 'Headless / visible Chrome DevTools Protocol automation for complex web navigation and data capture.',
      status: ProviderStatus.CONNECTED,
      connectedAccount: 'Port 9222 Active',
      services: ['Page Navigation', 'Form Interaction', 'Screenshot Capture', 'DOM Extraction'],
      badge: 'Built-in',
      authType: 'none',
      actions: ['Launch Browser']
    });

    // 6. Model Context Protocol (MCP) Manager
    capabilities.push({
      id: 'cap_mcp_gateway',
      providerId: 'mcp',
      name: 'Model Context Protocol (MCP)',
      category: CapabilityCategory.DEVELOPER,
      description: 'First-class stdio and HTTP/SSE MCP client with AST safety analysis and risk scoring.',
      status: ProviderStatus.CONNECTED,
      connectedAccount: `${mcpServers.length} MCP Servers Registered`,
      services: ['Stdio Transport', 'HTTP/SSE Transport', 'Dynamic Tool Discovery', 'AST Risk Vetting'],
      badge: 'Extensible',
      authType: 'mcp_config',
      actions: ['Manage MCP Servers', 'Add Server']
    });

    // 7. n8n Workflow Automation
    const n8nStatus = providersStatus['n8n'];
    capabilities.push({
      id: 'cap_n8n_integration',
      providerId: 'n8n',
      name: 'n8n Workflow Automation',
      category: CapabilityCategory.AUTOMATION,
      description: 'Trigger 400+ SaaS automations via self-hosted or cloud n8n webhook nodes.',
      status: n8nStatus?.status || ProviderStatus.REQUIRES_API_KEY,
      connectedAccount: n8nStatus?.status === ProviderStatus.CONNECTED ? 'Connected' : 'Requires API Key',
      services: ['Webhook Triggers', 'Multi-app Pipelines', 'Data Transformation'],
      badge: 'Integration',
      authType: 'api_key',
      actions: ['Configure API Key', 'Test Connection']
    });

    // 8. Oxylabs Enterprise Scraping
    const oxylabsStatus = providersStatus['oxylabs'];
    capabilities.push({
      id: 'cap_oxylabs_search',
      providerId: 'oxylabs',
      name: 'Oxylabs SERP & Proxy API',
      category: CapabilityCategory.RESEARCH,
      description: 'Enterprise SERP scraping, proxy rotation, and e-commerce data extraction.',
      status: oxylabsStatus?.status || ProviderStatus.REQUIRES_API_KEY,
      connectedAccount: oxylabsStatus?.status === ProviderStatus.CONNECTED ? 'Connected' : 'Requires Credentials',
      services: ['Google Search SERP', 'E-Commerce Scraping', 'Residential Proxies'],
      badge: 'Integration',
      authType: 'api_key',
      actions: ['Configure Credentials']
    });

    // 9. Voice STT & TTS (ElevenLabs / Web Speech)
    const elevenlabsStatus = providersStatus['elevenlabs'];
    capabilities.push({
      id: 'cap_voice_speech',
      providerId: 'elevenlabs',
      name: 'Voice & Speech Engine',
      category: CapabilityCategory.AI_MEDIA,
      description: 'Continuous speech-to-text with silence detection debounce and studio-quality voice synthesis.',
      status: ProviderStatus.CONNECTED,
      connectedAccount: elevenlabsStatus?.status === ProviderStatus.CONNECTED ? 'ElevenLabs Active' : 'Web Speech API Active',
      services: ['Speech-to-Text (STT)', 'Text-to-Speech (TTS)', 'Transcript Preview'],
      badge: 'Interactive',
      authType: 'hybrid',
      actions: ['Test Voice', 'Configure Key']
    });

    // 10. ClawLink Node Network
    capabilities.push({
      id: 'cap_clawlink_nodes',
      providerId: 'clawlink',
      name: 'ClawLink Device Bridge',
      category: CapabilityCategory.DEVICES,
      description: 'Encrypted peer-to-peer connection to mobile devices, remote servers, and edge nodes.',
      status: ProviderStatus.CONNECTED,
      connectedAccount: 'Local Gateway Node Active',
      services: ['Remote Execution', 'File Sync', 'Push Notifications'],
      badge: 'Distributed',
      authType: 'node_pairing',
      actions: ['Pair Device']
    });

    // 11. Remotion Video Engine
    capabilities.push({
      id: 'cap_remotion_video',
      providerId: 'remotion',
      name: 'Remotion Video Generator',
      category: CapabilityCategory.AI_MEDIA,
      description: 'Programmatic video composition, animated charts, and marketing video rendering.',
      status: ProviderStatus.CONNECTED,
      connectedAccount: 'Local Node Core Active',
      services: ['Video Rendering', 'Motion Graphics', 'Dynamic Slides'],
      badge: 'Media',
      authType: 'built_in',
      actions: ['Create Video']
    });

    return {
      totalCapabilities: capabilities.length,
      connectedCount: capabilities.filter(c => c.status === ProviderStatus.CONNECTED).length,
      capabilities
    };
  }
}

let sharedCapabilityRegistry = null;

export function getSharedCapabilityRegistry() {
  if (!sharedCapabilityRegistry) {
    sharedCapabilityRegistry = new MesniumCapabilityRegistry();
  }
  return sharedCapabilityRegistry;
}
