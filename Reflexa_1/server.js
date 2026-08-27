import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Top-level request body parsing middleware (1mb cap for security)
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Static asset serving from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Cache for Gemini API key from Secret Manager
let cachedSecretApiKey = null;

async function getGeminiApiKey() {
  if (cachedSecretApiKey) return cachedSecretApiKey;

  // 1. Attempt fetching dynamically from Google Cloud Secret Manager API
  try {
    const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT || process.env.FIREBASE_PROJECT_ID;
    if (projectId) {
      const client = new SecretManagerServiceClient();
      const name = `projects/${projectId}/secrets/GEMINI_API_KEY/versions/latest`;
      const [version] = await client.accessSecretVersion({ name });
      const secretValue = version?.payload?.data?.toString('utf8');
      if (secretValue && secretValue.trim()) {
        cachedSecretApiKey = secretValue.trim();
        console.log('[SecretManager] Successfully retrieved GEMINI_API_KEY from Google Cloud Secret Manager API.');
        return cachedSecretApiKey;
      }
    }
  } catch (err) {
    // SecretManager SDK lookup may fall back to container environment secret binding
  }

  // 2. Fallback to Cloud Run Secret Manager environment injection (--set-secrets GEMINI_API_KEY=GEMINI_API_KEY:latest)
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY') {
    cachedSecretApiKey = process.env.GEMINI_API_KEY;
    return cachedSecretApiKey;
  }

  return process.env.GEMINI_API_KEY || '';
}

// Resilient Gemini Model Fallback Ladder
const MODEL_LADDER = [
  'gemini-3.6-flash',
  'gemini-3.1-flash-lite',
  'gemini-flash-latest',
  'gemini-3.7-flash'
];

async function generateContentWithFallback(contentsInput) {
  const apiKey = await getGeminiApiKey();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }

  const ai = new GoogleGenAI({ apiKey });
  const systemInstruction = `You are Reflexa, an empathetic AI emotional intelligence assistant engaging in a continuous multi-turn journal conversation with the user.
Analyze the user's latest entry within the context of the entire conversation history provided.
You MUST reply ONLY with valid JSON containing these exact five keys:
- "replyText": A warm, thoughtful, empathetic conversational response addressing the user's latest message in the context of your ongoing chat.
- "summary": A concise (1-2 sentence) reflection summarizing the key takeaway or core emotional theme of this exchange.
- "moodScore": An integer from 1 to 10 (1 = extremely negative/distressed, 5 = neutral, 10 = extremely joyful/peaceful) evaluating the user's current emotional state.
- "primaryEmotion": A single descriptive emotion word (e.g., "Joy", "Anxiety", "Nostalgia", "Serenity", "Frustration", "Gratitude", "Hope", "Overwhelmed", "Contentment").
- "suggestedFollowUps": An array of exactly 3 short, actionable, conversational follow-up prompts for the user to explore next (e.g., ["Explore this feeling further", "What action step can I take?", "How can I reframe this?"]).

Do NOT include markdown formatting or backticks outside the raw JSON output.`;

  let formattedContents = [];
  if (typeof contentsInput === 'string') {
    formattedContents = [{ role: 'user', parts: [{ text: contentsInput }] }];
  } else if (Array.isArray(contentsInput)) {
    formattedContents = contentsInput.map(item => {
      let text = '';
      if (Array.isArray(item.parts) && item.parts.length > 0) {
        text = item.parts[0].text || '';
      } else if (typeof item.text === 'string') {
        text = item.text;
      } else if (typeof item.content === 'string') {
        text = item.content;
      }
      return {
        role: (item.role === 'model' || item.role === 'assistant') ? 'model' : 'user',
        parts: [{ text: String(text) }]
      };
    });
  }

  if (formattedContents.length === 0) {
    throw new Error('No valid content or conversation turns provided for Gemini.');
  }

  let lastError = null;

  for (const modelName of MODEL_LADDER) {
    try {
      console.log(`[Gemini API] Attempting generation with model: ${modelName} (${formattedContents.length} turns)`);
      const response = await ai.models.generateContent({
        model: modelName,
        contents: formattedContents,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          temperature: 0.7,
        }
      });

      const responseText = response.text || '';
      console.log(`[Gemini API] Model ${modelName} responded successfully.`);
      
      // Parse JSON payload safely
      let cleanedText = responseText.trim();
      if (cleanedText.startsWith('```json')) {
        cleanedText = cleanedText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (cleanedText.startsWith('```')) {
        cleanedText = cleanedText.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }

      const parsedData = JSON.parse(cleanedText);

      // Validate schema
      const replyText = typeof parsedData.replyText === 'string' ? parsedData.replyText : (typeof parsedData.summary === 'string' ? parsedData.summary : 'I hear you and appreciate you sharing your thoughts.');
      const summary = typeof parsedData.summary === 'string' ? parsedData.summary : 'Reflection completed.';
      let moodScore = Number(parsedData.moodScore);
      if (isNaN(moodScore) || moodScore < 1 || moodScore > 10) {
        moodScore = 5;
      }
      const primaryEmotion = typeof parsedData.primaryEmotion === 'string' ? parsedData.primaryEmotion : 'Reflective';
      
      let suggestedFollowUps = Array.isArray(parsedData.suggestedFollowUps) ? parsedData.suggestedFollowUps.filter(item => typeof item === 'string' && item.trim().length > 0) : [];
      if (suggestedFollowUps.length < 3) {
        suggestedFollowUps = [
          "Explore this feeling further",
          "What is an action step I can take?",
          "How can I reframe this positively?"
        ];
      } else {
        suggestedFollowUps = suggestedFollowUps.slice(0, 3);
      }

      return {
        replyText,
        summary,
        moodScore,
        primaryEmotion,
        suggestedFollowUps,
        modelUsed: modelName
      };

    } catch (err) {
      console.error(`[Gemini API] Failed with model ${modelName}:`, err.message);
      lastError = err;
      // Continue to next model in fallback ladder
    }
  }

  throw new Error(`All Gemini models in fallback ladder failed. Last error: ${lastError?.message || 'Unknown error'}`);
}

