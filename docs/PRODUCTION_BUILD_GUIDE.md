# Production Build Guide

This guide covers how to create production builds for the DAO Copilot application across all supported platforms.

## Prerequisites

### 1. Environment Setup

Before building for production, ensure you have the following set up:

#### Required Environment Variables

Create a `.env.production` file in the project root with the following variables:

```bash
# Core Configuration
NODE_ENV=production
APP_NAME=DAO Copilot
APP_VERSION=1.0.0

# API Keys (Required)
GEMINI_API_KEY=your_actual_gemini_api_key
OPENAI_API_KEY=your_actual_openai_api_key
ANTHROPIC_API_KEY=your_actual_anthropic_api_key

# Build Configuration
BUILD_TARGET=production
MINIFY_CODE=true
GENERATE_SOURCEMAPS=false

# Security & Features
ENABLE_TELEMETRY=false
DEBUG_MODE=false
CRASH_REPORTING=true
AUTO_UPDATE_CHECK=true
```

#### macOS Code Signing (Required for macOS distribution)

For macOS builds, you'll also need:

```bash
# Apple Developer Certificate
APPLE_DEVELOPER_ID=Developer ID Application: Your Name (TEAMID)
APPLE_ID=your_apple_id@example.com
APPLE_APP_PASSWORD=your_app_specific_password
APPLE_TEAM_ID=your_team_id
```

#### Linux Distribution Info

For Linux packages, the build will automatically include:

- Package name: `dao-copilot`
- Categories: Office, Productivity
- Description: A comprehensive DAO management and collaboration platform

### 2. Build Dependencies

Ensure all dependencies are installed:

```bash
npm install
```

## Building for Production

### All Platforms

Build for all platforms simultaneously:

```bash
npm run build:production
```

This command:

- Sets `NODE_ENV=production`
- Enables code minification
- Disables source maps
- Optimizes bundle size
- Creates builds for macOS, Windows, and Linux

### Platform-Specific Builds

#### macOS

```bash
npm run build:production:mac
```

Creates:

- `.app` bundle in `out/` directory
- ZIP archive for distribution
- Code-signed (if certificates configured)

#### Windows

```bash
npm run build:production:win
```

Creates:

- Squirrel installer (`Setup.exe`)
- Portable executable
- MSI installer (if configured)

#### Linux

```bash
npm run build:production:linux
```

Creates:

- `.deb` package (Ubuntu/Debian)
- `.rpm` package (Red Hat/Fedora)
- AppImage (universal Linux)

## Build Artifacts

After successful builds, you'll find the following in the `out/` directory:

```
out/
├── make/
│   ├── squirrel.windows/        # Windows installer
│   ├── zip/darwin/              # macOS ZIP
│   ├── deb/                     # Debian package
│   └── rpm/                     # RPM package
└── dao-copilot-{platform}/      # Platform-specific builds
```

## Build Optimization Features

### Automatic Optimizations

The production build includes:

1. **Code Splitting**: Vendors, UI components, and utilities are split into separate chunks
2. **Tree Shaking**: Unused code is automatically removed
3. **Minification**: Code is compressed for smaller file size
4. **Console Log Removal**: Debug logging is stripped from production builds
5. **Asset Optimization**: Images and other assets are compressed

### Bundle Analysis

To analyze bundle size and composition:

```bash
npm run build:analyze
```

This generates a report showing:

- Bundle size breakdown
- Dependency analysis
- Optimization opportunities

## Security Considerations

### Production Safety

The build system includes several security measures:

1. **Environment Isolation**: Production builds use separate environment files
2. **API Key Validation**: Required API keys are validated before build
3. **Debug Stripping**: All debug code and console logs are removed
4. **Source Map Control**: Source maps are disabled by default for security

### Code Signing

#### macOS

- Requires valid Apple Developer ID certificate
- Automatic notarization (if configured)
- Hardened runtime enabled

#### Windows

- Optional Authenticode signing
- Requires valid code signing certificate

## Distribution

### macOS

- ZIP file can be distributed directly
- For App Store: Additional entitlements required
- For notarization: Apple ID credentials needed

### Windows

- Squirrel installer provides auto-update capability
- MSI for enterprise deployment
- Portable executable for standalone use

### Linux

- DEB packages for Debian/Ubuntu systems
- RPM packages for Red Hat/Fedora systems
- AppImage for universal compatibility

## Troubleshooting

### Common Issues

1. **Missing API Keys**

   ```
   Error: Missing required environment variable: GEMINI_API_KEY
   ```

   Solution: Ensure all required API keys are set in `.env.production`

2. **Build Size Too Large**

   - Run `npm run build:analyze` to identify large dependencies
   - Consider code splitting for large features
   - Review imported libraries for alternatives

3. **macOS Signing Issues**

   ```
   Error: No valid code signing identity found
   ```

   Solution: Install Apple Developer certificate or disable signing for development

4. **Linux Dependencies**
   ```
   Error: Missing system dependencies
   ```
   Solution: Install required system packages (typically handled automatically)

### Performance Optimization

For optimal production performance:

1. **Monitor Bundle Size**: Keep total bundle under 50MB
2. **Lazy Loading**: Implement for non-critical features
3. **Asset Optimization**: Compress images and other media
4. **Memory Management**: Profile for memory leaks

## Testing Production Builds

Before distribution, test the production builds:

1. **Functionality Testing**: Verify all features work correctly
2. **Performance Testing**: Check startup time and memory usage
3. **Security Testing**: Ensure no sensitive data is exposed
4. **Installation Testing**: Test installation on clean systems

### Automated Testing

Run the full test suite against production builds:

```bash
npm run test:production
```

This includes:

- Unit tests with production configuration
- Integration tests with production APIs
- Performance benchmarks
- Security audits

## Version Management

### Semantic Versioning

Update version numbers in:

- `package.json`
- `.env.production` (`APP_VERSION`)
- Platform-specific metadata

### Release Notes

Document changes in:

- `CHANGELOG.md`
- Platform-specific release notes
- Distribution platform descriptions

## Continuous Integration

For automated builds, set up CI/CD with:

1. **Environment Variables**: Store API keys securely
2. **Build Matrix**: Test across platforms
3. **Artifact Storage**: Save builds for distribution
4. **Release Automation**: Auto-tag and publish releases

Example GitHub Actions workflow available in `.github/workflows/production-build.yml`
