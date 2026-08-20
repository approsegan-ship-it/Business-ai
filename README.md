// server-streaming.js
import express from 'express';
import { GoogleGenAI } from '@google/genai';

const app = express();
app.use(express.json());

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Route de streaming en direct
app.post('/api/gemini/stream', async (req, res) => {
  const { prompt, systemInstruction } = req.body;

  // En-têtes obligatoires pour le streaming SSE (Server-Sent Events)
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    // Appel de Gemini en mode streaming
    const stream = await ai.models.generateContentStream({
      model: 'gemini-3.7-flash',
      contents: prompt,
      config: {
        systemInstruction: systemInstruction || "Tu es un assistant commercial expert.",
        temperature: 0.7,
      },
    });

    // Envoi de chaque mot/fragment en direct au navigateur
    for await (const chunk of stream) {
      if (chunk.text) {
        res.write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`);
      }
    }

    // Signal de fin de transmission
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    console.error('Erreur Streaming Cloud :', error);
    res.write(`data: ${JSON.stringify({ error: 'Erreur lors de la génération' })}\n\n`);
    res.end();
  }
});

app.listen(3000, () => {
  console.log('Serveur Cloud Streaming actif sur http://localhost:3000');
});
