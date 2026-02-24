/**

 * Date parsing, phone normalization, validation,
 * and text processing helpers.


/** Parse natural language dates into YYYY-MM-DD format. */
import { v4 as uuidv4 } from 'uuid';

export function parseDate(dateStr: string): string | null {
  const input = dateStr.toLowerCase().trim();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (input === 'today') {
    return formatDate(today);
  }

  if (input === 'tomorrow') {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return formatDate(tomorrow);
  }

  // "next tuesday", "next friday", etc.
  const dayNames = [
    'sunday', 'monday', 'tuesday', 'wednesday',
    'thursday', 'friday', 'saturday',
  ];
  const nextMatch = input.match(/next\s+(\w+)/);
  if (nextMatch) {
    const dayIndex = dayNames.indexOf(nextMatch[1]);
    if (dayIndex !== -1) {
      const date = new Date(today);
      const currentDay = date.getDay();
      let daysToAdd = dayIndex - currentDay;
      if (daysToAdd <= 0) daysToAdd += 7;
      date.setDate(date.getDate() + daysToAdd);
      return formatDate(date);
    }
  }

  // "this wednesday", etc.
  const thisMatch = input.match(/this\s+(\w+)/);
  if (thisMatch) {
    const dayIndex = dayNames.indexOf(thisMatch[1]);
    if (dayIndex !== -1) {
      const date = new Date(today);
      const currentDay = date.getDay();
      let daysToAdd = dayIndex - currentDay;
      if (daysToAdd < 0) daysToAdd += 7;
      date.setDate(date.getDate() + daysToAdd);
      return formatDate(date);
    }
  }

  // "in 3 days", "in 2 weeks"
  const inDaysMatch = input.match(/in\s+(\d+)\s+days?/);
  if (inDaysMatch) {
    const days = parseInt(inDaysMatch[1]);
    const date = new Date(today);
    date.setDate(date.getDate() + days);
    return formatDate(date);
  }

  // Standard date format
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) {
    return formatDate(parsed);
  }

  return null;
}

/** Parse natural language time into HH:MM (24h) format. */
export function parseTime(timeStr: string): string | null {
  const input = timeStr.toLowerCase().trim();

  const timeRegex = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i;
  const match = input.match(timeRegex);

  if (match) {
    let hours = parseInt(match[1]);
    const minutes = match[2] ? parseInt(match[2]) : 0;
    const period = match[3]?.toLowerCase();

    if (period === 'pm' && hours < 12) {
      hours += 12;
    } else if (period === 'am' && hours === 12) {
      hours = 0;
    }

    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return `${hours.toString().padStart(2, '0')}:${minutes
        .toString()
        .padStart(2, '0')}`;
    }
  }

  // Handle word-based times
  const wordToNumber: Record<string, number> = {
    noon: 12, midday: 12, midnight: 0,
    one: 1, two: 2, three: 3, four: 4, five: 5,
    six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    eleven: 11, twelve: 12,
  };

  for (const [word, num] of Object.entries(wordToNumber)) {
    if (input.includes(word)) {
      let hours = num;
      // Assume PM for typical clinic hours (1-4 PM)
      if (hours >= 1 && hours <= 4 && !input.includes('am') && !input.includes('morning')) {
        hours += 12;
      }
      return `${hours.toString().padStart(2, '0')}:00`;
    }
  }

  return null;
}

/** Format a Date object to YYYY-MM-DD. */
export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/** Format a Date object to HH:MM. */
export function formatTime(date: Date): string {
  return date.toTimeString().substring(0, 5);
}

/** Get current date in YYYY-MM-DD format. */
export function getCurrentDate(): string {
  return formatDate(new Date());
}

/** Get current time in HH:MM format. */
export function getCurrentTime(): string {
  return formatTime(new Date());
}

/** Check if a date is in the past. */
export function isDateInPast(dateStr: string): boolean {
  const date = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date < today;
}

/** Check if a time has already passed for a given date. */
export function isTimeInPast(dateStr: string, timeStr: string): boolean {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const dateTime = new Date(dateStr);
  dateTime.setHours(hours, minutes, 0, 0);
  return dateTime < new Date();
}

// ===========================================
// PHONE HELPERS
// ===========================================

