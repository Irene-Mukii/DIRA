// Provider-neutral interface for a future real-time transcription service.
export interface TranscriptionResult {
  text: string;
  isFinal: boolean;
  confidence?: number;
  timestamp?: number;
}

export interface TranscriptionService {
  start(): Promise<void>;
  stop(): void;
  onResult(callback: (result: TranscriptionResult) => void): void;
  onError(callback: (error: Error) => void): void;
}

export class TranscriptionAdapter {
  private service: TranscriptionService | null = null;
  
  constructor(service: TranscriptionService) {
    this.service = service;
  }
  
  async transcribeRealtime(audioStream: MediaStream): Promise<void> {
    if (!this.service) throw new Error("No transcription service configured");
    await this.service.start();
  }
  
  stop(): void {
    this.service?.stop();
  }
}
