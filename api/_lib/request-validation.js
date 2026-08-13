export const MAX_AUDIO_BASE64_CHARS = 4_000_000;
export const MAX_MESSAGE_CHARS = 4_000;
export const MAX_TRANSCRIPTION_CONTEXT_CHARS = 20_000;
export const MAX_HISTORY_ITEMS = 12;

const ALLOWED_AUDIO_TYPES = new Set([
  'audio/mp4',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
]);

function failure(error, status = 400) {
  return { ok: false, error, status };
}

export function validateTranscriptionPayload(payload) {
  const audioBase64 = payload?.audioBase64;
  const mimeType = payload?.mimeType;

  if (typeof audioBase64 !== 'string' || audioBase64.length === 0) {
    return failure('Audio data is required.');
  }
  if (audioBase64.length > MAX_AUDIO_BASE64_CHARS) {
    return failure('Audio exceeds the inline upload limit.', 413);
  }
  if (
    audioBase64.length % 4 !== 0
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(audioBase64)
  ) {
    return failure('Audio data must be valid base64.');
  }
  if (!ALLOWED_AUDIO_TYPES.has(mimeType)) {
    return failure('Unsupported audio type.');
  }

  return { ok: true, value: { audioBase64, mimeType } };
}

export function validateChatPayload(payload) {
  const message = typeof payload?.message === 'string' ? payload.message.trim() : '';
  if (!message) return failure('Message is required.');
  if (message.length > MAX_MESSAGE_CHARS) return failure('Message is too long.', 413);

  const transcription = typeof payload?.transcription === 'string'
    ? payload.transcription.trim()
    : '';
  if (transcription.length > MAX_TRANSCRIPTION_CONTEXT_CHARS) {
    return failure('Transcription context is too long.', 413);
  }

  const history = payload?.history ?? [];
  if (!Array.isArray(history) || history.length > MAX_HISTORY_ITEMS) {
    return failure('Chat history is invalid or too long.');
  }

  const normalizedHistory = [];
  for (const item of history) {
    const role = item?.role;
    const text = typeof item?.text === 'string' ? item.text.trim() : '';
    if (!['user', 'model'].includes(role) || !text || text.length > MAX_MESSAGE_CHARS) {
      return failure('Chat history contains an invalid message.');
    }
    normalizedHistory.push({ role, text });
  }

  return {
    ok: true,
    value: { message, history: normalizedHistory, transcription },
  };
}
