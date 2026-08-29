/**
 * MESNIUM GOOGLE CALENDAR READ CONNECTOR (PHASE 9)
 * 
 * Provides normalized read-only event listing, agenda queries, and schedule lookups.
 */

import { GoogleWorkspaceClient } from './client.js';

export class GoogleCalendarReader {
  constructor(accountEmail = null) {
    this.client = new GoogleWorkspaceClient(accountEmail);
  }

  /**
   * List upcoming calendar events.
   */
  async listEvents(options = {}) {
    const rawEvents = await this.client.calendarListEvents({
      max: options.max || 10,
      calendarId: options.calendarId || 'primary',
      timeMin: options.timeMin,
      timeMax: options.timeMax
    });

    if (!Array.isArray(rawEvents)) return [];

    return rawEvents.map(evt => ({
      id: evt.id,
      title: evt.summary || '(Untitled Event)',
      start: evt.start?.dateTime || evt.start?.date || '',
      end: evt.end?.dateTime || evt.end?.date || '',
      location: evt.location || '',
      description: evt.description || '',
      status: evt.status || 'confirmed',
      organizer: evt.organizer?.email || '',
      attendees: (evt.attendees || []).map(a => a.email || a.displayName),
      htmlLink: evt.htmlLink || ''
    }));
  }

  /**
   * Get agenda summary formatted for agent context.
   */
  async getAgenda(options = {}) {
    const events = await this.listEvents(options);
    if (events.length === 0) {
      return 'No upcoming calendar events scheduled.';
    }

    return events.map((e, idx) => {
      const timeStr = e.start ? `${e.start} – ${e.end}` : 'All Day';
      const locStr = e.location ? ` | Location: ${e.location}` : '';
      return `${idx + 1}. **${e.title}** (${timeStr}${locStr})\n   ${e.description ? e.description.slice(0, 150) : ''}`;
    }).join('\n\n');
  }
}
