// utility for date parsing, phone number normalization
// validation and text processing.

import {v4 as uuidv4 } from 'uuid'

// date and time helper

export function parseDate(dateStr: string): string | null {
    const input = dateStr.toLowerCase().trim();
    const today = new Date();
    today.setHours(0, 0, 0, 0)

    if (input === 'today') {
        return formatDate(today)
    }
    
    //tomorrow
    if (input === 'tomorrow') {
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1)
        return formatDate(tomorrow)
    }

    //next weekday
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
    const nextMatch = input.match(/next\s+(\w+)/)
    if (nextMatch) {
        const dayIndex = dayNames.indexOf(nextMatch[1]);
        if (dayIndex !== -1) {
            const date = new Date(today);
            const currentDay = date.getDay();
            let daysToAdd = dayIndex - currentDay;
            if (daysToAdd <= 0) daysToAdd += 7;
            date.setDate(date.getDate() + daysToAdd);
            return formatDate(date)
        }
    }

    // this weekday
    const thisMatch = input.match(/this\s+(\w+)/);
    if (thisMatch) {
        const dayIndex = dayNames.indexOf(thisMatch[1]);
        if (dayIndex !== -1) {
            const date = new Date(today);
            const currentDay = date.getDay();
            let daysToAdd = dayIndex - currentDay;
            if (daysToAdd <0 ) daysToAdd += 7;
            date.setDate(date.getDate() +daysToAdd );
            return formatDate(date)
        }
    }

    //in x days
    const inDaysMatch = input.match(/in\s+(\d+)\s+days?/);
    if (inDaysMatch) {
        const days = parseInt(inDaysMatch[1]);
        const date = new Date(today);
        date.setDate(date.getDate() + days);
        return formatDate(date);
    }

    // parse standard date
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
        return formatDate(parsed)
    }

    return null;
}

// parse natural language time and hours

export function parseTime(timeStr: string): string | null {
    const input = timeStr.toLowerCase().trim();

    const timeRegex = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i;
    const match = input.match(timeRegex);

    if (match) {
        let hours = parseInt(match[1]);
        const minutes = match[2] ? parseInt(match[2]) : 0;
        const period = match[3]?.toLowerCase();

        //convert to 24hour format
        if (period === 'pm' && hours < 12) {
            hours += 12;
        } else if (period === 'am' && hours === 12) {
            hours = 0
        }

        //validate
        if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
            return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
        }
    }

    //handle word times
    const wordToNumber: Record<string, number> = {
        'noon': 12, 'midday': 12,
        'midnight': 0,
        'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
        'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
        'eleven': 11, 'twelve': 12
    };

    for (const [word, num] of Object.entries(wordToNumber)) {
        if (input.includes(word)) {
            let hours = num;
            // assumes pm for clinic hours
            if (hours >= 1 && hours <= 11 && !input.includes('am') && !input.includes('morning')) {
                if (hours <5) hours += 12; 
            }
            return `${hours.toString().padStart(2, '0')}:00`
        }
    } 
    return null
}

//format date object to YYY-MM-DD string

export function formatDate(date: Date): string {
    return date.toISOString().split('T')[0]
}

// format a Date object to HH:MM string

export function formatTime(date: Date): string {
    return date.toTimeString().substring(0, 5);
}

// get current date in YYYY-MM-DD format

export function getCurrentDate(): string {
    return formatDate(new Date());
}

// get current time in HH:MM format

export function getCurrentTime(): string {
    return formatTime(new Date());
}

// check if a date is in the past

export function isDateInPast(dateStr: string): boolean {
    const date = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date < today;
}

// check if a time has passed for today

export function isTimeInPast(dateStr: string, timeStr: string): boolean {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const dateTime = new Date(dateStr)
    dateTime.setHours(hours, minutes, 0, 0);
    return dateTime < new Date();
}


// phone number helper

// normalize a phone number to  +[country code][number]

