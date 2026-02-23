//manages the flow of , function execution, and cordinates between all other serviices.

import { patientModel, callLogModel, faqModel, appointmentModel } from '../models';
import openaiService from './openai';
import ttsService from './tts';
import redis from '../config/redis';
import db from '../config/database'
import { getCurrentDate, formatTimeForDisplay, validateAppointment,  } from '../utils/helpers';
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
  Doctor,
  Department,
  Location,
  GreetingResponse,
  FunctionExecutionResult,
} from '../../types/index';




//initialization

//initialize a new conversation session when a call starts
export async function initializeConversation(
    callSid: string,
    fromNumber: string,
    toNumber: string
): Promise<Session> {
    logger.call(callSid, 'info', 'Initializing conversation', {from: fromNumber});

    //find or create the customer
    const patient = await patientModel.findOrCreate(fromNumber);

    //get reservation
    const upcomingAppointments = await appointmentModel.findUpcomingByPatient(patient.id);

    //call log entery
    await callLogModel.create(callSid, fromNumber, toNumber, patient.id)

    //initialize session state
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

    // store in redis
    await redis.setSession(callSid, session);

    logger.call(callSid, 'info', 'Session initialized', {
      customerId: patient.id,
      hasName: !!patient.full_name,
      upcomingReservations: upcomingAppointments.length,
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

  const businessName = process.env.BUSINESS_NAME || 'the NeuroSpine institute';
  const patient = session.patient;
  const appointments = session.upcomingAppointments;

  let greeting: string;

  if (patient?.full_name && appointments.length > 0) {
    // Returning customer with upcoming reservation
    const nextRes = appointments[0];
    greeting = `Hello ${patient.full_name}! 
    Thank you for calling ${businessName}. 
    I see you have a appointment coming up on 
    ${formatDateForSpeech(nextRes.appointment_date)} at
     ${formatTimeForDisplay(nextRes.appointment_time)}. 
    How can I help you today?`;
  } else if (patient?.full_name) {
    // Returning customer without reservation
    greeting = `Hello ${patient.full_name}! 
    Thank you for calling ${businessName}. How can I help you today?`;
  } else {
    // New customer
    greeting = `Thank you for calling ${businessName}
    ! I'm your AI assistant and I 
    can help you schedile an appointment or answer questions about our services, or connect you with our staff.
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
  const context = await buildToolContext(session);

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

//build toolcontext with clinic locations and departments from db
async function buildToolContext(session: Session): Promise<ToolContext> {
  let locations: string[] = [];
  let departments: string[] = [];

  try {
    const locResult = await db.query<Location>(
      'SELECT name FROM locations WHERE is_active = true ORDER BY id'
    );
    locations = locResult.rows.map((l) => l.name);
  } catch {
    locations = [
      'NeuroSpine Institute - Palmdale',
      'NeuroSpine Institute - Sherman Oaks',
      'NeuroSpine Institute - Valencia',
      'NeuroSpine Institute - Thousand Oaks',
    ];
  }

  try {
    const depResult = await db.query<Department>(
      'SELECT name FROM departments WHERE is_active = true ORDER BY id'
    );
    departments = depResult.rows.map((d) => d.name);
  } catch {
    departments = [
      'Neurosurgery',
      'Neurology',
      'Pain Management',
      'Physical Medicine & Rehabilitation',
      'Chiropractic Care',
      'Urgent Care',
    ];
  }

  return {
    businessName: process.env.BUSINESS_NAME || 'NeuroSpine Institute',
    patientPhone: session.patient?.phone || 'unknown',
    patientName: session.patient?.full_name || null,
    appointmentCount: session.patient?.total_appointments || 0,
    currentDate: getCurrentDate(),
    openingHour: process.env.BUSINESS_OPENING_HOUR || '08:00',
    closingHour: process.env.BUSINESS_CLOSING_HOUR || '17:00',
    locations,
    departments,
  };
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

    case 'book_appointment':
      return handleBookAppointment(callSid, session, args);

    case 'reschedule_appointment':
      return handleRescheduleAppointment(args);

    case 'cancel_appointment':
      return handleCancelAppointment(args);

    case 'get_patient_appointments':
      return handleGetAppointments(session);

    case 'update_patient_info':
      return handleUpdatePatientInfo(session, args);

    case 'get_department_info':
      return handleGetDepartmentInfo(args);

    case 'answer_faq':
      return handleFaq(args);

    case 'transfer_to_staff':
      return handleTransfer(callSid, args);

    case 'end_call':
      return handleEndCall(callSid, session);

    default:
      logger.warn('Unknown function called', { name });
      return { success: false, error: `Unknown function: ${name}` };
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
  const validation = validateAppointment(date, time);
  if (!validation.valid) {
    return {success: false, error: validation.error};
  }

let doctorId: number | undefined;
if (args.doctor_name) {
  const doctor = await findDoctorByName(String(args.doctor_name));
  if (doctor) doctorId = doctor.id
}

let locationId: number | undefined;
if (args.location) {
  const location = await findLocationByName(String(args.location));
  if (location) locationId = location.id
}

  //check availability
  const availability = await appointmentModel.checkAvailability(date, time, doctorId, locationId)

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
    return { success: false, error: 'patient not found'};
  }

  const date = String(args.date);
  const time = String(args.time);

  let doctorId: number | undefined;
  let doctorName: string | undefined;
  if (args.doctor_name) {
    const doctor = await findDoctorByName(String(args.doctor_name));
    if (doctor) {
      doctorId = doctor.id;
      doctorName = doctor.full_name
    }
  }

  //resolve department
  let departmentId: number | undefined;
  let departmentName: string | undefined;
  if (args.department) {
    const dept = await findDepartmentByName(String(args.department));
    if (dept) {
      departmentId = dept.id;
      departmentName = dept.name
    }
  }

  //resolve location
  let locationId: number | undefined;
  let locationName: string | undefined;
  if (args.location) {
    const location = await findLocationByName(String(args.location));
    if (location) {
      locationId = location.id;
      locationName = location.name;
    }
  }

  try {
    const appointment = await appointmentModel.create({
      patientId: session.patient.id,
      doctorId,
      departmentId,
      locationId,
      date,
      time,
      appointmentType: (args.appointment_type as string) || 'consultation',
      reasonForVisit: args.reason_for_visit ? String(args.reason_for_visit) : undefined,
      specialInstructions: args.special_instructions
        ? String(args.special_instructions)
        : undefined,
      isNewPatient: args.is_new_patient === 'true',
      source: 'phone_ai',
    });

    // Update patient stats
    await patientModel.incrementAppointmentCount(session.patient.id);

    // Link appointment to call
    await callLogModel.linkAppointment(callSid, appointment.id);

    return {
      success: true,
      data: {
        appointmentId: appointment.id,
        confirmationCode: appointment.confirmation_code,
        date: appointment.appointment_date,
        time: appointment.appointment_time,
        doctorName: doctorName || 'To be assigned',
        departmentName: departmentName || undefined,
        locationName: locationName || undefined,
        appointmentType: appointment.appointment_type,
      },
    };
  } catch (error) {
    logger.error('Failed to book appointment', error);
    return { success: false, error: 'Failed to book appointment' };
  }
}

async function handleRescheduleAppointment(
  args: Record<string, unknown>
): Promise<FunctionExecutionResult> {
  const appointmentId = parseInt(String(args.appointment_id));

  // Try to find by confirmation code if not a number
  let appt: Appointment | null = null;
  if (isNaN(appointmentId)) {
    appt = await appointmentModel.findByConfirmationCode(String(args.appointment_id));
  } else {
    appt = await appointmentModel.findById(appointmentId);
  }

  if (!appt) {
    return { success: false, error: 'Appointment not found' };
  }

  const updates: Record<string, unknown> = {};
  if (args.new_date) updates.date = String(args.new_date);
  if (args.new_time) updates.time = String(args.new_time);

  if (args.new_doctor_name) {
    const doctor = await findDoctorByName(String(args.new_doctor_name));
    if (doctor) updates.doctorId = doctor.id;
  }

  if (args.new_location) {
    const location = await findLocationByName(String(args.new_location));
    if (location) updates.locationId = location.id;
  }

  try {
    const updated = await appointmentModel.modify(appt.id, updates);

    if (!updated) {
      return { success: false, error: 'Appointment not found' };
    }

    return {
      success: true,
      data: {
        appointmentId: updated.id,
        confirmationCode: updated.confirmation_code,
        date: updated.appointment_date,
        time: updated.appointment_time,
      },
    };
  } catch (error) {
    logger.error('Failed to reschedule appointment', error);
    return { success: false, error: 'Failed to reschedule appointment' };
  }
}

async function handleCancelAppointment(
  args: Record<string, unknown>
): Promise<FunctionExecutionResult> {
  const appointmentId = parseInt(String(args.appointment_id));
  const reason = args.reason ? String(args.reason) : undefined;

  // Try confirmation code if not a number
  let appt: Appointment | null = null;
  if (isNaN(appointmentId)) {
    appt = await appointmentModel.findByConfirmationCode(String(args.appointment_id));
  } else {
    appt = await appointmentModel.findById(appointmentId);
  }

  if (!appt) {
    return { success: false, error: 'Appointment not found' };
  }

  try {
    const cancelled = await appointmentModel.cancel(appt.id, reason);

    if (!cancelled) {
      return { success: false, error: 'Appointment not found' };
    }

    return {
      success: true,
      data: { cancelled: true, appointmentId: appt.id },
    };
  } catch (error) {
    logger.error('Failed to cancel appointment', error);
    return { success: false, error: 'Failed to cancel appointment' };
  }
}

async function handleGetAppointments(
  session: Session
): Promise<FunctionExecutionResult> {
  if (!session.patient) {
    return { success: true, data: { appointments: [] } };
  }

  const appointments = await appointmentModel.findUpcomingByPatient(session.patient.id);

  return {
    success: true,
    data: {
      appointments: appointments.map((a) => ({
        id: a.id,
        date: a.appointment_date,
        time: a.appointment_time,
        doctorName: a.doctor_name || 'To be assigned',
        departmentName: a.department_name,
        locationName: a.location_name,
        appointmentType: a.appointment_type,
        status: a.status,
        confirmationCode: a.confirmation_code,
      })),
    },
  };
}

async function handleUpdatePatientInfo(
  session: Session,
  args: Record<string, unknown>
): Promise<FunctionExecutionResult> {
  if (!session.patient) {
    return { success: false, error: 'Patient not found' };
  }

  const updateData: Record<string, unknown> = {};

  if (args.name) {
    updateData.full_name = String(args.name);
  }
  if (args.insurance_provider) {
    updateData.insurance_provider = String(args.insurance_provider);
  }
  if (args.insurance_id) {
    updateData.insurance_id = String(args.insurance_id);
  }
  if (args.email) {
    updateData.email = String(args.email);
  }

  await patientModel.update(session.patient.id, updateData);

  // Update session with new patient data
  const updatedPatient = { ...session.patient, ...updateData };
  await redis.updateSession(session.callSid, {
    patient: updatedPatient as Patient,
  });

  return {
    success: true,
    data: { updated: Object.keys(updateData) },
  };
}
async function handleGetDepartmentInfo(
  args: Record<string, unknown>
): Promise<FunctionExecutionResult> {
  const deptQuery = String(args.department).toLowerCase().trim();

  try {
    // Find department by name or slug
    const deptResult = await db.query<Department>(
      `SELECT * FROM departments
       WHERE is_active = true
         AND (LOWER(name) LIKE $1 OR slug LIKE $1)
       LIMIT 1`,
      [`%${deptQuery}%`]
    );

    if (deptResult.rows.length === 0) {
      return {
        success: true,
        data: {
          found: false,
          message: 'Department not found. Available departments: Neurosurgery, Neurology, Pain Management, Physical Medicine & Rehabilitation, Chiropractic Care, Urgent Care.',
        },
      };
    }

    const dept = deptResult.rows[0];

    // Get doctors in this department
    const doctorsResult = await db.query<Doctor>(
      `SELECT * FROM doctors
       WHERE department_id = $1 AND is_active = true
       ORDER BY full_name`,
      [dept.id]
    );

    return {
      success: true,
      data: {
        found: true,
        department: dept.name,
        description: dept.description,
        doctors: doctorsResult.rows.map((d) => ({
          name: `${d.full_name}${d.title ? ', ' + d.title : ''}`,
          specialty: d.specialty,
          acceptingNewPatients: d.is_accepting_new_patients,
        })),
      },
    };
  } catch (error) {
    logger.error('Failed to get department info', error);
    return { success: false, error: 'Failed to look up department information' };
  }
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
  // generate summarty analysis
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
  logger.call(callSid, 'info', 'call ended', data)

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

async function findDoctorByName(name: string): Promise<Doctor | null> {
  const result = await db.query<Doctor>(
    `SELECT * FROM doctors
     WHERE is_active = true
       AND LOWER(full_name) LIKE $1
     LIMIT 1`,
    [`%${name.toLowerCase()}%`]
  );
  return result.rows[0] || null;
}

async function findDepartmentByName(name: string): Promise<Department | null> {
  const result = await db.query<Department>(
    `SELECT * FROM departments
     WHERE is_active = true
       AND (LOWER(name) LIKE $1 OR slug LIKE $1)
     LIMIT 1`,
    [`%${name.toLowerCase()}%`]
  );
  return result.rows[0] || null;
}

async function findLocationByName(name: string): Promise<Location | null> {
  const result = await db.query<Location>(
    `SELECT * FROM locations
     WHERE is_active = true
       AND LOWER(name) LIKE $1
     LIMIT 1`,
    [`%${name.toLowerCase()}%`]
  );
  return result.rows[0] || null;
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


