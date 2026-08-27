# Reflexa - Personal Gemini Journal & Mood Analytics

Reflexa is a production-grade, containerized full-stack web application built with **Node.js/Express**, **Firebase Authentication**, **Cloud Firestore**, and **Google Gemini 3.6 Flash AI** (`@google/genai`). It provides real-time empathetic reflection, structured emotional intelligence analytics, voice dictation, smart AI follow-up suggestions, weekly behavioral synthesis, safety triage guardrails, and activity heatmaps.

---

## 1. System Architecture & Testing Flow Chart

Below is the complete end-to-end flow chart illustrating user interactions, frontend event flows, backend AI execution via the Gemini Fallback Ladder, and Firestore persistence.

```mermaid
flowchart TD
    %% User Action & Auth Boundary
    subgraph Client_Boundary ["Client Interface (Browser & Web Speech API)"]
        A[User Accesses Reflexa Web App] --> B{Authenticated?}
        B -- No --> C[Google Sign-In / Guest Preview Mode]
        B -- Yes --> D[Main Interactive Dashboard]
        
        %% Module Inputs
        D --> E1[Voice Dictation - Web Speech API]
        D --> E2[Text Entry / Prompt Chips]
        D --> E3[Smart Reply AI Chips]
        
        E1 --> F[Populate Input Bar]
        E2 --> F
        E3 --> F
        
        F --> G[Submit Journal Entry]
    end

    %% Full-Stack Server API Proxy
    subgraph Backend_Boundary ["Server Proxy (Node.js / Express - Port 3000)"]
        G --> H[POST /api/generate - Body Deserialization & Validation]
        H --> I[Execute Gemini Fallback Ladder]
        
        subgraph Gemini_Ladder ["Gemini AI Fallback Protocol"]
            I --> J1[Primary: gemini-3.6-flash]
            J1 -- Success --> K[Structured JSON Evaluation]
            J1 -- Recoverable Error --> J2[Fallback 1: gemini-3.1-flash-lite]
            J2 -- Success --> K
            J2 -- Recoverable Error --> J3[Fallback 2: gemini-flash-latest]
            J3 -- Success --> K
            J3 -- Recoverable Error --> J4[Fallback 3: gemini-3.7-flash]
            J4 --> K
        end
        
        K --> L[Return JSON: replyText, summary, moodScore, primaryEmotion, suggestedFollowUps]
    end

    %% Client State & Persistence
    subgraph Persistence_And_UI ["Data Persistence & UI Render Pipeline"]
        L --> M[Render Dark Chat Stream Bubble]
        L --> N[Render Smart Reply Follow-up Chips]
        L --> O{Safety Guardrail Check: Score <= 2 or Distress Keywords?}
        
        O -- Yes --> P[Surface 988 Helpline Crisis Banner]
        O -- No --> Q[Continue Normal State]

        M --> R[Save Session to Firestore: /users/{userId}/sessions/{sessionId}]
        
        R --> S1[Update KPI Cards & Check-in Streak 🔥]
        R --> S2[Update Chart.js Emotional Trend Line]
        R --> S3[Update 28-Day Consistency Heatmap Grid]
        R --> S4[Append to Reflection Log]
    end

    %% Special Feature Subgraphs
    subgraph Special_Features ["Export & Weekly Synthesis Utilities"]
        D --> T1[Click Export Journal Button] --> U1[Format Session to Markdown .md Download]
        D --> T2[Click Weekly Synthesis Button] --> U2[POST /api/weekly-summary] --> U3[Render Weekly Digest Modal]
    end
```

---

## 2. Threat Modeling & Security Architecture

Reflexa implements defensive patterns across all 5 Agentic Threat Zones:

| Threat Zone | Risk Description | Severity | Countermeasure / Mitigation Strategy |
| :--- | :--- | :--- | :--- |
| **Input Surfaces** | Oversized payloads, XSS via journal text, malicious prompt injection. | **High** | Express body parsers capped at 1MB; strict HTML string escaping (`escapeHtml`); input length capped at 10,000 characters. |
| **Planning & Reasoning** | Prompt injection attempting to bypass AI JSON output rules. | **Medium** | Server-side system prompt enforcing `responseMimeType: "application/json"`; treating user journal input strictly as plain data. |
| **Tool Execution** | Client-side API key exposure or unauthorized Gemini API execution. | **Critical** | Zero client-side API keys; all Gemini calls proxied via server-side `/api/generate` and `/api/weekly-summary` endpoints; secret retrieval via environment / Google Cloud Secret Manager. |
| **Memory & State** | Cross-tenant document read/write or data leakage in Firestore. | **Critical** | Firestore security rules enforcing owner isolation (`request.auth.uid == userId`); session scope bound to `/users/{userId}/sessions/{sessionId}`. |
| **Inter-System Comm** | Plaintext credentials or exposed tokens in repository source. | **High** | Zero hardcoded keys; Cloud Secret Manager IAM bindings; standardized `.env.example` templates. |

