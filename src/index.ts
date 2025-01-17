#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ErrorCode,
} from "@modelcontextprotocol/sdk/types.js";
import * as say from 'say';
import * as recorder from 'node-record-lpcm16';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';

const execAsync = promisify(exec);

// Type definitions for tool arguments
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

const server = new Server(
  {
    name: "Lucidia-Voice-Gateway",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const voices = await getWindowsVoices();
  
  return {
    tools: [
      {
        name: "text_to_speech",
        description: "Convert text to speech using Windows SAPI",
        inputSchema: {
          type: "object",
          properties: {
            text: {
              type: "string",
              description: "The text to convert to speech"
            },
            voice: {
              type: "string",
              description: "The voice to use",
              enum: voices,
              default: voices[0]
            },
            speed: {
              type: "number",
              description: "Speech speed (0.5 to 2.0)",
              minimum: 0.5,
              maximum: 2.0,
              default: 1.0
            }
          },
          required: ["text"]
        }
      },
      {
        name: "speech_to_text",
        description: "Convert speech to text using Windows Speech Recognition",
        inputSchema: {
          type: "object",
          properties: {
            duration: {
              type: "number",
              description: "Duration to record in seconds (1-60)",
              minimum: 1,
              maximum: 60,
              default: 5
            }
          }
        }
      }
    ]
  };
});

// Type guard functions
function isTextToSpeechArgs(args: unknown): args is TextToSpeechArgs {
  const a = args as TextToSpeechArgs;
  return typeof a?.text === 'string';
}

function isSpeechToTextArgs(args: unknown): args is SpeechToTextArgs {
  const a = args as SpeechToTextArgs;
  return a === undefined || typeof a?.duration === 'number';
}

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    switch (request.params.name) {
      case "text_to_speech": {
        if (!isTextToSpeechArgs(request.params.arguments)) {
          throw new McpError(ErrorCode.InvalidParams, "Invalid text-to-speech arguments");
        }

        const { text, voice, speed = 1.0 } = request.params.arguments;

        return new Promise<{ content: Array<{ type: string; text: string }> }>((resolve, reject) => {
          say.speak(text, voice, speed, (err) => {
            if (err) {
              reject(new McpError(ErrorCode.InternalError, String(err)));
            } else {
              resolve({
                content: [{
                  type: "text",
                  text: `Successfully spoke: "${text}"`
                }]
              });
            }
          });
        });
      }

      case "speech_to_text": {
        if (!isSpeechToTextArgs(request.params.arguments)) {
          throw new McpError(ErrorCode.InvalidParams, "Invalid speech-to-text arguments");
        }

        const { duration = 5 } = request.params.arguments;
        const wavFile = path.join(process.cwd(), 'recording.wav');

        // Start recording
        const recording = recorder.record({
          sampleRate: 16000,
          channels: 1,
          audioType: 'wav'
        });

        // Create write stream
        const fileStream = fs.createWriteStream(wavFile);
        recording.stream().pipe(fileStream);

        // Wait for recording duration and file to be written
        await new Promise<void>((resolve) => {
          setTimeout(() => {
            recording.stop();
            fileStream.end();
            fileStream.on('finish', resolve);
          }, duration * 1000);
        });

        try {
          // Use Windows Speech Recognition via PowerShell
          const script = `
            Add-Type -AssemblyName System.Speech;
            $recognizer = New-Object System.Speech.Recognition.SpeechRecognizer;
            $grammar = New-Object System.Speech.Recognition.DictationGrammar;
            $recognizer.LoadGrammar($grammar);
            $audio = [System.IO.File]::ReadAllBytes('${wavFile.replace(/\\/g, '\\\\')}');
            $stream = New-Object System.IO.MemoryStream(@(,$audio));
            $result = $recognizer.RecognizeSync([System.Speech.AudioFormat.AudioStream]::new($stream));
            $result.Text;
          `;

          const { stdout } = await execAsync(`powershell -Command "${script}"`);
          
          // Clean up recording file
          fs.unlinkSync(wavFile);

          return {
            content: [{
              type: "text",
              text: stdout.trim() || "No speech detected"
            }]
          };
        } catch (error) {
          // Clean up recording file
          if (fs.existsSync(wavFile)) {
            fs.unlinkSync(wavFile);
          }
          
          throw new McpError(ErrorCode.InternalError, `Speech recognition failed: ${String(error)}`);
        }
      }

      default:
        throw new McpError(ErrorCode.MethodNotFound, "Unknown tool");
    }
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(
      ErrorCode.InternalError,
      String(error)
    );
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Windows Speech MCP server running on stdio");
}

main().catch((error: unknown) => {
  console.error("Server error:", String(error));
  process.exit(1);
});
