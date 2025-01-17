const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const { createServer } = require('net');

const execAsync = promisify(exec);
const app = express();

// Helper function to find an available port
async function findAvailablePort(startPort) {
  const isPortAvailable = (port) => {
    return new Promise((resolve) => {
      const server = createServer()
        .listen(port, () => {
          server.once('close', () => resolve(true));
          server.close();
        })
        .on('error', () => resolve(false));
    });
  };

  let port = startPort;
  while (!(await isPortAvailable(port))) {
    port++;
  }
  return port;
}

app.use(cors());
app.use(express.json());
app.use(express.static('test'));

// Helper function to execute PowerShell commands
async function runPowerShell(script) {
    try {
        const { stdout } = await execAsync(`powershell -Command "${script}"`);
        return stdout.trim();
    } catch (error) {
        throw new Error(`PowerShell execution failed: ${error.message}`);
    }
}

// Get available voices
app.get('/voices', async (req, res) => {
    try {
        const script = `
            Add-Type -AssemblyName System.Speech;
            (New-Object System.Speech.Synthesis.SpeechSynthesizer).GetInstalledVoices().VoiceInfo.Name
        `;
        const output = await runPowerShell(script);
        const voices = output.split('\n').map(v => v.trim()).filter(Boolean);
        res.json(voices);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Text to Speech
app.post('/tts', async (req, res) => {
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

        await runPowerShell(script);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Speech to Text
app.post('/stt', async (req, res) => {
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

        await runPowerShell(recordScript);

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

        const transcription = await runPowerShell(transcribeScript);

        // Clean up the audio file
        await fs.unlink(audioFile);

        res.json({ text: transcription || 'No speech detected' });
    } catch (error) {
        res.status(500).json({ error: error.message });
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