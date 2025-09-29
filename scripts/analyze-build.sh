#!/bin/bash

# Bundle Analysis Script for Production Builds
# Analyzes build artifacts and provides optimization recommendations

echo "🔍 Production Build Analysis"
echo "=================================="

# Check if build directory exists
if [ ! -d ".vite/build" ]; then
    echo "❌ Build directory not found. Please run a production build first."
    exit 1
fi

echo ""
echo "📊 Build Size Analysis"
echo "----------------------"

# Calculate total build size
total_size=$(du -sh .vite/build | cut -f1)
echo "Total build size: $total_size"

# List largest files
echo ""
echo "📁 Largest Build Files:"
find .vite/build -type f -name "*.js" -o -name "*.css" | xargs ls -lh | sort -k5 -hr | head -10

echo ""
echo "🎯 Bundle Composition"
echo "--------------------"

# Count file types
echo "JavaScript files: $(find .vite/build -name "*.js" | wc -l)"
echo "CSS files: $(find .vite/build -name "*.css" | wc -l)"
echo "Asset files: $(find .vite/build -type f ! -name "*.js" ! -name "*.css" | wc -l)"

echo ""
echo "🚀 Optimization Recommendations"
echo "-------------------------------"

# Check for large JS files (>500KB)
large_js=$(find .vite/build -name "*.js" -size +500k)
if [ -n "$large_js" ]; then
    echo "⚠️  Large JavaScript files detected (>500KB):"
    echo "$large_js" | while read file; do
        size=$(ls -lh "$file" | awk '{print $5}')
        echo "  - $(basename "$file"): $size"
    done
    echo "  Recommendation: Consider code splitting or lazy loading"
else
    echo "✅ No excessively large JavaScript files found"
fi

# Check for uncompressed assets
echo ""
uncompressed=$(find .vite/build -name "*.png" -o -name "*.jpg" -o -name "*.svg" | head -5)
if [ -n "$uncompressed" ]; then
    echo "📸 Asset optimization opportunities:"
    echo "$uncompressed" | while read file; do
        size=$(ls -lh "$file" | awk '{print $5}')
        echo "  - $(basename "$file"): $size"
    done
    echo "  Recommendation: Optimize images and compress assets"
fi

echo ""
echo "🔢 Build Statistics Summary"
echo "--------------------------"
echo "Build completed at: $(date)"
echo "Node environment: ${NODE_ENV:-development}"
echo "Total files: $(find .vite/build -type f | wc -l)"

# Check if source maps exist
if [ -f ".vite/build/main.js.map" ]; then
    echo "⚠️  Source maps included in build (consider disabling for production)"
else
    echo "✅ Source maps disabled for production"
fi

echo ""
echo "📋 Next Steps"
echo "-------------"
echo "1. Review large files for optimization opportunities"
echo "2. Consider implementing lazy loading for large components"
echo "3. Optimize assets (images, fonts) if needed"
echo "4. Test application performance in production mode"

echo ""
echo "Analysis complete! 🎉"