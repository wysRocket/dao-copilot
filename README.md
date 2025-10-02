# DAO Copilot - AI Assistant with Glass UI

An Electron-based AI assistant application that can record system audio and microphone, transcribe audio in real-time, and provide intelligent assistance through a modern glassmorphism interface.

## Features

- **Real-time Audio Transcription**: Records system audio and microphone with AI-powered transcription
- **Multi-window Architecture**: Supports multiple windows for enhanced workflow
- **Modern Glass UI**: Enhanced with glassmorphism effects using liquid-glass-react
- **Dark Theme**: Fumadocs-inspired dark theme with glass overlays
- **AI Assistant**: Integrated AI capabilities for intelligent conversation
- **Gemini Live API Integration**: Real-time AI communication with Google's Gemini Live API

## 🚀 Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/wysRocket/dao-copilot.git
cd dao-copilot

# Install dependencies
npm install

# Start the application
npm run start
```

### Build for Production

```bash
# Build for current platform
npm run build

# Clean previous builds
npm run clean

# Run tests before building
npm run prebuild
```

## 🔧 Development Workflow

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start the development application |
| `npm run build` | Build the application for production |
| `npm run build:all` | Build for all platforms |
| `npm test` | Run unit tests |
| `npm run test:e2e` | Run end-to-end tests |
| `npm run test:all` | Run all tests |
| `npm run lint` | Run ESLint |
| `npm run format` | Check code formatting |
| `npm run format:write` | Fix code formatting |
| `npm run clean` | Clean build artifacts |

### GitHub Projects Synchronization

Sync Taskmaster tasks with GitHub Projects for visual board management:

| Command | Description |
|---------|-------------|
| `npm run sync:project:fetch` | Fetch project fields and structure |
| `npm run sync:project:list` | List all items in the project |
| `npm run sync:project:sync` | Preview task sync (dry run) |
| `npm run sync:project:sync:live` | Actually sync tasks to project |

See [GitHub Projects Sync Documentation](./docs/GITHUB_PROJECTS_SYNC.md) for detailed usage.

### Release Management

```bash
# Patch release (1.0.0 -> 1.0.1)
npm run release

# Minor release (1.0.0 -> 1.1.0)
npm run release:minor

# Major release (1.0.0 -> 2.0.0)
npm run release:major
```

## 🏗️ CI/CD Pipeline

This project includes comprehensive GitHub Actions workflows:

### Continuous Integration (`ci.yml`)
- Runs on every push and pull request
- Executes linting, formatting checks, and tests
- Security audit and CodeQL analysis
- Uploads test results as artifacts

### Build and Release (`build.yml`)
- Triggered by version tags or manual dispatch
- Cross-platform builds (Windows, macOS, Linux)
- Automatic GitHub releases
- Build artifact uploads

### Publishing (`publish.yml`)
- Publishes to npm and GitHub Packages
- Triggered by releases or manual dispatch

### Deployment (`deploy.yml`)
- Documentation deployment to GitHub Pages
- Release asset management
- Auto-updates release descriptions

### Automated Workflows

1. **Version Bump**: Update version in `package.json`
2. **Auto-tagging**: Automatic git tag creation
3. **Cross-platform Build**: Windows, macOS, Linux binaries
4. **Release Creation**: Automated GitHub releases
5. **Asset Upload**: Distribution files attached to releases

## 🚀 Gemini Live API Integration

The application includes comprehensive integration with Google's Gemini Live API for real-time AI interactions:

### Key Features

- **Multi-Authentication Support**: API key, service account, and default authentication
- **Real-time Processing**: Live audio streaming and processing capabilities
- **TypeScript Support**: Full type safety and IntelliSense support
- **Comprehensive Testing**: Automated test suites for validation
- **Production Ready**: Error handling, retry logic, and monitoring

### Quick Setup

1. Get your API key from [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Add to your `.env` file:
   ```env
   GEMINI_API_KEY=your_api_key_here
   ```
3. Run the test to verify setup:
   ```bash
   node simple-api-test.mjs
   ```

### Documentation

- **[Complete Setup Guide](./docs/GCP_SDK_SETUP_GUIDE.md)** - Detailed installation and configuration
- **[Quick Reference](./docs/GCP_SDK_QUICK_REFERENCE.md)** - Common code patterns and usage
- **[Implementation Changelog](./docs/GCP_SDK_CHANGELOG.md)** - Development history and progress

### Usage Example

```typescript
import {initializeGCPSDK, getGCPSDK} from '@/services/gcp-sdk-manager'

