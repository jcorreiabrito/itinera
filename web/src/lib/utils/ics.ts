import type { Trip, ItineraryItem } from '$lib/db';

function formatDateToICS(dateStr?: string, timeStr?: string): string {
  if (!dateStr) return '';
  const cleanDate = dateStr.replace(/-/g, '');
  if (!timeStr) {
    return cleanDate;
  }
  const cleanTime = timeStr.replace(/:/g, '') + '00';
  return `${cleanDate}T${cleanTime}`;
}

function addOneDayISO(isoDate: string): string {
  const parts = isoDate.split('-').map(Number);
  if (parts.length < 3 || parts.some(isNaN)) return isoDate;
  const dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + 1));
  return dt.toISOString().split('T')[0];
}

export function generateTripICS(trip: Trip, items: Partial<ItineraryItem>[] = []): string {
  const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const primaryDest = trip.destinations?.[0]?.name ?? '';
  const calName = primaryDest || trip.title || 'Trip';

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Itinera Trip Planner//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${calName}`,
  ];

  // Trip master event
  if (trip.startDate) {
    const startStr = formatDateToICS(trip.startDate);
    // RFC 5545 specifies that DTEND for all-day VALUE=DATE events is exclusive
    const rawEndDate = trip.endDate || trip.startDate;
    const endStr = formatDateToICS(addOneDayISO(rawEndDate));

    lines.push(
      'BEGIN:VEVENT',
      `UID:trip-${trip._id}-${now}@itinera`,
      `DTSTAMP:${now}`,
      `SUMMARY:✈️ ${trip.title}`,
      `DESCRIPTION:${(trip.notes || 'Trip planned with Itinera').replace(/\n/g, '\\n')}`,
      primaryDest ? `LOCATION:${primaryDest}` : '',
      `DTSTART;VALUE=DATE:${startStr}`,
      `DTEND;VALUE=DATE:${endStr}`,
      'END:VEVENT'
    );
  }

  // Itinerary items
  for (const item of items) {
    if (!item.date) continue;
    const startTime = item.startTime ?? (item as any).time;
    const start = formatDateToICS(item.date, startTime);
    const summary = item.title || 'Scheduled Activity';
    const desc = item.notes ? item.notes.replace(/\n/g, '\\n') : '';

    let loc = '';
    if (typeof item.location === 'string') {
      loc = item.location;
    } else if (item.location) {
      loc = item.location.name || item.location.address || '';
    }

    lines.push(
      'BEGIN:VEVENT',
      `UID:item-${item._id || Math.random().toString(36).substring(2)}-${now}@itinera`,
      `DTSTAMP:${now}`,
      `SUMMARY:${summary}`,
      desc ? `DESCRIPTION:${desc}` : '',
      loc ? `LOCATION:${loc}` : '',
      startTime ? `DTSTART:${start}` : `DTSTART;VALUE=DATE:${start}`,
      'END:VEVENT'
    );
  }

  lines.push('END:VCALENDAR');
  return lines.filter(Boolean).join('\r\n');
}

export function downloadTripICS(trip: Trip, items: Partial<ItineraryItem>[] = []): void {
  if (typeof window === 'undefined') return;
  const content = generateTripICS(trip, items);
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const primaryDest = trip.destinations?.[0]?.name;
  const nameStr = primaryDest || trip.title || 'trip';
  a.download = `${nameStr.toLowerCase().replace(/[^a-z0-9]/g, '-')}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