/** Normalize a phone number to +[country code][number]. */
export function normalizePhone(
  phone: string,
  defaultCountry: string = '1'
): string | null {
  let cleaned = phone.replace(/[^\d+]/g, '');

  if (cleaned.startsWith('+')) {
    return cleaned;
  }

  // Remove leading 1 if present for US
  if (cleaned.startsWith('1') && cleaned.length === 11) {
    cleaned = cleaned.substring(1);
  }

  // Validate US number length (10 digits)
  if (cleaned.length === 10) {
    return `+${defaultCountry}${cleaned}`;
  }

  if (cleaned.length > 10) {
    return `+${cleaned}`;
  }

  return null;
}

/** Format a phone number for display: (661) 480-2377 */
export function formatPhoneForDisplay(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');

  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }

  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return `(${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  }

  return phone;
}

// ===========================================
// VALIDATION
// ===========================================

/**
 * Validate an appointment date and time.
 * Checks format, past dates, past times, and business hours.
 */
export function validateAppointment(
  date: string,
  time: string
): { valid: boolean; error?: string } {
  // Check date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { valid: false, error: 'Invalid date format' };
  }

  // Check time format
  if (!/^\d{2}:\d{2}$/.test(time)) {
    return { valid: false, error: 'Invalid time format' };
  }

  // Check if in past
  if (isDateInPast(date)) {
    return { valid: false, error: 'Cannot schedule appointments for past dates' };
  }

  // Check if today and time has passed
  if (date === getCurrentDate() && isTimeInPast(date, time)) {
    return { valid: false, error: 'That time has already passed today' };
  }

  // Check business hours
  const openingHour = process.env.BUSINESS_OPENING_HOUR || '08:00';
  const closingHour = process.env.BUSINESS_CLOSING_HOUR || '17:00';

  if (time < openingHour || time > closingHour) {
    return {
      valid: false,
      error: `Our office hours are ${formatTimeForDisplay(openingHour)} to ${formatTimeForDisplay(closingHour)}, Monday through Friday`,
    };
  }

  // Check if it's a weekend (Saturday = 6, Sunday = 0)
  const appointmentDate = new Date(date);
  const dayOfWeek = appointmentDate.getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return {
      valid: false,
      error: 'Our office is closed on weekends. We are open Monday through Friday',
    };
  }

  return { valid: true };
}

// Keep backward compatibility alias
export const validateReservation = validateAppointment;

/** Format time for display (24h → 12h). */
export function formatTimeForDisplay(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return minutes === 0
    ? `${displayHours} ${period}`
    : `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
}

// ===========================================
// TEXT PROCESSING
// ===========================================

/** Extract a number from text (supports word numbers). */
export function extractNumber(text: string): number | null {
  const wordToNum: Record<string, number> = {
    one: 1, two: 2, three: 3, four: 4, five: 5,
    six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
    fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
    nineteen: 19, twenty: 20,
  };

  const lower = text.toLowerCase();

  for (const [word, num] of Object.entries(wordToNum)) {
    if (lower.includes(word)) {
      return num;
    }
  }

  const digitMatch = text.match(/\d+/);
  if (digitMatch) {
    return parseInt(digitMatch[0]);
  }

  return null;
}

/** Clean text for TTS (remove markdown, URLs, etc.). */
export function cleanTextForSpeech(text: string): string {
  return text
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Generate a unique 6-character confirmation code. */
export function generateConfirmationCode(): string {
  // Excludes ambiguous characters: 0, O, I, 1, L
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/** Generate a UUID v4. */
export function generateUUID(): string {
  return uuidv4();
}

/** Truncate text with ellipsis. */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength - 3) + '...';
}

/** Capitalize first letter of each word. */
export function titleCase(text: string): string { 
  return text
    .toLowerCase()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// ===========================================
// EXPORTS
// ===========================================

export default {
  parseDate,
  parseTime,
  formatDate,
  formatTime,
  getCurrentDate,
  getCurrentTime,
  isDateInPast,
  isTimeInPast,
  normalizePhone,
  formatPhoneForDisplay,
  validateAppointment,
  validateReservation, // backward compat
  formatTimeForDisplay,
  extractNumber,
  cleanTextForSpeech,
  generateConfirmationCode,
  generateUUID,
  truncate,
  titleCase,
};