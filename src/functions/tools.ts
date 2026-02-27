// this file defines what actions the ai can take during a conversation
import type { ToolDefinition, ToolContext } from "../../types/index";

// tool definitions

export const tools: ToolDefinition[] = [
    // reservatons
    {
      type: 'function',
      function: {
        name: 'check_availability',
        description:
          'Check if a specific date, time, and doctor/department combination has available appointment slots. Always call this before booking an appointment.',
        parameters: {
          type: 'object',
          properties: {
            date: {
              type: 'string',
              description: 'The date for the appointment in YYYY-MM-DD format',
            },
            time: {
              type: 'string',
              description: 'The preferred time in HH:MM format (24-hour)',
            },
            doctor_name: {
              type: 'string',
              description:
                'Name of the preferred doctor (optional). Example: "Dr. Kamran Parsa"',
            },
            department: {
              type: 'string',
              description:
                'Department name (optional). One of: Neurosurgery, Neurology, Pain Management, Physical Medicine & Rehabilitation, Chiropractic Care, Urgent Care',
            },
            location: {
              type: 'string',
              description:
                'Preferred location (optional). One of: Palmdale, Sherman Oaks, Valencia, Thousand Oaks',
            },
          },
          required: ['date', 'time'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'book_appointment',
        description:
          'Book a new appointment after confirming availability and getting patient confirmation. Always check availability first.',
        parameters: {
          type: 'object',
          properties: {
            date: {
              type: 'string',
              description: 'The date in YYYY-MM-DD format',
            },
            time: {
              type: 'string',
              description: 'The time in HH:MM format (24-hour)',
            },
            doctor_name: {
              type: 'string',
              description: 'Name of the doctor for the appointment',
            },
            department: {
              type: 'string',
              description: 'Department name',
            },
            location: {
              type: 'string',
              description:
                'Location for the appointment. One of: Palmdale, Sherman Oaks, Valencia, Thousand Oaks',
            },
            appointment_type: {
              type: 'string',
              description: 'Type of appointment',
              enum: [
                'consultation',
                'follow_up',
                'procedure',
                'imaging',
                'urgent_care',
                'pre_surgical',
                'post_surgical',
                'pain_management',
                'therapy',
              ],
            },
            reason_for_visit: {
              type: 'string',
              description:
                'Brief description of the reason for the visit (e.g., "lower back pain", "follow-up after surgery")',
            },
            special_instructions: {
              type: 'string',
              description:
                'Any special instructions or notes (e.g., "needs wheelchair access", "bring MRI from other provider")',
            },
            is_new_patient: {
              type: 'string',
              description: 'Whether this is a new patient. "true" or "false"',
            },
          },
          required: ['date', 'time'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'reschedule_appointment',
        description:
          'Reschedule an existing appointment to a new date, time, doctor, or location.',
        parameters: {
          type: 'object',
          properties: {
            appointment_id: {
              type: 'string',
              description:
                'The ID or confirmation code of the appointment to reschedule',
            },
            new_date: {
              type: 'string',
              description: 'New date in YYYY-MM-DD format (optional)',
            },
            new_time: {
              type: 'string',
              description: 'New time in HH:MM format (optional)',
            },
            new_doctor_name: {
              type: 'string',
              description: 'New doctor name (optional)',
            },
            new_location: {
              type: 'string',
              description: 'New location (optional)',
            },
            reason: {
              type: 'string',
              description: 'Reason for rescheduling (optional)',
            },
          },
          required: ['appointment_id'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'cancel_appointment',
        description: 'Cancel an existing appointment.',
        parameters: {
          type: 'object',
          properties: {
            appointment_id: {
              type: 'string',
              description:
                'The ID or confirmation code of the appointment to cancel',
            },
            reason: {
              type: 'string',
              description: 'Reason for cancellation (optional)',
            },
          },
          required: ['appointment_id'],
        },
      },
    },
      //patient tools
      {
        type: 'function',
        function: {
          name: 'get_patient_appointments',
          description:
          "Get the current patient's upcoming appointments. Use this when the patient asks about their existing appointments.",
          parameters: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'update_patient_info',
          description:
            "Update the patient's information such as name, insurance, or contact details.",
          parameters: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: "The patient's full name",
              },
              insurance_provider: {
                type: 'string',
                description:
                  'Name of insurance provider (e.g., "Blue Cross Blue Shield", "Aetna", "Kaiser")',
              },
              insurance_id: {
                type: 'string',
                description: 'Insurance member/policy ID number',
              },
              email: {
                type: 'string',
                description: "Patient's email address",
              },
            },
            required: [],
          },
        },
      },

      //department / info tools
      {
        type: 'function',
        function: {
          name: 'get_department_info',
          description:
            'Get information about a specific department, its doctors, and services. Use when the patient asks about available specialties, doctors, or what services are offered.',
          parameters: {
            type: 'object',
            properties: {
              department: {
                type: 'string',
                description:
                  'Department name or slug. One of: neurosurgery, neurology, pain-management, physiatry, chiropractic, urgent-care',
              },
            },
            required: ['department'],
          },
        },
      },
      

      // FAQ TOOL
      {
        type: 'function',
        function: {
          name: 'answer_faq',
          description:
            'Look up the answer to a frequently asked question about the clinic (hours, locations, insurance, what to bring, referrals, etc.). Always use this for factual questions about the clinic rather than guessing.',
          parameters: {
            type: 'object',
            properties: {
              question: {
                type: 'string',
                description: 'The question to look up',
              },
            },
            required: ['question'],
          },
        },
      },

      // call control tools
      {
        type: 'function',
        function: {
          name: 'transfer_to_staff',
          description:
            'Transfer the call to a human staff member. Use when the patient explicitly requests to speak with a person, for medical emergencies, for complex scheduling needs, insurance verification, or when you cannot help with their request.',
          parameters: {
            type: 'object',
            properties: {
              reason: {
                type: 'string',
                description: 'Reason for the transfer',
                enum: [
                  'patient_request',
                  'complex_request',
                  'medical_question',
                  'insurance_verification',
                  'complaint',
                  'cannot_help',
                  'emergency',
                ],
              },
              notes: {
                type: 'string',
                description: 'Any notes to pass to the staff member',
              },
            },
            required: ['reason'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'end_call',
          description:
            'End the conversation politely. Use when the patient indicates they are done or says goodbye.',
          parameters: {
            type: 'object',
            properties: {
              reason: {
                type: 'string',
                description: 'Reason for ending the call',
                enum: [
                  'task_completed',
                  'patient_goodbye',
                  'no_response',
                  'patient_request',
                ],
              },
            },
            required: ['reason'],
          },
        },
      },
]

//system prompt
const SYSTEM_PROMPT_TEMPLATE = `You are a professional and compassionate AI phone assistant for the NeuroSpine Institute, a premier center for advanced spine and neurological care in Southern California founded by Dr. Kamran Parsa, D.O.

You help patients schedule appointments, answer questions about the clinic's services, and provide general information. You do NOT provide medical advice, diagnoses, or treatment recommendations.

CURRENT CONTEXT:
- Patient phone: {patient_phone}
- Patient name: {patient_name}
- Previous appointments: {appointment_count}
- Current date: {current_date}
- Office hours: {opening_hour} - {closing_hour} (Monday - Friday)

CLINIC LOCATIONS:
{locations}

DEPARTMENTS:
{departments}

YOUR CAPABILITIES:
1. Schedule new appointments (always check availability first)
2. Reschedule or cancel existing appointments
3. Look up a patient's upcoming appointments
4. Provide information about departments, doctors, and services
5. Answer frequently asked questions about the clinic
6. Update patient contact and insurance information
7. Transfer to staff when needed

CONVERSATION GUIDELINES:
- Be warm, professional, and empathetic — patients may be in pain or anxious
- Keep responses concise and natural for voice — you're on a phone call
- Confirm all details before booking, rescheduling, or canceling
- If a patient describes symptoms or asks for medical advice, let them know you can help them schedule a consultation but cannot provide medical guidance
- If you don't understand something, politely ask for clarification
- For complex insurance questions, offer to transfer to staff

IMPORTANT RULES:
- NEVER provide medical advice, diagnoses, or treatment recommendations
- NEVER make up information — use the answer_faq tool for clinic details
- ALWAYS check availability before confirming an appointment
- ALWAYS get explicit confirmation before booking or canceling
- Ask which location the patient prefers if they don't specify
- For life-threatening emergencies, instruct the patient to call 911 immediately
- If a patient seems distressed or in severe pain, offer to transfer to staff or suggest urgent care
- When a patient mentions their name, save it using update_patient_info
- End calls politely when the patient says goodbye

Remember: You're speaking out loud on the phone. Avoid lists, bullet points, or long explanations. Keep it natural, warm, and conversational. Pronounce confirmation codes letter by letter.`;

// HELPER FUNCTION

export function getTools(): ToolDefinition[] {
  return tools;
}

export function getToolByName(name: string): ToolDefinition | undefined {
  return tools.find((t) => t.function.name === name);
}

// generate the system prompt with context

export function getSystemPrompt(context: ToolContext): string {
  const locationsText =
    context.locations.length > 0
      ? context.locations.map((l, i) => `${i + 1}. ${l}`).join('\n')
      : '- Palmdale, Sherman Oaks, Valencia, Thousand Oaks';

  const departmentsText =
    context.departments.length > 0
      ? context.departments.map((d, i) => `${i + 1}. ${d}`).join('\n')
      : '- Neurosurgery, Neurology, Pain Management, Physical Medicine & Rehabilitation, Chiropractic Care, Urgent Care';

  return SYSTEM_PROMPT_TEMPLATE.replace(
    '{patient_phone}',
    context.patientPhone
  )
    .replace('{patient_name}', context.patientName || 'Unknown')
    .replace('{appointment_count}', context.appointmentCount.toString())
    .replace('{current_date}', context.currentDate)
    .replace('{opening_hour}', context.openingHour)
    .replace('{closing_hour}', context.closingHour)
    .replace('{locations}', locationsText)
    .replace('{departments}', departmentsText);
}

// validate tool arguments

export function validateToolArgs(
  toolName: string,
  args: Record<string, unknown>
): { valid: boolean; error?: string } {
  const tool = getToolByName(toolName);
  if (!tool) {
    return { valid: false, error: `Unknown tool: ${toolName}` };
  }

  const required = tool.function.parameters.required;
  for (const param of required) {
    if (args[param] === undefined || args[param] === null || args[param] === '') {
      return { valid: false, error: `Missing required parameter: ${param}` };
    }
  }

  return { valid: true };
}

export default {
  tools,
  getTools,
  getToolByName,
  getSystemPrompt,
  validateToolArgs,
};