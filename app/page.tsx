"use client";
import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { ref, push, query, orderByChild, limitToLast, get } from "firebase/database";
import { database } from "@/firebase/config";

export default function Home() {
  const [details, setDetails] = useState("Senior Software Engineer with 5+ years of experience in React, Node.js, and TypeScript. Specialized in building scalable web applications and microservices. Strong background in system design, database optimization, and cloud infrastructure (AWS, Docker). Passionate about clean code, testing, and mentoring junior developers.");
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [answer, setAnswer] = useState<string>("");
  const [showChatHistory, setShowChatHistory] = useState(false);
  const [chatHistory, setChatHistory] = useState<any[]>([]);
  const [loadingChats, setLoadingChats] = useState(false);
  const [expandedChats, setExpandedChats] = useState<Record<string, boolean>>({});
  const [showJobContext, setShowJobContext] = useState(false);
  const [chatHistoryError, setChatHistoryError] = useState<string>("");
  const [saveStatus, setSaveStatus] = useState<string>("");
  const [isEditingContext, setIsEditingContext] = useState(false);
  const recognitionRef = useRef<any>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Memoize details check
  const hasDetails = useMemo(() => details.trim().length > 0, [details]);

  // Load saved job context from localStorage on mount
  useEffect(() => {
    const savedDetails = localStorage.getItem('jobContext');
    if (savedDetails) {
      setDetails(savedDetails);
    }
  }, []);

  // Auto-start recording on component mount - REMOVED automatic start
  // This was causing issues, let users manually start recording

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Optimized chat history fetcher with caching
  const fetchChatHistory = useCallback(async () => {
    setLoadingChats(true);
    setChatHistoryError("");
    
    try {
      const interviewsRef = ref(database, "interviews");
      const interviewsQuery = query(interviewsRef, orderByChild("createdAt"), limitToLast(50));
      
      const snapshot = await get(interviewsQuery);
      
      if (snapshot.exists()) {
        const data = snapshot.val();
        const chats = Object.entries(data).map(([key, value]: [string, any]) => ({
          id: key,
          ...value,
          createdAt: new Date(value.createdAt),
        }));
        
        chats.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        setChatHistory(chats);
      } else {
        setChatHistory([]);
      }
    } catch (error: any) {
      console.error("Error fetching chat history:", error);
      const msg = String(error.message || "");
      
      if (error.code === "PERMISSION_DENIED" || msg.includes("permission")) {
        setChatHistoryError("Permission denied. Check Realtime Database rules.");
      } else if (msg.includes("index")) {
        try {
          const fallbackSnapshot = await get(ref(database, 'interviews'));
          if (fallbackSnapshot.exists()) {
            const data = fallbackSnapshot.val();
            const chats = Object.entries(data).map(([key, value]: [string, any]) => ({
              id: key,
              ...value,
              createdAt: new Date(value.createdAt),
            }));
            chats.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
            setChatHistory(chats);
            setChatHistoryError("Index not defined. Add .indexOn to Database rules.");
          }
        } catch {
          setChatHistoryError("Failed to load chat history.");
        }
      } else {
        setChatHistoryError(`Failed to load: ${msg}`);
      }
    } finally {
      setLoadingChats(false);
    }
  }, []);

  // Fetch chat history when modal opens
  useEffect(() => {
    if (showChatHistory) {
      fetchChatHistory();
    }
  }, [showChatHistory, fetchChatHistory]);

  // Optimized speech recognition
  const startRecording = useCallback(() => {
    const win = window as any;
    const SpeechRecognition = win.SpeechRecognition || win.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      alert("SpeechRecognition not supported. Use Chrome or Edge.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = true;

    let currentTranscript = "";

    recognition.onresult = (event: any) => {
      let finalTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        }
      }
      if (finalTranscript) {
        currentTranscript += (currentTranscript ? " " : "") + finalTranscript;
        setTranscript(currentTranscript);
      }
    };

    recognition.onerror = () => {
      stopRecording();
    };

    recognition.onend = () => {
      setIsRecording(false);
      recognitionRef.current = null;
      if (currentTranscript.trim()) {
        sendToAI(currentTranscript);
      }
    };

    recognition.start();
    recognitionRef.current = recognition;
    setIsRecording(true);
    setTranscript("");
    setAnswer("Listening...");
  }, []);

  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        console.warn("Error stopping recognition", e);
      }
      recognitionRef.current = null;
    }
    setIsRecording(false);
  }, []);

  // Non-blocking Firebase save
  const saveToFirebase = useCallback(async (data: any) => {
    try {
      const interviewsRef = ref(database, "interviews");
      await push(interviewsRef, {
        ...data,
        jobContext: details // Save job context with each interview
      });
      setSaveStatus("✅ Saved!");
      saveTimeoutRef.current = setTimeout(() => setSaveStatus(""), 3000);
    } catch (error: any) {
      console.error("Firebase save error:", error);
      const errorMsg = error.code === "PERMISSION_DENIED" 
        ? "⚠️ Permission denied" 
        : "⚠️ Save failed";
      setSaveStatus(errorMsg);
    }
  }, [details]);

  // OPTIMIZED: Stream AI response + parallel Firebase save
  const sendToAI = useCallback(async (transcriptText: string) => {
    // Check details directly from state, not memoized value
    if (!details || details.trim().length === 0) {
      setAnswer("Error: Please fill in job context first!");
      return;
    }

    // Cancel previous request if exists
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setAnswer("⚡ Processing...");
    setSaveStatus("");
    
    const startTime = Date.now();

    try {
      const res = await fetch("/api/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ details, transcript: transcriptText }),
        signal: abortControllerRef.current.signal,
      });

      if (!res.ok) {
        const errBody = await res.text();
        setAnswer(`Error: ${errBody}`);
        return;
      }

      const contentType = res.headers.get("content-type") || "";
      let aiAnswer = "";

      // Handle streaming if supported
      if (res.body && contentType.includes("text/plain")) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value, { stream: true });
          aiAnswer += chunk;
          setAnswer(aiAnswer); // Update in real-time
        }
      } else if (contentType.includes("application/json")) {
        const data = await res.json();
        aiAnswer = data.answer || data.error || "Unexpected response";
        setAnswer(aiAnswer);
      } else {
        aiAnswer = await res.text();
        setAnswer(aiAnswer || "Empty response");
      }

      const responseTime = Date.now() - startTime;
      console.log(`⚡ Response received in ${responseTime}ms`);

      // NON-BLOCKING: Save to Firebase in parallel
      setSaveStatus("💾 Saving...");
      saveToFirebase({
        details,
        transcript: transcriptText,
        answer: aiAnswer,
        createdAt: new Date().toISOString(),
      });

    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('Request cancelled');
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      setAnswer(`Error: ${msg}`);
    }
  }, [details, saveToFirebase]); // Add details as dependency

  const handleSend = useCallback(async () => {
    if (!transcript.trim()) {
      return alert("No transcript available. Please record first.");
    }
    await sendToAI(transcript);
  }, [transcript, sendToAI]);

  // Save job context to localStorage and close modal
  const saveJobContext = useCallback(() => {
    localStorage.setItem('jobContext', details);
    setShowJobContext(false);
    setIsEditingContext(false);
    setSaveStatus("✅ Job context saved!");
    setTimeout(() => setSaveStatus(""), 2000);
  }, [details]);

  // Reset to default job context
  const resetJobContext = useCallback(() => {
    const defaultContext = "Senior Software Engineer with 5+ years of experience in React, Node.js, and TypeScript. Specialized in building scalable web applications and microservices. Strong background in system design, database optimization, and cloud infrastructure (AWS, Docker). Passionate about clean code, testing, and mentoring junior developers.";
    setDetails(defaultContext);
    localStorage.setItem('jobContext', defaultContext);
  }, []);

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-gray-100 p-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-white">
            🎙️ Live Interview AI
          </h1>
          <div className="flex gap-3">
            <button
              onClick={() => setShowJobContext(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-full font-semibold transition"
              title="Job Context"
            >
              📋
            </button>
            <button
              onClick={() => setShowChatHistory(true)}
              className="bg-purple-600 hover:bg-purple-700 text-white p-3 rounded-full font-semibold transition"
              title="Chat History"
            >
              💬
            </button>
          </div>
        </div>

        {saveStatus && (
          <div className={`mb-4 p-3 rounded ${
            saveStatus.includes("✅") ? "bg-green-900/50 border border-green-700 text-green-200" :
            saveStatus.includes("⚠️") ? "bg-red-900/50 border border-red-700 text-red-200" :
            "bg-blue-900/50 border border-blue-700 text-blue-200"
          }`}>
            {saveStatus}
          </div>
        )}

        {showJobContext && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-[#1a1a1a] border border-gray-700 rounded-lg shadow-xl max-w-2xl w-full">
              <div className="flex justify-between items-center p-6 border-b border-gray-700">
                <h2 className="text-2xl font-bold text-white">📋 Job Context</h2>
                <button
                  onClick={() => {
                    setShowJobContext(false);
                    setIsEditingContext(false);
                  }}
                  className="text-gray-400 hover:text-white text-2xl"
                >
                  ✕
                </button>
              </div>
              <div className="p-6">
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm text-gray-400">Your job role and experience:</label>
                  <div className="flex gap-2">
                    {!isEditingContext ? (
                      <button
                        onClick={() => setIsEditingContext(true)}
                        className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded transition"
                      >
                        ✏️ Edit
                      </button>
                    ) : (
                      <button
                        onClick={resetJobContext}
                        className="text-xs bg-gray-600 hover:bg-gray-700 text-white px-3 py-1 rounded transition"
                      >
                        🔄 Reset to Default
                      </button>
                    )}
                  </div>
                </div>
                
                {isEditingContext ? (
                  <textarea
                    placeholder="e.g., Senior Software Engineer, 5 years React & Node.js..."
                    value={details}
                    onChange={(e) => setDetails(e.target.value)}
                    className="w-full p-3 bg-[#0a0a0a] border border-gray-700 rounded text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
                    rows={6}
                  />
                ) : (
                  <div className="w-full p-3 bg-[#0a0a0a] border border-gray-700 rounded text-gray-300 whitespace-pre-wrap min-h-[144px]">
                    {details}
                  </div>
                )}
                
                {!hasDetails && (
                  <p className="text-sm text-yellow-400 mt-2">⚠️ Fill this to start recording</p>
                )}
                {hasDetails && isEditingContext && (
                  <p className="text-sm text-green-400 mt-2">✓ Ready to save!</p>
                )}
                
                <button
                  onClick={saveJobContext}
                  className="mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-semibold transition"
                >
                  {isEditingContext ? "💾 Save Changes" : "✓ Done"}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="my-6">
          <div className="flex gap-3 justify-center mb-3">
            <button
              onClick={isRecording ? stopRecording : startRecording}
              disabled={!hasDetails}
              className={`px-5 py-2 rounded font-semibold transition ${
                isRecording
                  ? "bg-red-600 hover:bg-red-700"
                  : hasDetails
                  ? "bg-green-600 hover:bg-green-700"
                  : "bg-gray-600 cursor-not-allowed opacity-50"
              } text-white`}
            >
              {isRecording ? "⏹ Stop" : "🎤 Record"}
            </button>

            <button
              onClick={handleSend}
              className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded font-semibold transition"
            >
              🚀 Send
            </button>
          </div>

          <p className="text-sm text-gray-400 mb-1">Transcript:</p>
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            className="w-full p-3 bg-[#1a1a1a] border border-gray-700 rounded text-gray-100 focus:outline-none focus:border-blue-500"
            rows={4}
          />
          <button
            onClick={() => setTranscript("")}
            className="mt-2 bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm font-semibold transition"
          >
            🗑️ Clear
          </button>
        </div>

        <div className="mt-8 p-5 rounded-lg bg-[#121212] border border-gray-700 shadow-lg">
          <h2 className="text-lg font-semibold text-blue-400 mb-2">💡 AI Answer</h2>
          <div className="whitespace-pre-wrap text-gray-100 leading-relaxed">
            {answer || <span className="text-gray-500">Waiting...</span>}
          </div>
        </div>

        {showChatHistory && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-[#1a1a1a] border border-gray-700 rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
              <div className="flex justify-between items-center p-6 border-b border-gray-700">
                <h2 className="text-2xl font-bold text-white">📊 Chat History</h2>
                <div className="flex gap-2">
                  <button
                    onClick={fetchChatHistory}
                    className="text-gray-400 hover:text-white text-lg transition"
                    title="Refresh"
                  >
                    🔄
                  </button>
                  <button
                    onClick={() => setShowChatHistory(false)}
                    className="text-gray-400 hover:text-white text-2xl"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div className="overflow-y-auto flex-1 p-6">
                {chatHistoryError && (
                  <div className="bg-red-900/50 border border-red-700 text-red-200 p-3 rounded mb-4 text-sm">
                    {chatHistoryError}
                  </div>
                )}
                {loadingChats ? (
                  <div className="flex justify-center items-center h-32">
                    <p className="text-gray-400">Loading...</p>
                  </div>
                ) : chatHistory.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-gray-400">No interviews yet. Start recording!</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {chatHistory.map((chat, index) => (
                      <div
                        key={chat.id}
                        className="bg-[#121212] border border-gray-700 rounded p-4 hover:border-blue-500 transition"
                      >
                        <div className="mb-3 pb-3 border-b border-gray-600">
                          <span className="text-gray-400 text-sm">
                            #{chatHistory.length - index} • {chat.createdAt?.toLocaleDateString?.()} {chat.createdAt?.toLocaleTimeString?.()}
                          </span>
                        </div>
                        <div className="mb-4">
                          <p className="text-gray-400 text-xs uppercase mb-1">📝 Your Answer:</p>
                          <p className="text-gray-300 text-sm whitespace-pre-wrap">{chat.transcript}</p>
                        </div>
                        <div>
                          <p className="text-gray-400 text-xs uppercase mb-1">💡 AI Feedback:</p>
                          {(() => {
                            const raw = chat.answer || "";
                            const expanded = expandedChats[chat.id];
                            const limit = 400;
                            const needsTruncate = raw.length > limit;
                            const display = needsTruncate && !expanded ? raw.substring(0, limit) + "..." : raw;

                            return (
                              <div>
                                <p className="text-blue-300 text-sm whitespace-pre-wrap">{display || "(no feedback)"}</p>
                                {needsTruncate && (
                                  <button
                                    onClick={() => setExpandedChats((s) => ({ ...s, [chat.id]: !s[chat.id] }))}
                                    className="mt-2 text-sm text-gray-400 hover:text-white"
                                  >
                                    {expanded ? 'Show less' : 'Show more'}
                                  </button>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 flex gap-3 bg-[#1a1a1a] border border-gray-700 rounded-full px-4 py-3 shadow-lg z-40 md:hidden">
          <button
            onClick={isRecording ? stopRecording : startRecording}
            disabled={!hasDetails}
            className={`px-4 py-2 rounded-full font-semibold text-sm transition ${
              isRecording
                ? "bg-red-600 hover:bg-red-700"
                : hasDetails
                ? "bg-green-600 hover:bg-green-700"
                : "bg-gray-600 cursor-not-allowed opacity-50"
            } text-white`}
          >
            {isRecording ? "⏹" : "🎤"}
          </button>

          <button
            onClick={handleSend}
            className="px-4 py-2 rounded-full font-semibold text-sm bg-blue-600 hover:bg-blue-700 text-white transition"
          >
            🚀
          </button>
        </div>
      </div>
    </main>
  );
}