// Function to generate Weekly Insights Summary via Gemini Fallback Ladder
async function generateWeeklySummaryWithFallback(entriesList) {
  const apiKey = await getGeminiApiKey();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }

  const ai = new GoogleGenAI({ apiKey });
  const systemInstruction = `You are Reflexa, an expert AI emotional intelligence analyst.
Analyze the provided user journal entries and reflection summaries from the past week.
Synthesize the behavioral patterns and emotional trends into a clear, supportive weekly digest.
You MUST reply ONLY with valid JSON containing these exact four keys:
- "summary": A 2-3 sentence overarching narrative summarizing the user's emotional arc over the past week.
- "themes": An array of exactly 3 short behavioral or emotional pattern statements observed (e.g., ["Peak stress during midweek deliverables", "Restorative evening walks", "Strong interpersonal grounding"]).
- "actionItems": An array of exactly 3 actionable, empathetic wellness habits for the upcoming week.
- "overallMoodTrend": A short descriptive status (e.g., "Steadily Improving", "Resilient & Balanced", "Fluctuating", "Deep Rest Needed").

Do NOT include markdown formatting or backticks outside the raw JSON output.`;

  const formattedContent = entriesList.map((item, idx) => {
    return `[Entry ${idx + 1}] Date: ${item.timestamp || 'Recent'} | Emotion: ${item.primaryEmotion || 'N/A'} (Score: ${item.moodScore || 5}/10)\nPrompt: ${item.prompt || ''}\nSummary: ${item.summary || ''}`;
  }).join('\n---\n');

  const contentsInput = [{ role: 'user', parts: [{ text: `Here are my journal entries from the past week:\n\n${formattedContent}` }] }];

  let lastError = null;

  for (const modelName of MODEL_LADDER) {
    try {
      console.log(`[Gemini Weekly API] Attempting generation with model: ${modelName}`);
      const response = await ai.models.generateContent({
        model: modelName,
        contents: contentsInput,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          temperature: 0.7,
        }
      });

      const responseText = response.text || '';
      let cleanedText = responseText.trim();
      if (cleanedText.startsWith('```json')) {
        cleanedText = cleanedText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (cleanedText.startsWith('```')) {
        cleanedText = cleanedText.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }

      const parsedData = JSON.parse(cleanedText);
      return {
        summary: typeof parsedData.summary === 'string' ? parsedData.summary : 'Over the past week, your reflections demonstrate emotional awareness and resilience.',
        themes: Array.isArray(parsedData.themes) && parsedData.themes.length > 0 ? parsedData.themes.slice(0, 3) : ['Mindful daily reflection', 'Emotional awareness', 'Personal growth'],
        actionItems: Array.isArray(parsedData.actionItems) && parsedData.actionItems.length > 0 ? parsedData.actionItems.slice(0, 3) : ['Maintain evening unwinding routine', 'Schedule short micro-breaks', 'Celebrate small wins'],
        overallMoodTrend: typeof parsedData.overallMoodTrend === 'string' ? parsedData.overallMoodTrend : 'Resilient & Steady',
        modelUsed: modelName
      };

    } catch (err) {
      console.error(`[Gemini Weekly API] Failed with model ${modelName}:`, err.message);
      lastError = err;
    }
  }

  throw new Error(`Weekly summary generation failed on all models: ${lastError?.message || 'Unknown error'}`);
}

