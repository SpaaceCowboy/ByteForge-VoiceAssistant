//text to speech OpenAi and eleven labs

import OpenAI from 'openai'
import { cleanTextForSpeech } from '../utils/helpers'
import logger from '../utils/logger';
import type { TTSProvider, OpenAIVoice, OpenAITTSModel} from '../../index';

// configuration 

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const TTS_PROVIDER: TTSProvider = (process.env.TTS_PROVIDER as TTSProvider) || 'openai'
const OPENAI_VOICE: OpenAIVoice = (process.env.OPENAI_TTS_VOICE as OpenAIVoice) || 'nova';
const OPENAI_MODEL: OpenAITTSModel = (process.env.OPENAI_TTS_MODEL as OpenAITTSModel) || 'tts-1'
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM'

// openai tts

//generate speech using openai tts api

export async function openaiTTS(text: string): Promise<Buffer> {
    const startTime = Date.now();
    const cleanedText = cleanTextForSpeech(text);

    try {
        const mp3Response = await openai.audio.speech.create({
            model: OPENAI_MODEL,
            voice: OPENAI_VOICE,
            input: cleanedText,
            response_format: 'mp3'
        });

        const arrayBuffer = await mp3Response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const duration = Date.now() - startTime;
        logger.apiTiming('OpenAI', 'TTS', duration, true);

        return buffer;
    } catch (error) {
        const duration = Date.now() - startTime;
        logger.apiTiming('OpenAI', 'TTS', duration, false);
        logger.error('OpenAI TTS error', error);
        throw error;
    }
}

// stream speech generation from OpenAI (for low latency)

export async function openaiTTSStream(text: string): Promise<NodeJS.ReadableStream> {
    const cleanedText = cleanTextForSpeech(text);

    const response = await openai.audio.speech.create({
        model: OPENAI_MODEL,
        voice: OPENAI_VOICE,
        input: cleanedText,
        response_format: 'mp3'
    });

    return response.body as unknown as NodeJS.ReadableStream;
}

// Elevenlabs tts

export async function elevenLabsTTS(text: string): Promise<Buffer> {
    if (!ELEVENLABS_API_KEY) {
        throw new Error('Elevenlabs API key not configured')
    }

    const startTime = Date.now();
    const cleanedText = cleanTextForSpeech(text)

    try {
        const response  = await fetch(
            `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
            {
                method: 'POST',
                headers: {
                    'Accept': 'audio/mpeg',
                    'Content-Type': 'application/json',
                    'xi-api-key': ELEVENLABS_API_KEY,
                },
                body: JSON.stringify({
                    text: cleanedText,
                    model_id: 'eleven_turbo_v2', //fastest model
                    voice_settings: {
                        stability: 0.5,
                        similarity_boost: 0.75,
                    },
                }),
            }
        )
        if (!response.ok) {
            throw new Error(`ElevenLabs API error: ${response.status}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const duration = Date.now() - startTime;
        logger.apiTiming('ElevenLabs', 'TTS', duration, true);

        return buffer;
    } catch (error) {
        const duration = Date.now() - startTime;
        logger.apiTiming('ElevenLabs', 'TTS', duration, false);
        logger.error('ElevenLabs TTS error', error);
        throw error;
    }
}

//stream speech generation from Elevenlab
export async function elevenLabsTTSStream(text: string): Promise<NodeJS.ReadableStream> {
    if (!ELEVENLABS_API_KEY) {
        throw new Error('ElevenLabs API key not configured');
    }

    const cleanedText = cleanTextForSpeech(text);

    const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}/stream`,
        {
            method: 'POST',
            headers: {
                'Accept': 'audio/mpeg',
                'Content-type': 'application/json',
                'xi-api-key': ELEVENLABS_API_KEY,
            },
            body: JSON.stringify({
                text: cleanedText,
                model_id: 'eleven_turbo_v2',
                voice_settings: {
                    stability: 0.5,
                    similarity_boost: 0.75
                }
            })
        }
    )

    if (!response.ok) {
        throw new Error(`ElevenLabs stream error: ${response.status}`);
    }

    return response.body as unknown as NodeJS.ReadableStream
}

// unified interface

// generate speech using the configured provider

export async function textToSpeech(text: string): Promise<Buffer> {
    if (TTS_PROVIDER === 'elevenlabs') {
        return elevenLabsTTS(text);
    }
    return openaiTTS(text)
}

//stream generated speech

export async function textToSpeechStream(text: string): Promise<NodeJS.ReadableStream> {
    if (TTS_PROVIDER === 'elevenlabs') {
        return elevenLabsTTSStream(text);
    }
    return openaiTTSStream(text)
}

// utility
//split text into chunks for faster initial playback and return as array

export function splitTextForStreaming(text: string, maxLength: number = 100): string[] {
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text]
    const chunks: string[] = [];
    let currentChunk = '';

    for ( const sentence of sentences) {
        if ((currentChunk + sentence).length <= maxLength) {
            currentChunk += sentence;
        } else {
            if (currentChunk) {
                chunks.push(currentChunk.trim());
            }
            currentChunk = sentence
        }
    }

    if (currentChunk) {
        chunks.push(currentChunk.trim())
    }

    return chunks
}

// get available voices for a provider

export function getAvailableVoices(provider: TTSProvider): string[] {
    if (provider === 'openai') {
        return ['alloy', 'echo', 'fable','onyx', 'nova', 'shimmer']
    }
    
    return [];
}

// convert audio to Twilio-compatible format
//this is a place holder change in production

export async function convertToMulaw(audioBuffer: Buffer): Promise<Buffer> {
    // In production, use ffmpeg or a similar library:
    // ffmpeg -i input.mp3 -ar 8000 -ac 1 -codec:a pcm_mulaw -f mulaw output.raw
    
    logger.warn('convertToMulaw: Not implemented - returning original buffer');
    return audioBuffer;
  }

  export default {
    textToSpeech,
    textToSpeechStream,
    openaiTTS,
    openaiTTSStream,
    elevenLabsTTS,
    elevenLabsTTSStream,
    splitTextForStreaming,
    getAvailableVoices,
    convertToMulaw,
  };