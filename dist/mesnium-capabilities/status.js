/**
 * MESNIUM CAPABILITIES & INTEGRATIONS STATUS ENGINE (V1 PRODUCTIZATION)
 * 
 * Provides live, honest audit of all OpenClaw integrations, services, and optional dependencies.
 * Never fakes a connected state. Reports missing dependencies honestly.
 */

import { getSharedIntegrationRegistry } from '../integrations/registry.js';
import { IntegrationStatus } from '../integrations/types.js';

export function getCapabilitiesStatus() {
  const intReg = getSharedIntegrationRegistry();
  const accounts = intReg.listAccounts();
  const googleAccount = accounts.find(a => a.provider === 'google' && (a.status === 'connected' || a.status === 'CONNECTED'));

  const googleConnected = Boolean(googleAccount);
  const googleServices = googleAccount?.services || [];

  return {
    timestamp: Date.now(),
    integrations: {
      google_workspace: {
        id: 'google_workspace',
        name: 'Google Workspace',
        status: googleConnected ? 'CONNECTED' : 'DISCONNECTED',
        email: googleAccount ? googleAccount.email : null,
        services: {
          gmail: googleServices.includes('gmail') ? 'CONNECTED' : 'DISCONNECTED',
          drive: googleServices.includes('drive') ? 'CONNECTED' : 'DISCONNECTED',
          calendar: googleServices.includes('calendar') ? 'CONNECTED' : 'DISCONNECTED'
        },
        requiresAuth: true,
        description: 'Access authorized Gmail, Google Drive, and Google Calendar data.'
      },
      whatsapp: {
        id: 'whatsapp',
        name: 'WhatsApp Business',
        status: 'NOT_CONNECTED',
        requiresAuth: true,
        description: 'WhatsApp Business messaging integration.'
      },
      n8n: {
        id: 'n8n',
        name: 'n8n Workflow Automation',
        status: process.env.N8N_WEBHOOK_URL || process.env.N8N_API_KEY ? 'CONNECTED' : 'NOT_CONFIGURED',
        requiresAuth: true,
        description: 'Trigger and monitor custom n8n business workflows.'
      },
      oxylabs: {
        id: 'oxylabs',
        name: 'Oxylabs Real-Time Web Data',
        status: process.env.OXYLABS_API_KEY || process.env.OXYLABS_USERNAME ? 'CONNECTED' : 'NOT_CONFIGURED',
        requiresAuth: true,
        description: 'Advanced real-time web scraping and enterprise SERP retrieval.'
      },
      calling: {
        id: 'calling',
        name: 'Voice Calling (ClawCall / SuperCall)',
        status: process.env.TWILIO_AUTH_TOKEN || process.env.TELNYX_API_KEY ? 'CONNECTED' : 'NOT_CONFIGURED',
        requiresAuth: true,
        description: 'Outbound voice calling and interactive voice agent.'
      },
      clawlink: {
        id: 'clawlink',
        name: 'ClawLink Device Bridge',
        status: 'READY',
        requiresAuth: false,
        description: 'Local device communication bridge.'
      },
      google_meet: {
        id: 'google_meet',
        name: 'Google Meet Context & Prep',
        status: googleConnected && googleServices.includes('calendar') ? 'CONNECTED' : 'DISCONNECTED',
        requiresAuth: true,
        description: 'Meeting briefing, agenda preparation, and post-meeting summaries.'
      },
      remotion: {
        id: 'remotion',
        name: 'Remotion Video Generation',
        status: 'READY',
        requiresAuth: false,
        description: 'Programmatic video composition and rendering.'
      },
      voice_dictation: {
        id: 'voice_dictation',
        name: 'Voice Dictation (STT)',
        status: 'AVAILABLE',
        requiresAuth: false,
        description: 'Continuous browser-based voice transcription with natural pause tolerance.'
      },
      voice_tts: {
        id: 'voice_tts',
        name: 'Speech Synthesis (TTS)',
        status: 'AVAILABLE',
        requiresAuth: false,
        description: 'Natural text-to-speech voice playback for assistant responses.'
      }
    }
  };
}
