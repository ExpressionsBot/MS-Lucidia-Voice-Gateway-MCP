# MS-Lucidia-Voice-Gateway-MCP

A Model Context Protocol (MCP) server that provides text-to-speech and speech-to-text capabilities using Windows' built-in speech services. This server leverages the native Windows Speech API (SAPI) through PowerShell commands, eliminating the need for external APIs or services.

## Features

- Text-to-Speech (TTS) using Windows SAPI voices
- Speech-to-Text (STT) using Windows Speech Recognition
- Simple web interface for testing
- No external API dependencies
- Uses native Windows capabilities

## Prerequisites

- Windows 10/11
- Node.js 16+
- PowerShell
- Windows Speech Recognition enabled

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

3. Build the MCP server:
```bash
npm run build
```

## Usage

### As an MCP Server

1. Add the server configuration to your Cline MCP settings:

```json
{
  "mcpServers": {
    "windows-speech": {
      "command": "node",
      "args": ["build/index.js"],
      "cwd": "/path/to/MS-Lucidia-Voice-Gateway-MCP",
      "disabled": false,
      "alwaysAllow": []
    }
  }
}
```

2. Enable MCP Servers in Cline's settings

3. Use the available tools:

```typescript
// Text to Speech
<use_mcp_tool>
<server_name>windows-speech</server_name>
<tool_name>text_to_speech</tool_name>
<arguments>
{
  "text": "Hello, this is a test",
  "voice": "Microsoft David Desktop",
  "speed": 1.0
}
</arguments>
</use_mcp_tool>

// Speech to Text
<use_mcp_tool>
<server_name>windows-speech</server_name>
<tool_name>speech_to_text</tool_name>
<arguments>
{
  "duration": 5
}
</arguments>
</use_mcp_tool>
```

### Testing Interface

1. Start the test server:
```bash
npm run test
```

2. Open `http://localhost:3000` in your browser
3. Use the web interface to test TTS and STT capabilities

## Available Tools

### text_to_speech
Converts text to speech using Windows SAPI.

Parameters:
- `text` (required): The text to convert to speech
- `voice` (optional): The voice to use (e.g., "Microsoft David Desktop")
- `speed` (optional): Speech rate from 0.5 to 2.0 (default: 1.0)

### speech_to_text
Records audio and converts it to text using Windows Speech Recognition.

Parameters:
- `duration` (optional): Recording duration in seconds (default: 5, max: 60)

## Troubleshooting

1. Make sure Windows Speech Recognition is enabled and properly configured
2. Check that you have at least one SAPI voice installed
3. Ensure PowerShell execution policy allows running commands
4. Verify your microphone is working for STT functionality

## License

MIT

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request
