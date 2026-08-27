# Reflexa - Personal Gemini Journal & Mood Analytics

Reflexa is a production-ready, containerized full-stack web application designed for deployment on Google Cloud Run. It combines **Firebase Authentication**, **Cloud Firestore**, and **Google Gemini 3.6 Flash AI** to provide empathetic reflections on user journal entries alongside a **Mood Analytics Dashboard**.

---

## 1. Threat Modeling & Security Architecture

Reflexa implements defensive patterns across all 5 Agentic Threat Zones:

| Threat Zone | Risk Description | Severity | Countermeasure / Mitigation Strategy |
| :--- | :--- | :--- | :--- |
| **Input Surfaces** | Oversized payloads, XSS via journal text, malicious injection. | **High** | Express body parsers capped at 1MB; strict HTML string escaping; input length caps (10,000 chars). |
| **Planning & Reasoning** | Prompt injection attempting to bypass AI JSON output rules. | **Medium** | System prompt instructions enforcing strict `responseMimeType: "application/json"`; treating journal text strictly as user input. |
| **Tool Execution** | Client-side API key exposure or unauthorized Gemini API execution. | **Critical** | Zero client-side API keys; all Gemini calls proxied via server-side `/api/generate` route; dynamic retrieval via `@google-cloud/secret-manager`. |
| **Memory & State** | Cross-tenant document read/write or data leakage in Firestore. | **Critical** | Firestore security rules enforcing owner isolation (`request.auth.uid == userId`); queries explicitly scoped to `/users/{userId}/interactions`. |
| **Inter-System Comm** | Insecure token storage or plain-text secrets in source code. | **High** | Zero hardcoding; Cloud Secret Manager IAM bindings; standard `.env.example` templates. |

---

## 2. Prerequisites & Cloud Setup

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

## 3. Secret Manager Setup

Store your `GEMINI_API_KEY` securely in Google Cloud Secret Manager and grant the Cloud Run runtime service account permission to read it:

```bash
# 1. Create the secret in Secret Manager
gcloud secrets create GEMINI_API_KEY --replication-policy="automatic"

# 2. Add your Gemini API Key as a version
echo -n "YOUR_ACTUAL_GEMINI_API_KEY" | gcloud secrets versions add GEMINI_API_KEY --data-file=-

# 3. Retrieve your project number
export PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")

# 4. Grant Secret Manager Secret Accessor role to default Compute service account
gcloud secrets add-iam-policy-binding GEMINI_API_KEY \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

---

## 4. Firestore Security Rules

Deploy the following owner-bound security rules to Cloud Firestore to isolate each user's data:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/interactions/{interactionId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

---

## 5. Google Cloud Run Deployment

Build and deploy Reflexa to Google Cloud Run with the mandatory verification campaign label:

```bash
gcloud run deploy reflexa \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-secrets GEMINI_API_KEY=GEMINI_API_KEY:latest \
  --update-labels=dev-tutorial=cloud-run-ai-challenge
```

---

## 6. Functional Verification Walkthrough

Follow these steps to test and verify every interaction in the application:

### Test Case 1: Landing Page & Authentication
1. Open the application URL in a web browser.
2. Confirm the landing page renders the **Reflexa** branding, feature highlights, and the **Sign in with Google** button.
3. Click **Sign in with Google** (or click **Continue in Preview / Guest Mode** for local testing).
4. Verify that upon authentication, the header updates with your profile picture and name, and the main dashboard opens.

### Test Case 2: Journal Submission & AI Reflection (JSON Mode)
1. In the **Write Reflection** card, select a prompt chip or type a custom journal entry (e.g., *"Completed a major project milestone today! Feeling accomplished and ready to celebrate."*).
2. Click **Analyze with Gemini AI**.
3. Observe the loading state spinner on the submit button.
4. Verify the server-side proxy invokes Gemini using structured JSON mode and returns:
   - `primaryEmotion` (e.g., "Joy" or "Accomplishment")
   - `moodScore` (e.g., 9/10)
   - `summary` (empathetic reflection paragraph)
5. Verify the **Gemini Analysis** result card animates onto the screen with color-coded mood indicators.

### Test Case 3: Mood Analytics Dashboard & History Sync
1. Examine the **Mood Analytics Trends** line graph powered by Chart.js.
2. Verify that submitting new reflections dynamically updates the graph's points, labels, and curved trend line.
3. Check the **Reflection Log** on the right panel to confirm that past journal entries display their timestamps, emotion badges, and summary text in reverse chronological order.
4. Verify top metrics (**Average Mood**, **Total Reflections**, **Top Emotion**) update in real-time.
