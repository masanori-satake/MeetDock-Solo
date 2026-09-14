export type RecurrenceType = 'once' | 'daily' | 'weekly' | 'weekdays' | 'monthly' | 'yearly';

export interface Meeting {
  id: string;
  title: string;
  url: string;
  startTime: string; // ISO 8601 string
  endTime?: string;  // ISO 8601 string (optional; defaults to startTime + 30 min if omitted)
  timeZone?: string; // IANA time zone or fixed UTC offset used for recurrence calculations
  recurrence: RecurrenceType;
  recurrenceInterval?: number; // e.g., every 2 days / months / years
  daysOfWeek?: number[];       // 0 = Sun, 1 = Mon, ..., 6 = Sat
  dayOfMonth?: number;         // 1 - 31
  monthOfYear?: number;        // 1 - 12
  dayOfYear?: number;          // 1 - 31
  recurrenceEndDate?: string;  // ISO 8601 string (end date of recurrence series)
  organizer?: string;
  meetingId?: string;
  passcode?: string;
  isEnterprise?: boolean;
  notified5m?: boolean;
  notifiedStart?: boolean;
  uid?: string;
  sequence?: number;
  status?: string;
  location?: string;
  description?: string;
  attendees?: string[];
  alarmMinutes?: number;
}

export interface ParsedMeetingInfo {
  title: string;
  url: string;
  startTime?: Date;
  endTime?: Date;
  timeZone?: string;
  organizer?: string;
  meetingId?: string;
  passcode?: string;
  isEnterprise?: boolean;
  recurrence?: RecurrenceType;
  recurrenceInterval?: number;
  daysOfWeek?: number[];
  dayOfMonth?: number;
  monthOfYear?: number;
  dayOfYear?: number;
  recurrenceEndDate?: Date;
  uid?: string;
  sequence?: number;
  status?: string;
  location?: string;
  description?: string;
  attendees?: string[];
  alarmMinutes?: number;
}
