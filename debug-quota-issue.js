/**
 * Debug script for quota and API key issues
 * Run this in the console to check quota status and force recovery
 */

console.log('🔍 DAO Copilot Quota Debug Tool');
console.log('================================');

// Check current quota status
function checkQuotaStatus() {
  try {
    if (typeof window !== 'undefined' && window.getQuotaStatus) {
      const quotaStatus = window.getQuotaStatus();
      console.log('📊 Current Quota Status:', quotaStatus);
      
      if (quotaStatus.isQuotaExceeded) {
        const timeUntilReset = quotaStatus.timeUntilReset;
        const minutesRemaining = timeUntilReset ? Math.ceil(timeUntilReset / 60000) : 'unknown';
        console.warn(`⏰ Quota exceeded. Time until reset: ${minutesRemaining} minutes`);
      } else {
        console.log('✅ Quota status is good');
      }
      
      return quotaStatus;
    } else {
      console.error('❌ getQuotaStatus not available. Make sure the app is loaded.');
      return null;
    }
  } catch (error) {
    console.error('❌ Error checking quota status:', error);
    return null;
  }
}

// Force quota reset
function forceQuotaReset() {
  try {
    if (typeof window !== 'undefined' && window.forceQuotaReset) {
      window.forceQuotaReset();
      console.log('🔄 Quota reset forced successfully');
      return true;
    } else {
      console.error('❌ forceQuotaReset not available');
      return false;
    }
  } catch (error) {
    console.error('❌ Error forcing quota reset:', error);
    return false;
  }
}

// Emergency recovery
function emergencyRecover() {
  try {
    if (typeof window !== 'undefined' && window.emergencyRecoverTranscription) {
      window.emergencyRecoverTranscription();
      console.log('🚑 Emergency recovery initiated');
      return true;
    } else {
      console.error('❌ emergencyRecoverTranscription not available');
      return false;
    }
  } catch (error) {
    console.error('❌ Error during emergency recovery:', error);
    return false;
  }
}

// Test transcription system
function testTranscription() {
  try {
    if (typeof window !== 'undefined' && window.forceTestTranscription) {
      window.forceTestTranscription();
      console.log('🧪 Test transcription initiated');
      return true;
    } else {
      console.error('❌ forceTestTranscription not available');
      return false;
    }
  } catch (error) {
    console.error('❌ Error testing transcription:', error);
    return false;
  }
}

// Main debug function
function debugQuotaIssue() {
  console.log('🔧 Starting quota issue diagnosis...');
  console.log('');
  
  // Step 1: Check quota status
  console.log('Step 1: Checking quota status...');
  const quotaStatus = checkQuotaStatus();
  console.log('');
  
  // Step 2: If quota exceeded, force reset
  if (quotaStatus && quotaStatus.isQuotaExceeded) {
    console.log('Step 2: Quota exceeded detected, forcing reset...');
    forceQuotaReset();
    console.log('');
    
    // Wait a moment and check again
    setTimeout(() => {
      console.log('Step 2b: Checking quota status after reset...');
      checkQuotaStatus();
      console.log('');
    }, 1000);
  } else {
    console.log('Step 2: Quota status looks good, skipping reset');
    console.log('');
  }
  
  // Step 3: Emergency recovery
  console.log('Step 3: Running emergency recovery...');
  emergencyRecover();
  console.log('');
  
  // Step 4: Test transcription
  setTimeout(() => {
    console.log('Step 4: Testing transcription system...');
    testTranscription();
    console.log('');
    console.log('✅ Debug procedure complete!');
    console.log('');
    console.log('📝 Next steps:');
    console.log('1. Wait a few seconds for recovery to complete');
    console.log('2. Try speaking into your microphone');
    console.log('3. Check the transcription display for results');
    console.log('4. If issues persist, check your API key quotas in Google Cloud Console');
  }, 2000);
}

// Export functions for manual use
if (typeof window !== 'undefined') {
  window.debugQuotaIssue = debugQuotaIssue;
  window.checkQuotaStatus = checkQuotaStatus;
  window.forceQuotaReset = forceQuotaReset;
  window.emergencyRecover = emergencyRecover;
  window.testTranscription = testTranscription;
  
  console.log('');
  console.log('🎯 Available debug functions:');
  console.log('• window.debugQuotaIssue() - Run full diagnosis');
  console.log('• window.checkQuotaStatus() - Check current quota');
  console.log('• window.forceQuotaReset() - Force quota reset');
  console.log('• window.emergencyRecover() - Emergency recovery');
  console.log('• window.testTranscription() - Test transcription');
  console.log('');
  console.log('🚀 Quick Start: Run window.debugQuotaIssue() to begin');
}

// Auto-run if this script is executed directly
if (typeof window !== 'undefined') {
  console.log('');
  console.log('🤖 Auto-running quota diagnosis in 2 seconds...');
  console.log('(You can also run window.debugQuotaIssue() manually)');
  
  setTimeout(() => {
    debugQuotaIssue();
  }, 2000);
}
