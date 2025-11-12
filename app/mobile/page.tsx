"use client";
import { useState } from "react";
import { ref, set } from "firebase/database";
import { database } from "@/firebase/config";

export default function MobileController() {
  const sessionId = "live-session-1"; // Must match desktop session ID
  const [status, setStatus] = useState("idle");

  async function sendCommand(action: "start" | "stop") {
    try {
      await set(ref(database, `sessions/${sessionId}/control`), {
        action,
        timestamp: Date.now(),
      });
      setStatus(action === "start" ? "recording" : "stopped");
    } catch (err) {
      console.error("Firebase command error", err);
    }
  }

  return (
    <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center gap-6">
      <h1 className="text-2xl font-bold">📱 Mobile Recording Controller</h1>
      <div className="flex gap-4">
        <button
          onClick={() => sendCommand("start")}
          className="bg-green-600 hover:bg-green-700 px-6 py-3 rounded-lg"
        >
          ▶️ Start Recording
        </button>
        <button
          onClick={() => sendCommand("stop")}
          className="bg-red-600 hover:bg-red-700 px-6 py-3 rounded-lg"
        >
          ⏹ Stop Recording
        </button>
      </div>
      <p className="text-gray-300 mt-4">
        Current Status:{" "}
        <span
          className={`${
            status === "recording" ? "text-green-400" : "text-red-400"
          } font-semibold`}
        >
          {status}
        </span>
      </p>
    </main>
  );
}
