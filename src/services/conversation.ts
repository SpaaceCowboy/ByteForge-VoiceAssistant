//manages the conversation flow, function execution, and coordinates between all other services.

import { customerModel, callLogModel, faqModel, reservationModel } from '../models';
import openaiService from './openai';
import ttsService from './tts';
import redis from '../config/redis';
import { getCurrentDate, formatTimeForDisplay, validateReservation, validatePartySize } from '../utils/helpers';
import logger from '../utils/logger';
import type {
  Session,
  Customer,
  Reservation,
  Message,
  SessionState,
  CollectedData,
  ToolContext,
  ConversationResponse,
  GreetingResponse,
  FunctionExecutionResult,
} from '../../index';



//initialization

//initialize a new conversation session when a call starts
export async function initializeConversation(
    callSid: string,
    fromNumber: string,
    toNumber: string
): Promise<Session> {
    logger.call(callSid, 'info', 'Initializing conversation', {from: fromNumber});

    //find or create the customer
    const customer = await customerModel.findOrCreate(fromNumber);

    //get reservation
    const upcomingReservations = await reservationModel.findUpcomingByCustomer(customer.id);

    //call log entry
    await callLogModel.create(callSid, fromNumber, toNumber, customer.id)

    //initialize session state
    const session: Session = {
      callSid,
      customer,
      upcomingReservations,
      state: {
        currentStep: 'greeting',
        confirmationPending: false,
        pendingReservation: null,
        transferRequested: false,
        endRequested: false,
      },
      messageHistory: [],
      collectedData: {},
      createdAt: new Date(),
    };

    // store in redis
    await redis.setSession(callSid, session);

    logger.call(callSid, 'info', 'Session initialized', {
      customerId: customer.id,
      hasName: !!customer.full_name,
      upcomingReservations: upcomingReservations.length,
    });

    return session;
}

//Greeting generation

// generate personalized greeting for the caller
export async function generateGreeting(callSid: string): Promise<GreetingResponse> {
  const session = await redis.getSession(callSid);

  if(!session) {
    throw new Error(`Session not found: ${callSid}`);
  }

  const businessName = process.env.BUSINESS_NAME || 'our restaurant';
  const customer = session.customer;
  const reservations = session.upcomingReservations;

  let greeting: string;

  if (customer?.full_name && reservations.length > 0) {
    // Returning customer with upcoming reservation
    const nextRes = reservations[0];
    greeting = `Hello ${customer.full_name}! 
    Thank you for calling ${businessName}. 
    I see you have a reservation coming up on 
    ${formatDateForSpeech(nextRes.reservation_date)} at
     ${formatTimeForDisplay(nextRes.reservation_time)}. 
    How can I help you today?`;
  } else if (customer?.full_name) {
    // Returning customer without reservation
    greeting = `Hello ${customer.full_name}! 
    Thank you for calling ${businessName}. How can I help you today?`;
  } else {
    // New customer
    greeting = `Thank you for calling ${businessName}
    ! I'm your AI assistant and I 
    can help you make a reservation or answer questions about our restaurant.
     How can I help you today?`;
  }
  
  // Generate audio
  let audio: Buffer | undefined;
  try {
    audio = await ttsService.textToSpeech(greeting);
  } catch (error) {
    logger.call(callSid, 'error', 'Failed to generate greeting audio', error);
  }
  
  // Add greeting to message history
  await redis.addMessage(callSid, {
    role: 'assistant',
    content: greeting,
    timestamp: new Date(),
  });
  
  // Update session state
  await redis.updateSessionState(callSid, { currentStep: 'listening' });
  
  return { text: greeting, audio };
}

