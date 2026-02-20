import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk'
import logger from '../utils/logger';
import type { DeepgramCallbacks, DeepgramController, TranscriptionResult} from '../../index'



const deepgram = createClient(process.env.DEEPGRAM_API_KEY || '')

//live transcription
// streaming audio from phone calls

export function createLiveTranscription(callbacks: DeepgramCallbacks): DeepgramController {
    logger.info('Creating Deepgram live transcription session')

    //transcription connection
    const connection = deepgram.listen.live({
        //audio format setting
        encoding: 'mulaw',
        sample_rate: 8000,
        channels: 1,

        //model setting
        model: 'nova-2',
        language: 'en-US',

        //features
        smart_format: true,
        punctuate: true,
        interim_results: true, //get results while speaking
        utterance_end_ms: 1000, // detect end of speech after 1s silence
        vad_events: true, //voice activity
    })

    let isOpen = false;

    connection.on(LiveTranscriptionEvents.Open, () => {
        isOpen = true;
        logger.debug('Deepgram connection opened')
    })

    // transcription results
    connection.on(LiveTranscriptionEvents.Transcript, (data) => {
        const transcript = data.channel?.alternatives?.[0];

        if (!transcript) return
        
        const text = transcript.transcript;
        const confidence = transcript.confidence || 0
        const isFinal = data.is_final;

        if(!text.trim()) return;

        if (isFinal && callbacks.onTranscript) {
            //speech final result
            callbacks.onTranscript(text, confidence);
        } else if (!isFinal && callbacks.onInterim) {
            callbacks.onInterim(text);
        }
    })

    //handle utterance end 
    connection.on(LiveTranscriptionEvents.UtteranceEnd, () => {
        if (callbacks.onUtteranceEnd) {
            callbacks.onUtteranceEnd();
        }
    });

    //error handling
    connection.on(LiveTranscriptionEvents.Error, (error) => {
        logger.error('Deepgram error', error);
        if (callbacks.onError) {
            callbacks.onError(error instanceof Error ? error : new Error(String(error)));
        }
    })

    // handle connection close
    connection.on(LiveTranscriptionEvents.Close, () => {
        isOpen = false;
        logger.debug('Deepgram connection closed')
    })

    return {
        send: (audioData: Buffer): void => {
          if (isOpen) {
            connection.send(audioData);
          }
        },
        close: (): void => {
          if (isOpen) {
            connection.finish();
            isOpen = false;
          }
        },
        isOpen: (): boolean => isOpen,
      };
}

// file transcription

//transcribe a pre-recorded audio file for voicemail or call recordings

export async function transcribeFile(
    audioBuffer: Buffer,
    mimetype: string = 'audio/wav'
): Promise<TranscriptionResult> {
    const startTime = Date.now();

    try {
        const { result } = await deepgram.listen.prerecorded.transcribeFile(
            audioBuffer,
            {
                model: 'nova-2',
                smart_format: true,
                punctuate: true,
                detect_language: true,
                mimetype,
            }
        );

        const duration = Date.now() - startTime;
        logger.apiTiming('Deepgram', 'transcribeFile', duration, true)

        const channel = result?.results?.channels?.[0];
        const alternative = channel?.alternatives?.[0];

        return {
            transcript: alternative?.transcript || '',
            confidence: alternative?.confidence || 0,
            words: alternative?.words?.map(w => ({
                word: w.word,
                start: w.start,
                end: w.end,
                confidence: w.confidence,
            })) || [],
            duration: result?.metadata?.duration || 0
        };
    } catch (error) {
        const duration = Date.now() - startTime;
        logger.apiTiming('Deepgram', 'transcribeFile', duration, false);
        logger.error('Deepgram transcription error', error);
        throw error
    }
}

// transcribe audio from a url

export async function transcribeUrl(url: string): Promise<TranscriptionResult> {
    const startTime = Date.now();

    try {
        const {result} = await deepgram.listen.prerecorded.transcribeUrl(
            { url },
            {
             model: 'nova-2',
             smart_format: true,
             punctuate: true,
            }
        );

        const duration = Date.now() - startTime;
        logger.apiTiming('Deepgram', 'transcribeUrl', duration, true);

        const channel = result?.results?.channels?.[0]
        const alternative = channel?.alternatives?.[0]

        return {
            transcript: alternative?.transcript ||'',
            confidence: alternative?.confidence || 0,
            words: alternative?.words?.map(w => ({
                word: w.word,
                start: w.start,
                end: w.end,
                confidence: w.confidence,
            })) || [],
            duration: result?.metadata?.duration || 0,
        };
    } catch (error) {
        const duration = Date.now() - startTime;
        logger.apiTiming('Deepgram', 'transcribeUrl', duration, false);
        logger.error('Deepgram URL transcription error', error)
        throw error
    }
}

// utility function
// convert base64 audio to buffer, twilio sends audio as base64 encoded

export function base64ToBuffer(base64:string): Buffer {
    return Buffer.from(base64, 'base64')
}

// voice activity detection

export function containsSpeech(audioBuffer: Buffer, threshold: number = 0.01): boolean {
    // Calculate average amplitude
    let sum = 0;
    for (let i = 0; i < audioBuffer.length; i++) {
      sum += Math.abs(audioBuffer[i] - 128) / 128; // Normalize to 0-1
    }
    const avgAmplitude = sum / audioBuffer.length;
    
    return avgAmplitude > threshold;
  }


  export default {
    createLiveTranscription,
    transcribeFile,
    transcribeUrl,
    base64ToBuffer,
    containsSpeech,
  };