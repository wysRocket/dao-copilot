#!/bin/bash

# Force Gemini Live API to use the official v1beta schema format
export GEMINI_SCHEMA_FORCE_INDEX=17

echo "🔧 Setting Gemini WebSocket to use official v1beta schema (variant 17)"
echo "Environment: GEMINI_SCHEMA_FORCE_INDEX=17"
echo ""
echo "This variant uses the correct realtimeInput.mediaChunks format:"
echo '{'
echo '  "realtimeInput": {'
echo '    "mediaChunks": [{'
echo '      "mimeType": "audio/pcm;rate=16000",'
echo '      "data": "base64_audio_data"'
echo '    }]'
echo '  }'
echo '}'
echo ""
echo "Run your application now to test the fixed schema!"
