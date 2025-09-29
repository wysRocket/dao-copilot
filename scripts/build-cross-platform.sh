#!/bin/bash

# Cross-Platform Production Build Script
# This script builds the application for all supported platforms

set -e  # Exit on any error

echo "🚀 Starting cross-platform production builds..."
echo "================================="

# Check if we're in the right directory
if [[ ! -f "package.json" ]]; then
    echo "❌ Error: package.json not found. Please run from project root."
    exit 1
fi

# Set production environment
export NODE_ENV=production

# Clean previous builds
echo "🧹 Cleaning previous builds..."
npm run clean

# Create builds directory for reports
mkdir -p builds/reports

# Function to build and test a platform
build_platform() {
    local platform=$1
    local start_time=$(date +%s)
    
    echo ""
    echo "📦 Building for $platform..."
    echo "----------------------------"
    
    # Run the build
    if npm run build:production:${platform}; then
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        
        echo "✅ $platform build completed in ${duration}s"
        
        # Verify the build
        if [[ -d "out" ]]; then
            echo "📊 Build artifacts for $platform:"
            find out -name "*.zip" -o -name "*.dmg" -o -name "*.exe" -o -name "*.deb" -o -name "*.rpm" | head -5
        fi
        
        return 0
    else
        echo "❌ $platform build failed"
        return 1
    fi
}

# Track build results
build_results_mac=""
build_results_windows=""
build_results_linux=""

# Build for macOS (if on macOS)
if [[ "$OSTYPE" == "darwin"* ]]; then
    if build_platform "mac"; then
        build_results_mac="✅ SUCCESS"
    else
        build_results_mac="❌ FAILED"
    fi
else
    echo "ℹ️  Skipping macOS build (not running on macOS)"
    build_results_mac="⏭️  SKIPPED"
fi

# Build for Windows (cross-platform)
if build_platform "win"; then
    build_results_windows="✅ SUCCESS"
else
    build_results_windows="❌ FAILED"
fi

# Build for Linux (cross-platform)
if build_platform "linux"; then
    build_results_linux="✅ SUCCESS"
else
    build_results_linux="❌ FAILED"
fi

# Generate summary report
echo ""
echo "📊 Cross-Platform Build Summary"
echo "================================"

echo "macOS: $build_results_mac"
echo "Windows: $build_results_windows"  
echo "Linux: $build_results_linux"

total_builds=3
successful_builds=0

if [[ "$build_results_mac" == "✅ SUCCESS" ]]; then
    ((successful_builds++))
fi
if [[ "$build_results_windows" == "✅ SUCCESS" ]]; then
    ((successful_builds++))
fi
if [[ "$build_results_linux" == "✅ SUCCESS" ]]; then
    ((successful_builds++))
fi

echo ""
echo "Success Rate: $successful_builds/$total_builds platforms"

# Generate detailed report
cat > builds/reports/cross-platform-build-report.md << EOF
# Cross-Platform Build Report

**Generated:** $(date)
**Node Environment:** $NODE_ENV
**Success Rate:** $successful_builds/$total_builds platforms

## Build Results

- **macOS**: $build_results_mac
- **Windows**: $build_results_windows
- **Linux**: $build_results_linux

## Build Artifacts

$(if [[ -d "out" ]]; then
    echo "### Generated Files"
    find out -name "*.zip" -o -name "*.dmg" -o -name "*.exe" -o -name "*.deb" -o -name "*.rpm" -exec ls -lh {} \;
else
    echo "No build artifacts found in 'out/' directory"
fi)

## Next Steps

1. Test installation on each target platform
2. Verify application functionality across platforms  
3. Validate platform-specific features
4. Document any platform-specific issues

EOF

echo "📝 Detailed report saved to: builds/reports/cross-platform-build-report.md"

# Exit with appropriate code
if [[ $successful_builds -eq $total_builds ]]; then
    echo "🎉 All builds completed successfully!"
    exit 0
elif [[ $successful_builds -gt 0 ]]; then
    echo "⚠️  Some builds failed. Check logs above."
    exit 1
else
    echo "❌ All builds failed."
    exit 1
fi