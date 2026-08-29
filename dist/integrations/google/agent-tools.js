/**
 * MESNIUM GOOGLE WORKSPACE AGENT TOOLS (PHASE 9)
 * 
 * Exposes read-only Google Drive, Gmail, and Calendar tools to the ReAct agent runner.
 */

import { GoogleWorkspaceClient } from './client.js';
import { GmailReader } from './gmail.js';
import { GoogleCalendarReader } from './calendar.js';

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
        description: 'The search query or filename pattern to find in Google Drive.'
      },
      maxResults: {
        type: 'integer',
        minimum: 1,
        maximum: 20,
        description: 'Maximum number of files to return (default: 5).'
      }
    },
    required: ['query'],
    additionalProperties: false
  },
  execute: async (toolCallId, params) => {
    try {
      const files = await client.driveSearch(params.query, { max: params.maxResults || 5 });
      if (!files || files.length === 0) {
        return {
          toolCallId,
          content: [{ type: 'text', text: `No Google Drive files found matching: "${params.query}".` }]
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

// 2. Gmail Search Tool
export const GmailSearchTool = {
  name: 'gmail_search',
  label: 'Gmail Search',
  description: 'Search emails in Gmail by sender, subject, date, or keyword. Returns email snippets and timestamps.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Gmail search query (e.g., "from:John", "newer_than:7d", "subject:proposal").'
      },
      maxResults: {
        type: 'integer',
        minimum: 1,
        maximum: 20,
        description: 'Maximum number of emails to return (default: 5).'
      }
    },
    required: ['query'],
    additionalProperties: false
  },
  execute: async (toolCallId, params) => {
    try {
      const emails = await gmailReader.searchEmails(params.query, { max: params.maxResults || 5 });
      if (!emails || emails.length === 0) {
        return {
          toolCallId,
          content: [{ type: 'text', text: `No emails found matching query: "${params.query}".` }]
        };
      }

      const formatted = emails.map((m, idx) => (
        `${idx + 1}. **${m.subject}**\n   From: ${m.from}\n   Date: ${m.date || m.internalDateIso}\n   Snippet: ${m.snippet}`
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

// 3. Google Calendar Agenda Tool
export const CalendarAgendaTool = {
  name: 'calendar_agenda',
  label: 'Calendar Agenda',
  description: 'Fetch upcoming calendar events, schedule, and meeting details.',
  parameters: {
    type: 'object',
    properties: {
      timeMin: {
        type: 'string',
        description: 'Optional start date/time in ISO or relative format (e.g., "now", "today", "2026-08-30").'
      },
      timeMax: {
        type: 'string',
        description: 'Optional end date/time (e.g., "+7d", "2026-09-05").'
      },
      maxResults: {
        type: 'integer',
        minimum: 1,
        maximum: 20,
        description: 'Maximum number of events to return (default: 5).'
      }
    },
    additionalProperties: false
  },
  execute: async (toolCallId, params) => {
    try {
      const agenda = await calendarReader.getAgenda({
        max: params.maxResults || 5,
        timeMin: params.timeMin,
        timeMax: params.timeMax
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