// Initialize SDK
await initializeGCPSDK()

// Generate text
const sdk = getGCPSDK()
const response = await sdk.genAI.models.generateContent({
  model: 'gemini-2.5-flash',
  contents: [{parts: [{text: 'Hello, world!'}]}]
})
```

## 🎨 UI Enhancement with Glassmorphism

This application features a modern glassmorphism design system powered by `liquid-glass-react`, providing:

- **Glass Effects**: Blurred backgrounds with transparency for depth
- **Dark Theme**: Professional dark color scheme with glass overlays
- **Visual Hierarchy**: Layered glass components for improved UX
- **Performance Optimized**: Efficient rendering of glass effects

### Glass UI Components

The application includes several glass-enhanced components:

- `TestGlassComponent`: Demonstration component showing glass effects
- Enhanced UI components with liquid-glass styling
- Consistent glassmorphism theme throughout the application

## 🔧 Configuration

### Environment Variables

Create a `.env` file in the project root:

```env
# Google AI/Gemini API
GEMINI_API_KEY=your_gemini_api_key_here
GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account.json

# Development
NODE_ENV=development
ELECTRON_IS_DEV=1
```

### Build Configuration

The Vite configuration has been updated to include liquid-glass-react in optimized dependencies:

```typescript
// vite.renderer.config.mts
optimizeDeps: {
  include: ['liquid-glass-react', '@google-cloud/speech', '@google/genai'],
}
```

## 📦 Building & Publishing

### Local Build

```bash
# Build for current platform
npm run build

# Build for specific platform
npm run make -- --platform=win32
npm run make -- --platform=darwin
npm run make -- --platform=linux
```

### Automated Publishing

1. **Version Bump**: Update version in `package.json`
2. **Push Changes**: `git push origin main`
3. **Create Release**: GitHub Actions automatically builds and releases
4. **Download**: Releases available on GitHub Releases page

### Distribution Files

| Platform | File Types | Description |
|----------|------------|-------------|
| Windows | `.exe` | Windows installer |
| macOS | `.dmg` | macOS disk image |
| Linux | `.AppImage`, `.deb`, `.snap` | Linux packages |

## 🛠️ Dependencies

### Core Technologies

- **Electron**: Cross-platform desktop app framework
- **React**: UI library with TypeScript
- **Vite**: Build tool and development server
- **Tailwind CSS**: Utility-first CSS framework

### Glass UI Library

- **liquid-glass-react** (v1.1.1): Provides glassmorphism effects and components

## 🧪 Testing

```bash
# Run all tests
npm run test:all

# Run unit tests only
npm run test:unit

# Run E2E tests only
npm run test:e2e

# Watch mode for development
npm run test:watch
```

## 🏗️ Architecture

The application follows a multi-window Electron architecture with:

- Main process for system-level operations
- Renderer processes for UI with React
- IPC communication between processes
- Glass UI layer for enhanced visual experience

## 🐛 Troubleshooting

### Common Issues

#### Glass Effects Not Showing

- Ensure `liquid-glass-react` is properly installed
- Check that components are wrapped with appropriate glass containers
- Verify CSS backdrop-filter support in your environment

#### Build Issues

- Run `npm install` to ensure all dependencies are installed
- Check that Vite configuration includes liquid-glass-react optimization
- Clear node_modules and reinstall if issues persist

#### CI/CD Issues

- Verify GitHub secrets are configured (GITHUB_TOKEN is automatic)
- Check workflow files for syntax errors
- Ensure branch protection rules allow workflow runs

### Support

- **Documentation**: Check the `/docs` folder for detailed guides
- **Issues**: [Open an issue](https://github.com/wysRocket/dao-copilot/issues) on GitHub
- **Discussions**: Use GitHub Discussions for questions and ideas

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes with glass UI enhancements
4. Write tests for your changes
5. Run the full test suite: `npm run test:all`
6. Submit a pull request

### Development Guidelines

- Follow the existing code style (ESLint + Prettier)
- Write tests for new features
- Update documentation as needed
- Use conventional commits for commit messages

## 📄 License

[Add your license information here]

## 🙏 Acknowledgments

- **liquid-glass-react**: For the beautiful glassmorphism effects
- **Google Cloud**: For AI and speech processing APIs
- **Electron Team**: For the excellent desktop app framework
- **React Team**: For the powerful UI library
