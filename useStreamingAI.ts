import { useState } from 'react';

export function useStreamingAI() {
  const [output, setOutput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const generateStream = async (prompt: string, systemInstruction?: string) => {
    setOutput('');
    setIsGenerating(true);

    try {
      const response = await fetch('/api/gemini/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, systemInstruction }),
      });

      if (!response.body) throw new Error('Flux indisponible');

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let done = false;

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;

        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const dataStr = line.replace('data: ', '').trim();
              if (dataStr === '[DONE]') break;

              try {
                const parsed = JSON.parse(dataStr);
                if (parsed.text) {
                  setOutput((prev) => prev + parsed.text);
                }
              } catch (e) {
                // Ligne partielle en cours de lecture
              }
            }
          }
        }
      }
    } catch (err) {
      console.error('Erreur lecture flux:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  return { output, isGenerating, generateStream };
    }
