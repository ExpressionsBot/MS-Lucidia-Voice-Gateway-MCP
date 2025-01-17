#!/usr/bin/env node

import express, { Request, Response } from 'express';
import cors from 'cors';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';
import * as net from 'net';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const execAsync = promisify(exec);

// Configuration
const DEFAULT_VOICE = 'Microsoft Jenny(Natural) - English (United States)';
const DEFAULT_TIMEOUT = parseInt(process.env.TIMEOUT || '30000', 10);
const DEFAULT_PORT = 3000;

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Type definitions for request arguments
interface TextToSpeechArgs {
  text: string;
  voice?: string;
  speed?: number;
}

interface SpeechToTextArgs {
  duration?: number;
}

interface ChatArgs {
  message: string;
  voice?: string;
  speed?: number;
}

// Helper function to find an available port
async function findAvailablePort(startPort: number): Promise<number> {
  const isPortAvailable = (port: number): Promise<boolean> => {
    return new Promise((resolve) => {
      const server = net.createServer()
        .once('error', () => resolve(false))
        .once('listening', () => {
          server.close();
          resolve(true);
        })
        .listen(port);
    });
  };

  for (let port = startPort; port < startPort + 100; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error('No available ports found');
}

// Helper function to get available Windows voices
async function getWindowsVoices(): Promise<string[]> {
  try {
    const { stdout } = await execAsync('powershell -Command "Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).GetInstalledVoices().VoiceInfo.Name"', {
      timeout: DEFAULT_TIMEOUT
    });
    return stdout.split('\n').map(v => v.trim()).filter(Boolean);
  } catch (error) {
    console.error('Error getting voices:', error);
    return [DEFAULT_VOICE];
  }
}

// Helper function to speak text using Windows TTS
async function speakText(text: string, voice: string = DEFAULT_VOICE, speed: number = 1.0): Promise<void> {
  const script = `
    Add-Type -AssemblyName System.Speech;
    $synthesizer = New-Object System.Speech.Synthesis.SpeechSynthesizer;
    $synthesizer.SelectVoice('${voice}');
    $synthesizer.Rate = ${Math.round((speed - 1) * 10)};
    $synthesizer.Speak('${text.replace(/'/g, "''")}');
  `;

  await execAsync(`powershell -Command "${script}"`, { timeout: DEFAULT_TIMEOUT });
}

// Helper function to get GPT-4 response
async function getChatResponse(message: string): Promise<string> {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { 
          role: "system", 
          content: "You are a helpful assistant. Keep your responses concise and natural, as they will be spoken aloud."
        },
        { 
          role: "user", 
          content: message 
        }
      ],
      temperature: 0.7,
      max_tokens: 150
    });

    return completion.choices[0]?.message?.content || "I'm sorry, I couldn't generate a response.";
  } catch (error) {
    console.error('Error getting GPT-4 response:', error);
    throw error;
  }
}

// Initialize Express app
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static('test'));

// Add timeout middleware
app.use((req: Request, res: Response, next) => {
  res.setTimeout(DEFAULT_TIMEOUT, () => {
    res.status(408).json({ error: 'Request timeout' });
  });
  next();
});

// Get available voices
app.get('/voices', async (_req: Request, res: Response) => {
  try {
    const voices = await getWindowsVoices();
    res.json(voices);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// Text to Speech
app.post('/tts', async (req: Request<{}, {}, TextToSpeechArgs>, res: Response) => {
  try {
    const { text, voice = DEFAULT_VOICE, speed = 1.0 } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    await speakText(text, voice, speed);
    res.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message.includes('timeout')) {
      res.status(408).json({ error: 'Operation timed out' });
    } else {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  }
});

// Speech to Text
app.post('/stt', async (req: Request<{}, {}, SpeechToTextArgs>, res: Response) => {
  try {
    const { duration = 5 } = req.body;
    const audioFile = path.join(__dirname, 'recording.wav');

    // Record audio using PowerShell
    const recordScript = `
      Add-Type -AssemblyName System.Windows.Forms;
      $audio = New-Object System.IO.MemoryStream;
      $waveSource = New-Object NAudio.Wave.WaveInEvent;
      $waveSource.WaveFormat = New-Object NAudio.Wave.WaveFormat(16000, 1);
      $waveFile = New-Object NAudio.Wave.WaveFileWriter('${audioFile}', $waveSource.WaveFormat);
      $waveSource.DataAvailable = {
        param($sender, $e)
        $waveFile.Write($e.Buffer, 0, $e.BytesRecorded)
      };
      $waveSource.StartRecording();
      Start-Sleep -Seconds ${duration};
      $waveSource.StopRecording();
      $waveFile.Dispose();
    `;

    await execAsync(recordScript, { timeout: DEFAULT_TIMEOUT + (duration * 1000) });

    // Transcribe the recorded audio
    const transcribeScript = `
      Add-Type -AssemblyName System.Speech;
      $recognizer = New-Object System.Speech.Recognition.SpeechRecognizer;
      $grammar = New-Object System.Speech.Recognition.DictationGrammar;
      $recognizer.LoadGrammar($grammar);
      $audio = [System.IO.File]::ReadAllBytes('${audioFile}');
      $stream = New-Object System.IO.MemoryStream(@(,$audio));
      $result = $recognizer.RecognizeSync([System.Speech.AudioFormat.AudioStream]::new($stream));
      $result.Text;
    `;

    const { stdout } = await execAsync(`powershell -Command "${transcribeScript}"`, { timeout: DEFAULT_TIMEOUT });

    // Clean up the audio file
    await fs.promises.unlink(audioFile);

    res.json({ text: stdout.trim() || 'No speech detected' });
  } catch (error) {
    // Clean up the audio file if it exists
    const audioFile = path.join(__dirname, 'recording.wav');
    if (fs.existsSync(audioFile)) {
      await fs.promises.unlink(audioFile);
    }
    
    if (error instanceof Error && error.message.includes('timeout')) {
      res.status(408).json({ error: 'Operation timed out' });
    } else {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  }
});

// Chat endpoint that gets GPT-4 response and speaks it
app.post('/chat', async (req: Request<{}, {}, ChatArgs>, res: Response) => {
  try {
    const { message, voice = DEFAULT_VOICE, speed = 1.0 } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Get GPT-4 response
    const response = await getChatResponse(message);
    
    // Speak the response
    await speakText(response, voice, speed);

    res.json({ 
      success: true,
      response,
      spoken: true
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('timeout')) {
      res.status(408).json({ error: 'Operation timed out' });
    } else {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  }
});

// Start the server
async function startServer() {
  try {
    const port = await findAvailablePort(DEFAULT_PORT);
    app.listen(port, () => {
      console.log(`Windows Speech Server running at http://localhost:${port}`);
      console.log(`Using default voice: ${DEFAULT_VOICE}`);
      console.log(`Timeout set to: ${DEFAULT_TIMEOUT}ms`);
      console.log('GPT-4 integration enabled');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
