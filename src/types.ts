export interface Recording {
  id: string;
  blob: Blob;
  url: string;
  duration: number;
  timestamp: Date;
  transcription?: string;
  isTranscribing?: boolean;
}

export interface Message {
  role: 'user' | 'model';
  text: string;
}
