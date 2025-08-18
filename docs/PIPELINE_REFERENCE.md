# 🚀 DAO Copilot Production Pipeline Quick Reference

## Overview

The production build pipeline automatically builds, tests, and publishes your Electron application across multiple platforms using GitHub Actions.

## 🔄 Workflow Triggers

### Continuous Integration (CI)

- **Trigger**: Every push and pull request
- **Actions**: Linting, testing, security scanning, dependency checks
- **File**: `.github/workflows/ci.yml`

### Release Builds

- **Trigger**: Git tags matching `v*.*.*` (e.g., `v1.0.0`, `v2.1.3`)
- **Actions**: Multi-platform builds, code signing, GitHub Release creation
- **File**: `.github/workflows/release.yml`

### Manual Publishing

- **Trigger**: Manual dispatch from GitHub Actions tab
- **Actions**: Build and publish to various platforms
- **File**: `.github/workflows/publish.yml`

## 📦 Release Process

### 1. Standard Release

```bash
# Update version in package.json
npm version patch   # or minor, major
git push origin main
git push --tags

# The pipeline will automatically:
# ✅ Run all tests
# ✅ Build for Windows, macOS, Linux
# ✅ Sign code (if certificates configured)
# ✅ Create GitHub Release
# ✅ Upload binaries
```

### 2. Pre-release

```bash
npm version prerelease --preid=beta
git push origin main
git push --tags
```

### 3. Manual Build

1. Go to GitHub Actions tab
2. Select "Publish" workflow
3. Click "Run workflow"
4. Choose your options

## 🛠️ Build Outputs

### Windows

- `dao-copilot-setup-{version}.exe` - NSIS installer
- `dao-copilot-{version}.exe` - Portable executable
- `dao-copilot-{version}.msi` - MSI installer (optional)

### macOS

- `dao-copilot-{version}.dmg` - DMG installer
- `dao-copilot-{version}-mac.zip` - Zip archive
- `dao-copilot-{version}.pkg` - PKG installer (optional)

### Linux

- `dao-copilot-{version}.AppImage` - AppImage (recommended)
- `dao-copilot_{version}_amd64.deb` - Debian package
- `dao-copilot-{version}.x86_64.rpm` - RPM package

## 🔐 Security & Code Signing

### Required Secrets (Repository Settings > Secrets)

#### GitHub Publishing

- `GH_TOKEN`: GitHub Personal Access Token with repo/workflow permissions

#### Windows Code Signing

- `WIN_CSC_LINK`: Base64 encoded .p12 certificate
- `WIN_CSC_KEY_PASSWORD`: Certificate password

#### macOS Code Signing & Notarization

- `CSC_LINK`: Base64 encoded .p12 certificate
- `CSC_KEY_PASSWORD`: Certificate password
- `APPLE_ID`: Apple Developer Account email
- `APPLE_ID_PASSWORD`: App-specific password
- `APPLE_TEAM_ID`: Apple Developer Team ID

### Setting up Code Signing Certificates

#### Windows

1. Obtain code signing certificate from trusted CA
2. Export as .p12 file
3. Convert to base64: `base64 -i certificate.p12 | pbcopy`
4. Add to GitHub secrets

#### macOS

1. Download certificates from Apple Developer portal
2. Export from Keychain as .p12
3. Convert to base64: `base64 -i certificate.p12 | pbcopy`
4. Create app-specific password in Apple ID settings
5. Add all secrets to GitHub

## 🔧 Configuration Files

### `electron-builder.yml`

Main build configuration for all platforms:

- App metadata and branding
- Platform-specific build options
- Code signing configuration
- Auto-updater settings

### `.github/workflows/`

- `ci.yml`: Continuous integration
- `release.yml`: Release builds
- `publish.yml`: Publishing workflow

### `package.json`

Build scripts and publishing configuration:

```json
{
  "scripts": {
    "build": "npm run build:main && npm run build:renderer",
    "dist": "electron-builder",
    "dist:win": "electron-builder --win",
    "dist:mac": "electron-builder --mac",
    "dist:linux": "electron-builder --linux",
    "prepare-release": "./scripts/prepare-release.sh",
    "publish": "electron-builder --publish=always"
  }
}
```

## 🚨 Troubleshooting

### Build Failures

#### Common Issues

1. **Missing dependencies**: Check `package.json` and lock files
2. **Node version mismatch**: Pipeline uses Node.js 20
3. **Test failures**: Fix failing tests before release
4. **Code signing errors**: Verify certificate secrets

#### Debug Steps

1. Check Actions tab for detailed logs
2. Look for specific error messages
3. Compare with successful builds
4. Test locally with same Node version

### Code Signing Issues

#### Windows

- Verify certificate is not expired
- Check timestamp server availability
- Ensure certificate supports code signing

#### macOS

- Verify all required secrets are set
- Check Apple Developer account status
- Ensure certificates are not expired
- Verify app-specific password

### Release Not Created

1. Check if tag format matches `v*.*.*`
2. Verify `GH_TOKEN` has correct permissions
3. Ensure release workflow completed successfully
4. Check for conflicting release names

## 📊 Monitoring

### GitHub Actions

- View all workflow runs in the Actions tab
- Check build artifacts in completed runs
- Monitor security scanning results

### Releases

- All releases appear in the Releases section
- Download statistics available
- Release notes generated automatically

### Security

- Dependabot alerts for vulnerable dependencies
- CodeQL security scanning results
- Vulnerability alerts in repository

## 🔄 Auto-Updates

The application includes auto-updater functionality:

- Checks GitHub Releases for updates
- Downloads and installs updates automatically
- Configurable update intervals
- User notification system

### Configuration

Auto-updater settings in `electron-builder.yml`:

```yaml
publish:
  provider: github
  owner: wysRocket
  repo: dao-copilot
```

## 📋 Maintenance

### Regular Tasks

1. **Dependencies**: Dependabot creates PRs for updates
2. **Security**: Review security alerts weekly
3. **Certificates**: Renew before expiration
4. **Node.js**: Update pipeline Node version annually

### Version Management

- Use semantic versioning (MAJOR.MINOR.PATCH)
- Tag format: `v1.2.3`
- Pre-releases: `v1.2.3-beta.1`
- Release candidates: `v1.2.3-rc.1`

## 🎯 Best Practices

1. **Test before tagging**: Ensure all tests pass
2. **Review changes**: Use pull requests for all changes
3. **Update documentation**: Keep README and docs current
4. **Monitor builds**: Check Actions tab after releases
5. **Security first**: Keep dependencies updated
6. **Sign releases**: Always use code signing for production

---

For detailed setup instructions, run: `./scripts/setup-pipeline.sh`
