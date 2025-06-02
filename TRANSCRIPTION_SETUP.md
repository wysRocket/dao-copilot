# Environment Setup for DAO Copilot

## Google API Key Setup

To use the transcription functionality, you need to set up a Google API key for the Gemini API.

### Step 1: Get your Google API Key

1. Go to the [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Create a new API key or use an existing one
3. Copy the API key

### Step 2: Set the Environment Variable

You can set the API key in several ways:

#### Option 1: Using .env file (Recommended for development)

Create a `.env` file in the project root and add:

```bash
GOOGLE_API_KEY=your-api-key-here
```

#### Option 2: System Environment Variable

##### macOS/Linux:

```bash
export GOOGLE_API_KEY="your-api-key-here"
```

Add this to your `~/.zshrc` or `~/.bashrc` to make it permanent.

##### Windows:

```cmd
set GOOGLE_API_KEY=your-api-key-here
```

### Step 3: Verify Setup

After setting the environment variable, run the app and check the console logs. You should see:

```
✅ Google API Key found and loaded
```

If you see API key validation errors, the transcription feature won't work.

## Troubleshooting CORS Issues

The current implementation follows the **Renderer → IPC → Main Process → Gemini API** flow, which should prevent CORS issues entirely because:

1. The renderer process sends audio data via IPC
2. The main process handles the API calls directly
3. No web requests are made from the renderer

If you're still experiencing CORS issues, it might be because:

1. The API key is not properly configured
2. The audio data format is incorrect
3. Network connectivity issues

The app includes a fallback proxy server that can be used if direct API calls fail.

## Architecture

```
┌─────────────────┐    IPC     ┌─────────────────┐    HTTPS    ┌─────────────────┐
│                 │  -------->  │                 │  --------> │                 │
│ Renderer Process│             │  Main Process   │            │  Gemini API     │
│                 │  <--------  │                 │  <-------- │                 │
└─────────────────┘            └─────────────────┘            └─────────────────┘
                                        │
                                        │ Fallback
                                        ▼
                                ┌─────────────────┐    HTTPS    ┌─────────────────┐
                                │                 │  --------> │                 │
                                │  Proxy Server   │            │  Gemini API     │
                                │  (localhost)    │  <-------- │                 │
                                └─────────────────┘            └─────────────────┘
```

This architecture eliminates CORS issues because the API calls are made from Node.js (main process or proxy) rather than the browser (renderer process).
