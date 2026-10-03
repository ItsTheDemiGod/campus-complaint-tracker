const { GoogleGenAI } = require('@google/genai');

// Official current SDK (@google/genai); the older @google/generative-ai is legacy.
// Throws on require if the key is empty, so only require it from code that needs it.
if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set');
module.exports = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
