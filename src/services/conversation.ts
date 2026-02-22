// Manages the conversation flow, function execution, and coordinates between all other services.
// SpineWell Clinic - AI Voice Assistant

import { patientModel, callLogModel, faqModel, appointmentModel } from '../models';
import openaiService from './openai';
import ttsService from './tts';
import redis from '../config/redis';
import { getCurrentDate, formatTimeForDisplay, validateAppointment } from '../utils/helpers';
import logger from '../utils/logger';
import type {
  Session,
  Patient,
  Appointment,
  Message,
  SessionState,
  CollectedData,
  ToolContext,
  ConversationResponse,
  GreetingResponse,
  FunctionExecutionResult,
} from '../../types/index';



// Initialization

// Initialize a new conversation session when a call starts
export async function initializeConversation(
    callSid: string,
    fromNumber: string,
    toNumber: string
): Promise<Session> {
    logger.call(callSid, 'info', 'Initializing conversation', {from: fromNumber});

    // Find or create the patient
    const patient = await patientModel.findOrCreate(fromNumber);

    // Get upcoming appointments
    const upcomingAppointments = await appointmentModel.findUpcomingByPatient(patient.id);

    // Create call log entry
    await callLogModel.create(callSid, fromNumber, toNumber, patient.id)

    // Initialize session state
    const session: Session = {
      callSid,
      patient,
      upcomingAppointments,
      state: {
        currentStep: 'greeting',
        confirmationPending: false,
        pendingAppointment: null,
        transferRequested: false,
        endRequested: false,
      },
      messageHistory: [],
      collectedData: {},
      createdAt: new Date(),
    };

    // Store in Redis
    await redis.setSession(callSid, session);

    logger.call(callSid, 'info', 'Session initialized', {
      patientId: patient.id,
      hasName: !!patient.full_name,
      upcomingAppointments: upcomingAppointments.length,
    });

    return session;
}

// Greeting generation

