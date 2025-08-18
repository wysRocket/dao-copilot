#!/bin/bash

# DAO Copilot - Release Creation Script
# Automates the process of creating new releases

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_step() {
    echo -e "\n${BLUE}📋 $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check if we're in the right directory
if [[ ! -f "package.json" ]]; then
    print_error "Please run this script from the project root directory"
    exit 1
fi

# Check for uncommitted changes
if [[ -n $(git status --porcelain) ]]; then
    print_error "You have uncommitted changes. Please commit or stash them first."
    git status --short
    exit 1
fi

# Get current version
CURRENT_VERSION=$(node -p "require('./package.json').version")
print_step "Current version: $CURRENT_VERSION"

# Ask for version type
echo "What type of release would you like to create?"
echo "1) patch (1.0.0 -> 1.0.1)"
echo "2) minor (1.0.0 -> 1.1.0)" 
echo "3) major (1.0.0 -> 2.0.0)"
echo "4) prerelease (1.0.0 -> 1.0.1-0 or 1.0.1-0 -> 1.0.1-1)"
echo "5) custom version"
echo -n "Choose (1-5): "
read -r choice

case $choice in
    1) VERSION_TYPE="patch" ;;
    2) VERSION_TYPE="minor" ;;
    3) VERSION_TYPE="major" ;;
    4) VERSION_TYPE="prerelease" ;;
    5) 
        echo -n "Enter custom version (e.g., 1.2.3 or 1.2.3-beta.1): "
        read -r CUSTOM_VERSION
        if [[ ! $CUSTOM_VERSION =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9\.-]+)?$ ]]; then
            print_error "Invalid version format"
            exit 1
        fi
        ;;
    *)
        print_error "Invalid choice"
        exit 1
        ;;
esac

# Update version in package.json
print_step "Updating version"
if [[ $choice == "5" ]]; then
    npm version "$CUSTOM_VERSION" --no-git-tag-version
    NEW_VERSION=$CUSTOM_VERSION
else
    NEW_VERSION=$(npm version "$VERSION_TYPE" --no-git-tag-version)
    NEW_VERSION=${NEW_VERSION#v} # Remove 'v' prefix if present
fi

print_success "Updated version to: $NEW_VERSION"

# Ask for release notes
print_step "Creating release notes"
echo "Enter release notes (press Ctrl+D when done):"
RELEASE_NOTES=$(cat)

if [[ -z "$RELEASE_NOTES" ]]; then
    print_warning "No release notes provided"
    RELEASE_NOTES="Release v$NEW_VERSION

## Changes
- Bug fixes and improvements

## Installation
Download the appropriate installer for your platform from the assets below."
fi

# Create release notes file
RELEASE_NOTES_FILE=".tmp-release-notes.md"
cat > "$RELEASE_NOTES_FILE" << EOF
$RELEASE_NOTES
EOF

# Commit version bump
print_step "Committing version bump"
git add package.json package-lock.json
git commit -m "chore: bump version to $NEW_VERSION"

# Create and push tag
print_step "Creating and pushing tag"
git tag -a "v$NEW_VERSION" -m "Release v$NEW_VERSION"

echo "Ready to push changes and create release."
echo -n "Continue? (y/N): "
read -r confirm

if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    print_warning "Release cancelled. Reverting changes..."
    git reset --hard HEAD~1
    git tag -d "v$NEW_VERSION"
    rm -f "$RELEASE_NOTES_FILE"
    exit 1
fi

# Push changes and tag
git push origin $(git branch --show-current)
git push origin "v$NEW_VERSION"

print_success "Tag v$NEW_VERSION pushed successfully!"

# Wait a moment for GitHub to process the tag
sleep 2

# Check if release workflow started
print_step "Checking release workflow status"
WORKFLOW_URL="https://github.com/wysRocket/dao-copilot/actions"
echo "🔗 Check build progress at: $WORKFLOW_URL"

# Clean up
rm -f "$RELEASE_NOTES_FILE"

print_step "Release Process Complete!"
echo "=================================================="
print_success "Release v$NEW_VERSION has been created!"
echo
echo "What happens next:"
echo "1. 🔄 GitHub Actions will automatically build your app"
echo "2. 📦 Binaries will be created for Windows, macOS, and Linux"
echo "3. 🚀 A GitHub Release will be published with download links"
echo "4. ⏱️  This usually takes 10-15 minutes"
echo
echo "Monitor progress:"
echo "🔗 Actions: $WORKFLOW_URL"
echo "🔗 Releases: https://github.com/wysRocket/dao-copilot/releases"
echo
echo "If the build fails:"
echo "- Check the Actions tab for error logs"
echo "- Common issues: test failures, missing secrets, dependency problems"
echo "- You can re-run failed workflows from the Actions tab"

print_success "Happy releasing! 🎉"
