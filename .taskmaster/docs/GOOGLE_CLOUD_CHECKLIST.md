# Google Cloud Setup Checklist - dao-copilot Gemini Live API

## 📋 **Progress Tracker**

### **Phase 1: Google Cloud Account Setup**

- [ ] 1.1 Access Google Cloud Console (console.cloud.google.com)
- [ ] 1.2 Sign in with Google account
- [ ] 1.3 Accept Google Cloud Platform Terms of Service
- [ ] 1.4 Complete phone verification (if required)

### **Phase 2: Project Creation**

- [ ] 2.1 Create new project: `dao-copilot-transcription`
- [ ] 2.2 Set project ID: `dao-copilot-transcription-2025`
- [ ] 2.3 Select organization/location
- [ ] 2.4 Note project ID for later use: `_________________`

### **Phase 3: API Enablement**

- [ ] 3.1 Navigate to APIs & Services > Library
- [ ] 3.2 Enable **Generative AI API**
- [ ] 3.3 Enable **Vertex AI API**
- [ ] 3.4 Enable **Cloud AI Platform API**
- [ ] 3.5 Enable **Cloud Resource Manager API**

### **Phase 4: Billing Setup**

- [ ] 4.1 Navigate to Billing section
- [ ] 4.2 Create billing account: `dao-copilot-transcription-billing`
- [ ] 4.3 Add payment method (credit card/bank)
- [ ] 4.4 Link project to billing account
- [ ] 4.5 Set up budget: $200/month with alerts at 50%, 75%, 90%, 100%

### **Phase 5: Service Account Creation**

- [ ] 5.1 Go to IAM & Admin > Service Accounts
- [ ] 5.2 Create service account: `gemini-transcription-service`
- [ ] 5.3 Assign roles: Vertex AI User, AI Platform Developer, Service Account User
- [ ] 5.4 Generate JSON key file
- [ ] 5.5 Download and secure key file
- [ ] 5.6 Key file location: `_________________`

### **Phase 6: Environment Setup**

- [ ] 6.1 Install Google Cloud CLI (optional)
- [ ] 6.2 Test API connectivity
- [ ] 6.3 Add environment variables to .env file
- [ ] 6.4 Test authentication

### **Phase 7: Application Preparation**

- [ ] 7.1 Create project description document
- [ ] 7.2 Prepare technical implementation plan
- [ ] 7.3 Document expected usage patterns
- [ ] 7.4 Create supporting architecture diagrams
- [ ] 7.5 Review application materials with team

### **Phase 8: Application Submission**

- [ ] 8.1 Access Google AI Studio (aistudio.google.com)
- [ ] 8.2 Navigate to API access requests
- [ ] 8.3 Complete application form
- [ ] 8.4 Upload supporting documents
- [ ] 8.5 Submit application
- [ ] 8.6 Note application reference: `_________________`

### **Phase 9: Follow-up**

- [ ] 9.1 Set up calendar reminders for follow-up
- [ ] 9.2 Monitor email for Google responses
- [ ] 9.3 Respond promptly to any requests for clarification
- [ ] 9.4 Document approval status

## 📝 **Important Information to Record**

### **Project Details**

- **Project Name**: dao-copilot-transcription
- **Project ID**: **********\_\_\_\_**********
- **Project Number**: ********\_\_\_\_********
- **Billing Account ID**: ********\_********

### **Service Account**

- **Service Account Email**: ******\_\_******
- **Key File Location**: ********\_\_********
- **Key Creation Date**: ********\_\_********

### **Application Tracking**

- **Application Date**: ********\_\_\_********
- **Reference Number**: ********\_\_********
- **Expected Response**: ********\_********
- **Approval Status**: ********\_\_\_********

## 🔧 **Environment Variables Template**

```bash
# Add these to your .env file after setup
GOOGLE_CLOUD_PROJECT_ID=dao-copilot-transcription-2025
GOOGLE_APPLICATION_CREDENTIALS=/path/to/your/service-account-key.json
GEMINI_LIVE_API_REGION=us-central1
GEMINI_API_ENDPOINT=https://generativelanguage.googleapis.com
```

## 📞 **Support Contacts**

- **Google Cloud Support**: Access through console
- **Billing Questions**: Billing section in console
- **API Access Issues**: Google AI Studio support
- **Technical Questions**: Developer forums

## 🎯 **Next Steps After Setup**

1. Complete this checklist systematically
2. Test API connectivity before application
3. Prepare comprehensive application materials
4. Submit application with all supporting documents
5. Set up monitoring for application status
6. Begin planning Phase 2 (Technical Architecture) while waiting

---

**Created**: July 30, 2025  
**Last Updated**: ******\_\_\_\_******  
**Completed By**: ********\_********
