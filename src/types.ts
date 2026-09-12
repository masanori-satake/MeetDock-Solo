export type RecurrenceType = 'once' | 'weekly' | 'weekdays';

export interface Meeting {
  id: string;
  title: string;
  url: string;
  startTime: string; // ISO 8601 string
  endTime?: string;  // ISO 8601 string (optional; defaults to startTime + 30 min if omitted)
  recurrence: RecurrenceType;
  notified5m?: boolean;
  notifiedStart?: boolean;
}

export interface ParsedMeetingInfo {
  title: string;
  url: string;
  startTime?: Date;
  endTime?: Date;
}
