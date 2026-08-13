import { createHash, timingSafeEqual } from 'node:crypto';

export function sendJson(response, status, body) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.status(status).json(body);
}

export function requirePost(request, response) {
  if (request.method === 'POST') return true;
  response.setHeader('Allow', 'POST');
  sendJson(response, 405, { error: 'Method not allowed.' });
  return false;
}

export function requireAccessToken(request, response) {
  const expected = process.env.VOICE_APP_ACCESS_TOKEN;
  if (!expected) {
    sendJson(response, 503, { error: 'AI access is not configured.' });
    return false;
  }

  const provided = request.headers['x-voice-access-token'];
  if (typeof provided !== 'string') {
    sendJson(response, 401, { error: 'AI access token is required.' });
    return false;
  }

  const expectedDigest = createHash('sha256').update(expected).digest();
  const providedDigest = createHash('sha256').update(provided).digest();
  const valid = timingSafeEqual(expectedDigest, providedDigest);
  if (!valid) {
    sendJson(response, 403, { error: 'AI access token is invalid.' });
    return false;
  }
  return true;
}

export function requestBody(request) {
  if (typeof request.body === 'string') {
    try {
      return JSON.parse(request.body);
    } catch {
      return null;
    }
  }
  return request.body;
}
