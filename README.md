# Reflexa 🧠

Reflexa is an AI-powered personal reflection and journaling application that helps users understand their thoughts, track moods, and have meaningful conversations with an AI companion.

## 🚀 Live Demo

[Open Reflexa](https://reflexa.ai.studio)

## ✨ Features

- 🔐 Firebase Authentication with Google Sign-In
- 💬 Multi-turn conversations powered by Gemini
- 📝 Personal journaling
- 📊 Mood tracking and analysis
- 🎙️ Voice input
- 💡 Smart follow-up suggestions
- 📅 Weekly AI reflection and synthesis
- 🔥 Activity/streak tracking
- 📈 28-day activity visualization
- 🛡️ Safety-aware AI responses
- 🔒 User-isolated Cloud Firestore data

## 🏗️ Architecture

```text
                    Reflexa
                       |
             +---------+---------+
             |                   |
        Firebase             Backend API
        Services                  |
             |                    |
       +-----+-----+       +------+------+
       |           |       |             |
   Firebase     Firestore /api/generate  |
     Auth          |      /api/weekly-summary
                   |             |
             User UID            |
             Security            |
              Rules              |
                   |             |
                   +-------------+
                                 |
                         Google Cloud
                        Secret Manager
                                 |
                          GEMINI_API_KEY
                                 |
                           Gemini API


🔐 Security

Reflexa is designed so that sensitive Gemini credentials are never exposed to the browser.

Gemini API calls are handled through server-side API routes.
The Gemini API key is stored using Google Cloud Secret Manager.
The Gemini API key is accessed server-side through GEMINI_API_KEY.
No Gemini API key is hardcoded in the source code.
No Gemini API key is exposed to frontend JavaScript.
Firebase Authentication identifies users.
Cloud Firestore Security Rules enforce user ownership using the authenticated user's UID.
Users cannot access another user's private journal/session data.
🔑 Authentication

Firebase Authentication is used for user sign-in.

The application uses the authenticated user's Firebase UID to associate personal application data with that user.

💬 Multi-turn AI Interaction

Reflexa maintains conversation history within an active session and sends the conversation context to the Gemini backend.

Example:

User: My favorite color is blue.
AI: ...

User: What is my favorite color?
AI: Blue

Starting a new session intentionally starts a new conversation context.

🗄️ Data Isolation

User data is stored in Cloud Firestore under user-specific data paths.

Firestore Security Rules enforce ownership using the authenticated Firebase UID.

Conceptually:

User A
  └── Own data only

User B
  └── Own data only

A user cannot read or modify another user's private data.

🤖 Gemini Backend

The frontend communicates with the backend rather than directly exposing the Gemini API key.

Main backend routes include:

/api/generate
/api/weekly-summary

The backend obtains the Gemini credential securely through the server-side secret configuration.

🌟 Original Features

Reflexa extends basic AI chat with additional features including:

Weekly AI reflection/synthesis
Mood analysis
Voice-to-text journaling
Smart follow-up suggestions
Streak and activity tracking
28-day activity visualization
Safety-aware response handling

The weekly AI reflection feature provides a higher-level summary of the user's journaling activity rather than only responding to individual messages.

🛠️ Technology Stack
Google AI Studio
Gemini API
Firebase Authentication
Cloud Firestore
Google Cloud Secret Manager
Server-side API routes
JavaScript / web technologies
🔒 Secrets & Environment Variables

No real API keys or secrets should be committed to this repository.

The Gemini API key is managed server-side through Google Cloud Secret Manager.

If environment variables are required for local development, create them locally and do not commit the .env file.

Example:

GEMINI_API_KEY=

Never place the actual secret value in this README or source code.

🧪 Verification

The application has been verified for:

Firebase authentication
Multi-turn Gemini conversations
Firestore user isolation
Server-side Gemini API access
Secret Manager-based Gemini API key management
Backend API routes
Production deployment

Build and lint checks pass successfully.

📦 Deployment

The production application is deployed and available at:

https://reflexa.ai.studio
