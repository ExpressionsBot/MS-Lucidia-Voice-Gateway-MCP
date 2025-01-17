#!/usr/bin/env node

import express, { Request, Response } from 'express';
import cors from 'cors';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';
import * as net from 'net';

const execAsync = promisify(exec);

// Type definitions for request arguments
interface TextToSpeechArgs {
  text: string;
  voice?: string;
  speed?: number;
}

interface SpeechToTextArgs {
  duration?: number; // Duration to record in seconds
}

// Helper function to get available Windows voices
async function getWindowsVoices(): Promise<string[]> {
  try {
    const { stdout } = await execAsync('powershell -Command "Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).GetInstalledVoices().VoiceInfo.Name"');
    return stdout.split('\n').map(v => v.trim()).filter(Boolean);
  } catch (error) {
    console.error('Error getting voices:', error);
    return ['Microsoft David Desktop', 'Microsoft Zira Desktop']; // Default fallback voices
  }
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

// Initialize Express app
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static('test'));

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
    const { text, voice = 'Microsoft David Desktop', speed = 1.0 } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    const script = `
      Add-Type -AssemblyName System.Speech;
      $synthesizer = New-Object System.Speech.Synthesis.SpeechSynthesizer;
      $synthesizer.SelectVoice('${voice}');
      $synthesizer.Rate = ${Math.round((speed - 1) * 10)};
      $synthesizer.Speak('${text.replace(/'/g, "''")}');
    `;

    await execAsync(`powershell -Command "${script}"`);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
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

    await execAsync(recordScript);

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

    const { stdout } = await execAsync(`powershell -Command "${transcribeScript}"`);

    // Clean up the audio file
    await fs.promises.unlink(audioFile);

    res.json({ text: stdout.trim() || 'No speech detected' });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// Start the server
async function startServer() {
  try {
    const port = await findAvailablePort(3000);
    app.listen(port, () => {
      console.log(`Windows Speech Server running at http://localhost:${port}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