//process user input and generate a response
export async function processInput(
  callSid: string,
  userInput: string,
): Promise<ConversationResponse> {
  const startTime = Date.now();
  logger.call(callSid, 'info', 'processing input', {input: userInput});

  //get session
  const session = await redis.getSession(callSid);
  if (!session) {
    throw new Error(`Session not found: ${callSid}`);
  }

  //add user message to history
  await redis.addMessage(callSid, {
    role: 'user',
    content: userInput,
    timestamp: new Date(),
  })

  // refresh session after adding message
  const updatedSession = await redis.getSession(callSid);
  if (!updatedSession) {
    throw new Error('Session lost during processing');
  }

  // build context for OpenAI
  const context: ToolContext = {
    businessName: process.env.BUSINESS_NAME || 'our restaurant',
    customerPhone: session.customer?.phone || 'unknown',
    customerName: session.customer?.full_name || null,
    reservationCount: session.customer?.total_reservations || 0,
    currentDate: getCurrentDate(),
    openingHour: process.env.BUSINESS_OPENING_HOUR || '08:00',
    closingHour: process.env.BUSINESS_CLOSING_HOUR || '16:00',
  };

  // call openai
  const response = await openaiService.chat(updatedSession.messageHistory, context);

  let responseText = response.content || '';
  let shouldEnd = false;
  let shouldTransfer = false;
  let transferReason:  string | undefined;

  // handle function call if present
  if (response.functionCall) {
    const { name, arguments: args, id} = response.functionCall;
    logger.call(callSid, 'info', 'Function call', {name, args});

    //execute the function 
    const result = await executeFunctionCall(callSid, name, args);

    // get natural response after function execution
    responseText = await openaiService.continueAfterFunctionCall(
      updatedSession.messageHistory,
      name,
      result,
      id,
      context
    );

    // check for end/transfer flags
    shouldEnd = result.shouldEnd || false;
    shouldTransfer = result.shouldTransfer || false;
    transferReason = result.transferReason;
  }

  // generate TTS audio 
  let audio: Buffer | undefined;
  if (responseText) {
    try { 
      audio = await ttsService.textToSpeech(responseText);
    } catch (error) {
      logger.call(callSid, 'error', 'TTS generation failed', error);
    }

    //add response to history
    await redis.addMessage(callSid, {
      role: 'assistant',
      content: responseText,
      timestamp: new Date(),
    })

    //update transcript
    await callLogModel.appendToTranscript(callSid, 'user', userInput);
    await callLogModel.appendToTranscript(callSid, 'assistant', responseText);
  }

  const duration = Date.now() - startTime;
  logger.call(callSid, 'info', 'Processing complete', {duration: `${duration}ms`})

  return {
    text: responseText,
    audio,
    shouldEnd,
    shouldTransfer,
    transferReason,
  }
}

// function execution

async function executeFunctionCall(
  callSid: string,
  name: string,
  args: Record<string, unknown>
): Promise<FunctionExecutionResult> {
  const session = await redis.getSession(callSid);
  if (!session) {
    return {success: false, error: 'Session not found'};
  }

  switch (name) {
    case 'check_availability':
      return handleCheckAvailability(args);
    
    case 'create_reservation':
      return handleCreateReservation(callSid, session, args);
    
    case 'modify_reservation':
      return handleModifyReservation(args);
    
    case 'cancel_reservation':
      return handleCancelReservation(args);

    case 'get_customer_reservations':
      return handleGetReservations(session);

    case 'update_customer_name':
      return handleUpdateName(session, args);

    case 'answer_faq':
      return handleFaq(args);

    case 'transfer_to_human':
      return handleTransfer(callSid, args);

    case 'end_call':
      return handleEndCall(callSid, session);

    default:
      logger.warn('unknown function called', {name});
      return {success: false, error: `Unknown function: ${name}`}
  }
}

// function handler 
async function handleCheckAvailability(
  args: Record<string, unknown>
): Promise<FunctionExecutionResult> {
  const date = String(args.date);
  const time = String(args.time);
  const partySize = parseInt(String(args.party_size));

  // validate inputys
  const validation = validateReservation(date, time);
  if (!validation.valid) {
    return {success: false, error: validation.error};
  }

  const sizeValidation = validatePartySize(partySize);
  if (!sizeValidation.valid) {
    return { success: false, error: sizeValidation.error };
  }

  //check availability
  const availability = await reservationModel.checkAvailability(date, time, partySize)

  return {
    success: true,
    data: availability,
  }
}

async function handleCreateReservation(
  callSid: string,
  session: Session,
  args: Record<string, unknown> 
): Promise<FunctionExecutionResult> {
  if (!session.customer) {
    return { success: false, error: 'Customer not found'};
  }

  const date = String(args.date);
  const time = String(args.time);
  const partySize = parseInt(String(args.party_size));
  const specialRequests = args.special_requests ? String(args.special_requests) : undefined;

  try {
    // create the reservation
    const reservation = await reservationModel.create({
      customerId: session.customer.id,
      date,
      time,
      partySize,
      specialRequests,
      source: 'phone_ai',
    });

    //update customer stats
    await customerModel.incrementReservationCount(session.customer.id);

    //link reservation to call
    await callLogModel.linkReservation(callSid, reservation.id)

    return {
      success: true,
      data: {
        reservationId: reservation.id,
        confirmationCode: reservation.confirmation_code,
        date: reservation.reservation_date,
        time: reservation.reservation_time,
        partySize: reservation.party_size,
      },
    };

  } catch (error) {
    logger.error('Failed to create reservation', error);
    return { success: false, error: 'Failed to create reservation'};
  }
}

