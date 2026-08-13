import type { Message } from '../types';

const ACCESS_TOKEN_KEY = 'voice-pro-ai-access-token';
const MAX_AUDIO_BYTES = 3_000_000;

function getAccessToken(): string {
  const existing = window.sessionStorage.getItem(ACCESS_TOKEN_KEY);
  if (existing) return existing;

  const provided = window.prompt('Enter your private Voice Pro AI access token:')?.trim();
  if (!provided) throw new Error('AI access token is required.');
  window.sessionStorage.setItem(ACCESS_TOKEN_KEY, provided);
  return provided;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-voice-access-token': getAccessToken(),
    },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      window.sessionStorage.removeItem(ACCESS_TOKEN_KEY);
    }
    throw new Error(result.error || `Request failed (${response.status}).`);
  }
  return result as T;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Audio could not be read.'));
    reader.onload = () => {
      const encoded = String(reader.result).split(',')[1];
      encoded ? resolve(encoded) : reject(new Error('Audio could not be encoded.'));
    };
    reader.readAsDataURL(blob);
  });
}

export async function requestTranscription(blob: Blob): Promise<string> {
  if (!blob.size) throw new Error('The recording is empty.');
  if (blob.size > MAX_AUDIO_BYTES) {
    throw new Error('Recording is too large for inline transcription (3 MB maximum).');
  }
  const audioBase64 = await blobToBase64(blob);
  const result = await post<{ transcription: string }>('/api/transcribe', {
    audioBase64,
    mimeType: blob.type.split(';')[0] || 'audio/webm',
  });
  return result.transcription;
}

export async function requestChat(input: {
  message: string;
  history: Message[];
  transcription?: string;
}): Promise<string> {
  const result = await post<{ message: string }>('/api/chat', input);
  return result.message;
}

export function clearAiAccessToken(): void {
  window.sessionStorage.removeItem(ACCESS_TOKEN_KEY);
}
