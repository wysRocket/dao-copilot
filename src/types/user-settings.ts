export interface UserSettings {
  transcriptionLanguage?: string;
  audioQuality?: 'low' | 'medium' | 'high';
  uiTheme?: 'light' | 'dark' | 'system';
  // Add other user setting fields as needed
  [key: string]: unknown;
}
