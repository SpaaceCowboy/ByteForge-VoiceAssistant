import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  parseDate,
  parseTime,
  formatDate,
  formatTime,
  getCurrentDate,
  normalizePhone,
  formatPhoneForDisplay,
  formatTimeForDisplay,
  extractNumber,
  cleanTextForSpeech,
  truncate,
  titleCase,
  generateConfirmationCode,
  validateAppointment,
} from './helpers';

// ==========================================
// parseDate
// ==========================================

describe('parseDate', () => {
  it('returns today for "today"', () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    expect(parseDate('today')).toBe(formatDate(today));
  });

  it('returns tomorrow for "tomorrow"', () => {
    const tomorrow = new Date();
    tomorrow.setHours(0, 0, 0, 0);
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(parseDate('tomorrow')).toBe(formatDate(tomorrow));
  });

  it('handles "next <dayname>"', () => {
    const result = parseDate('next monday');
    expect(result).not.toBeNull();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Result should be in the future
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    expect(result! > formatDate(today)).toBe(true);
  });

  it('handles "this <dayname>"', () => {
    const result = parseDate('this friday');
    expect(result).not.toBeNull();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('handles "in N days"', () => {
    const result = parseDate('in 3 days');
    const expected = new Date();
    expected.setHours(0, 0, 0, 0);
    expected.setDate(expected.getDate() + 3);
    expect(result).toBe(formatDate(expected));
  });

  it('parses ISO date strings', () => {
    expect(parseDate('2026-06-15')).toBe('2026-06-15');
  });

  it('returns null for gibberish', () => {
    expect(parseDate('asdfgh')).toBeNull();
  });

  it('is case-insensitive', () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expected = formatDate(today);
    expect(parseDate('TODAY')).toBe(expected);
    expect(parseDate('Today')).toBe(expected);
  });
});

// ==========================================
// parseTime
// ==========================================

describe('parseTime', () => {
  it('parses "3pm" as 15:00', () => {
    expect(parseTime('3pm')).toBe('15:00');
  });

  it('parses "3 PM" as 15:00', () => {
    expect(parseTime('3 PM')).toBe('15:00');
  });

  it('parses "12:00am" as 00:00', () => {
    expect(parseTime('12:00am')).toBe('00:00');
  });

  it('parses "2:30 PM" as 14:30', () => {
    expect(parseTime('2:30 PM')).toBe('14:30');
  });

  it('parses "9am" as 09:00', () => {
    expect(parseTime('9am')).toBe('09:00');
  });

  it('parses "12pm" as 12:00', () => {
    expect(parseTime('12pm')).toBe('12:00');
  });

  it('parses "noon" as 12:00', () => {
    expect(parseTime('noon')).toBe('12:00');
  });

  it('parses "midnight" as 00:00', () => {
    expect(parseTime('midnight')).toBe('00:00');
  });

  it('assumes PM for hours 1-4 (clinic hours)', () => {
    expect(parseTime('three')).toBe('15:00');
    expect(parseTime('two')).toBe('14:00');
  });

  it('does not assume PM when "am" is specified', () => {
    expect(parseTime('three am')).toBe('03:00');
  });

  it('returns null for gibberish', () => {
    expect(parseTime('asdfgh')).toBeNull();
  });
});

// ==========================================
// formatDate / formatTime
// ==========================================

describe('formatDate', () => {
  it('formats a Date to YYYY-MM-DD', () => {
    const date = new Date('2026-03-15T12:00:00Z');
    expect(formatDate(date)).toBe('2026-03-15');
  });
});

describe('formatTime', () => {
  it('formats a Date to HH:MM', () => {
    const date = new Date('2026-01-01T14:30:00');
    expect(formatTime(date)).toBe('14:30');
  });
});

// ==========================================
// normalizePhone
// ==========================================

describe('normalizePhone', () => {
  it('normalizes 10-digit US number', () => {
    expect(normalizePhone('6614802377')).toBe('+16614802377');
  });

  it('normalizes formatted number', () => {
    expect(normalizePhone('(661) 480-2377')).toBe('+16614802377');
  });

  it('normalizes 11-digit with leading 1', () => {
    expect(normalizePhone('16614802377')).toBe('+16614802377');
  });

  it('returns already-formatted number as-is', () => {
    expect(normalizePhone('+16614802377')).toBe('+16614802377');
  });

  it('returns null for short number', () => {
    expect(normalizePhone('12345')).toBeNull();
  });
});

// ==========================================
// formatPhoneForDisplay
// ==========================================

describe('formatPhoneForDisplay', () => {
  it('formats 10-digit number', () => {
    expect(formatPhoneForDisplay('6614802377')).toBe('(661) 480-2377');
  });

  it('formats 11-digit with leading 1', () => {
    expect(formatPhoneForDisplay('16614802377')).toBe('(661) 480-2377');
  });

  it('formats +1 prefixed number', () => {
    expect(formatPhoneForDisplay('+16614802377')).toBe('(661) 480-2377');
  });

  it('returns original for unrecognized format', () => {
    expect(formatPhoneForDisplay('123')).toBe('123');
  });
});

