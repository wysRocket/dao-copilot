# Cross-Platform Build Strategy

## Current Status: macOS Host

When building on macOS, we can natively build for:

- ✅ **macOS**: Full native support
- ⚠️ **Windows**: Requires additional tools (Mono + Wine)
- ⚠️ **Linux**: Requires platform-specific tools (rpmbuild for RPM)

## Recommended Production Build Strategy

### Option 1: Platform-Specific Build Machines (Recommended)

Build on each target platform for best results:

- **macOS builds**: Build on macOS (current setup)
- **Windows builds**: Build on Windows machine or VM
- **Linux builds**: Build on Linux machine or container

### Option 2: Cross-Platform with Tools

Install required tools for cross-compilation:

#### For Windows builds on macOS (Electron Squirrel installer):

```bash
# Install prerequisites via Homebrew (2025 recommendations)
brew install mono                      # Mono 7.x+ provides .NET runtime
brew install --cask wine-stable        # Wine 9.x+ hosts Squirrel tools

# (Optional) switch to wine-staging for newer features
# brew install --cask wine-staging

# Verify toolchain paths
mono --version
wine --version

# Apple Silicon: run Forge commands under Rosetta if needed
# arch -x86_64 npm run build:production:win

# Optional: isolate Wine prefix to avoid permission prompts
# export WINEPREFIX="$HOME/.wine-electron"
```

- Ensure `/usr/local/bin` (or the Homebrew prefix shown in `brew --prefix`) appears in your shell `PATH` so Forge can locate `mono` and `wine`.
- Keep `@electron-forge/maker-squirrel` updated and test generated `.exe/.nupkg` artifacts on an actual Windows VM or CI runner.
- For production releases, plan for a Windows code-signing certificate and supply `certificateFile` / `certificatePassword` in `forge.config.ts`.

#### For Linux builds on macOS:

```bash
# Install RPM build tools
brew install rpm
```

### Option 3: CI/CD Pipeline (Best for Production)

Use GitHub Actions or similar to build on multiple platforms:

- **macOS runner**: For macOS builds
- **Windows runner**: For Windows builds
- **Linux runner**: For Linux builds

## Current Successful Build

✅ **macOS Build Successful:**

- Platform: darwin-arm64
- Size: ~139MB
- Format: ZIP archive
- Location: `out/make/zip/darwin/arm64/capture-darwin-arm64-1.0.0.zip`

## Immediate Next Steps

Since we have a successful macOS build, we can:

1. ✅ Test the macOS build thoroughly
2. ✅ Validate all functionality works in production mode
3. ✅ Document the build process
4. 🔄 Set up additional platforms as needed

## Testing the Current Build

The macOS build is ready for comprehensive testing:

- Installation testing
- Functionality verification
- Performance benchmarking
- Security validation

## Distribution Strategy

For now, we can distribute the macOS build while setting up additional platforms:

- Immediate: macOS users (native build)
- Future: Windows and Linux (with proper build environment)
