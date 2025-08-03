# Gemini Model Name Update Inventory

## Overview
This document provides a comprehensive inventory of all occurrences of `gemini-live-2.5-flash-preview` that need to be updated to `gemini-2.5-flash-live` across the codebase.

**Total occurrences found: 87**

## Categorized Inventory

### 1. Core WebSocket Client Code (8 files)
Critical files that handle the actual WebSocket connection and API communication:

#### `/src/services/main-stt-transcription.ts`
- **Line 26**: `const DEFAULT_GEMINI_LIVE_MODEL = 'gemini-live-2.5-flash-preview'`
- **Category**: Configuration constant
- **Priority**: High - Used as default model

#### `/src/services/gemini-live-websocket.ts`
- **Line 21**: `export const GEMINI_LIVE_MODEL = 'gemini-live-2.5-flash-preview'`
- **Line 46**: `// Enhanced data models for gemini-live-2.5-flash-preview responses`
- **Line 247**: `* Enhanced message parser for gemini-live-2.5-flash-preview model`
- **Line 1514**: `// Use enhanced message parser for gemini-live-2.5-flash-preview`
- **Line 3347**: `* Parse a response using the enhanced gemini-live-2.5-flash-preview parser`
- **Category**: Core WebSocket implementation
- **Priority**: Critical - Main WebSocket client

#### `/src/services/audio-streaming-pipeline.ts`
- **Line 67**: `model: config.websocket.model || 'gemini-live-2.5-flash-preview'`
- **Line 306**: `model: 'gemini-live-2.5-flash-preview',`
- **Category**: Audio pipeline configuration
- **Priority**: High - Streaming functionality

#### `/src/services/proxy-stt-transcription.ts`
- **Line 101**: `model: 'gemini-live-2.5-flash-preview', // Use v1beta model`
- **Category**: Proxy service
- **Priority**: High - STT integration

### 2. Configuration and Helper Files (2 files)

#### `/src/helpers/gemini-websocket-config.ts`
- **Line 60**: `modelName: 'gemini-live-2.5-flash-preview',`
- **Line 232**: `'Consider using "gemini-live-2.5-flash-preview" for optimal v1beta performance.'`
- **Line 247**: `'gemini-live-2.5-flash-preview',`
- **Line 253**: `Model "${config.modelName}" is legacy. Consider upgrading to "gemini-live-2.5-flash-preview" for v1beta compatibility.`
- **Line 367**: `modelName: 'gemini-live-2.5-flash-preview',`
- **Category**: Configuration helper
- **Priority**: High - Configuration management

#### `/src/services/transcription-compatibility.ts`
- **Lines 127, 137, 208, 216, 222 (2x), 223, 224, 225, 337, 348, 354, 387, 388, 389**: Multiple references in compatibility layer
- **Category**: Compatibility and migration
- **Priority**: High - Migration logic

### 3. Test Files (3 files)

#### `/src/services/test-gemini-websocket.ts`
- **Line 25**: `model: 'gemini-live-2.5-flash-preview',`
- **Category**: Test configuration
- **Priority**: Medium - Test setup

#### `/src/services/debug-gemini-websocket.ts`
- **Line 22**: `model: 'gemini-live-2.5-flash-preview',`
- **Category**: Debug utilities
- **Priority**: Medium - Debug configuration

#### `/src/services/gemini-live-websocket-test.ts`
- **Line 11**: `model: 'gemini-live-2.5-flash-preview',`
- **Category**: WebSocket tests
- **Priority**: Medium - Test configuration

### 4. Documentation Files (2 files)

#### `/src/services/README-gemini-live.md`
- **Line 3**: Description text
- **Line 32**: Code example
- **Line 165**: Configuration example
- **Line 392**: Type definition comment
- **Line 795**: Environment variable example
- **Category**: Technical documentation
- **Priority**: Medium - Documentation accuracy

#### `.env.example`
- **Line 19**: `GEMINI_MODEL_NAME="gemini-live-2.5-flash-preview"`
- **Line 45**: Deprecated variable comment (2 occurrences)
- **Line 46**: Deprecated variable comment (2 occurrences)
- **Category**: Environment configuration
- **Priority**: High - Default configuration

### 5. Script Files (1 file)

#### `/src/scripts/migrate-v1beta-config.ts`
- **Line 53**: `updatedEnv.GEMINI_MODEL_NAME = 'gemini-live-2.5-flash-preview'`
- **Category**: Migration script
- **Priority**: Medium - Migration tooling

### 6. TaskMaster Documentation Files (Multiple files)
Files in `.taskmaster/tasks/` directory containing task definitions and documentation:

#### Task Files:
- `task_027.txt` - Multiple occurrences in implementation task
- `task_028.txt` - Test suite documentation
- `task_029.txt` - Documentation update task
- `task_030.txt` - Model update task
- `task_031.txt` - Configuration validation task
- `task_032.txt` - Service consistency task
- `tasks.json` - Task definitions

**Category**: Project management documentation
**Priority**: Low - Historical records (these can be updated for consistency but don't affect functionality)

## Update Priority Order

### Phase 1: Critical (Must be updated first)
1. `/src/services/gemini-live-websocket.ts` - Core WebSocket client
2. `/src/services/main-stt-transcription.ts` - Default model constant
3. `/src/helpers/gemini-websocket-config.ts` - Configuration management

### Phase 2: High Priority (Core functionality)
4. `/src/services/audio-streaming-pipeline.ts` - Streaming pipeline
5. `/src/services/proxy-stt-transcription.ts` - STT service
6. `/src/services/transcription-compatibility.ts` - Compatibility layer
7. `.env.example` - Environment configuration

### Phase 3: Medium Priority (Supporting files)
8. Test files: `test-gemini-websocket.ts`, `debug-gemini-websocket.ts`, `gemini-live-websocket-test.ts`
9. `/src/scripts/migrate-v1beta-config.ts` - Migration script
10. `/src/services/README-gemini-live.md` - Technical documentation

### Phase 4: Low Priority (Documentation)
11. TaskMaster task files and documentation

## Verification Checklist

After updates, verify:
- [ ] All WebSocket connections use the new model name
- [ ] Configuration files are consistent
- [ ] Test files use the correct model name
- [ ] Documentation reflects the change
- [ ] No remaining references to `gemini-live-2.5-flash-preview`
- [ ] All environment variables are updated
- [ ] Migration scripts work correctly

## Search Commands for Verification

```bash
# Search for any remaining old model references
grep -r "gemini-live-2.5-flash-preview" src/
grep -r "gemini-live-2.5-flash-preview" .env*

# Verify new model name is used
grep -r "gemini-2.5-flash-live" src/
```

## Notes

- The model name change is from `gemini-live-2.5-flash-preview` to `gemini-2.5-flash-live`
- This affects both string literals and comments/documentation
- Some files have multiple occurrences that each need individual attention
- Test files should be updated to ensure they test the correct model
- Environment configuration must be consistent across all environments
