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