// API Route for Gemini Multi-Turn Reflection Proxy
app.post('/api/generate', async (req, res) => {
  try {
    // Defensive payload ingestion
    const body = (req.body && typeof req.body === 'object') ? req.body : {};
    const entry = typeof body.entry === 'string' ? body.entry.trim() : (typeof body.prompt === 'string' ? body.prompt.trim() : '');
    const history = Array.isArray(body.history) ? body.history : null;

    let contentsInput;
    if (history && history.length > 0) {
      contentsInput = history;
      if (entry) {
        // Ensure entry is attached as latest turn if not already present
        const lastTurn = history[history.length - 1];
        const lastText = lastTurn?.parts?.[0]?.text || lastTurn?.text;
        if (lastTurn?.role !== 'user' || lastText !== entry) {
          contentsInput = [...history, { role: 'user', parts: [{ text: entry }] }];
        }
      }
    } else if (entry) {
      contentsInput = entry;
    } else {
      return res.status(400).json({ error: 'Either journal entry text or conversation history is required.' });
    }

    const result = await generateContentWithFallback(contentsInput);
    return res.json({
      success: true,
      data: result
    });

  } catch (err) {
    console.error('[API Route /api/generate Error]:', err);
    return res.status(500).json({
      error: err.message || 'Internal server error while evaluating journal entry.'
    });
  }
});

// API Route for Gemini Weekly Insights Synthesis
app.post('/api/weekly-summary', async (req, res) => {
  try {
    const body = (req.body && typeof req.body === 'object') ? req.body : {};
    const entries = Array.isArray(body.entries) ? body.entries : [];

    if (entries.length === 0) {
      return res.status(400).json({ error: 'At least one journal entry or reflection is required for weekly synthesis.' });
    }

    const result = await generateWeeklySummaryWithFallback(entries);
    return res.json({
      success: true,
      data: result
    });
  } catch (err) {
    console.error('[API Route /api/weekly-summary Error]:', err);
    return res.status(500).json({
      error: err.message || 'Internal server error while generating weekly summary.'
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', app: 'Reflexa', timestamp: new Date().toISOString() });
});

// Firebase configuration endpoint for client app
app.get('/api/firebase-config', (req, res) => {
  try {
    const configPath = path.join(__dirname, 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(raw);
      return res.json({ success: true, config });
    }
  } catch (err) {
    console.warn('[Firebase Config Route Error]:', err.message);
  }
  return res.json({ success: false, config: null });
});

// Serve SPA index.html for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Reflexa Backend] Server listening on http://0.0.0.0:${PORT}`);
});
