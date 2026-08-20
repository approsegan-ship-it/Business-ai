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
// server.ts
import express, { Request, Response } from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;
app.use(express.json());

// Initialisation sécurisée du client Gemini
let aiClient: GoogleGenAI | null = null;
function getGenAI(): GoogleGenAI | null {
  if (!aiClient && process.env.GEMINI_API_KEY) {
    aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });
  }
  return aiClient;
}

// Modèles avec ordre de priorité pour garantir 100% de disponibilité
const TEXT_MODELS = [
  "gemini-3.7-flash",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash",
];

// Générateur intelligent de secours local (si aucune clé API n'est configurée)
function generateSmartFallback(prompt: string, systemInstruction?: string): string {
  const p = (prompt || "").toLowerCase();
  const inst = (systemInstruction || "").toLowerCase();

  if (p.includes("whatsapp") || inst.includes("whatsapp")) {
    return `Bonjour et bienvenue chez nous ! 😊\n\nNous avons bien reçu votre demande concernant nos produits. Que vous souhaitiez des informations sur nos disponibilités, nos tarifs ou les modalités de livraison, notre équipe est à votre entière disposition !\n\n👉 *Comment pouvons-nous vous aider aujourd'hui ?*`;
  }

  if (p.includes("post") || p.includes("réseau") || p.includes("facebook") || p.includes("instagram")) {
    return `✨ NOUVELLE ARRIVÉE & OFFRE SPÉCIALE ! ✨\n\nDécouvrez notre sélection exclusive conçue pour allier qualité, confort et élégance au meilleur prix.\n\n🔥 Profitez dès aujourd'hui de nos disponibilités limitées.\n\n📍 Commandez directement par message privé ou WhatsApp pour une expédition rapide !\n\n#Boutique #Qualité #Style #Promotion #BonPlan`;
  }

  return `Bonjour ! Notre assistant IA a préparé cette recommandation commerciale pour vous :\n\n✅ **Produit & Qualité certifiée**\n✅ **Service client réactif et livraison soignée**\n\nN'hésitez pas à nous contacter directement sur WhatsApp pour finaliser votre commande !`;
}

// Fonction de génération avec gestion des erreurs et bascule de modèles
async function generateWithFallback(
  ai: GoogleGenAI,
  prompt: string,
  systemInstruction?: string,
  temperature = 0.7
): Promise<{ text: string; modelUsed: string }> {
  for (const model of TEXT_MODELS) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction: systemInstruction || "Tu es un assistant commercial expert pour PME.",
          temperature,
        },
      });

      if (response?.text) {
        return { text: response.text, modelUsed: model };
      }
    } catch (err) {
      console.warn(`Modèle ${model} indisponible, passage au modèle suivant...`);
    }
  }
  throw new Error("Génération impossible sur tous les modèles.");
}

// ROUTE 1 : Génération de texte (Posts, Fiches produits, Offres)
app.post("/api/gemini/generate", async (req: Request, res: Response) => {
  try {
    const { prompt, systemInstruction, temperature } = req.body;
    const ai = getGenAI();

    if (!ai) {
      return res.json({ text: generateSmartFallback(prompt, systemInstruction), isFallback: true });
    }

    const { text, modelUsed } = await generateWithFallback(ai, prompt, systemInstruction, temperature);
    return res.json({ text, isFallback: false, model: modelUsed });
  } catch (error) {
    return res.json({
      text: generateSmartFallback(req.body?.prompt, req.body?.systemInstruction),
      isFallback: true,
    });
  }
});

// ROUTE 2 : Chat multi-tours avec l'assistant
app.post("/api/gemini/chat", async (req: Request, res: Response) => {
  try {
    const { messages, systemInstruction } = req.body;
    const ai = getGenAI();
    const lastMessage = messages?.[messages.length - 1]?.text || "";

    if (!ai) {
      return res.json({ text: generateSmartFallback(lastMessage, systemInstruction), isFallback: true });
    }

    const formattedContents = messages.map((m: any) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.text }],
    }));

    const response = await ai.models.generateContent({
      model: "gemini-3.7-flash",
      contents: formattedContents,
      config: { systemInstruction, temperature: 0.7 },
    });

    return res.json({ text: response.text, isFallback: false });
  } catch (error) {
    const lastMsg = req.body?.messages?.slice(-1)[0]?.text || "";
    return res.json({ text: generateSmartFallback(lastMsg, req.body?.systemInstruction), isFallback: true });
  }
});

// Démarrage du serveur
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Serveur IA actif sur le port ${PORT}`);
});server.ts
