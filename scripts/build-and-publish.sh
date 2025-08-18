#!/bin/bash

# DAO Copilot Distribution Script
# This script automates the build and publishing process

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo -e "${BLUE}[BUILD]${NC} $1"
}

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    print_error "package.json not found. Please run this script from the project root."
    exit 1
fi

# Get version from package.json
VERSION=$(node -pe "require('./package.json').version")
print_header "Building DAO Copilot v${VERSION}"

# Parse command line arguments
BUILD_TYPE="all"
PUBLISH="false"
SKIP_TESTS="false"
CLEAN_BUILD="false"
PLATFORM=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --platform)
            PLATFORM="$2"
            BUILD_TYPE="platform"
            shift 2
            ;;
        --publish)
            PUBLISH="true"
            shift
            ;;
        --skip-tests)
            SKIP_TESTS="true"
            shift
            ;;
        --clean)
            CLEAN_BUILD="true"
            shift
            ;;
        --help)
            echo "DAO Copilot Build Script"
            echo ""
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --platform PLATFORM  Build for specific platform (win32, darwin, linux)"
            echo "  --publish            Publish the build to GitHub releases"
            echo "  --skip-tests         Skip running tests before build"
            echo "  --clean              Clean build directories before building"
            echo "  --help               Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0                          # Build for all platforms"
            echo "  $0 --platform darwin       # Build for macOS only"
            echo "  $0 --publish               # Build and publish to GitHub"
            echo "  $0 --clean --skip-tests    # Clean build without tests"
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Clean build if requested
if [ "$CLEAN_BUILD" = "true" ]; then
    print_status "Cleaning build directories..."
    rm -rf out dist .vite build/Release node_modules/.cache
    npm run clean 2>/dev/null || true
fi

# Install dependencies
print_status "Installing dependencies..."
npm ci

# Run tests unless skipped
if [ "$SKIP_TESTS" = "false" ]; then
    print_status "Running tests..."
    npm run test:all
else
    print_warning "Skipping tests as requested"
fi

# Run linting and formatting checks
print_status "Running code quality checks..."
npm run lint
npm run format

# Build the application
print_status "Building application..."
case $BUILD_TYPE in
    "all")
        print_status "Building for all platforms..."
        npm run build:all
        ;;
    "platform")
        print_status "Building for platform: $PLATFORM"
        if [ -n "$PLATFORM" ]; then
            npm run make -- --platform="$PLATFORM"
        else
            print_error "Platform not specified"
            exit 1
        fi
        ;;
    *)
        npm run build
        ;;
esac

# List generated files
print_status "Build completed! Generated files:"
if [ -d "out" ]; then
    find out -name "*.exe" -o -name "*.dmg" -o -name "*.AppImage" -o -name "*.deb" -o -name "*.rpm" -o -name "*.snap" | head -20
fi

# Get build size information
print_status "Build size information:"
if [ -d "out" ]; then
    du -sh out/* 2>/dev/null | head -10 || echo "No build files found in out/"
fi

# Publish if requested
if [ "$PUBLISH" = "true" ]; then
    if [ -z "$GH_TOKEN" ]; then
        print_error "GH_TOKEN environment variable required for publishing"
        print_warning "Set GH_TOKEN to your GitHub personal access token"
        exit 1
    fi
    
    print_status "Publishing to GitHub releases..."
    npm run publish
else
    print_status "Build completed successfully!"
    echo ""
    print_status "To publish this build:"
    echo "  1. Set GH_TOKEN environment variable"
    echo "  2. Run: $0 --publish"
    echo ""
    print_status "Or create a GitHub release manually and upload the files from the 'out' directory"
fi

print_header "Build Summary"
echo "Version: $VERSION"
echo "Build Type: $BUILD_TYPE"
echo "Platform: ${PLATFORM:-all}"
echo "Published: $PUBLISH"
echo "Tests Run: $([ "$SKIP_TESTS" = "false" ] && echo "Yes" || echo "No")"
echo ""
print_status "Build completed successfully! 🎉"
