// Thin wrapper calling Whissle MCP
// Provides real-time and batch transcription capabilities

export interface STTOptions {
  language?: string;
  enableRealtime?: boolean;
  confidenceThreshold?: number;
}

export class STTClient {
  private provider: string = "whissle";

  async transcribeRealtime(audioStream: MediaStream, onPartial: (text: string) => void): Promise<string> {
    // Architecture supports real-time transcription via MCP to Whissle
    // Implementation will stream audio and emit partial results
    return Promise.resolve("");
  }

  async transcribe(audioBlob: Blob): Promise<string> {
    // Batch transcription
    return Promise.resolve("");
  }
}
