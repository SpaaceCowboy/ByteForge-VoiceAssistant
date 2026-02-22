// This file defines what actions the AI can take during a conversation
// SpineWell Clinic - Appointment Management Tools
import type { ToolDefinition, ToolContext } from "../../types/index";

// Tool definitions

export const tools: ToolDefinition[] = [
    // Appointments
    {
        type: 'function',
        function: {
          name: 'check_availability',
          description: 'Check if a specific date and time slot is available for an appointment. Always call this before booking an appointment.',
          parameters: {
            type: 'object',
            properties: {
              date: {
                type: 'string',
                description: 'The date for the appointment in YYYY-MM-DD format',
              },
              time: {
                type: 'string',
                description: 'The time for the appointment in HH:MM format (24-hour)',
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
          description: 'Book a new appointment after confirming availability and getting patient confirmation. Always check availability first.',
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
              reason_for_visit: {
                type: 'string',
                description: 'The reason for the appointment (e.g., back pain, neck pain, follow-up, consultation)',
              },
              special_instructions: {
                type: 'string',
                description: 'Any special instructions or notes (e.g., bring imaging results, wheelchair access needed)',
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
          description: 'Reschedule an existing appointment (change date or time)',
          parameters: {
            type: 'object',
            properties: {
              appointment_id: {
                type: 'string',
                description: 'The ID of the appointment to reschedule',
              },
              new_date: {
                type: 'string',
                description: 'New date in YYYY-MM-DD format (optional)',
              },
              new_time: {
                type: 'string',
                description: 'New time in HH:MM format (optional)',
              },
              special_instructions: {
                type: 'string',
                description: 'Updated special instructions (optional)',
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
          description: 'Cancel an existing appointment',
          parameters: {
            type: 'object',
            properties: {
              appointment_id: {
                type: 'string',
                description: 'The ID of the appointment to cancel',
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
      // Patient tools
      {
        type: 'function',
        function: {
          name: 'get_patient_appointments',
          description: 'Get the current patient\'s upcoming appointments',
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
          name: 'update_patient_name',
          description: 'Update the patient\'s name when they provide it',
          parameters: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'The patient\'s full name',
              },
            },
            required: ['name'],
          },
        },
      },


      // FAQ tool
      {
        type: 'function',
        function: {
            name: 'answer_faq',
            description: 'Look up the answer to a frequently asked question about the clinic (hours, location, insurance, services, etc.)',
            parameters: {
                type: 'object',
                    properties: {
                        question: {
                            type: 'string',
                            description: 'The question to look up'
                        },
                    },
                    required: ['question'],
            },
        },
      },

      // Call control tools
      {
        type: 'function',
        function: {
          name: 'transfer_to_staff',
          description: 'Transfer the call to clinic staff. Use when the patient explicitly requests to speak with a person, or when you cannot help with their request.',
          parameters: {
            type: 'object',
            properties: {
              reason: {
                type: 'string',
                description: 'Brief reason for the transfer',
                enum: [
                  'patient_request',
                  'complex_request',
                  'medical_question',
                  'insurance_issue',
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
          description: 'End the conversation politely. Use when the patient indicates they are done or says goodbye.',
          parameters: {
            type: 'object',
            properties: {
              reason: {
                type:'string',
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

// System prompt
const SYSTEM_PROMPT_TEMPLATE = `You are a friendly and professional AI phone assistant for {business_name}, a spinal care clinic. You help patients with appointments and answer questions about the clinic and its services.

CURRENT CONTEXT:
- Patient phone: {patient_phone}
- Patient name: {patient_name}
- Previous appointments: {appointment_count}
- Current date: {current_date}
- Clinic hours: {opening_hour} - {closing_hour} (Monday through Friday)

YOUR CAPABILITIES:
1. Book new appointments (always check availability first)
2. Reschedule existing appointments
3. Cancel appointments
4. Answer questions about the clinic, services, insurance, and conditions treated
5. Transfer to clinic staff when needed

CONVERSATION GUIDELINES:
- Be warm, empathetic, and professional - patients may be in pain or anxious
- Keep responses concise and natural for voice
- Confirm details before taking action
- If you don't understand, politely ask for clarification
- For medical advice questions, explain that you cannot provide medical advice and offer to transfer to clinical staff

IMPORTANT RULES:
- Never provide medical diagnoses or treatment advice
- Use the FAQ tool for clinic details
- Always check availability before confirming an appointment
- Get explicit confirmation before booking or canceling
- If the patient seems distressed or describes an emergency, offer to transfer to staff immediately
- End calls politely when the patient says goodbye

Remember: You're speaking out loud, so avoid lists, bullet points, or long explanations. Keep it natural and conversational.`;

// Helper functions

export function getTools(): ToolDefinition[] {
  return tools;
}

export function getToolByName(name: string): ToolDefinition | undefined {
  return tools.find(t => t.function.name === name)
}

// Generate the system prompt with context

export function getSystemPrompt(context: ToolContext): string {
  return SYSTEM_PROMPT_TEMPLATE
    .replace('{business_name}', context.businessName)
    .replace('{patient_phone}', context.patientPhone)
    .replace('{patient_name}', context.patientName || 'Unknown')
    .replace('{appointment_count}', context.appointmentCount.toString())
    .replace('{current_date}', context.currentDate)
    .replace('{opening_hour}', context.openingHour)
    .replace('{closing_hour}', context.closingHour);
}

// Validate tool arguments

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
