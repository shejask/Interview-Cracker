// Shared recording utilities that can be reused across components

export type RecordingState = {
  isRecording: boolean;
  transcript: string;
  setIsRecording: (val: boolean) => void;
  setTranscript: (val: string) => void;
  setAnswer: (val: string) => void;
  recognitionRef: React.MutableRefObject<any>;
  sendToAI?: (transcript: string) => Promise<void>; // Optional callback to process transcript
};

/**
 * Start recording using Web Speech API
 */
export function startRecording(state: RecordingState) {
  const { isRecording, setIsRecording, setTranscript, setAnswer, recognitionRef } = state;

  if (isRecording) {
    console.warn("Recording already in progress");
    return;
  }

  const win = window as any;
  const SpeechRecognition = win.SpeechRecognition || win.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    alert("SpeechRecognition not supported in this browser. Use Chrome or Edge.");
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.interimResults = true;
  recognition.continuous = true;

  let currentTranscript = "";

  recognition.onstart = () => {
    console.log("🎙️ Recording started");
    setIsRecording(true);
    setAnswer("Listening...");
  };

  recognition.onresult = (event: any) => {
    let finalTranscript = "";
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      const res = event.results[i];
      if (res.isFinal) finalTranscript += res[0].transcript;
    }
    currentTranscript += finalTranscript ? (currentTranscript ? " " : "") + finalTranscript : "";
    setTranscript(currentTranscript);
  };

  recognition.onerror = (e: any) => {
    console.error("🎙️ SpeechRecognition error:", e);
    stopRecording(state);
  };

  recognition.onend = () => {
    console.log("⏹ Recording ended");
    setIsRecording(false);
    recognitionRef.current = null;
    
    // If sendToAI callback is provided, process the transcript
    if (state.sendToAI && currentTranscript.trim()) {
      console.log("📤 Sending transcript to AI:", currentTranscript);
      state.sendToAI(currentTranscript);
    }
  };

  try {
    recognition.start();
    recognitionRef.current = recognition;
  } catch (e) {
    console.warn("Error starting recognition:", e);
  }
}

/**
 * Stop recording
 */
export function stopRecording(state: RecordingState) {
  const { setIsRecording, recognitionRef } = state;

  const recognition = recognitionRef.current;
  if (recognition) {
    try {
      recognition.stop();
    } catch (e) {
      console.warn("Error stopping recognition:", e);
    }
    recognitionRef.current = null;
  }
  setIsRecording(false);
}
