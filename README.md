# MS-Lucidia-Voice-Gateway-MCP

A Model Context Protocol (MCP) server that provides text-to-speech and speech-to-text capabilities using Windows' built-in speech services. This server leverages the native Windows Speech API (SAPI) through PowerShell commands, eliminating the need for external APIs or services.

## Features

- Text-to-Speech (TTS) using Windows SAPI voices
- Speech-to-Text (STT) using Windows Speech Recognition
- Simple web interface for testing
- No external API dependencies
- Uses native Windows capabilities

## Prerequisites

- Windows 10/11 with Speech Recognition enabled
- Node.js 16+
- PowerShell

## Installation

1. Clone the repository:
```bash
git clone https://github.com/ExpressionsBot/MS-Lucidia-Voice-Gateway-MCP.git
cd MS-Lucidia-Voice-Gateway-MCP
```

2. Install dependencies:
```bash
npm install
```

3. Build the project:
```bash
npm run build
```

## Usage

### Testing Interface

1. Start the test server:
```bash
npm run test
```

2. Open `http://localhost:3000` in your browser
3. Use the web interface to test TTS and STT capabilities

### Available Tools

#### text_to_speech
Converts text to speech using Windows SAPI.

Parameters:
- `text` (required): The text to convert to speech
- `voice` (optional): The voice to use (e.g., "Microsoft David Desktop")
- `speed` (optional): Speech rate from 0.5 to 2.0 (default: 1.0)

Example:
```javascript
fetch('http://localhost:3000/tts', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    text: "Hello, this is a test",
    voice: "Microsoft David Desktop",
    speed: 1.0
  })
});
```

#### speech_to_text
Records audio and converts it to text using Windows Speech Recognition.

Parameters:
- `duration` (optional): Recording duration in seconds (default: 5, max: 60)

Example:
```javascript
fetch('http://localhost:3000/stt', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    duration: 5
  })
}).then(response => response.json())
  .then(data => console.log(data.text));
```

## Troubleshooting

1. Make sure Windows Speech Recognition is enabled:
   - Open Windows Settings
   - Go to Time & Language > Speech
   - Enable Speech Recognition

2. Check available voices:
   - Open PowerShell and run:
   ```powershell
   Add-Type -AssemblyName System.Speech
   (New-Object System.Speech.Synthesis.SpeechSynthesizer).GetInstalledVoices().VoiceInfo.Name
   ```

3. Test speech recognition:
   - Open Speech Recognition in Windows Settings
   - Run through the setup wizard if not already done
   - Test that Windows can recognize your voice

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request

## License

MIT
