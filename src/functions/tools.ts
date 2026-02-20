// this file defines what actions the ai can take during a conversation
import type { ToolDefinition, ToolContext } from "../../index";

// tool definitions

export const tools: ToolDefinition[] = [
    // reservations
    {
        type: 'function',
        function: {
          name: 'check_availability',
          description: 'Check if a specific date and time slot is available for a reservation. Always call this before creating a reservation.',
          parameters: {
            type: 'object',
            properties: {
              date: {
                type: 'string',
                description: 'The date for the reservation in YYYY-MM-DD format',
              },
              time: {
                type: 'string',
                description: 'The time for the reservation in HH:MM format (24-hour)',
              },
              party_size: {
                type: 'number',
                description: 'Number of guests',
              },
            },
            required: ['date', 'time', 'party_size'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'create_reservation',
          description: 'Create a new reservation after confirming availability and getting customer confirmation. Always check availability first.',
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
              party_size: {
                type: 'number',
                description: 'Number of guests',
              },
              special_requests: {
                type: 'string',
                description: 'Any special requests or notes',
              },
            },
            required: ['date', 'time', 'party_size'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'modify_reservation',
          description: 'Modify an existing reservation (change date, time, or party size)',
          parameters: {
            type: 'object',
            properties: {
              reservation_id: {
                type: 'string',
                description: 'The ID of the reservation to modify',
              },
              new_date: {
                type: 'string',
                description: 'New date in YYYY-MM-DD format (optional)',
              },
              new_time: {
                type: 'string',
                description: 'New time in HH:MM format (optional)',
              },
              new_party_size: {
                type: 'string',
                description: 'New number of guests (optional)',
              },
              special_requests: {
                type: 'string',
                description: 'Updated special requests (optional)',
              },
            },
            required: ['reservation_id'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'cancel_reservation',
          description: 'Cancel an existing reservation',
          parameters: {
            type: 'object',
            properties: {
              reservation_id: {
                type: 'string',
                description: 'The ID of the reservation to cancel',
              },
              reason: {
                type: 'string',
                description: 'Reason for cancellation (optional)',
              },
            },
            required: ['reservation_id'],
          },
        },
      },

      // customer tools
      {
        type: 'function',
        function: {
          name: 'get_customer_reservations',
          description: 'Get the current customer\'s upcoming reservations',
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
          name: 'update_customer_name',
          description: 'Update the customer\'s name when they provide it',
          parameters: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'The customer\'s full name',
              },
            },
            required: ['name'],
          },
        },
      },

      // FAQ TOOL
      {
        type: 'function',
        function: {
            name: 'answer_faq',
            description: 'Look up the answer to a frequently asked question about the restaurant (hours, location, etc.)',
            parameters: {
                type: 'object',
                    properties: {
                        question: {
                            type: 'string',
                            description: 'the question to look up'
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
          name: 'transfer_to_human',
          description: 'Transfer the call to human staff member. Use when the customer explicitly requests to speak with a person, or when you cannot help with their request',
          parameters: {
            type: 'object',
            properties: {
              reason: {
                type: 'string',
                description: 'Brief reason for the transfer',
                enum: [
                  'customer_request',
                  'complex_request',
                  'complaint',
                  'cannot_help',
                  'emergency',
                ],
              },
              notes: {
                type: 'string',
                description: 'Any notes to pass to the human agent',
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
          description: 'End the conversation politely, Use when the customer indicates they are done or says goodbye.',
          parameters: {
            type: 'object',
            properties: {
              reason: {
                type:'string',
                description: 'Reason for ending the call',
                enum: [
                'task_completed',
                'customer_goodbye',
                'no_response',
                'customer_request',
            ],
            },
          },
          required: ['reason'],
          },
        },
      },
]

//system prompt
const SYSTEM_PROMPT_TEMPLATE = `You are a friendly and professional AI phone assistant for {business_name}. You help customers with reservations and answer questions about the restaurant.

CURRENT CONTEXT:
- Customer phone: {customer_phone}
- Customer name: {customer_name}
- Previous reservations: {reservation_count}
- Current date: {current_date}
- Business hours: {opening_hour} - {closing_hour}

YOUR CAPABILITIES:
1. Make new reservations (always check availability first)
2. Modify existing reservations
3. Cancel reservations
4. Answer questions about the restaurant
5. Transfer to human staff when needed

CONVERSATION GUIDELINES:
- Be warm, friendly, and conversational - you're talking on the phone, not writing
- Keep responses concise and natural for voice
- Confirm details before taking action
- If you don't understand, politely ask for clarification
- For complex requests, offer to transfer to a human

IMPORTANT RULES:
- Never make up information - use the FAQ tool for restaurant details
- Always check availability before confirming a reservation
- Get explicit confirmation before booking or canceling
- If the customer seems upset, offer to transfer to a manager
- End calls politely when the customer says goodbye

Remember: You're speaking out loud, so avoid lists, bullet points, or long explanations. Keep it natural and conversational.`;

// HELPER FUNCTION

export function getTools(): ToolDefinition[] {
  return tools;
}

export function getToolByName(name: string): ToolDefinition | undefined {
  return tools.find(t => t.function.name === name)
}

// generate the system prompt with context

export function getSystemPrompt(context: ToolContext): string {
  return SYSTEM_PROMPT_TEMPLATE
    .replace('{business_name}', context.businessName)
    .replace('{customer_phone}', context.customerPhone)
    .replace('{customer_name}', context.customerName || 'Unknown')
    .replace('{reservation_count}', context.reservationCount.toString())
    .replace('{current_date}', context.currentDate)
    .replace('{opening_hour}', context.openingHour)
    .replace('{closing_hour}', context.closingHour);
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