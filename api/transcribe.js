import { transcribeWithGemini } from './_lib/gemini.js';
import { requestBody, requireAccessToken, requirePost, sendJson } from './_lib/http.js';
import { validateTranscriptionPayload } from './_lib/request-validation.js';

export default async function handler(request, response) {
  if (!requirePost(request, response) || !requireAccessToken(request, response)) return;

  const validation = validateTranscriptionPayload(requestBody(request));
  if (!validation.ok) {
    sendJson(response, validation.status, { error: validation.error });
    return;
  }

  try {
    const transcription = await transcribeWithGemini(validation.value);
    sendJson(response, 200, { transcription });
  } catch (error) {
    console.error('Transcription request failed.', error);
    sendJson(response, 502, { error: 'Transcription service failed.' });
  }
}
