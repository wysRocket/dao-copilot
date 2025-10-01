#!/bin/bash

# DAO Copilot - Production Pipeline Setup Script
# This script helps configure repository secrets and settings for CI/CD

set -e

REPO="wysRocket/dao-copilot"
echo "🚀 Setting up production build pipeline for $REPO"
echo "=================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_step() {
    echo -e "\n${BLUE}📋 Step: $1${NC}"
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

# Check if GitHub CLI is installed and authenticated
print_step "Checking GitHub CLI authentication"
if ! command -v gh &> /dev/null; then
    print_error "GitHub CLI is not installed. Please install it first:"
    echo "  brew install gh"
    exit 1
fi

if ! gh auth status &> /dev/null; then
    print_error "GitHub CLI is not authenticated. Please run:"
    echo "  gh auth login"
    exit 1
fi

print_success "GitHub CLI is authenticated"

# Function to set repository secret
set_secret() {
    local secret_name=$1
    local secret_description=$2
    local is_optional=${3:-false}
    
    print_step "Setting up secret: $secret_name"
    echo "Description: $secret_description"
    
    if [ "$is_optional" = true ]; then
        echo -n "Set this secret? (y/N): "
        read -r response
        if [[ ! "$response" =~ ^[Yy]$ ]]; then
            print_warning "Skipping optional secret: $secret_name"
            return
        fi
    fi
    
    echo -n "Enter value for $secret_name (input will be hidden): "
    read -rs secret_value
    echo
    
    if [ -n "$secret_value" ]; then
        if gh secret set "$secret_name" --body "$secret_value" --repo "$REPO" 2>/dev/null; then
            print_success "Set secret: $secret_name"
        else
            print_error "Failed to set secret: $secret_name"
        fi
    else
        print_warning "Skipping empty secret: $secret_name"
    fi
}

print_step "Repository Secrets Configuration"
echo "The following secrets need to be configured for full pipeline functionality:"
echo

# Required secrets
echo -e "${YELLOW}Required Secrets:${NC}"
set_secret "GH_TOKEN" "GitHub Personal Access Token with repo and workflow permissions"

echo -e "\n${YELLOW}Code Signing Secrets (for production releases):${NC}"
set_secret "CSC_LINK" "Code signing certificate (p12 file base64 encoded)" true
set_secret "CSC_KEY_PASSWORD" "Password for code signing certificate" true

echo -e "\n${YELLOW}macOS Notarization Secrets:${NC}"
set_secret "APPLE_ID" "Apple ID for notarization" true
set_secret "APPLE_ID_PASSWORD" "App-specific password for Apple ID" true
set_secret "APPLE_TEAM_ID" "Apple Team ID for notarization" true

echo -e "\n${YELLOW}Windows Code Signing:${NC}"
set_secret "WIN_CSC_LINK" "Windows code signing certificate (p12 file base64 encoded)" true
set_secret "WIN_CSC_KEY_PASSWORD" "Password for Windows code signing certificate" true

# Configure branch protection
print_step "Setting up branch protection rules"
echo "Configuring protection for master branch..."

PROTECTION_CONFIG='{
  "required_status_checks": {
    "strict": true,
    "contexts": [
      "ci",
      "build-and-test"
    ]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "required_approving_review_count": 1,
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false
  },
  "restrictions": null
}'

if curl -s -H "Authorization: token $(gh auth token)" \
   -H "Accept: application/vnd.github.v3+json" \
   -X PUT \
   -d "$PROTECTION_CONFIG" \
   "https://api.github.com/repos/$REPO/branches/master/protection" > /dev/null; then
    print_success "Branch protection configured for master"
else
    print_warning "Failed to configure branch protection (this may require admin permissions)"
fi

# Enable vulnerability alerts
print_step "Enabling security features"
if gh api -X PATCH "/repos/$REPO" -f has_vulnerability_alerts=true > /dev/null 2>&1; then
    print_success "Enabled vulnerability alerts"
else
    print_warning "Could not enable vulnerability alerts"
fi

# Configure repository settings
print_step "Configuring repository settings"
REPO_CONFIG='{
  "allow_merge_commit": true,
  "allow_squash_merge": true,
  "allow_rebase_merge": true,
  "delete_branch_on_merge": true,
  "has_issues": true,
  "has_wiki": true,
  "has_projects": true
}'

if curl -s -H "Authorization: token $(gh auth token)" \
   -H "Accept: application/vnd.github.v3+json" \
   -X PATCH \
   -d "$REPO_CONFIG" \
   "https://api.github.com/repos/$REPO" > /dev/null; then
    print_success "Repository settings configured"
else
    print_warning "Some repository settings may not have been applied"
fi

print_step "Setup Complete!"
echo "=================================================="
print_success "Production build pipeline is now configured!"
echo
echo "Next steps:"
echo "1. 🔀 Merge the production build pipeline PR"
echo "2. 🏷️  Create a version tag to trigger your first release:"
echo "   git tag v1.0.0"
echo "   git push origin v1.0.0"
echo "3. 📦 Check the Actions tab to see your builds running"
echo "4. 🚀 Download built applications from GitHub Releases"
echo
echo -e "${BLUE}Pipeline Features:${NC}"
echo "✅ Automated CI/CD on pull requests"
echo "✅ Multi-platform builds (Windows, macOS, Linux)"
echo "✅ Automatic GitHub Releases"
echo "✅ Code signing support"
echo "✅ Security scanning"
echo "✅ Dependency updates via Dependabot"
echo
echo -e "${YELLOW}Optional Enhancements:${NC}"
echo "🔐 Set up code signing certificates for production releases"
echo "🍎 Configure macOS notarization for App Store distribution"
echo "🏪 Set up Windows Store publishing"
echo "📱 Configure auto-updater endpoints"

print_success "Setup script completed successfully!"
