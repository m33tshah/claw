/**
 * MESNIUM GOOGLE WORKSPACE AGENT TOOLS (PHASE 9 / V1.1 PRODUCTIZATION)
 * 
 * Exposes full Google Drive, Gmail, and Calendar tools to the ReAct agent runner.
 * Gating all consequential mutations (sending emails, modifying calendar, uploading files)
 * through the Mesnium Action Gatekeeper.
 */

import { GoogleWorkspaceClient } from './client.js';
import { GmailReader } from './gmail.js';
import { GoogleCalendarReader } from './calendar.js';
import { getSharedActionGatekeeper } from '../../mesnium-actions/gatekeeper.js';
import { ActionType } from '../../mesnium-actions/types.js';

const client = new GoogleWorkspaceClient();
const gmailReader = new GmailReader();
const calendarReader = new GoogleCalendarReader();

// 1. Google Drive Search Tool
export const GoogleDriveSearchTool = {
  name: 'google_drive_search',
  label: 'Google Drive Search',
  description: 'Search files and documents in Google Drive. Returns file names, MIME types, and web links.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Optional search query or filename pattern to find in Google Drive.'
      },
      maxResults: {
        type: 'integer',
        minimum: 1,
        maximum: 20,
        description: 'Maximum number of files to return (default: 5).'
      }
    },
    additionalProperties: false
  },
  execute: async (toolCallId, params = {}) => {
    try {
      const query = params?.query || '';
      const files = await client.driveSearch(query, { max: params?.maxResults || 5 });
      if (!files || files.length === 0) {
        return {
          toolCallId,
          content: [{ type: 'text', text: `No Google Drive files found${query ? ` matching: "${query}"` : ''}.` }]
        };
      }

      const formatted = files.map((f, idx) => (
        `${idx + 1}. **${f.name}** (Type: ${f.mimeType})\n   ID: ${f.id}\n   Link: ${f.webViewLink || 'N/A'}`
      )).join('\n\n');

      return {
        toolCallId,
        content: [{ type: 'text', text: `Found ${files.length} Google Drive file(s):\n\n${formatted}` }]
      };
    } catch (err) {
      return { toolCallId, isError: true, content: [{ type: 'text', text: `Google Drive search error: ${err.message}` }] };
    }
  }
};

// 2. Google Drive Upload Tool
export const GoogleDriveUploadTool = {
  name: 'google_drive_upload',
  label: 'Google Drive Upload',
  description: 'Upload a local file to Google Drive.',
  parameters: {
    type: 'object',
    properties: {
      localPath: {
        type: 'string',
        description: 'Absolute path to the local file to upload.'
      },
      confirmed: {
        type: 'boolean',
        description: 'Set to true once operator has confirmed upload.'
      }
    },
    required: ['localPath'],
    additionalProperties: false
  },
  execute: async (toolCallId, params = {}) => {
    try {
      if (!params.localPath) throw new Error('localPath is required');
      const res = await client.driveUpload(params.localPath);
      return {
        toolCallId,
        content: [{ type: 'text', text: `Successfully uploaded file to Google Drive: ${params.localPath}\n\nDrive File ID: ${res.id || 'Uploaded'}` }]
      };
    } catch (err) {
      return { toolCallId, isError: true, content: [{ type: 'text', text: `Google Drive upload error: ${err.message}` }] };
    }
  }
};

// 3. Gmail Search Tool
export const GmailSearchTool = {
  name: 'gmail_search',
  label: 'Gmail Search',
  description: 'Search and read emails from Gmail. Returns email snippets, subjects, and senders.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Optional Gmail search query (e.g., "is:unread", "newer_than:7d", "from:someone", "subject:meeting"). Defaults to "newer_than:30d".'
      },
      maxResults: {
        type: 'integer',
        minimum: 1,
        maximum: 20,
        description: 'Maximum number of emails to return (default: 5).'
      }
    },
    additionalProperties: false
  },
  execute: async (toolCallId, params = {}) => {
    try {
      const query = params?.query || 'newer_than:30d';
      const emails = await gmailReader.searchEmails(query, { max: params?.maxResults || 5 });
      if (!emails || emails.length === 0) {
        return {
          toolCallId,
          content: [{ type: 'text', text: `No emails found matching query: "${query}".` }]
        };
      }

      const formatted = emails.map((m, idx) => (
        `${idx + 1}. **${m.subject}**\n   From: ${m.from}\n   Date: ${m.date || m.internalDateIso}\n   Snippet: ${m.snippet}\n   ID: ${m.id}`
      )).join('\n\n---\n\n');

      return {
        toolCallId,
        content: [{ type: 'text', text: `Found ${emails.length} email(s):\n\n${formatted}` }]
      };
    } catch (err) {
      return { toolCallId, isError: true, content: [{ type: 'text', text: `Gmail search error: ${err.message}` }] };
    }
  }
};

