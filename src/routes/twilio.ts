/**
 * Two approaches supported:
 * 1. Simple: Using Twilio's Gather verb (higher latency)
 * 2. Advanced: Using media streams WebSocket (lowest latency)
 */
import { Router, Request, Response } from 'express'
import twilio from 'twilio'
import { WebSocket, WebSocketServer } from 'ws'
import conversationService from '../services/conversation'
import deepgramService from '../services/deepgram'
import logger from '../utils/logger'
import type {
    TwilioVoiceRequest,
    TwilioStatusRequest,
    TwilioMediaStreamMessage,
    DeepgramController
} from '../../types/index'
import type { Server } from 'http'
import { Hangup } from 'twilio/lib/twiml/VoiceResponse'

const router = Router()

//twilio client for outbound actions
const twilioClient = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
)

// VOICE WEBHOOK (MEDIA STREAMS)

//POST /twilio/voice, called when a call is recived, responds wuth twiml to connect to a media stream
router.post('/voice', async (req: Request, res: Response) => {
    const body = req.body as TwilioVoiceRequest;
    const callSid = body.CallSid;
    const from = body.From;
    const to = body.To

    logger.info('Incoming call', {callSid, from, to})

    try {
        await conversationService.initializeConversation(callSid, from, to)

        const twiml = new twilio.twiml.VoiceResponse();
        //start with a message while sets up
        twiml.says({ voice: 'Polly.Joanna'}, 'One moment please.')

        const connect = twiml.connect();
        const stream = connect.stream({
            url: `wss://${req.headers.host}/media-stream`,
        })

        stream.parameter({ name: 'callSid', value: callSid});
        stream.parameter({ name: 'from', value: from})

        res.type('text/xml');
        res.send(twiml.toString())
    } catch (error) {
        logger.error('Error handling voice webhook', error);

        //return error
        const twiml = new twilio.twiml.VoiceResponse();
        twiml.say('We apologize, but we are experiencing technical difficulties. please try again later')
        twiml.hangup();

        res.type('text/xml')
        res.send(twiml.toString())
    }
})

//voice webhook
//post /twilio/voice-simple
//higher latancy
router.post('/voice-simple', async (req: Request, res: Response) => {
    const body = req.body as TwilioVoiceRequest;
    const callSid = body.CallSid;
    const from = body.From;
    const to = body.To;
    const speechResult = body.SpeechResult;
    
    logger.info('Voice simple webhook', {callSid, speechResult: speechResult?.substring(0, 50)});

    try {
        const twiml = new twilio.twiml.VoiceResponse()

        if (!speechResult) {
            await conversationService.initializeConversation(callSid, from, to);
            const greeting = await conversationService.generateGreeting(callSid);

            //greeting and gather response
            const gather = twiml.gather({
                input: ['speech'],
                speechTimeout: 'auto',
                action: '/twilio/voice-simple',
                method: 'POST',
            })
            gather.say({ voice: 'Polly.Joanna'}, greeting.text);

            //if no input prompt again
            twiml.redirect('/twilio/voice-simple');
        } else {
            //process users speech
            const response = await conversationService.processInput(callSid, speechResult)

            if (response.shouldTransfer) {
                const transferNumber = process.env.TRANSFER_NUMBER;
                if (transferNumber) {
                    twiml.say({voice: 'Polly.Joanna'}, 'transferring you now');
                    twiml.dial(transferNumber);
                } else {
                    twiml.say({ voice: 'Polly.Joanna'}, 'I apologize, but no one is available to take your call right now')
                }
            } else if (response.shouldEnd) {
                twiml.say({ voice: 'Polly.Joanna'}, response.text);
                twiml.hangup()
            } else {
                //cuntinue conversation
                const gather = twiml.gather({
                    input: ['speech'],
                    speechTimeout: 'auto',
                    action: '/twilio/voice-simple',
                    method: 'POST',
                })
                gather.say({ voice: 'Polly.Joanna'}, response.text)

                twiml.redirect('/twilio/voice-simple')
            }
        }

        res.type('text/xml');
        res.send(twiml.toString())
    } catch (error) {
        logger.error('Error in voice-simple',  error);

        const twiml = new twilio.twiml.VoiceResponse()
        twiml.say('Sorry, something went wrong please try again');
        twiml.hangup();

        res.type('text/xml');
        res.send(twiml.toString())
    }
})

//STATUS CALBACKK

//POST /twilio/status / called when call status changes (ringing, in-progress, completed)
router.post('/status', async (req:Request, res: Response) => {
    const body = req.body as TwilioStatusRequest;
    const callSid = body.CallSid;
    const status = body.CallStatus;
    const duration = parseInt(body.CallDuration || '0')

    logger.info('Call status update', {callSid, status, duration})

    try {
        if ( status === 'completed' || status === 'failed' || status === 'no-answer' || status ==='busy') {
            await conversationService.handleCallEnded(callSid, {status, duration});
        }
        
        res.sendStatus(200)
    } catch (error) {
        logger.error('Error handling status callback', error);
        res.sendStatus(500)
    }
})

