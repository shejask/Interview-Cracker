# Remote Recording Control

This feature enables synchronized remote control of recording across multiple devices or sessions using Firebase Realtime Database.

## Architecture

### Components

1. **`lib/recording.ts`** - Shared recording utilities
   - `startRecording(state)` - Start Web Speech API recording
   - `stopRecording(state)` - Stop recording
   - Reusable across components

2. **`lib/remote-control.tsx`** - Remote control listener
   - `RemoteControlListener` - Listener component that monitors Firebase for commands
   - `DesktopListener` - UI page for monitoring remote sessions

3. **`app/page.tsx`** - Main interview app
   - Desktop mode: Uses Web Speech API for local recording
   - Mobile mode: Acts as remote controller, sends commands to Firebase
   - Auto-detects device type and switches modes automatically

4. **`app/listener/page.tsx`** - Desktop listener page
   - Accessible at `/listener`
   - Shows monitoring UI for remote recording sessions

## How It Works

### Mobile Remote Control Mode

When you visit the app on **mobile** (or if SpeechRecognition is not supported):
- The app automatically enters **Remote Control Mode** 📱
- Clicking "Record" sends a `start` command to Firebase
- Desktop listening app receives command and starts recording
- Status displays: "🎙️ Recording on Desktop"
- Clicking "Stop" sends a `stop` command

### Recording Flow

1. **Desktop App** (`/`)
   - User fills job context
   - `RemoteControlListener` listens to `sessions/live-session-1/control`
   - Uses Web Speech API for direct recording
   - When remote "start" arrives, starts recording
   - When "stop" arrives, stops recording

2. **Mobile App** (same URL on mobile device)
   - Auto-detects mobile + no SpeechRecognition
   - Enters Remote Control Mode
   - Clicking Record sends Firebase command (no local recording)
   - Shows status: "Recording on Desktop"
   - Desktop app records and processes speech

3. **Desktop Listener** (`/listener`)
   - Displays monitoring UI
   - Shows connection status to Firebase
   - Listens for the same session ID

4. **Firebase Path**
   - Remote commands written to: `sessions/live-session-1/control`
   - Set action to "start" or "stop"
   - Example payload:
     ```json
     {
       "action": "start",
       "timestamp": "2025-11-13T12:00:00Z",
       "initiatedFrom": "mobile"
     }
     ```

## Usage Examples

### Example 1: Manual Remote Trigger

In Firebase Console → Realtime Database:
```
sessions/
  live-session-1/
    control/
      action: "start"
      timestamp: "2025-11-13T12:00:00Z"
```

Then change `action` to `"stop"` to stop recording.

### Example 2: Programmatic Control (Node.js)

```javascript
import { getDatabase, ref, set } from "firebase/database";

const db = getDatabase();
const controlRef = ref(db, "sessions/live-session-1/control");

// Start recording
await set(controlRef, {
  action: "start",
  timestamp: new Date().toISOString()
});

// Stop after 10 seconds
setTimeout(async () => {
  await set(controlRef, {
    action: "stop",
    timestamp: new Date().toISOString()
  });
}, 10000);
```

### Example 3: Multiple Sessions

You can control multiple sessions by changing the session ID:

```javascript
// Session 1
await set(ref(db, "sessions/session-1/control"), { action: "start" });

// Session 2
await set(ref(db, "sessions/session-2/control"), { action: "start" });
```

## Firebase Rules

Required Realtime Database rules for remote control:

```json
{
  "rules": {
    "sessions": {
      "$sessionId": {
        "control": {
          ".read": true,
          ".write": true,
          ".indexOn": ["createdAt"]
        },
        "interviews": {
          ".read": true,
          ".write": true,
          ".indexOn": ["createdAt"]
        }
      }
    },
    "interviews": {
      ".read": true,
      ".write": true,
      ".indexOn": ["createdAt"]
    }
  }
}
```

## Security Notes

⚠️ **Development Only**: The rules above are permissive for development.

For production, restrict writes:
```json
{
  "rules": {
    "sessions": {
      "$sessionId": {
        "control": {
          ".read": "auth != null",
          ".write": "auth.token.sessionId === $sessionId"
        }
      }
    }
  }
}
```

## Testing

1. **Start the main app**
   ```bash
   npm run dev
   ```
   Navigate to `http://localhost:3001`

2. **Open a second tab/window with the listener**
   Navigate to `http://localhost:3001/listener`

3. **Trigger remote recording**
   - Go to Firebase Console → Realtime Database
   - Navigate to `sessions/live-session-1/control`
   - Set `action` to `"start"`
   - You should see recording start on the main app
   - Change to `"stop"` to stop

## Troubleshooting

- **Recording not starting?**
  - Check Firebase Console → Realtime Database for the control path
  - Verify database rules allow read/write
  - Check browser console for errors
  - Ensure job context is filled on main app

- **Listener not showing connection?**
  - Verify Firebase is initialized correctly
  - Check network tab for Firebase API calls
  - Clear browser cache and reload

- **Permission Denied?**
  - Update Realtime Database rules (see above)
  - Ensure rules match your database structure
  - Publish rules after changes

## Future Enhancements

- [ ] Add session history and statistics
- [ ] Support batch recording commands
- [ ] Add UI controls to send remote commands from main app
- [ ] Implement session recording presets
- [ ] Add real-time sync of transcript between devices
- [ ] Support multiple concurrent sessions
