import OpenAI from 'openai'
import { getTools, getSystemPrompt} from '../functions/tools'
import logger from '../utils/logger'
import type {
    Message,
    ToolContext,
    OpenAIChatResponse,
    FunctionCallResult
} from '../../index'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o'

// chatt completion
// handles calling function

export async function chat(
    messages: Message[],
    context: ToolContext
  ): Promise<OpenAIChatResponse> {
    const startTime = Date.now();
    
    try {
      // Build the messages array for OpenAI
      const systemPrompt = getSystemPrompt(context);
      
      const openaiMessages: ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        ...messages.map(msg => formatMessageForOpenAI(msg)),
      ];
      
      // Make the API call
      const response = await openai.chat.completions.create({
        model: MODEL,
        messages: openaiMessages,
        tools: getTools(),
        tool_choice: 'auto', // Let the model decide when to use tools
        temperature: 0.7,    // Some creativity but not too random
        max_tokens: 500,     // Keep responses concise for voice
      });
      
      const duration = Date.now() - startTime;
      logger.apiTiming('OpenAI', 'chat', duration, true);
      
      // Extract the response
      const choice = response.choices[0];
      const message = choice.message;
      
      // Check for function call
      let functionCall: FunctionCallResult | null = null;
      if (message.tool_calls && message.tool_calls.length > 0) {
        const toolCall = message.tool_calls[0]; // Handle first tool call
        functionCall = {
          name: toolCall.function.name,
          arguments: JSON.parse(toolCall.function.arguments),
          id: toolCall.id,
        };
      }
      
      return {
        content: message.content,
        functionCall,
        usage: response.usage || null,
      };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.apiTiming('OpenAI', 'chat', duration, false);
      logger.error('OpenAI chat error', error);
      throw error;
    }
  }
  
  /**
   * Continue the conversation after a function call
   * Sends the function result back to get a natural response
   */
  export async function continueAfterFunctionCall(
    messages: Message[],
    functionName: string,
    functionResult: unknown,
    toolCallId: string,
    context: ToolContext
  ): Promise<string> {
    const startTime = Date.now();
    
    try {
      const systemPrompt = getSystemPrompt(context);
      
      // Build messages including the function call and result
      const openaiMessages: ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        ...messages.map(msg => formatMessageForOpenAI(msg)),
        // Add the assistant message with the tool call
        {
          role: 'assistant',
          content: null,
          tool_calls: [{
            id: toolCallId,
            type: 'function',
            function: {
              name: functionName,
              arguments: '{}', // Arguments already parsed
            },
          }],
        },
        // Add the tool result
        {
          role: 'tool',
          tool_call_id: toolCallId,
          content: JSON.stringify(functionResult),
        },
      ];
      
      const response = await openai.chat.completions.create({
        model: MODEL,
        messages: openaiMessages,
        temperature: 0.7,
        max_tokens: 500,
      });
      
      const duration = Date.now() - startTime;
      logger.apiTiming('OpenAI', 'continueAfterFunctionCall', duration, true);
      
      return response.choices[0].message.content || '';
      
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.apiTiming('OpenAI', 'continueAfterFunctionCall', duration, false);
      logger.error('OpenAI continue error', error);
      throw error;
    }
  }
  
  // analysis function 

  // Generate a brief summar of call

  export async function generateCallSummary(transcript: string): Promise<string> {
    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini', //use smaller model for cost saving
            messages: [
                {
                    role: 'system',
                    content: 'Summarize this phone call transcript in 2-3 sentences. focuse on the main topic and outcome',
                },
                {
                    role: 'user',
                    content: transcript,
                },
            ],
            temperature: 0.3,
            max_tokens: 150,
        });

        return response.choices[0].message.content || 'unable to generate summary'
    } catch (error) {
        logger.error('Failed to generate call summary', error);
        return 'Unable to generate summary '
    }
  }

  // detect the primary intent of a call

  export async function detectIntent(transcript: string): Promise<string> {
    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: `Classify the primary intent of this phone call into one of these categories:
                    - new_reservation: Customer wants to make a new booking
                    - modify_reservation: Customer wants to change an existing booking
                    - cancel_reservation: Customer wants to cancel a booking
                    - inquiry: Customer asking about clinic details
                    - faq: General questions about hours, services, etc.
                    - complaint: Customer has a complaint
                    - other: Doesn't fit other categories
                    Respond with only the category name.`,
                },
                {
                    role: 'user',
                    content: transcript,
                },
            ],
            temperature: 0,
            max_tokens: 20,
        });

        return response.choices[0].message.content?.toLowerCase().trim() || 'other'
    } catch (error) {
        logger.error('Failed to detect intent', error)
        return 'unknown'
    }
  }

  export async function analyzeSentiment(
    transcript: string
  ): Promise<{sentiment: string; score: number}> {
    try{
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: `Analyze the customer's sentiment in this phone call.
                    Respond with a JSON object containing:
                    - sentiment: "positive", "neutral", or "negative"
                    - score: a number from -1.0 (very negative) to 1.0 (very positive)
                    Example: {"sentiment": "positive", "score": 0.7}`,
                },
                {
                    role: 'user',
                    content: transcript,
                },
            ],
            temperature: 0,
            max_tokens: 50,
        })

        const content = response.choices[0].message.content || '';
        const parsed = JSON.parse(content);

        return {
            sentiment: parsed.sentiment || 'neutral',
            score: typeof parsed.score === 'number' ? parsed.score : 0,
        };
    } catch (error) {
        logger.error('failed to analyze sentiment', error);
        return { sentiment: 'neutral', score: 0}
    }
  }

  //helper function

  function formatMessageForOpenAI(message: Message): ChatCompletionMessageParam {
    if (message.role === 'tool') {
        return {
            role: 'tool',
            tool_call_id: message.tool_call_id || '',
            content: message.content,
        }
    }

    if (message.role === 'assistant' && message.tool_calls) {
        return {
            role: 'assistant',
            content: message.content || null,
            tool_calls: message.tool_calls.map(tc => ({
                id: tc.id,
                type: 'function' as const,
                function: {
                    name: tc.function.name,
                    arguments: tc.function.arguments,
                },
            })),
        };
    }

    return {
        role: message.role as 'user' | 'assistant' | 'system',
        content: message.content,
    }
  }


  export default {
    chat,
    continueAfterFunctionCall,
    generateCallSummary,
    detectIntent,
    analyzeSentiment,
  };