//MEDIA STREAM WEBSOCKET

//websocket setup for twilio media stream

export function setupMediaStreamWebSocket(server: Server): void {
    const wss = new WebSocketServer({ noServer: true });
    
    // Handle upgrade requests
    server.on('upgrade', (request, socket, head) => {
      const pathname = request.url;
      
      if (pathname === '/media-stream') {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request);
        });
      } else {
        socket.destroy();
      }
    });
    
    // Handle connections
    wss.on('connection', (ws: WebSocket) => {
      let callSid: string | null = null;
      let streamSid: string | null = null;
      let deepgramController: DeepgramController | null = null;
      let audioBuffer: Buffer[] = [];
      let isProcessing = false;
      
      logger.info('Media stream WebSocket connected');
      
      ws.on('message', async (message: Buffer) => {
        try {
          const data = JSON.parse(message.toString()) as TwilioMediaStreamMessage;
          
          switch (data.event) {
            case 'connected':
              logger.debug('Media stream connected');
              break;
              
            case 'start':
              // Extract call metadata
              callSid = data.start?.customParameters?.callSid || data.start?.callSid || null;
              streamSid = data.start?.streamSid || null;
              
              logger.info('Media stream started', { callSid, streamSid });
              
              // Initialize Deepgram for transcription
              deepgramController = deepgramService.createLiveTranscription({
                onTranscript: async (text: string, confidence: number) => {
                  if (!callSid || isProcessing) return;
                  
                  logger.call(callSid, 'info', 'Transcript', { text, confidence });
                  
                  isProcessing = true;
                  try {
                    // Process the user's input
                    const response = await conversationService.processInput(callSid, text);
                    
                    // Send audio response back through Twilio
                    if (response.audio && streamSid) {
                      await sendAudioResponse(ws, streamSid, response.audio);
                    }
                    
                    // Handle call control
                    if (response.shouldEnd && callSid) {
                      await hangupCall(callSid);
                    } else if (response.shouldTransfer && callSid) {
                      await transferCall(callSid);
                    }
                    
                  } catch (error) {
                    logger.error('Error processing transcript', error);
                  } finally {
                    isProcessing = false;
                  }
                },
                onInterim: (text: string) => {
                  logger.debug('Interim transcript', { text });
                },
                onError: (error: Error) => {
                  logger.error('Deepgram error', error);
                },
              });
              
              // Generate and send greeting
              if (callSid) {
                try {
                  const greeting = await conversationService.generateGreeting(callSid);
                  if (greeting.audio && streamSid) {
                    await sendAudioResponse(ws, streamSid, greeting.audio);
                  }
                } catch (error) {
                  logger.error('Error generating greeting', error);
                }
              }
              break;
              
            case 'media':
              // Forward audio to Deepgram
              if (data.media?.payload && deepgramController) {
                const audioData = Buffer.from(data.media.payload, 'base64');
                deepgramController.send(audioData);
              }
              break;
              
            case 'stop':
              logger.info('Media stream stopped', { callSid });
              break;
          }
          
        } catch (error) {
          logger.error('Error processing media message', error);
        }
      });
      
      ws.on('close', () => {
        logger.info('Media stream WebSocket closed', { callSid });
        
        // Clean up
        if (deepgramController) {
          deepgramController.close();
        }
      });
      
      ws.on('error', (error) => {
        logger.error('WebSocket error', error);
      });
    });
    
    logger.info('Media stream WebSocket server initialized');
  }

  // send audio back through the media stream
async function sendAudioResponse(
  ws: WebSocket,
  streamSid: string,
  audioBuffer: Buffer
): Promise<void> {
  const audioBase64 = audioBuffer.toString('base64');
  const message = {
    event:'media',
    streamSid,
    media: {
      payload: audioBase64,
    },
  }

  ws.send(JSON.stringify(message))
}

//hang up a call
async function hangupCall(callSid: string): Promise<void> {
  try {
    await twilioClient.calls(callSid).update({ status: 'completed'});
    logger.info('Call hung up', {callSid});
  } catch (error) {
    logger.error('Failed to hang up call', error)
  }
}

//transfer a call to a human
async function transferCall(callSid: string): Promise<void> {
  const transferNumber = process.env.TRANSFER_NUMBER;

  if (!transferNumber) {
    logger.warn('No transfer number configured');
    return;
  }
  
try {
  const twiml = new twilio.twiml.VoiceResponse();
  twiml.say({ voice: 'Polly.Joanna'}, 'Transfering you now. please hold');
  twiml.dial(transferNumber);

  await twilioClient.calls(callSid).update({
    twiml: twiml.toString(),
  })

  logger.info('Call transferred', { callSid, to: transferNumber });
} catch (error) {
  logger.error('Failed to transfer call', error)
}
}

export async function updateCall(callSid: string, twimlString: string): Promise<void> {
  await twilioClient.calls(callSid).update({ twiml: twimlString });
}

export default router;
