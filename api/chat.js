import { chatWithGemini } from './_lib/gemini.js';
import { requestBody, requireAccessToken, requirePost, sendJson } from './_lib/http.js';
import { validateChatPayload } from './_lib/request-validation.js';

export default async function handler(request, response) {
  if (!requirePost(request, response) || !requireAccessToken(request, response)) return;

  const validation = validateChatPayload(requestBody(request));
  if (!validation.ok) {
    sendJson(response, validation.status, { error: validation.error });
    return;
  }

  try {
    const message = await chatWithGemini(validation.value);
    sendJson(response, 200, { message });
  } catch (error) {
    console.error('Chat request failed.', error);
    sendJson(response, 502, { error: 'Chat service failed.' });
  }
}