---

## 3. Prerequisites & Cloud Setup

Ensure you have installed the [Google Cloud SDK](https://cloud.google.com/sdk) and enabled the required GCP services:

```bash
# Set your GCP Project ID
export PROJECT_ID="your-gcp-project-id"
gcloud config set project $PROJECT_ID

# Enable required GCP APIs
gcloud services enable \
  run.googleapis.com \
  secretmanager.googleapis.com \
  firestore.googleapis.com \
  cloudbuild.googleapis.com
```

---

## 4. Secret Manager Setup

Store your `GEMINI_API_KEY` securely in Google Cloud Secret Manager and grant the default Cloud Run runtime service account access:

```bash
# 1. Create the secret in Secret Manager
gcloud secrets create GEMINI_API_KEY --replication-policy="automatic"

# 2. Add your Gemini API Key as a version
echo -n "YOUR_ACTUAL_GEMINI_API_KEY" | gcloud secrets versions add GEMINI_API_KEY --data-file=-

# 3. Retrieve your project number
export PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")

# 4. Grant Secret Manager Secret Accessor role to compute service account
gcloud secrets add-iam-policy-binding GEMINI_API_KEY \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

---

## 5. Firestore Security Rules

Deploy the following owner-bound security rules to Cloud Firestore to isolate user data:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/sessions/{sessionId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /users/{userId}/interactions/{interactionId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

---

## 6. Google Cloud Run Deployment

Build and deploy Reflexa to Google Cloud Run with the mandatory campaign verification label:

```bash
gcloud run deploy reflexa \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-secrets GEMINI_API_KEY=GEMINI_API_KEY:latest \
  --update-labels=dev-tutorial=cloud-run-ai-challenge
```

---

## 7. Complete Interactive Testing Walkthrough

Follow these test cases to verify every module and user interaction in the application:

### Test Case 1: Authentication & Guest Preview
1. Open the application URL in a web browser.
2. Verify the landing screen displays Reflexa branding, feature highlights, and the Google Sign-In button.
3. Click **Sign in with Google** (or **Continue in Preview / Guest Mode**).
4. Confirm the landing screen transitions smoothly to the dark-themed main dashboard with user avatar and stats.

### Test Case 2: Voice Dictation (Module 1 - Web Speech API)
1. In the bottom input bar, click the **Microphone icon**.
2. Grant microphone access if requested by the browser.
3. Observe the mic button turn into a pulsing red active indicator (`bg-rose-500/20 text-rose-400 border-rose-500/40 animate-pulse`).
4. Speak a phrase (e.g., *"Today was a productive day full of accomplishments"*).
5. Verify your voice transcribes in real-time directly into the text field.

### Test Case 3: AI Chat, Fallback Ladder & Smart Replies (Module 2)
1. Submit your entry by clicking the orange **Send button**.
2. Observe the chat container render a left-aligned thinking bubble (`Reflecting & analyzing mood...`).
3. Verify the server proxy calls Gemini and returns a structured JSON payload:
   - User chat bubble (orange text container on the right).
   - Agent chat bubble (dark card on the left with key takeaway summary & mood score).
4. Verify **3 Smart Reply Chips** appear above the input bar (e.g., *"Explore this feeling further"*).
5. Click a Smart Reply chip to confirm it instantly sends as your next turn.

### Test Case 4: Weekly Insights Synthesis (Module 2)
1. Click the **Weekly Synthesis** button in the top navigation header.
2. Verify the modal opens in a loading state while calling `/api/weekly-summary`.
3. Confirm Gemini synthesizes multi-day entries into an overarching narrative, 3 observed behavioral themes, and 3 recommended wellness habits.
4. Click **Done / Got It** to close the modal.

### Test Case 5: Wellness Tracking & Safety Guardrails (Module 3)
1. **Check-in Streak**: Verify the middle KPI card displays your consecutive reflection streak (e.g., `🔥 1 Day`).
2. **Safety Triage Banner**: Type a low-mood or distress entry (e.g., *"I feel overwhelmed and completely hopeless"*).
3. Submit the message and verify the rose-themed **Supportive Care Notice** banner automatically appears at the top of the chat window with **988 Helpline** resource numbers.
4. Click the **X** button to dismiss the banner.

### Test Case 6: Markdown Export & Activity Heatmap (Module 4)
1. **Markdown Export**: In the chat header, click **Export**. Confirm the browser downloads a `.md` file formatted with session timestamps, emotions, and takeaways.
2. **Consistency Heatmap**: In the right panel, toggle from **Trend** to **Heatmap**. Confirm the 28-day grid renders activity tiles colored according to reflection frequency and mood score.
