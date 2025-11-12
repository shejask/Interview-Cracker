"use client";
import { useEffect } from "react";
import { ref, onValue } from "firebase/database";
import { database } from "@/firebase/config";
import { startRecording, stopRecording, type RecordingState } from "@/lib/recording";

interface RemoteControlListenerProps {
  recordingState: RecordingState;
  sessionId?: string;
}

/**
 * Remote Control Listener Component
 * Listens to Firebase Realtime Database for remote start/stop recording commands
 * Useful for synchronized recording across multiple devices or pre-recorded sessions
 */
export function RemoteControlListener({ recordingState, sessionId = "live-session-1" }: RemoteControlListenerProps) {
  useEffect(() => {
    const controlRef = ref(database, `sessions/${sessionId}/control`);

    const unsubscribe = onValue(controlRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) return;

      console.log("📡 Remote control command received:", data);

      if (data.action === "start") {
        console.log("🎙️ Remote: Starting recording...");
        startRecording(recordingState);
      } else if (data.action === "stop") {
        console.log("🛑 Remote: Stopping recording...");
        stopRecording(recordingState);
      }
    });

    return () => unsubscribe();
  }, [recordingState, sessionId]);

  return null; // This is a listener-only component, renders nothing
}

/**
 * Desktop Listener Page Component
 * Displays a UI for monitoring remote recording sessions
 */
export function DesktopListener() {
  const sessionId = "live-session-1";

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white flex flex-col items-center justify-center p-8">
      <div className="max-w-2xl mx-auto text-center">
        <h1 className="text-4xl font-bold mb-4">💻 Desktop Recording Listener</h1>
        <p className="text-xl text-gray-400 mb-2">Session ID: <span className="text-blue-400 font-mono">{sessionId}</span></p>
        <p className="text-lg text-gray-300 mb-8">Listening for remote recording commands...</p>

        <div className="bg-[#1a1a1a] border border-gray-700 rounded-lg p-8">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
              <p className="text-gray-300">Connected to Firebase Realtime Database</p>
            </div>
            <div className="text-sm text-gray-500">
              <p>• Waiting for start/stop commands</p>
              <p>• Recording will be triggered remotely</p>
              <p>• AI feedback will be generated automatically</p>
            </div>
          </div>
        </div>

        <div className="mt-8 text-sm text-gray-400">
          <p>To trigger recording from mobile/web:</p>
          <code className="bg-black p-4 rounded mt-4 block text-left font-mono">
            {`sessions/${sessionId}/control`}
          </code>
          <p className="mt-4">Set action: "start" or "stop"</p>
        </div>
      </div>
    </main>
  );
}