// ==========================================
// formatTimeForDisplay
// ==========================================

describe('formatTimeForDisplay', () => {
  it('converts 13:00 to 1 PM', () => {
    expect(formatTimeForDisplay('13:00')).toBe('1 PM');
  });

  it('converts 09:30 to 9:30 AM', () => {
    expect(formatTimeForDisplay('09:30')).toBe('9:30 AM');
  });

  it('converts 00:00 to 12 AM', () => {
    expect(formatTimeForDisplay('00:00')).toBe('12 AM');
  });

  it('converts 12:00 to 12 PM', () => {
    expect(formatTimeForDisplay('12:00')).toBe('12 PM');
  });

  it('converts 17:45 to 5:45 PM', () => {
    expect(formatTimeForDisplay('17:45')).toBe('5:45 PM');
  });
});

// ==========================================
// extractNumber
// ==========================================

describe('extractNumber', () => {
  it('extracts word numbers', () => {
    expect(extractNumber('three')).toBe(3);
    expect(extractNumber('seven')).toBe(7);
  });

  it('extracts digit numbers from text', () => {
    expect(extractNumber('I need 5 seats')).toBe(5);
  });

  it('prefers word match over digit', () => {
    expect(extractNumber('one')).toBe(1);
  });

  it('returns null for no number', () => {
    expect(extractNumber('hello')).toBeNull();
  });
});

// ==========================================
// cleanTextForSpeech
// ==========================================

describe('cleanTextForSpeech', () => {
  it('removes bold markdown', () => {
    expect(cleanTextForSpeech('**bold text**')).toBe('bold text');
  });

  it('removes italic markdown', () => {
    expect(cleanTextForSpeech('*italic*')).toBe('italic');
  });

  it('removes URLs', () => {
    expect(cleanTextForSpeech('visit https://example.com today')).toBe('visit today');
  });

  it('collapses whitespace', () => {
    expect(cleanTextForSpeech('hello   world')).toBe('hello world');
  });
});

// ==========================================
// truncate
// ==========================================

describe('truncate', () => {
  it('returns short text unchanged', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('returns exact-length text unchanged', () => {
    expect(truncate('hello', 5)).toBe('hello');
  });

  it('truncates with ellipsis', () => {
    expect(truncate('hello world', 8)).toBe('hello...');
  });
});

// ==========================================
// titleCase
// ==========================================

describe('titleCase', () => {
  it('capitalizes each word', () => {
    expect(titleCase('hello world')).toBe('Hello World');
  });

  it('lowercases uppercase input first', () => {
    expect(titleCase('HELLO WORLD')).toBe('Hello World');
  });

  it('handles single word', () => {
    expect(titleCase('hello')).toBe('Hello');
  });
});

// ==========================================
// generateConfirmationCode
// ==========================================

describe('generateConfirmationCode', () => {
  it('generates a 6-character code', () => {
    const code = generateConfirmationCode();
    expect(code).toHaveLength(6);
  });

  it('only uses allowed characters', () => {
    const allowed = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (let i = 0; i < 50; i++) {
      const code = generateConfirmationCode();
      for (const char of code) {
        expect(allowed).toContain(char);
      }
    }
  });
});

// ==========================================
// validateAppointment
// ==========================================

describe('validateAppointment', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.BUSINESS_OPENING_HOUR = '08:00';
    process.env.BUSINESS_CLOSING_HOUR = '17:00';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('rejects invalid date format', () => {
    const result = validateAppointment('not-a-date', '10:00');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid date format');
  });

  it('rejects invalid time format', () => {
    const result = validateAppointment('2030-06-15', 'bad');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid time format');
  });

  it('rejects past dates', () => {
    const result = validateAppointment('2020-01-01', '10:00');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('past dates');
  });

  it('rejects time outside business hours', () => {
    // Use a future weekday
    const futureDate = getNextWeekday();
    const result = validateAppointment(futureDate, '06:00');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('office hours');
  });

  it('rejects weekends', () => {
    const nextSaturday = getNextDayOfWeek(6);
    const result = validateAppointment(nextSaturday, '10:00');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('weekends');
  });

  it('accepts valid future weekday within business hours', () => {
    const futureDate = getNextWeekday();
    const result = validateAppointment(futureDate, '10:00');
    expect(result.valid).toBe(true);
  });
});

// ==========================================
// Test Helpers
// ==========================================

function getNextWeekday(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  while (date.getDay() === 0 || date.getDay() === 6) {
    date.setDate(date.getDate() + 1);
  }
  return date.toISOString().split('T')[0];
}

function getNextDayOfWeek(dayOfWeek: number): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  while (date.getDay() !== dayOfWeek) {
    date.setDate(date.getDate() + 1);
  }
  return date.toISOString().split('T')[0];
}
