import { GoogleGenAI } from '@google/genai';

function client() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured.');
  return new GoogleGenAI({ apiKey });
}

export async function transcribeWithGemini({ audioBase64, mimeType }) {
  const response = await client().models.generateContent({
    model: process.env.GEMINI_TRANSCRIPTION_MODEL || 'gemini-3.6-flash',
    contents: [{
      parts: [
        {
          text: 'Transcribe this audio accurately in its original language. Distinguish speakers when possible. Return only the transcription text.',
        },
        { inlineData: { data: audioBase64, mimeType } },
      ],
    }],
    config: {
      systemInstruction: 'You are a professional verbatim transcriber. Do not summarize or add commentary.',
    },
  });

  const text = response.text?.trim();
  if (!text) throw new Error('Gemini returned an empty transcription.');
  return text;
}

export async function chatWithGemini({ message, history, transcription }) {
  const contents = history.map((item) => ({
    role: item.role,
    parts: [{ text: item.text }],
  }));
  const context = transcription
    ? `Current transcription context:\n${transcription}\n\nUser question:\n${message}`
    : message;
  contents.push({ role: 'user', parts: [{ text: context }] });

  const response = await client().models.generateContent({
    model: process.env.GEMINI_CHAT_MODEL || 'gemini-3.1-pro-preview',
    contents,
    config: {
      systemInstruction: 'You help users analyze voice transcriptions. Be concise, accurate, and professional.',
    },
  });

  const text = response.text?.trim();
  if (!text) throw new Error('Gemini returned an empty chat response.');
  return text;
}