export function normalizePhone(phone: string, defaultCountry: string = '1'): string | null {
    let cleaned = phone.replace(/[^\d+]/g, '')

    if (cleaned.startsWith('+')) {
        return cleaned
    }

    // remove leading 1 if present for US 
    if (cleaned.startsWith('1') && cleaned.length === 11) {
        cleaned = cleaned.substring(1)
    }

    // validate US number length (10 digits)
    if (cleaned.length === 10) {
        return `+${defaultCountry}${cleaned}`;
    }

    if (cleaned.length > 10) {
        return `+${cleaned}`;
    }

    return null;
}

// format a phone number for display

export function formatPhoneForDisplay(phone: string): string {
    const cleaned = phone.replace(/\D/g, '');
    
    // US format
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    }
    
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      return `(${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
    }
    
    return phone;
  }

  // validate party size 

  export function validatePartySize(size: number): { valid: boolean; error?: string} {
    const maxSize = parseInt(process.env.MAX_PARTY_SIZE || '20');

    if (!Number.isInteger(size)) {
        return { valid: false, error: 'party size must be a whole number'};
    }

    if (size < 1) {
        return { valid: false, error: 'Party size must be at least 1 '};
    } 

    if (size > maxSize) {
        return {valid: false, error: `Party size cannot exceed ${maxSize}.For larger groups, please call to speak with a manager.`}
    }

    return { valid: true };
  }

  //validate reservation date and time

  export function validateReservation(
    date: string,
    time: string
  ): {valid: boolean; error?: string} {
    //check date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return { valid: false, error: 'Invalid date format' };
      }

      // check time format
      if (!/^\d{2}:\d{2}$/.test(time)) {
        return { valid: false, error: 'Invalid time format' };
      }

      // check if in past
      if (isDateInPast(date)) {
        return {valid: false, error: 'Cannot make reservations for past dates'};
      }

      // check if today and time has passed
      if (date === getCurrentDate() && isTimeInPast(date, time)) {
        return {valid: false, error: 'that time has already passed today'}
      }

      // check buisiness hours
      const openingHour = process.env.BUSINESS_OPENING_HOUR || '8:00';
      const closingHour = process.env.BUSINESS_CLOSING_HOUR || '17:00';

      if (time < openingHour || time > closingHour) {
        return {
            valid: false,
            error: `we're only open from ${formatTimeForDisplay(openingHour)} to ${formatTimeForDisplay(closingHour)}`
        }
      }

      return { valid: true}
  }

  // format time for display (24h to 12h)

  export function formatTimeForDisplay(time: string): string {
    const [hours, minutes] = time.split(':').map(Number);
    const period = hours >= 12? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return minutes === 0
    ? `${displayHours} ${period}`
    : `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
  }

  //text processing helper

export function extractNumber(text: string): number | null {
    const wordToNum: Record<string, number> = {
      'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
      'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
      'eleven': 11, 'twelve': 12, 'thirteen': 13, 'fourteen': 14,
      'fifteen': 15, 'sixteen': 16, 'seventeen': 17, 'eighteen': 18,
      'nineteen': 19, 'twenty': 20
    };

    const lower = text.toLowerCase();

    // check for word numbers (four = 4)
    for (const [word, num] of Object.entries(wordToNum)) {
        if (lower.includes(word)) {
            return num;
        }
    } 

    // check for digits
    const digitalMatch = text.match(/\d+/);
    if (digitalMatch) {
        return parseInt(digitalMatch[0])
    }

    return null
}  

//clean text for TTS (remove unwanted characters)

export function cleanTextForSpeech(text: string): string {
    return text
    .replace(/\*\*/g, '')           // Remove bold markers
    .replace(/\*/g, '')              // Remove italics markers
    .replace(/https?:\/\/\S+/g, '') // Remove URLs
    .replace(/\s+/g, ' ')           // Normalize whitespace
    .trim();
}

// generate a unique confirmation code

export function generateConfirmationCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return code;
}

// generate a UUID 
export function generateUUID(): string {
    return uuidv4()
}

//truncate text with ellipsis

export function truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
        return text;
    }
    return text.substring(0, maxLength - 3 ) + '...'
}

//capitalize first letter of each word

export function titleCase(text: string): string {
    return text
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

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
    validatePartySize,
    validateReservation,
    formatTimeForDisplay,
    extractNumber,
    cleanTextForSpeech,
    generateConfirmationCode,
    generateUUID,
    truncate,
    titleCase,
  };