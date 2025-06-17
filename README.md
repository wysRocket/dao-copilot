# DAO Copilot - AI Assistant with Glass UI

An Electron-based AI assistant application that can record system audio and microphone, transcribe audio in real-time, and provide intelligent assistance through a modern glassmorphism interface.

## Features

- **Real-time Audio Transcription**: Records system audio and microphone with AI-powered transcription
- **Multi-window Architecture**: Supports multiple windows for enhanced workflow
- **Modern Glass UI**: Enhanced with glassmorphism effects using liquid-glass-react
- **Dark Theme**: Fumadocs-inspired dark theme with glass overlays
- **AI Assistant**: Integrated AI capabilities for intelligent conversation

## UI Enhancement with Glassmorphism

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

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd dao-copilot

# Install dependencies
npm install

# Start the application
npm run start
```

## Dependencies

### Glass UI Library
- **liquid-glass-react** (v1.1.1): Provides glassmorphism effects and components

### Core Technologies
- **Electron**: Cross-platform desktop app framework
- **React**: UI library with TypeScript
- **Vite**: Build tool and development server
- **Tailwind CSS**: Utility-first CSS framework

## Development

### Running the Application
```bash
npm run start
```

### Building for Production
```bash
npm run make
```

### Testing
```bash
npm run test
```

## Glass UI Usage

### Basic Glass Component
```tsx
import LiquidGlass from 'liquid-glass-react';

function MyGlassComponent() {
  return (
    <LiquidGlass
      blurAmount={20}
      saturation={1.2}
      cornerRadius={12}
      mode="standard"
    >
      <div className="backdrop-blur-sm bg-white/10 p-6">
        Your content here
      </div>
    </LiquidGlass>
  );
}
```

### Available Glass Props
- `blurAmount`: Controls the blur intensity (default: 20)
- `saturation`: Color saturation level (default: 1.2)
- `cornerRadius`: Border radius in pixels (default: 12)
- `mode`: Glass rendering mode ("standard" | "vibrant")
- `overLight`: Whether component is over light background (default: false)

## Configuration

### Build Configuration
The Vite configuration has been updated to include liquid-glass-react in optimized dependencies:

```typescript
// vite.renderer.config.mts
optimizeDeps: {
  include: ['liquid-glass-react', '@google-cloud/speech', '@google/genai'],
}
```

### Theme Configuration
The application uses a dark theme with glass overlays. Glass components automatically adapt to the dark theme.

## Architecture

The application follows a multi-window Electron architecture with:
- Main process for system-level operations
- Renderer processes for UI with React
- IPC communication between processes
- Glass UI layer for enhanced visual experience

## Troubleshooting

### Glass Effects Not Showing
- Ensure `liquid-glass-react` is properly installed
- Check that components are wrapped with appropriate glass containers
- Verify CSS backdrop-filter support in your environment

### Build Issues
- Run `npm install` to ensure all dependencies are installed
- Check that Vite configuration includes liquid-glass-react optimization
- Clear node_modules and reinstall if issues persist

## Contributing

1. Create a feature branch: `git checkout -b feature/your-feature`
2. Make your changes with glass UI enhancements
3. Test the application thoroughly
4. Submit a pull request

## License

[Add your license information here]
