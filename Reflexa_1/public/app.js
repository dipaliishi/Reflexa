/**
 * Reflexa - Personal Gemini Journal & Mood Analytics
 * Complete Implementation with 4 Upgrade Modules:
 * - Module 1: Voice-to-Text Input (Web Speech API)
 * - Module 2: Smart Insights & Follow-Ups (Smart Reply Chips & Weekly Synthesis Modal)
 * - Module 3: Wellness Tracking & Safety Guardrails (Streak Tracker & Safety Triage Banner)
 * - Module 4: Export Utilities & Consistency Heatmap (Markdown Export & 28-Day Activity Heatmap)
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged 
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { 
  getFirestore, 
  doc,
  setDoc,
  collection, 
  getDocs, 
  query, 
  orderBy, 
  serverTimestamp 
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

// Provisioned Firebase Configuration
const fallbackConfig = {
  projectId: "nodal-essence-f6rpq",
  appId: "1:920226207191:web:ad13cce09aca95a1916792",
  apiKey: "AIzaSyCZ7TXPI2JpLgCUZSeC7-Akj-G56DFf_jI",
  authDomain: "nodal-essence-f6rpq.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-reflexa-6a2ae6bc-d59b-4abd-b2f1-393fce82ba29",
  storageBucket: "nodal-essence-f6rpq.firebasestorage.app",
  messagingSenderId: "920226207191"
};

let app, auth, db;

async function initFirebase() {
  let config = window.__FIREBASE_CONFIG__;
  if (!config) {
    try {
      const res = await fetch('/api/firebase-config');
      const data = await res.json();
      if (data.success && data.config) {
        config = data.config;
      }
    } catch (e) {
      console.warn('[Firebase Config fetch error]:', e);
    }
  }

  if (!config || !config.apiKey) {
    config = fallbackConfig;
  }

  try {
    app = initializeApp(config);
    auth = getAuth(app);
    if (config.firestoreDatabaseId) {
      db = getFirestore(app, config.firestoreDatabaseId);
    } else {
      db = getFirestore(app);
    }
    console.log('[Firebase Init] Firebase initialized successfully with project:', config.projectId);
  } catch (e) {
    console.warn('[Firebase Init Warning]:', e.message);
  }
}

// Global Application State
let currentUser = null;
let isGuestMode = false;
let moodChartInstance = null;
let isSpeechListening = false;
let speechRecognition = null;

// Multi-turn Session State Management
let currentSessionId = 'session_' + Date.now();
let currentSessionHistory = []; // Array of { role: 'user'|'model', parts: [{ text }], summary?, moodScore?, primaryEmotion?, timestamp }
let userSessions = []; // Array of session objects
let userInteractions = []; // Flattened array of evaluated turns for Chart.js & metrics

// DOM Element Selectors
const landingView = document.getElementById('landingView');
const dashboardView = document.getElementById('dashboardView');
const userProfile = document.getElementById('userProfile');
const userAvatar = document.getElementById('userAvatar');
const userName = document.getElementById('userName');

const btnGoogleSignIn = document.getElementById('btnGoogleSignIn');
const btnGuestAccess = document.getElementById('btnGuestAccess');
const btnSignOut = document.getElementById('btnSignOut');
const btnWeeklySummary = document.getElementById('btnWeeklySummary');

const journalForm = document.getElementById('journalForm');
const journalInput = document.getElementById('journalInput');
const btnSubmitJournal = document.getElementById('btnSubmitJournal');
const btnMic = document.getElementById('btnMic');
const charCount = document.getElementById('charCount');
const chatContainer = document.getElementById('chatContainer');
const btnNewSession = document.getElementById('btnNewSession');
const btnExportJournal = document.getElementById('btnExportJournal');

const safetyBanner = document.getElementById('safetyBanner');
const btnDismissSafety = document.getElementById('btnDismissSafety');

const smartRepliesContainer = document.getElementById('smartRepliesContainer');
const smartRepliesList = document.getElementById('smartRepliesList');

const aiResultCard = document.getElementById('aiResultCard');
const aiEmotionBadge = document.getElementById('aiEmotionBadge');
const aiMoodScore = document.getElementById('aiMoodScore');
const aiSummaryText = document.getElementById('aiSummaryText');
const aiModelBadge = document.getElementById('aiModelBadge');

const metricAvgScore = document.getElementById('metricAvgScore');
const metricAvgStatus = document.getElementById('metricAvgStatus');
const metricStreak = document.getElementById('metricStreak');
const metricStreakStatus = document.getElementById('metricStreakStatus');
const metricTopEmotion = document.getElementById('metricTopEmotion');
const metricTopEmotionSub = document.getElementById('metricTopEmotionSub');

const tabMoodTrend = document.getElementById('tabMoodTrend');
const tabHeatmap = document.getElementById('tabHeatmap');
const chartView = document.getElementById('chartView');
const heatmapView = document.getElementById('heatmapView');
const heatmapGrid = document.getElementById('heatmapGrid');
const heatmapSummaryText = document.getElementById('heatmapSummaryText');

const historyList = document.getElementById('historyList');
const historyCount = document.getElementById('historyCount');

const weeklyModal = document.getElementById('weeklyModal');
const btnCloseWeeklyModal = document.getElementById('btnCloseWeeklyModal');
const btnCloseWeeklyModalBtn = document.getElementById('btnCloseWeeklyModalBtn');
const weeklyTrendBadge = document.getElementById('weeklyTrendBadge');
const weeklySummaryText = document.getElementById('weeklySummaryText');
const weeklyThemesList = document.getElementById('weeklyThemesList');
const weeklyActionItemsList = document.getElementById('weeklyActionItemsList');

// Initialize Application
document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  initChart();
  initSpeechRecognition();
  await initFirebase();

  if (auth) {
    onAuthStateChanged(auth, (user) => {
      if (user) {
        currentUser = user;
        isGuestMode = false;
        handleUserSignedIn(user);
      } else if (!isGuestMode) {
        handleUserSignedOut();
      }
    });
  }
});

// Event Listeners Setup
function setupEventListeners() {
  // Google Sign-In
  btnGoogleSignIn?.addEventListener('click', async () => {
    if (!auth) {
      showToast('Firebase Auth', 'Auth service initializing. Continuing in Guest mode.', 'info');
      enableGuestMode();
      return;
    }
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.error('[Google Sign-In Error]:', err);
      showToast('Sign-In Error', err.message || 'Could not sign in with Google.', 'error');
      enableGuestMode();
    }
  });

  // Guest Mode Trigger
  btnGuestAccess?.addEventListener('click', () => {
    enableGuestMode();
  });

  // Sign Out
  btnSignOut?.addEventListener('click', async () => {
    if (auth && currentUser) {
      await signOut(auth);
    }
    enableGuestMode(false);
    handleUserSignedOut();
  });

  // Weekly Insights Button (Module 2)
  btnWeeklySummary?.addEventListener('click', () => {
    handleWeeklySummary();
  });

  // Close Weekly Modal
  btnCloseWeeklyModal?.addEventListener('click', () => {
    weeklyModal?.classList.add('hidden');
  });
  btnCloseWeeklyModalBtn?.addEventListener('click', () => {
    weeklyModal?.classList.add('hidden');
  });

  // New Chat Session Button
  btnNewSession?.addEventListener('click', () => {
    startNewSession();
  });

  // Export Journal Session (Module 4)
  btnExportJournal?.addEventListener('click', () => {
    exportJournalSession();
  });

  // Dismiss Safety Banner (Module 3)
  btnDismissSafety?.addEventListener('click', () => {
    safetyBanner?.classList.add('hidden');
  });

  // Analytics Tab Switcher (Module 4)
  tabMoodTrend?.addEventListener('click', () => {
    tabMoodTrend.className = 'px-3 py-1 text-xs font-semibold rounded-lg bg-amber-500/20 text-amber-300 transition';
    tabHeatmap.className = 'px-3 py-1 text-xs font-semibold rounded-lg text-slate-400 hover:text-white transition';
    chartView?.classList.remove('hidden');
    heatmapView?.classList.add('hidden');
  });

  tabHeatmap?.addEventListener('click', () => {
    tabHeatmap.className = 'px-3 py-1 text-xs font-semibold rounded-lg bg-amber-500/20 text-amber-300 transition';
    tabMoodTrend.className = 'px-3 py-1 text-xs font-semibold rounded-lg text-slate-400 hover:text-white transition';
    chartView?.classList.add('hidden');
    heatmapView?.classList.remove('hidden');
    renderHeatmap();
  });

  // Character Counter & Auto Expand Textarea
  journalInput?.addEventListener('input', (e) => {
    const len = e.target.value.length;
    charCount.textContent = `${len.toLocaleString()} / 10,000`;
  });

  // Microphone Dictation Toggle (Module 1)
  btnMic?.addEventListener('click', () => {
    toggleVoiceDictation();
  });

  // Starter Prompt Chips
  document.querySelectorAll('.prompt-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const promptText = chip.textContent.trim().replace(/^[\s\S]*?\s/, '');
      journalInput.value = promptText;
      journalInput.focus();
      charCount.textContent = `${journalInput.value.length} / 10,000`;
    });
  });

  // Journal Form Submission
  journalForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const promptText = journalInput.value.trim();
    if (!promptText) return;

    await submitJournalMessage(promptText);
  });
}

// Module 1: Voice-to-Text Input (Web Speech API)
function initSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.warn('[Speech Recognition] Web Speech API not natively supported in this browser environment.');
    return;
  }

  try {
    speechRecognition = new SpeechRecognition();
    speechRecognition.continuous = false;
    speechRecognition.interimResults = true;
    speechRecognition.lang = 'en-US';

    speechRecognition.onstart = () => {
      isSpeechListening = true;
      if (btnMic) {
        btnMic.className = 'p-2.5 rounded-xl text-rose-400 bg-rose-500/20 border border-rose-500/40 animate-pulse transition flex items-center justify-center shrink-0 active:scale-95';
      }
      showToast('Voice Dictation Active', 'Listening to your voice... Speak clearly.', 'info');
    };

    speechRecognition.onresult = (event) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      if (journalInput) {
        journalInput.value = transcript;
        charCount.textContent = `${transcript.length} / 10,000`;
      }
    };

    speechRecognition.onerror = (e) => {
      console.warn('[Speech Recognition Error]:', e.error);
      isSpeechListening = false;
      resetMicButton();
      if (e.error !== 'no-speech') {
        showToast('Voice Dictation', `Microphone event: ${e.error}`, 'info');
      }
    };

    speechRecognition.onend = () => {
      isSpeechListening = false;
      resetMicButton();
    };
  } catch (e) {
    console.warn('[Speech Recognition Init Error]:', e);
  }
}

function resetMicButton() {
  if (btnMic) {
    btnMic.className = 'p-2.5 rounded-xl text-slate-400 hover:text-amber-400 hover:bg-slate-800/80 transition flex items-center justify-center shrink-0 active:scale-95';
  }
}

function toggleVoiceDictation() {
  if (!speechRecognition) {
    showToast('Voice Dictation', 'Web Speech API is not supported in this browser. Please type your entry.', 'info');
    return;
  }

  if (isSpeechListening) {
    speechRecognition.stop();
  } else {
    try {
      speechRecognition.start();
    } catch (err) {
      console.warn('[Speech Recognition Start Error]:', err);
      speechRecognition.stop();
    }
  }
}

// Start Fresh Chat Session
function startNewSession() {
  currentSessionId = 'session_' + Date.now();
  currentSessionHistory = [];
  if (chatContainer) {
    chatContainer.innerHTML = '';
  }
  journalInput.value = '';
  charCount.textContent = '0 / 10,000';
  aiResultCard.classList.add('hidden');
  smartRepliesContainer?.classList.add('hidden');
  safetyBanner?.classList.add('hidden');
  renderChatStream();
  showToast('New Chat Session', 'Started a fresh reflection session with Gemini AI.', 'info');
}

// Guest Mode Handler
function enableGuestMode(enable = true) {
  isGuestMode = enable;
  if (enable) {
    currentUser = {
      uid: 'guest_user_preview',
      displayName: 'Guest Explorer',
      photoURL: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&q=80'
    };
    handleUserSignedIn(currentUser);
    showToast('Preview Mode Activated', 'You can test Gemini AI analysis & mood analytics live.', 'info');
  }
}

// User Signed In UI Handler
function handleUserSignedIn(user) {
  landingView.classList.add('hidden');
  dashboardView.classList.remove('hidden');
  userProfile.classList.remove('hidden');

  userAvatar.src = user.photoURL || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&q=80';
  userName.textContent = user.displayName || 'Reflexa User';

  loadUserSessions();
}

// User Signed Out UI Handler
function handleUserSignedOut() {
  currentUser = null;
  landingView.classList.remove('hidden');
  dashboardView.classList.add('hidden');
  userProfile.classList.add('hidden');
  userSessions = [];
  userInteractions = [];
  currentSessionHistory = [];
}

// Render Dark Immersive Chat Stream UI
function renderChatStream(isThinking = false) {
  if (!chatContainer) return;

  const avatarUrl = currentUser?.photoURL || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&q=80';

  if (currentSessionHistory.length === 0 && !isThinking) {
    chatContainer.innerHTML = `
      <div class="flex flex-col items-center justify-center h-full my-auto text-center py-12 px-4 space-y-3">
        <div class="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
          <i data-lucide="sun" class="w-6 h-6 text-amber-400"></i>
        </div>
        <h3 class="text-sm font-bold text-white">Start Your Reflection Conversation</h3>
        <p class="text-xs text-slate-400 max-w-sm leading-relaxed">
          Share your feelings, achievements, or concerns. Reflexa will listen, provide empathetic reflections, and evaluate your emotional trajectory.
        </p>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  let htmlContent = currentSessionHistory.map(turn => {
    const isUser = turn.role === 'user';
    const text = escapeHtml(turn.parts?.[0]?.text || turn.text || '');
    const dt = new Date(turn.timestamp || Date.now());
    const timeFormatted = isNaN(dt.getTime()) ? '' : dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (isUser) {
      return `
        <div class="flex items-start justify-end gap-2.5 self-end ml-auto max-w-[88%]">
          <div class="flex flex-col items-end space-y-1">
            <div class="bg-amber-500 text-slate-950 rounded-2xl rounded-tr-xs px-4 py-3 text-sm font-semibold shadow-md shadow-amber-500/10 leading-relaxed">
              ${text}
            </div>
            <span class="text-[10px] text-slate-500 px-1 font-medium">${timeFormatted}</span>
          </div>
          <img src="${avatarUrl}" class="w-7 h-7 rounded-full border border-amber-500/50 object-cover shrink-0 mt-0.5 shadow-xs" alt="User" />
        </div>
      `;
    } else {
      const score = turn.moodScore || 5;
      let badgeClass = 'bg-amber-500/10 text-amber-300 border-amber-500/30';
      if (score >= 7) badgeClass = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      if (score <= 4) badgeClass = 'bg-rose-500/10 text-rose-400 border-rose-500/30';

      return `
        <div class="flex items-start gap-2.5 self-start mr-auto max-w-[92%]">
          <div class="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
            <i data-lucide="sun" class="w-4 h-4 text-amber-400"></i>
          </div>
          <div class="flex flex-col space-y-1.5">
            <div class="bg-[#161f33] text-slate-100 border border-slate-700/60 rounded-2xl rounded-tl-xs p-4 text-sm shadow-md space-y-2.5">
              <div class="flex items-center justify-between gap-3 pb-2 border-b border-slate-800">
                <div class="flex items-center space-x-1.5">
                  <span class="text-[11px] font-bold text-amber-400 uppercase tracking-wider">Reflexa AI</span>
                </div>
                ${turn.primaryEmotion ? `
                  <span class="px-2 py-0.5 text-[10px] font-bold rounded-full border ${badgeClass}">
                    ${turn.primaryEmotion} (${score}/10)
                  </span>
                ` : ''}
              </div>
              <p class="leading-relaxed text-slate-200">${text}</p>
              ${turn.summary ? `
                <div class="bg-[#0b0f1a] p-3 rounded-xl border border-slate-800/80 text-xs text-amber-200/90 italic font-medium leading-relaxed">
                  <span class="font-bold not-italic text-amber-400">Key Takeaway:</span> "${escapeHtml(turn.summary)}"
                </div>
              ` : ''}
            </div>
            <span class="text-[10px] text-slate-500 px-1 font-medium">${timeFormatted}</span>
          </div>
        </div>
      `;
    }
  }).join('');

  if (isThinking) {
    htmlContent += `
      <div id="aiThinkingBubble" class="flex items-start gap-2.5 self-start mr-auto max-w-[85%]">
        <div class="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center shrink-0 mt-0.5 animate-pulse">
          <i data-lucide="sun" class="w-4 h-4 text-amber-400"></i>
        </div>
        <div class="bg-[#161f33] text-slate-200 border border-slate-700/60 rounded-2xl rounded-tl-xs px-4 py-3 text-sm shadow-md flex items-center space-x-3">
          <div class="flex items-center space-x-1.5">
            <span class="w-2 h-2 rounded-full bg-amber-400 animate-bounce"></span>
            <span class="w-2 h-2 rounded-full bg-amber-400 animate-bounce [animation-delay:0.2s]"></span>
            <span class="w-2 h-2 rounded-full bg-amber-400 animate-bounce [animation-delay:0.4s]"></span>
          </div>
          <span class="text-xs font-semibold text-amber-300">Reflecting & analyzing mood...</span>
        </div>
      </div>
    `;
  }

  chatContainer.innerHTML = htmlContent;

  if (window.lucide) window.lucide.createIcons();
  
  // Auto scroll chat to bottom
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Module 2: Smart Reply Chips Renderer
function renderSmartReplies(followUps) {
  if (!smartRepliesContainer || !smartRepliesList) return;

  const chips = Array.isArray(followUps) && followUps.length > 0 ? followUps : [
    "Explore this feeling further",
    "What is an action step I can take?",
    "How can I reframe this positively?"
  ];

  smartRepliesList.innerHTML = chips.map(text => `
    <button 
      type="button" 
      class="smart-reply-chip px-3 py-1.5 text-xs font-semibold rounded-xl bg-[#161f33] hover:bg-amber-500/20 hover:text-amber-300 hover:border-amber-500/50 text-slate-200 border border-slate-700/80 transition active:scale-95 text-left flex items-center space-x-1.5 shadow-xs"
    >
      <i data-lucide="arrow-right-circle" class="w-3.5 h-3.5 text-amber-400 shrink-0"></i>
      <span>${escapeHtml(text)}</span>
    </button>
  `).join('');

  smartRepliesContainer.classList.remove('hidden');
  if (window.lucide) window.lucide.createIcons();

  document.querySelectorAll('.smart-reply-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const chipText = chip.innerText.trim();
      smartRepliesContainer.classList.add('hidden');
      submitJournalMessage(chipText);
    });
  });
}

// Module 3: Safety Guardrails Triage Check
function checkSafetyTriage(moodScore, userText, aiReply) {
  if (!safetyBanner) return;

  const distressKeywords = [
    'hopeless', 'hurt myself', 'end it all', 'despair', "can't go on", 
    'suicide', 'give up', 'depressed', 'worthless', 'self-harm', 'no way out', 'kill myself'
  ];

  const combined = (userText + ' ' + (aiReply || '')).toLowerCase();
  const keywordMatch = distressKeywords.some(kw => combined.includes(kw));

  if (Number(moodScore) <= 2 || keywordMatch) {
    safetyBanner.classList.remove('hidden');
    safetyBanner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

// Submit Multi-Turn Journal Message
async function submitJournalMessage(promptText) {
  // 1. Append user's message immediately to UI state
  const userTurn = {
    role: 'user',
    parts: [{ text: promptText }],
    timestamp: new Date().toISOString()
  };

  currentSessionHistory.push(userTurn);
  smartRepliesContainer?.classList.add('hidden');
  renderChatStream(true); // render with thinking state

  // Clear input box immediately for clean user experience
  journalInput.value = '';
  charCount.textContent = '0 / 10,000';
  setLoadingState(true);

  try {
    // 2. Send entire currentSessionHistory array to backend
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entry: promptText,
        history: currentSessionHistory
      })
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error || 'Failed to generate AI chat response.');
    }

    const { replyText, summary, moodScore, primaryEmotion, suggestedFollowUps, modelUsed } = result.data;

    // 3. Append AI response to UI session history
    const aiTurn = {
      role: 'model',
      parts: [{ text: replyText }],
      summary,
      moodScore: Number(moodScore),
      primaryEmotion,
      timestamp: new Date().toISOString()
    };

    currentSessionHistory.push(aiTurn);
    renderChatStream(false);

    // Render Smart Reply Chips (Module 2)
    renderSmartReplies(suggestedFollowUps);

    // Check Safety Triage (Module 3)
    checkSafetyTriage(moodScore, promptText, replyText);

    // Display AI Result Summary Card
    displayAiResult({ summary, moodScore, primaryEmotion, modelUsed });

    // 4. Save Session to Firestore (/users/{userId}/sessions/{sessionId})
    await saveSessionToFirestore(summary, moodScore, primaryEmotion);

    // Refresh dashboard stats & chart
    rebuildInteractionsFromSessions();
    updateAnalyticsUI();
    renderHistoryList();
    updateChartData();

    showToast('Reflection Recorded', `${primaryEmotion} (Mood: ${moodScore}/10)`, 'success');

  } catch (err) {
    console.error('[Journal Chat Error]:', err);
    renderChatStream(false);
    showToast('Analysis Error', err.message || 'Error communicating with Gemini AI.', 'error');
  } finally {
    setLoadingState(false);
  }
}

// Save Session Document to Firestore
async function saveSessionToFirestore(latestSummary, latestMoodScore, latestEmotion) {
  if (db && currentUser && currentUser.uid !== 'guest_user_preview') {
    try {
      const docRef = doc(db, 'users', currentUser.uid, 'sessions', currentSessionId);
      const sessionData = {
        sessionId: currentSessionId,
        userId: currentUser.uid,
        messages: currentSessionHistory.map(m => ({
          role: m.role,
          text: m.parts?.[0]?.text || '',
          summary: m.summary || '',
          moodScore: m.moodScore || null,
          primaryEmotion: m.primaryEmotion || null,
          timestamp: m.timestamp || new Date().toISOString()
        })),
        latestMoodScore: Number(latestMoodScore),
        latestEmotion: latestEmotion,
        latestSummary: latestSummary,
        updatedAt: serverTimestamp(),
        createdAt: currentSessionHistory[0]?.timestamp || new Date().toISOString()
      };

      await setDoc(docRef, sessionData, { merge: true });
    } catch (fsErr) {
      console.warn('[Firestore Session Save Error]:', fsErr);
    }
  }
}

// Load User Sessions from Firestore
async function loadUserSessions() {
  userSessions = [];

  if (db && currentUser && currentUser.uid !== 'guest_user_preview') {
    try {
      const colRef = collection(db, 'users', currentUser.uid, 'sessions');
      const q = query(colRef, orderBy('updatedAt', 'desc'));
      const snapshot = await getDocs(q);

      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        let ts = new Date().toISOString();
        if (data.updatedAt && typeof data.updatedAt.toDate === 'function') {
          ts = data.updatedAt.toDate().toISOString();
        } else if (data.updatedAt) {
          ts = data.updatedAt;
        }

        userSessions.push({
          sessionId: docSnap.id,
          messages: data.messages || [],
          latestMoodScore: Number(data.latestMoodScore || 5),
          latestEmotion: data.latestEmotion || 'Reflective',
          latestSummary: data.latestSummary || '',
          timestamp: ts
        });
      });
    } catch (err) {
      console.warn('[Firestore Sessions Load Error]:', err.message);
    }
  }

  // Seed sample sessions if empty
  if (userSessions.length === 0) {
    userSessions = getSeedSessions();
  }

  // Set active session to most recent session or start new
  if (userSessions.length > 0) {
    const firstSession = userSessions[0];
    currentSessionId = firstSession.sessionId;
    currentSessionHistory = firstSession.messages.map(m => ({
      role: m.role,
      parts: [{ text: m.text }],
      summary: m.summary,
      moodScore: m.moodScore,
      primaryEmotion: m.primaryEmotion,
      timestamp: m.timestamp
    }));
    renderChatStream();
  }

  rebuildInteractionsFromSessions();
  updateAnalyticsUI();
  renderHistoryList();
  updateChartData();
}

// Rebuild flattened interactions array for Chart.js & metrics
function rebuildInteractionsFromSessions() {
  userInteractions = [];

  userSessions.forEach(session => {
    session.messages.forEach(m => {
      if (m.role === 'model' && m.moodScore) {
        userInteractions.push({
          prompt: session.messages[0]?.text || 'Session Reflection',
          summary: m.summary || session.latestSummary || 'Session reflection',
          moodScore: Number(m.moodScore),
          primaryEmotion: m.primaryEmotion || 'Reflective',
          timestamp: m.timestamp || session.timestamp
        });
      }
    });
  });

  if (userInteractions.length === 0) {
    userSessions.forEach(s => {
      userInteractions.push({
        prompt: s.messages[0]?.text || 'Session Reflection',
        summary: s.latestSummary || 'Session reflection',
        moodScore: s.latestMoodScore || 5,
        primaryEmotion: s.latestEmotion || 'Reflective',
        timestamp: s.timestamp
      });
    });
  }
}

// Seed Demo Chat Sessions
function getSeedSessions() {
  const now = Date.now();
  const dayMs = 86400000;
  return [
    {
      sessionId: 'session_demo_1',
      messages: [
        {
          role: 'user',
          text: 'Finished a major project deliverable ahead of schedule today! Enjoyed a peaceful evening walk in the park.',
          timestamp: new Date(now - dayMs * 3).toISOString()
        },
        {
          role: 'model',
          text: 'That sounds like a wonderful feeling! Completing a major goal gives you well-earned peace of mind. What stood out most during your walk?',
          summary: 'You are experiencing a strong sense of accomplishment and tranquil contentment.',
          moodScore: 9,
          primaryEmotion: 'Joy',
          timestamp: new Date(now - dayMs * 3 + 60000).toISOString()
        }
      ],
      latestMoodScore: 9,
      latestEmotion: 'Joy',
      latestSummary: 'Strong sense of accomplishment and tranquil contentment.',
      timestamp: new Date(now - dayMs * 3).toISOString()
    },
    {
      sessionId: 'session_demo_2',
      messages: [
        {
          role: 'user',
          text: 'Felt slightly overwhelmed by incoming emails and back-to-back team meetings during the afternoon.',
          timestamp: new Date(now - dayMs * 2).toISOString()
        },
        {
          role: 'model',
          text: 'It is completely understandable to feel drained after a heavy schedule. Remember to take brief breathing breaks between focus tasks.',
          summary: 'Workplace volume created temporary mental fatigue.',
          moodScore: 4,
          primaryEmotion: 'Overwhelmed',
          timestamp: new Date(now - dayMs * 2 + 60000).toISOString()
        }
      ],
      latestMoodScore: 4,
      latestEmotion: 'Overwhelmed',
      latestSummary: 'Workplace volume created temporary mental fatigue.',
      timestamp: new Date(now - dayMs * 2).toISOString()
    },
    {
      sessionId: 'session_demo_3',
      messages: [
        {
          role: 'user',
          text: 'Reconnected with an old friend over coffee and discussed past memories.',
          timestamp: new Date(now - dayMs * 1).toISOString()
        },
        {
          role: 'model',
          text: 'Nostalgic conversations with close friends are great for emotional grounding. How did it feel catching up on life paths?',
          summary: 'Warm interpersonal connections brought nostalgia and social fulfillment.',
          moodScore: 8,
          primaryEmotion: 'Nostalgia',
          timestamp: new Date(now - dayMs * 1 + 60000).toISOString()
        }
      ],
      latestMoodScore: 8,
      latestEmotion: 'Nostalgia',
      latestSummary: 'Warm interpersonal connections brought nostalgia and social fulfillment.',
      timestamp: new Date(now - dayMs * 1).toISOString()
    }
  ];
}

// Display Latest AI Result Card
function displayAiResult({ summary, moodScore, primaryEmotion, modelUsed }) {
  aiResultCard.classList.remove('hidden');
  aiEmotionBadge.textContent = primaryEmotion;
  aiMoodScore.textContent = moodScore;
  aiSummaryText.textContent = `"${summary}"`;
  aiModelBadge.textContent = modelUsed || 'gemini-3.6-flash';

  aiEmotionBadge.className = 'inline-block mt-1.5 px-3 py-1 text-xs font-bold rounded-lg border ';
  if (moodScore >= 7) {
    aiEmotionBadge.classList.add('bg-emerald-500/10', 'text-emerald-400', 'border-emerald-500/30');
  } else if (moodScore >= 5) {
    aiEmotionBadge.classList.add('bg-amber-500/10', 'text-amber-400', 'border-amber-500/30');
  } else {
    aiEmotionBadge.classList.add('bg-rose-500/10', 'text-rose-400', 'border-rose-500/30');
  }
}

// Module 3: Calculate Check-in Streak
function calculateCheckInStreak() {
  if (userSessions.length === 0 && userInteractions.length === 0) {
    metricStreak.textContent = '🔥 0';
    metricStreakStatus.textContent = '0 consecutive reflection days';
    return 0;
  }

  // Extract all timestamps
  const timestamps = [];
  userSessions.forEach(s => {
    if (s.timestamp) timestamps.push(new Date(s.timestamp));
    (s.messages || []).forEach(m => {
      if (m.timestamp) timestamps.push(new Date(m.timestamp));
    });
  });

  // Unique calendar days (YYYY-MM-DD)
  const uniqueDays = new Set();
  timestamps.forEach(d => {
    if (!isNaN(d.getTime())) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      uniqueDays.add(`${year}-${month}-${day}`);
    }
  });

  const sortedDates = Array.from(uniqueDays).sort().reverse(); // newest first
  if (sortedDates.length === 0) {
    metricStreak.textContent = '🔥 0';
    metricStreakStatus.textContent = '0 consecutive reflection days';
    return 0;
  }

  const todayStr = new Date().toISOString().split('T')[0];
  const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  let streak = 0;
  let currentDate = sortedDates.includes(todayStr) ? new Date() : (sortedDates.includes(yesterdayStr) ? new Date(Date.now() - 86400000) : null);

  if (currentDate) {
    while (true) {
      const dateStr = currentDate.toISOString().split('T')[0];
      if (uniqueDays.has(dateStr)) {
        streak++;
        currentDate.setDate(currentDate.getDate() - 1);
      } else {
        break;
      }
    }
  }

  metricStreak.textContent = `🔥 ${streak}`;
  metricStreakStatus.textContent = `${streak} consecutive reflection day${streak === 1 ? '' : 's'}`;
  return streak;
}

// Update Top Analytics Metrics Overview
function updateAnalyticsUI() {
  const count = userInteractions.length;

  // Update Streak (Module 3)
  calculateCheckInStreak();

  if (count === 0) {
    metricAvgScore.textContent = '--';
    metricAvgStatus.textContent = 'Awaiting entries';
    metricTopEmotion.textContent = '--';
    return;
  }

  const sum = userInteractions.reduce((acc, curr) => acc + (curr.moodScore || 5), 0);
  const avg = (sum / count).toFixed(1);
  metricAvgScore.textContent = avg;

  if (avg >= 7.5) {
    metricAvgStatus.textContent = 'Positive & Uplifted';
    metricAvgStatus.className = 'text-xs font-semibold text-emerald-400 mt-1 block';
  } else if (avg >= 5.0) {
    metricAvgStatus.textContent = 'Balanced & Steady';
    metricAvgStatus.className = 'text-xs font-semibold text-amber-400 mt-1 block';
  } else {
    metricAvgStatus.textContent = 'Reflective / Low';
    metricAvgStatus.className = 'text-xs font-semibold text-rose-400 mt-1 block';
  }

  // Calculate Dominant Emotion
  const emotionCounts = {};
  userInteractions.forEach(item => {
    const emo = item.primaryEmotion || 'Reflective';
    emotionCounts[emo] = (emotionCounts[emo] || 0) + 1;
  });

  let topEmo = '--';
  let maxCount = 0;
  Object.entries(emotionCounts).forEach(([emo, cnt]) => {
    if (cnt > maxCount) {
      maxCount = cnt;
      topEmo = emo;
    }
  });

  metricTopEmotion.textContent = topEmo;
  metricTopEmotionSub.textContent = `${maxCount} reflection${maxCount === 1 ? '' : 's'} recorded`;
}

// Module 4: Render 28-Day Activity Heatmap Grid
function renderHeatmap() {
  if (!heatmapGrid) return;

  const now = new Date();
  const dayMs = 86400000;
  const days = [];

  // Generate array for past 28 days (4 weeks x 7 days)
  for (let i = 27; i >= 0; i--) {
    const d = new Date(now.getTime() - i * dayMs);
    const dateStr = d.toISOString().split('T')[0];
    const displayLabel = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    days.push({ dateStr, displayLabel, interactions: [] });
  }

  // Map interactions to days
  userInteractions.forEach(item => {
    const d = new Date(item.timestamp);
    if (!isNaN(d.getTime())) {
      const dStr = d.toISOString().split('T')[0];
      const found = days.find(x => x.dateStr === dStr);
      if (found) {
        found.interactions.push(item);
      }
    }
  });

  let activeCount = 0;
  heatmapGrid.innerHTML = days.map(d => {
    const count = d.interactions.length;
    if (count > 0) activeCount++;

    let bgClass = 'bg-slate-800/80 border-slate-700/60';
    let avgMood = 0;

    if (count > 0) {
      avgMood = d.interactions.reduce((acc, curr) => acc + (curr.moodScore || 5), 0) / count;
      if (avgMood >= 7.5) bgClass = 'bg-amber-400 text-slate-950 font-bold border-yellow-300 shadow-xs shadow-amber-400/30';
      else if (avgMood >= 5.0) bgClass = 'bg-amber-600/90 text-amber-100 font-semibold border-amber-500';
      else bgClass = 'bg-amber-900/80 text-amber-200 border-amber-700';
    }

    const titleText = `${d.displayLabel}: ${count} reflection${count === 1 ? '' : 's'}${count > 0 ? ` (Avg Mood: ${avgMood.toFixed(1)}/10)` : ''}`;

    return `
      <div 
        class="w-full aspect-square rounded-lg ${bgClass} border flex items-center justify-center text-[10px] transition transform hover:scale-105 cursor-pointer relative group"
        title="${titleText}"
      >
        <span class="opacity-80">${d.displayLabel.split(' ')[1]}</span>
      </div>
    `;
  }).join('');

  if (heatmapSummaryText) {
    heatmapSummaryText.textContent = `${activeCount} / 28 Days Active`;
  }
}

// Module 4: Export Current Session to Markdown
function exportJournalSession() {
  if (currentSessionHistory.length === 0) {
    showToast('Export Journal', 'Current chat session has no messages to export.', 'info');
    return;
  }

  const dt = new Date();
  const dateStr = dt.toISOString().split('T')[0];
  const sessionTime = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  let markdownContent = `# Reflexa Journal Session - ${dateStr}\n`;
  markdownContent += `*Exported on ${dateStr} at ${sessionTime}*\n`;
  markdownContent += `*Session ID: ${currentSessionId}*\n\n`;
  markdownContent += `---\n\n`;

  let turnIndex = 1;
  currentSessionHistory.forEach(turn => {
    const role = turn.role === 'user' ? 'User' : 'Reflexa AI';
    const text = turn.parts?.[0]?.text || turn.text || '';
    const ts = turn.timestamp ? new Date(turn.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

    markdownContent += `### ${role} (${ts})\n`;
    markdownContent += `${text}\n\n`;

    if (turn.role === 'model') {
      if (turn.primaryEmotion || turn.moodScore) {
        markdownContent += `* **Primary Emotion:** ${turn.primaryEmotion || 'Reflective'}\n`;
        markdownContent += `* **Mood Score:** ${turn.moodScore || 5}/10\n`;
      }
      if (turn.summary) {
        markdownContent += `* **Key Takeaway:** "${turn.summary}"\n`;
      }
      markdownContent += `\n`;
    }

    markdownContent += `---\n\n`;
  });

  markdownContent += `*Reflexa Personal Gemini Journal & Mood Analytics*\n`;

  // Trigger browser file download
  const blob = new Blob([markdownContent], { type: 'text/markdown;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Reflexa_Journal_${dateStr}_${currentSessionId}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast('Journal Exported', `Downloaded session as markdown (.md) file.`, 'success');
}

// Module 2: Handle Weekly Insights Synthesis
async function handleWeeklySummary() {
  if (!weeklyModal) return;

  // Gather past 7 days of entries
  const recentEntries = userInteractions.slice(0, 10).map(item => ({
    timestamp: item.timestamp,
    prompt: item.prompt,
    summary: item.summary,
    moodScore: item.moodScore,
    primaryEmotion: item.primaryEmotion
  }));

  if (recentEntries.length === 0) {
    showToast('Weekly Synthesis', 'Log at least one journal entry to generate weekly insights.', 'info');
    return;
  }

  // Open modal in loading state
  weeklyModal.classList.remove('hidden');
  weeklyTrendBadge.textContent = 'Analyzing with Gemini...';
  weeklySummaryText.textContent = 'Synthesizing your past journal entries to identify behavioral patterns and emotional themes...';
  weeklyThemesList.innerHTML = '<div class="p-3 bg-[#0b0f1a] rounded-xl border border-slate-800 text-xs text-slate-400 animate-pulse">Extracting behavioral themes...</div>';
  weeklyActionItemsList.innerHTML = '<div class="p-3 bg-[#0b0f1a] rounded-xl border border-slate-800 text-xs text-slate-400 animate-pulse">Formulating wellness recommendations...</div>';

  try {
    const res = await fetch('/api/weekly-summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries: recentEntries })
    });

    const result = await res.json();
    if (!res.ok || !result.success) {
      throw new Error(result.error || 'Failed to generate weekly summary.');
    }

    const { summary, themes, actionItems, overallMoodTrend } = result.data;

    weeklyTrendBadge.textContent = overallMoodTrend || 'Resilient & Balanced';
    weeklySummaryText.textContent = summary || 'Over the past week, your reflections demonstrate high emotional awareness and steady resilience.';

    weeklyThemesList.innerHTML = (themes || []).map(theme => `
      <div class="p-3 bg-[#0b0f1a] rounded-xl border border-slate-800 text-xs text-slate-200 font-medium flex items-center space-x-2.5">
        <i data-lucide="sparkles" class="w-4 h-4 text-amber-400 shrink-0"></i>
        <span>${escapeHtml(theme)}</span>
      </div>
    `).join('');

    weeklyActionItemsList.innerHTML = (actionItems || []).map(action => `
      <div class="p-3 bg-[#0b0f1a] rounded-xl border border-slate-800 text-xs text-slate-200 font-medium flex items-center space-x-2.5">
        <i data-lucide="check-circle-2" class="w-4 h-4 text-emerald-400 shrink-0"></i>
        <span>${escapeHtml(action)}</span>
      </div>
    `).join('');

    if (window.lucide) window.lucide.createIcons();

  } catch (err) {
    console.error('[Weekly Synthesis Error]:', err);
    weeklySummaryText.textContent = 'Unable to complete synthesis at this moment. Please try again in a few moments.';
    showToast('Synthesis Error', err.message || 'Error communicating with Gemini AI.', 'error');
  }
}

// Render Past Reflection Session Log List
function renderHistoryList() {
  historyCount.textContent = `${userSessions.length} sessions`;

  if (userSessions.length === 0) {
    historyList.innerHTML = `
      <div class="text-center py-12 text-slate-500 text-sm">
        <i data-lucide="inbox" class="w-8 h-8 mx-auto mb-2 opacity-40"></i>
        <p>No chat sessions recorded yet. Start a conversation to begin tracking!</p>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  historyList.innerHTML = userSessions.map(session => {
    const dt = new Date(session.timestamp);
    const dateFormatted = isNaN(dt.getTime()) ? 'Recent' : dt.toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    const score = session.latestMoodScore || 5;
    let scoreColorClass = 'bg-amber-500/10 text-amber-300 border-amber-500/30';
    if (score >= 7) scoreColorClass = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
    if (score <= 4) scoreColorClass = 'bg-rose-500/10 text-rose-400 border-rose-500/30';

    const isActive = session.sessionId === currentSessionId;
    const firstUserMsg = session.messages.find(m => m.role === 'user')?.text || 'Reflection Session';

    return `
      <div 
        data-session-id="${session.sessionId}"
        class="session-card p-4 rounded-xl border transition cursor-pointer ${isActive ? 'bg-amber-500/10 border-amber-500/40 shadow-md' : 'bg-[#161f33] hover:bg-[#1c273e] border-slate-800'}"
      >
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center space-x-2">
            <span class="px-2.5 py-0.5 text-xs font-bold rounded-full border ${scoreColorClass}">
              ${session.latestEmotion || 'Reflective'}
            </span>
            <span class="text-xs text-slate-400 font-semibold">${session.messages.length} msgs</span>
          </div>
          <span class="text-[11px] text-slate-500 font-medium">${dateFormatted}</span>
        </div>
        
        <p class="text-xs text-slate-200 font-medium line-clamp-2 mb-2">"${escapeHtml(firstUserMsg)}"</p>
        
        ${session.latestSummary ? `
          <div class="pt-2 border-t border-slate-800 text-[11px] text-amber-300 font-medium italic flex items-start space-x-1.5">
            <i data-lucide="sparkles" class="w-3.5 h-3.5 mt-0.5 text-amber-400 shrink-0"></i>
            <span>${escapeHtml(session.latestSummary)}</span>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');

  // Attach click listener to load session
  document.querySelectorAll('.session-card').forEach(card => {
    card.addEventListener('click', () => {
      const sId = card.getAttribute('data-session-id');
      const found = userSessions.find(s => s.sessionId === sId);
      if (found) {
        currentSessionId = found.sessionId;
        currentSessionHistory = found.messages.map(m => ({
          role: m.role,
          parts: [{ text: m.text }],
          summary: m.summary,
          moodScore: m.moodScore,
          primaryEmotion: m.primaryEmotion,
          timestamp: m.timestamp
        }));
        renderChatStream();
        renderHistoryList();
        showToast('Session Loaded', `Opened chat session with ${found.messages.length} messages.`, 'info');
      }
    });
  });

  if (window.lucide) window.lucide.createIcons();
}

// Initialize Dark Chart.js Line Graph for Mood Trends
function initChart() {
  const ctx = document.getElementById('moodChart')?.getContext('2d');
  if (!ctx) return;

  const gradient = ctx.createLinearGradient(0, 0, 0, 250);
  gradient.addColorStop(0, 'rgba(245, 158, 11, 0.25)');
  gradient.addColorStop(1, 'rgba(245, 158, 11, 0.0)');

  moodChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: 'Mood Score (1-10)',
        data: [],
        borderColor: '#f59e0b',
        borderWidth: 3,
        pointBackgroundColor: '#f59e0b',
        pointBorderColor: '#101726',
        pointBorderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 7,
        tension: 0.35,
        fill: true,
        backgroundColor: gradient
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0b0f1a',
          borderColor: '#f59e0b',
          borderWidth: 1,
          titleColor: '#fbbf24',
          bodyColor: '#f1f5f9',
          padding: 12,
          displayColors: false,
          callbacks: {
            label: (context) => {
              const idx = context.dataIndex;
              const interaction = sortedInteractions()[idx];
              const emo = interaction?.primaryEmotion ? ` (${interaction.primaryEmotion})` : '';
              return `Mood Score: ${context.parsed.y}/10${emo}`;
            }
          }
        }
      },
      scales: {
        y: {
          min: 1,
          max: 10,
          ticks: {
            stepSize: 1,
            color: '#94a3b8',
            font: { family: 'Plus Jakarta Sans', size: 11, weight: '500' }
          },
          grid: {
            color: 'rgba(255, 255, 255, 0.06)'
          }
        },
        x: {
          ticks: {
            color: '#94a3b8',
            font: { family: 'Plus Jakarta Sans', size: 10, weight: '500' },
            maxRotation: 0
          },
          grid: {
            display: false
          }
        }
      }
    }
  });
}

// Sorted Interactions Ascending for Chronological Trend Line
function sortedInteractions() {
  return [...userInteractions].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}

// Update Chart Data with Chronological Interactions
function updateChartData() {
  if (!moodChartInstance) return;

  const sorted = sortedInteractions();
  const labels = sorted.map(item => {
    const dt = new Date(item.timestamp);
    return isNaN(dt.getTime()) ? 'Entry' : dt.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  });

  const scores = sorted.map(item => item.moodScore || 5);

  moodChartInstance.data.labels = labels;
  moodChartInstance.data.datasets[0].data = scores;
  moodChartInstance.update();
}

// Loading State Helper
function setLoadingState(loading) {
  if (loading) {
    btnSubmitJournal.disabled = true;
    btnSubmitJournal.innerHTML = `
      <svg class="animate-spin h-4 w-4 text-slate-950" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
    `;
  } else {
    btnSubmitJournal.disabled = false;
    btnSubmitJournal.innerHTML = `
      <i data-lucide="send" class="w-4 h-4"></i>
    `;
    if (window.lucide) window.lucide.createIcons();
  }
}

// Notification Toast Helper
function showToast(title, message, type = 'info') {
  const toast = document.getElementById('toast');
  const toastTitle = document.getElementById('toastTitle');
  const toastMessage = document.getElementById('toastMessage');
  const toastIcon = document.getElementById('toastIcon');

  if (!toast) return;

  toastTitle.textContent = title;
  toastMessage.textContent = message;

  if (type === 'error') {
    toastIcon.innerHTML = `<i data-lucide="alert-circle" class="w-5 h-5 text-rose-400"></i>`;
  } else if (type === 'success') {
    toastIcon.innerHTML = `<i data-lucide="check-circle" class="w-5 h-5 text-emerald-400"></i>`;
  } else {
    toastIcon.innerHTML = `<i data-lucide="info" class="w-5 h-5 text-amber-400"></i>`;
  }
  if (window.lucide) window.lucide.createIcons();

  toast.classList.remove('translate-y-20', 'opacity-0');

  setTimeout(() => {
    toast.classList.add('translate-y-20', 'opacity-0');
  }, 4000);
}

// Utility Function for XSS Prevention
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