// 4. Gmail Draft Tool
export const GmailDraftTool = {
  name: 'gmail_draft',
  label: 'Gmail Draft Create',
  description: 'Create a draft email in Gmail without sending it immediately.',
  parameters: {
    type: 'object',
    properties: {
      to: { type: 'string', description: 'Recipient email address.' },
      subject: { type: 'string', description: 'Email subject.' },
      body: { type: 'string', description: 'Email body text.' }
    },
    required: ['to', 'subject', 'body'],
    additionalProperties: false
  },
  execute: async (toolCallId, params = {}) => {
    try {
      const res = await client.gmailDraftCreate({
        to: params.to,
        subject: params.subject,
        body: params.body
      });
      return {
        toolCallId,
        content: [{ type: 'text', text: `Draft created successfully in Gmail!\n\nDraft ID: ${res.id || 'Created'}\nTo: ${params.to}\nSubject: ${params.subject}` }]
      };
    } catch (err) {
      return { toolCallId, isError: true, content: [{ type: 'text', text: `Gmail draft error: ${err.message}` }] };
    }
  }
};

// 5. Gmail Send Tool (Consequential Mutation with Gatekeeper Safety)
export const GmailSendTool = {
  name: 'gmail_send',
  label: 'Gmail Send',
  description: 'Send an email via Gmail. Requires operator confirmation before sending.',
  parameters: {
    type: 'object',
    properties: {
      to: { type: 'string', description: 'Recipient email address.' },
      subject: { type: 'string', description: 'Email subject.' },
      body: { type: 'string', description: 'Email body text.' },
      confirmed: { type: 'boolean', description: 'Set to true once operator has approved.' }
    },
    required: ['to', 'subject', 'body'],
    additionalProperties: false
  },
  execute: async (toolCallId, params = {}) => {
    try {
      const gatekeeper = getSharedActionGatekeeper();
      if (!params.confirmed) {
        const action = gatekeeper.proposeAction({
          actionType: ActionType.EMAIL_SEND,
          title: `Send email to ${params.to}: "${params.subject}"`,
          target: params.to,
          payload: { to: params.to, subject: params.subject, body: params.body },
          description: `Outbound email to ${params.to} with subject "${params.subject}"`
        });

        return {
          toolCallId,
          content: [{
            type: 'text',
            text: `I have prepared the email for **${params.to}** with subject *"${params.subject}"*.\n\n` +
                  `**Proposed Content:**\n\n> ${params.body.split('\n').join('\n> ')}\n\n` +
                  `*Action ID:* \`${action.id}\`\n\n` +
                  `*Please approve in Needs Attention or reply "Confirm Send" to transmit.*`
          }]
        };
      }

      // Explicitly confirmed: execute real send
      const res = await client.gmailSend({
        to: params.to,
        subject: params.subject,
        body: params.body
      });

      return {
        toolCallId,
        content: [{
          type: 'text',
          text: `Email sent successfully to **${params.to}**!\n\n` +
                `**Subject:** ${params.subject}\n` +
                `**Message ID:** ${res.id || res.messageId || 'Sent'}`
        }]
      };
    } catch (err) {
      return { toolCallId, isError: true, content: [{ type: 'text', text: `Gmail send error: ${err.message}` }] };
    }
  }
};

// 6. Google Calendar Agenda Tool
export const CalendarAgendaTool = {
  name: 'calendar_agenda',
  label: 'Calendar Agenda',
  description: 'Fetch upcoming calendar events, schedule, and meeting details.',
  parameters: {
    type: 'object',
    properties: {
      timeMin: { type: 'string', description: 'Optional start date/time (e.g. "now", "today", ISO string).' },
      timeMax: { type: 'string', description: 'Optional end date/time (e.g. "+7d", ISO string).' },
      maxResults: { type: 'integer', minimum: 1, maximum: 20, description: 'Max events (default: 5).' }
    },
    additionalProperties: false
  },
  execute: async (toolCallId, params = {}) => {
    try {
      const agenda = await calendarReader.getAgenda({
        max: params?.maxResults || 5,
        timeMin: params?.timeMin,
        timeMax: params?.timeMax
      });

      return {
        toolCallId,
        content: [{ type: 'text', text: `Upcoming Calendar Agenda:\n\n${agenda}` }]
      };
    } catch (err) {
      return { toolCallId, isError: true, content: [{ type: 'text', text: `Calendar lookup error: ${err.message}` }] };
    }
  }
};