// Generate personalized greeting for the caller
export async function generateGreeting(callSid: string): Promise<GreetingResponse> {
  const session = await redis.getSession(callSid);

  if(!session) {
    throw new Error(`Session not found: ${callSid}`);
  }

  const businessName = process.env.BUSINESS_NAME || 'SpineWell Clinic';
  const patient = session.patient;
  const appointments = session.upcomingAppointments;

  let greeting: string;

  if (patient?.full_name && appointments.length > 0) {
    // Returning patient with upcoming appointment
    const nextAppt = appointments[0];
    greeting = `Hello ${patient.full_name}! Thank you for calling ${businessName}. I see you have an appointment coming up on ${formatDateForSpeech(nextAppt.appointment_date)} at ${formatTimeForDisplay(nextAppt.appointment_time)}. How can I help you today?`;
  } else if (patient?.full_name) {
    // Returning patient without appointment
    greeting = `Hello ${patient.full_name}! Thank you for calling ${businessName}. How can I help you today?`;
  } else {
    // New patient
    greeting = `Thank you for calling ${businessName}! I'm your AI assistant and I can help you schedule an appointment or answer questions about our clinic and services. How can I help you today?`;
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

// Process user input and generate a response
export async function processInput(
  callSid: string,
  userInput: string,
): Promise<ConversationResponse> {
  const startTime = Date.now();
  logger.call(callSid, 'info', 'Processing input', {input: userInput});

  // Get session
  const session = await redis.getSession(callSid);
  if (!session) {
    throw new Error(`Session not found: ${callSid}`);
  }

  // Add user message to history
  await redis.addMessage(callSid, {
    role: 'user',
    content: userInput,
    timestamp: new Date(),
  })

  // Refresh session after adding message
  const updatedSession = await redis.getSession(callSid);
  if (!updatedSession) {
    throw new Error('Session lost during processing');
  }

  // Build context for OpenAI
  const context: ToolContext = {
    businessName: process.env.BUSINESS_NAME || 'SpineWell Clinic',
    patientPhone: session.patient?.phone || 'unknown',
    patientName: session.patient?.full_name || null,
    appointmentCount: session.patient?.total_appointments || 0,
    currentDate: getCurrentDate(),
    openingHour: process.env.BUSINESS_OPENING_HOUR || '08:00',
    closingHour: process.env.BUSINESS_CLOSING_HOUR || '17:00',
  };

  // Call OpenAI
  const response = await openaiService.chat(updatedSession.messageHistory, context);

  let responseText = response.content || '';
  let shouldEnd = false;
  let shouldTransfer = false;
  let transferReason: string | undefined;

  // Handle function call if present
  if (response.functionCall) {
    const { name, arguments: args, id} = response.functionCall;
    logger.call(callSid, 'info', 'Function call', {name, args});

    // Execute the function
    const result = await executeFunctionCall(callSid, name, args);

    // Get natural response after function execution
    responseText = await openaiService.continueAfterFunctionCall(
      updatedSession.messageHistory,
      name,
      result,
      id,
      context
    );

    // Check for end/transfer flags
    shouldEnd = result.shouldEnd || false;
    shouldTransfer = result.shouldTransfer || false;
    transferReason = result.transferReason;
  }

  // Generate TTS audio
  let audio: Buffer | undefined;
  if (responseText) {
    try {
      audio = await ttsService.textToSpeech(responseText);
    } catch (error) {
      logger.call(callSid, 'error', 'TTS generation failed', error);
    }

    // Add response to history
    await redis.addMessage(callSid, {
      role: 'assistant',
      content: responseText,
      timestamp: new Date(),
    })

    // Update transcript
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

// Function execution

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

    case 'book_appointment':
      return handleBookAppointment(callSid, session, args);

    case 'reschedule_appointment':
      return handleRescheduleAppointment(args);

    case 'cancel_appointment':
      return handleCancelAppointment(args);

    case 'get_patient_appointments':
      return handleGetAppointments(session);

    case 'update_patient_name':
      return handleUpdateName(session, args);

    case 'answer_faq':
      return handleFaq(args);

    case 'transfer_to_staff':
      return handleTransfer(callSid, args);

    case 'end_call':
      return handleEndCall(callSid, session);

    default:
      logger.warn('Unknown function called', {name});
      return {success: false, error: `Unknown function: ${name}`}
  }
}

// Function handlers
async function handleCheckAvailability(
  args: Record<string, unknown>
): Promise<FunctionExecutionResult> {
  const date = String(args.date);
  const time = String(args.time);

  // Validate inputs
  const validation = validateAppointment(date, time);
  if (!validation.valid) {
    return {success: false, error: validation.error};
  }

  // Check availability
  const availability = await appointmentModel.checkAvailability(date, time)

  return {
    success: true,
    data: availability,
  }
}

async function handleBookAppointment(
  callSid: string,
  session: Session,
  args: Record<string, unknown>
): Promise<FunctionExecutionResult> {
  if (!session.patient) {
    return { success: false, error: 'Patient not found'};
  }

  const date = String(args.date);
  const time = String(args.time);
  const reasonForVisit = args.reason_for_visit ? String(args.reason_for_visit) : undefined;
  const specialInstructions = args.special_instructions ? String(args.special_instructions) : undefined;

  try {
    // Create the appointment
    const appointment = await appointmentModel.create({
      patientId: session.patient.id,
      date,
      time,
      reasonForVisit,
      specialInstructions,
      source: 'phone_ai',
    });

    // Update patient stats
    await patientModel.incrementAppointmentCount(session.patient.id);

    // Link appointment to call
    await callLogModel.linkAppointment(callSid, appointment.id)

    return {
      success: true,
      data: {
        appointmentId: appointment.id,
        confirmationCode: appointment.confirmation_code,
        date: appointment.appointment_date,
        time: appointment.appointment_time,
      },
    };

  } catch (error) {
    logger.error('Failed to book appointment', error);
    return { success: false, error: 'Failed to book appointment'};
  }
}

async function handleRescheduleAppointment(
  args: Record<string, unknown>
): Promise<FunctionExecutionResult> {
  const appointmentId = parseInt(String(args.appointment_id));

  const updates: Record<string, unknown> = {};
  if (args.new_date) updates.date = String(args.new_date);
  if (args.new_time) updates.time = String(args.new_time);
  if (args.special_instructions) updates.specialInstructions = String(args.special_instructions);

  try {
    const appointment = await appointmentModel.modify(appointmentId, updates);

    if (!appointment) {
      return {success: false, error: 'Appointment not found'};
    }

    return {
      success: true,
      data: {
        appointmentId: appointment.id,
        date: appointment.appointment_date,
        time: appointment.appointment_time,
      },
    };

  } catch (error) {
    logger.error('Failed to reschedule appointment', error);
    return { success: false, error: 'Failed to reschedule appointment'};
  }
}

async function handleCancelAppointment(
  args: Record<string, unknown>
): Promise<FunctionExecutionResult> {
  const appointmentId = parseInt(String(args.appointment_id));
  const reason = args.reason ? String(args.reason) : undefined;

  try {
    const appointment = await appointmentModel.cancel(appointmentId, reason);

    if (!appointment) {
      return { success: false, error: 'Appointment not found' };
    }

    return {
      success: true,
      data: { cancelled: true, appointmentId },
    };

  } catch (error) {
    logger.error('Failed to cancel appointment', error);
    return { success: false, error: 'Failed to cancel appointment' };
  }
}

async function handleGetAppointments(session: Session): Promise<FunctionExecutionResult> {
  if (!session.patient) {
    return { success: true, data: { appointments: [] } };
  }

  const appointments = await appointmentModel.findUpcomingByPatient(session.patient.id);

  return {
    success: true,
    data: {
      appointments: appointments.map(a => ({
        id: a.id,
        date: a.appointment_date,
        time: a.appointment_time,
        reasonForVisit: a.reason_for_visit,
        status: a.status,
        confirmationCode: a.confirmation_code,
      })),
    },
  };
}

async function handleUpdateName(
  session: Session,
  args: Record<string, unknown>
): Promise<FunctionExecutionResult> {
  if (!session.patient) {
    return { success: false, error: 'Patient not found'};

  }

  const name = String(args.name);

  await patientModel.updateName(session.patient.id, name);

  // Update session
  await redis.updateSession(session.callSid, {
    patient: { ...session.patient, full_name: name},
  });

  return {
    success: true,
    data: { name },
  };
}

async function handleFaq(
  args: Record<string, unknown>
): Promise<FunctionExecutionResult> {
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
  const notes = args.notes ? String(args.notes) : undefined;

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
  // Generate summary analysis
  const refreshedSession = await redis.getSession(callSid);
  const transcript = refreshedSession?.messageHistory
  .map(m => `[${m.role}]: ${m.content}`)
  .join('\n') || '';

  const [summary, intent, sentiment] = await Promise.all([
    openaiService.generateCallSummary(transcript),
    openaiService.detectIntent(transcript),
    openaiService.analyzeSentiment(transcript),
  ])

  // Complete the call log
  await callLogModel.completeCall(callSid, {
    status: 'completed',
    transcript,
    summary,
    intent,
    sentiment: sentiment.sentiment,
    sentimentScore: sentiment.score,
  })

 // Delete session
 await redis.deleteSession(callSid);

 return {
  success: true,
  data: { ending: true},
  shouldEnd: true
 }
}

// Call ended handler

// From Twilio status callback

export async function handleCallEnded(
  callSid: string,
  data: { status: string; duration: number}
): Promise<void> {
  logger.call(callSid, 'info', 'Call ended', data)

  // Update call log
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

  // Clean up session
  await redis.deleteSession(callSid)
}

// Utility
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
