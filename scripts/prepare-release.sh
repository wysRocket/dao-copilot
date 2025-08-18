#!/bin/bash

# Release Preparation Script for DAO Copilot
# Automates version bumping, changelog generation, and release preparation

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

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
    echo -e "${BLUE}[RELEASE]${NC} $1"
}

# Check git status
check_git_status() {
    if [ -n "$(git status --porcelain)" ]; then
        print_error "Working directory is not clean. Please commit or stash your changes."
        git status --short
        exit 1
    fi
    
    if [ "$(git rev-parse --abbrev-ref HEAD)" != "master" ] && [ "$(git rev-parse --abbrev-ref HEAD)" != "main" ]; then
        print_warning "Not on master/main branch. Current branch: $(git rev-parse --abbrev-ref HEAD)"
        read -p "Continue anyway? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
}

# Generate changelog since last tag
generate_changelog() {
    local since_tag=$1
    local output_file="CHANGELOG_DRAFT.md"
    
    print_status "Generating changelog since $since_tag..."
    
    # Get commits since last tag
    local commits=$(git log ${since_tag}..HEAD --pretty=format:"- %s (%h)")
    local date=$(date +"%Y-%m-%d")
    local version=$2
    
    cat > $output_file << EOF
# Changelog

## [${version}] - ${date}

### Added
$(echo "$commits" | grep -E "^- (feat|add)" | sed 's/^- /- /' || echo "- No new features")

### Fixed  
$(echo "$commits" | grep -E "^- (fix|bug)" | sed 's/^- /- /' || echo "- No bug fixes")

### Changed
$(echo "$commits" | grep -E "^- (chore|refactor|update)" | sed 's/^- /- /' || echo "- No changes")

### Security
$(echo "$commits" | grep -E "^- (security|sec)" | sed 's/^- /- /' || echo "- No security updates")

### All Commits
$commits

EOF

    print_status "Changelog draft created: $output_file"
}

# Main release preparation function
prepare_release() {
    local release_type=$1
    
    print_header "Preparing $release_type release"
    
    # Check dependencies
    if ! command -v git &> /dev/null; then
        print_error "git is required but not installed"
        exit 1
    fi
    
    if ! command -v node &> /dev/null; then
        print_error "node is required but not installed"
        exit 1
    fi
    
    if ! command -v npm &> /dev/null; then
        print_error "npm is required but not installed"
        exit 1
    fi
    
    # Check git status
    check_git_status
    
    # Get current version
    local current_version=$(node -pe "require('./package.json').version")
    print_status "Current version: $current_version"
    
    # Get last tag
    local last_tag=$(git describe --tags --abbrev=0 2>/dev/null || echo "v0.0.0")
    print_status "Last tag: $last_tag"
    
    # Update version
    print_status "Bumping version ($release_type)..."
    npm version $release_type --no-git-tag-version
    
    local new_version=$(node -pe "require('./package.json').version")
    print_status "New version: $new_version"
    
    # Generate changelog
    generate_changelog $last_tag $new_version
    
    # Update README if needed
    if [ -f "README.md" ]; then
        print_status "Updating README.md with new version references..."
        sed -i.bak "s/Version: \*\*[^*]*\*\*/Version: **$new_version**/" README.md 2>/dev/null || true
        rm -f README.md.bak
    fi
    
    # Run tests
    print_status "Running tests..."
    npm test
    
    # Stage changes
    print_status "Staging changes..."
    git add package.json package-lock.json README.md 2>/dev/null || true
    
    # Commit changes
    local commit_message="chore: release v$new_version"
    print_status "Committing changes: $commit_message"
    git commit -m "$commit_message"
    
    # Create tag
    local tag_name="v$new_version"
    print_status "Creating tag: $tag_name"
    git tag -a $tag_name -m "Release $new_version"
    
    print_header "Release preparation completed!"
    echo ""
    print_status "Next steps:"
    echo "  1. Review the generated changelog: CHANGELOG_DRAFT.md"
    echo "  2. Push the changes: git push && git push --tags"
    echo "  3. The GitHub Actions will automatically build and create a release"
    echo "  4. Edit the GitHub release with the changelog content"
    echo ""
    print_status "Or run: git push && git push --tags"
    
    # Ask if user wants to push
    read -p "Push changes now? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_status "Pushing changes..."
        git push
        git push --tags
        print_status "✅ Release pushed! Check GitHub Actions for build progress."
    fi
}

# Parse arguments
RELEASE_TYPE="patch"

case "${1:-patch}" in
    patch|minor|major|prepatch|preminor|premajor|prerelease)
        RELEASE_TYPE=$1
        ;;
    --help|-h)
        echo "DAO Copilot Release Preparation Script"
        echo ""
        echo "Usage: $0 [release-type]"
        echo ""
        echo "Release Types:"
        echo "  patch      1.0.0 -> 1.0.1 (default)"
        echo "  minor      1.0.0 -> 1.1.0"
        echo "  major      1.0.0 -> 2.0.0"
        echo "  prepatch   1.0.0 -> 1.0.1-0"
        echo "  preminor   1.0.0 -> 1.1.0-0" 
        echo "  premajor   1.0.0 -> 2.0.0-0"
        echo "  prerelease 1.0.1-0 -> 1.0.1-1"
        echo ""
        echo "Examples:"
        echo "  $0              # Patch release"
        echo "  $0 minor        # Minor release"
        echo "  $0 major        # Major release"
        exit 0
        ;;
    *)
        print_error "Invalid release type: $1"
        print_error "Use --help to see valid options"
        exit 1
        ;;
esac

prepare_release $RELEASE_TYPE