// 7. Google Calendar Create Event Tool
export const CalendarCreateTool = {
  name: 'calendar_create_event',
  label: 'Calendar Create Event',
  description: 'Schedule a new event on Google Calendar.',
  parameters: {
    type: 'object',
    properties: {
      summary: { type: 'string', description: 'Event title/summary.' },
      start: { type: 'string', description: 'Start time (ISO 8601 string, e.g. "2026-09-01T10:00:00Z").' },
      end: { type: 'string', description: 'End time (ISO 8601 string, e.g. "2026-09-01T11:00:00Z").' },
      description: { type: 'string', description: 'Optional event description.' },
      location: { type: 'string', description: 'Optional meeting location or link.' },
      attendees: { type: 'string', description: 'Comma-separated attendee email addresses.' },
      withMeet: { type: 'boolean', description: 'Include Google Meet link.' },
      confirmed: { type: 'boolean', description: 'Set to true once operator has confirmed.' }
    },
    required: ['summary', 'start', 'end'],
    additionalProperties: false
  },
  execute: async (toolCallId, params = {}) => {
    try {
      const gatekeeper = getSharedActionGatekeeper();
      if (!params.confirmed) {
        const action = gatekeeper.proposeAction({
          actionType: ActionType.CALENDAR_CREATE,
          title: `Create Calendar Event: "${params.summary}"`,
          target: params.summary,
          payload: params,
          description: `Schedule "${params.summary}" from ${params.start} to ${params.end}`
        });

        return {
          toolCallId,
          content: [{
            type: 'text',
            text: `I have prepared the calendar event:\n\n` +
                  `**Title:** ${params.summary}\n` +
                  `**Time:** ${params.start} → ${params.end}\n` +
                  (params.location ? `**Location:** ${params.location}\n` : '') +
                  `\n*Action ID:* \`${action.id}\`\n\n` +
                  `*Please approve in Needs Attention or reply "Confirm" to schedule.*`
          }]
        };
      }

      const res = await client.calendarCreateEvent({
        summary: params.summary,
        start: params.start,
        end: params.end,
        description: params.description,
        location: params.location,
        attendees: params.attendees,
        withMeet: params.withMeet
      });

      return {
        toolCallId,
        content: [{
          type: 'text',
          text: `Calendar event created successfully!\n\n` +
                `**Title:** ${params.summary}\n` +
                `**Event ID:** ${res.id || 'Scheduled'}`
        }]
      };
    } catch (err) {
      return { toolCallId, isError: true, content: [{ type: 'text', text: `Calendar create error: ${err.message}` }] };
    }
  }
};

// 8. Google Calendar Delete Event Tool
export const CalendarDeleteTool = {
  name: 'calendar_delete_event',
  label: 'Calendar Delete Event',
  description: 'Delete/cancel an event on Google Calendar. Requires operator confirmation.',
  parameters: {
    type: 'object',
    properties: {
      eventId: { type: 'string', description: 'Event ID to delete.' },
      confirmed: { type: 'boolean', description: 'Set to true once operator has confirmed.' }
    },
    required: ['eventId'],
    additionalProperties: false
  },
  execute: async (toolCallId, params = {}) => {
    try {
      const gatekeeper = getSharedActionGatekeeper();
      if (!params.confirmed) {
        const action = gatekeeper.proposeAction({
          actionType: ActionType.CALENDAR_DELETE,
          title: `Delete Calendar Event: ${params.eventId}`,
          target: params.eventId,
          payload: params,
          description: `Delete calendar event with ID ${params.eventId}`
        });

        return {
          toolCallId,
          content: [{
            type: 'text',
            text: `Are you sure you want to delete calendar event \`${params.eventId}\`?\n\n` +
                  `*Action ID:* \`${action.id}\`\n\n` +
                  `*Please approve to delete.*`
          }]
        };
      }

      await client.calendarDeleteEvent('primary', params.eventId);
      return {
        toolCallId,
        content: [{ type: 'text', text: `Successfully deleted calendar event: ${params.eventId}` }]
      };
    } catch (err) {
      return { toolCallId, isError: true, content: [{ type: 'text', text: `Calendar delete error: ${err.message}` }] };
    }
  }
};