async function handleModifyReservation(
  args: Record<string, unknown>
):Promise<FunctionExecutionResult> {
  const reservationId = parseInt(String(args.reservation_id));

  const updates: Record<string, unknown> ={};
  if (args.new_date) updates.date = String(args.new_date);
  if (args.new_time) updates.time = String(args.new_time);
  if (args.new_party_size) updates.partySize = parseInt(String(args.new_party_size));
  if (args.special_requests) updates.specialRequests = String(args.special_requests);

  try {
    const reservation = await reservationModel.modify(reservationId, updates);

    if (!reservation) {
      return {success: false, error: 'Reservation not found'};
    }

    return {
      success: true,
      data: {
        reservationId: reservation.id,
        date: reservation.reservation_date,
        time: reservation.reservation_time,
        partySize: reservation.party_size,
      },
    };

  } catch (error) {
    logger.error('Failed to modify reservation', error);
    return { success:  false, error: 'Failed to modify reservation'};
  }
}

async function handleCancelReservation(
  args: Record<string, unknown>
): Promise<FunctionExecutionResult> {
  const reservationId = parseInt(String(args.reservation_id));
  const reason = args.reason ? String(args.reason) : undefined;
  
  try {
    const reservation = await reservationModel.cancel(reservationId, reason);
    
    if (!reservation) {
      return { success: false, error: 'Reservation not found' };
    }
    
    return {
      success: true,
      data: { cancelled: true, reservationId },
    };
    
  } catch (error) {
    logger.error('Failed to cancel reservation', error);
    return { success: false, error: 'Failed to cancel reservation' };
  }
}

async function handleGetReservations(session: Session): Promise<FunctionExecutionResult> {
  if (!session.customer) {
    return { success: true, data: { reservations: [] } };
  }
  
  const reservations = await reservationModel.findUpcomingByCustomer(session.customer.id);
  
  return {
    success: true,
    data: {
      reservations: reservations.map(r => ({
        id: r.id,
        date: r.reservation_date,
        time: r.reservation_time,
        partySize: r.party_size,
        status: r.status,
        confirmationCode: r.confirmation_code,
      })),
    },
  };
}

async function handleUpdateName(
  session: Session,
  args: Record<string, unknown>
): Promise<FunctionExecutionResult> {
  if (!session.customer) {
    return { success: false, error: 'Customer not found'};

  }

  const name = String(args.name);

  await customerModel.updateName(session.customer.id, name);

  //update session
  await redis.updateSession(session.callSid, {
    customer: { ...session.customer, full_name: name},
  });

  return {
    success: true,
    data: { name },
  };
}

async function handleFaq
(args: Record<string, unknown>): Promise<FunctionExecutionResult> {
  const question = String(args.question);
  
  const faq = await faqModel.findMatch(question);
  
  if (!faq) {
    return {
      success: true,
      data: {
        found: false,
        message: 'No specific information found. Please transfer to staff if needed.',
      },
    };
  }
  
  return {
    success: true,
    data: {
      found: true,
      answer: faq.answer,
    },
  };
}

async function handleTransfer(
  callSid: string,
  args: Record<string, unknown>
): Promise<FunctionExecutionResult> {
  const reason = String(args.reason);
  const notes = args.notes ? String (args.notes) : undefined;

  await callLogModel.markTransferred(callSid, reason);

  return {
    success: true,
    data: { transferring: true},
    shouldTransfer: true,
    transferReason: reason,
  }
}

async function handleEndCall(
  callSid: string,
  session: Session
): Promise<FunctionExecutionResult> {
  // generate summary analysis
  const refreshedSession = await redis.getSession(callSid);
  const transcript = refreshedSession?.messageHistory
  .map(m => `[${m.role}]: ${m.content}`)
  .join('\n') || '';

  const [summary, intent, sentiment] = await Promise.all([
    openaiService.generateCallSummary(transcript),
    openaiService.detectIntent(transcript),
    openaiService.analyzeSentiment(transcript),
  ])

  //complete the call log
  await callLogModel.completeCall(callSid, {
    status: 'completed',
    transcript,
    summary,
    intent,
    sentiment: sentiment.sentiment,
    sentimentScore: sentiment.score,
  })

 //delete session
 await redis.deleteSession(callSid);
 
 return {
  success: true,
  data: { ending: true},
  shouldEnd: true
 }
}

//call ended handler 

//from twilio status callback

export async function handleCallEnded(
  callSid: string,
  data: { status: string; duration: number}
): Promise<void> {
  logger.call(callSid, 'info', 'Call ended', data)

  //update call log
  const session = await redis.getSession(callSid)

  if (session) {
    const transcript = session.messageHistory
    .map(m => `[${m.role}]: ${m.content}`)
    .join('\n');

    await callLogModel.completeCall(callSid, {
      status: data.status,
      durationSeconds: data.duration,
      transcript,
    });
  }

  //clean up session
  await redis.deleteSession(callSid)
}

// utility 
function formatDateForSpeech(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}


export default {
  initializeConversation,
  generateGreeting,
  processInput,
  handleCallEnded,
};


