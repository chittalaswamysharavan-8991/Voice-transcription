import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), 'utf8');
}

async function loadValidationModule() {
  try {
    return await import('../api/_lib/request-validation.js');
  } catch {
    return null;
  }
}

function responseDouble() {
  return {
    body: null,
    headers: {},
    statusCode: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(body) {
      this.body = body;
    },
  };
}

test('browser bundle has no Gemini SDK or server API key injection', async () => {
  const [app, vite] = await Promise.all([
    source('src/App.tsx'),
    source('vite.config.ts'),
  ]);

  assert.doesNotMatch(app, /@google\/genai|GoogleGenAI|GEMINI_API_KEY/);
  assert.doesNotMatch(vite, /GEMINI_API_KEY|loadEnv|define\s*:/);
  assert.match(app, /requestTranscription/);
  assert.match(app, /requestChat/);
});

test('production dependency security floors stay enforced', async () => {
  const packageJson = JSON.parse(await source('package.json'));

  assert.match(packageJson.dependencies['@google/genai'], /^\^?2\./);
  assert.equal(packageJson.overrides.protobufjs, '7.6.5');
  assert.equal(packageJson.overrides.ws, '8.21.3');
  assert.match(packageJson.scripts.check, /npm run audit:prod/);
});

test('AI endpoints exist behind a server-only access-token boundary', async () => {
  const [transcribe, chat, gemini] = await Promise.all([
    source('api/transcribe.js'),
    source('api/chat.js'),
    source('api/_lib/gemini.js'),
  ]);

  assert.match(transcribe, /requireAccessToken/);
  assert.match(chat, /requireAccessToken/);
  assert.match(gemini, /process\.env\.GEMINI_API_KEY/);
  assert.doesNotMatch(gemini, /VITE_|PUBLIC_/);
});

test('server access token is enforced and private responses are not cached', async () => {
  const { requireAccessToken, sendJson } = await import('../api/_lib/http.js');
  const previous = process.env.VOICE_APP_ACCESS_TOKEN;

  try {
    process.env.VOICE_APP_ACCESS_TOKEN = 'test-only-access-token';

    const missing = responseDouble();
    assert.equal(requireAccessToken({ headers: {} }, missing), false);
    assert.equal(missing.statusCode, 401);

    const invalid = responseDouble();
    assert.equal(requireAccessToken({
      headers: { 'x-voice-access-token': 'wrong-token' },
    }, invalid), false);
    assert.equal(invalid.statusCode, 403);

    const valid = responseDouble();
    assert.equal(requireAccessToken({
      headers: { 'x-voice-access-token': 'test-only-access-token' },
    }, valid), true);

    const privateResponse = responseDouble();
    sendJson(privateResponse, 200, { message: 'private' });
    assert.equal(privateResponse.headers['Cache-Control'], 'no-store');
    assert.equal(privateResponse.headers['X-Content-Type-Options'], 'nosniff');
  } finally {
    if (previous === undefined) delete process.env.VOICE_APP_ACCESS_TOKEN;
    else process.env.VOICE_APP_ACCESS_TOKEN = previous;
  }
});

test('server handlers execute method, authorization, and payload gates under Node', async () => {
  const [{ default: transcribe }, { default: chat }] = await Promise.all([
    import('../api/transcribe.js'),
    import('../api/chat.js'),
  ]);
  const previous = process.env.VOICE_APP_ACCESS_TOKEN;

  try {
    process.env.VOICE_APP_ACCESS_TOKEN = 'handler-test-token';

    const methodRejected = responseDouble();
    await transcribe({ method: 'GET', headers: {} }, methodRejected);
    assert.equal(methodRejected.statusCode, 405);
    assert.equal(methodRejected.headers.Allow, 'POST');

    const unauthorized = responseDouble();
    await chat({ method: 'POST', headers: {}, body: {} }, unauthorized);
    assert.equal(unauthorized.statusCode, 401);

    const invalidPayload = responseDouble();
    await transcribe({
      method: 'POST',
      headers: { 'x-voice-access-token': 'handler-test-token' },
      body: {},
    }, invalidPayload);
    assert.equal(invalidPayload.statusCode, 400);
    assert.match(invalidPayload.body.error, /audio data is required/i);
  } finally {
    if (previous === undefined) delete process.env.VOICE_APP_ACCESS_TOKEN;
    else process.env.VOICE_APP_ACCESS_TOKEN = previous;
  }
});

test('transcription payload validation rejects unsafe audio input', async () => {
  const validation = await loadValidationModule();
  assert.ok(validation, 'request validation module must exist');

  assert.deepEqual(
    validation.validateTranscriptionPayload({ audioBase64: 'YWJj', mimeType: 'audio/webm' }),
    { ok: true, value: { audioBase64: 'YWJj', mimeType: 'audio/webm' } },
  );
  assert.equal(validation.validateTranscriptionPayload({}).ok, false);
  assert.equal(
    validation.validateTranscriptionPayload({ audioBase64: 'A', mimeType: 'audio/webm' }).ok,
    false,
  );
  assert.equal(
    validation.validateTranscriptionPayload({ audioBase64: 'YWJj', mimeType: 'text/plain' }).ok,
    false,
  );
  assert.equal(
    validation.validateTranscriptionPayload({
      audioBase64: 'a'.repeat(4_000_001),
      mimeType: 'audio/webm',
    }).ok,
    false,
  );
});

test('chat payload validation limits untrusted prompt size and history', async () => {
  const validation = await loadValidationModule();
  assert.ok(validation, 'request validation module must exist');

  assert.equal(validation.validateChatPayload({ message: 'Summarize this' }).ok, true);
  assert.equal(validation.validateChatPayload({ message: '' }).ok, false);
  assert.equal(validation.validateChatPayload({ message: 'a'.repeat(4_001) }).ok, false);
  assert.equal(
    validation.validateChatPayload({
      message: 'hello',
      history: Array.from({ length: 13 }, () => ({ role: 'user', text: 'x' })),
    }).ok,
    false,
  );
});
