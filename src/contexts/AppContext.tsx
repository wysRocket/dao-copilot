import React, {
  createContext,
  useContext,
  useReducer,
  useEffect,
  ReactNode,
} from 'react';
import {TranscriptionResult} from '../services/main-stt-transcription';

// Types for our global app state
export interface AppState {
  // AI Assistant state
  isAIVisible: boolean;
  aiQuery: string;
  aiResponse: string;
  isAILoading: boolean;

  // Audio/Transcription state
  isRecording: boolean;
  recordingTime: number;
  isTranscribing: boolean;
  transcripts: TranscriptionResult[];
  recordingStatus: string;

  // Window management state
  visibleWindows: Set<string>;
  windowPositions: Record<string, {x: number; y: number}>;

  // Theme state
  theme: 'light' | 'dark' | 'system';

  // Features state
  features: {
    screenMonitoring: boolean;
    audioListening: boolean;
    proactiveAssistance: boolean;
  };
}

// Action types for state updates
export type AppAction =
  | {type: 'TOGGLE_AI_VISIBILITY'}
  | {type: 'SET_AI_VISIBLE'; payload: boolean}
  | {type: 'SET_AI_QUERY'; payload: string}
  | {type: 'SET_AI_RESPONSE'; payload: string}
  | {type: 'SET_AI_LOADING'; payload: boolean}
  | {type: 'SET_RECORDING'; payload: boolean}
  | {type: 'SET_RECORDING_TIME'; payload: number}
  | {type: 'SET_TRANSCRIBING'; payload: boolean}
  | {type: 'ADD_TRANSCRIPT'; payload: TranscriptionResult}
  | {type: 'SET_TRANSCRIPTS'; payload: TranscriptionResult[]}
  | {type: 'SET_RECORDING_STATUS'; payload: string}
  | {type: 'SHOW_WINDOW'; payload: string}
  | {type: 'HIDE_WINDOW'; payload: string}
  | {
      type: 'SET_WINDOW_POSITION';
      payload: {windowId: string; x: number; y: number};
    }
  | {type: 'SET_THEME'; payload: 'light' | 'dark' | 'system'}
  | {type: 'TOGGLE_FEATURE'; payload: keyof AppState['features']}
  | {
      type: 'SET_FEATURE';
      payload: {feature: keyof AppState['features']; enabled: boolean};
    };

// Initial state
const initialState: AppState = {
  isAIVisible: false,
  aiQuery: '',
  aiResponse: '',
  isAILoading: false,
  isRecording: false,
  recordingTime: 0,
  isTranscribing: false,
  transcripts: [],
  recordingStatus: 'Ready to record',
  visibleWindows: new Set(),
  windowPositions: {},
  theme: 'system',
  features: {
    screenMonitoring: true,
    audioListening: true,
    proactiveAssistance: false,
  },
};

// Reducer function
function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'TOGGLE_AI_VISIBILITY':
      return {...state, isAIVisible: !state.isAIVisible};

    case 'SET_AI_VISIBLE':
      return {...state, isAIVisible: action.payload};

    case 'SET_AI_QUERY':
      return {...state, aiQuery: action.payload};

    case 'SET_AI_RESPONSE':
      return {...state, aiResponse: action.payload};

    case 'SET_AI_LOADING':
      return {...state, isAILoading: action.payload};

    case 'SET_RECORDING':
      return {...state, isRecording: action.payload};

    case 'SET_RECORDING_TIME':
      return {...state, recordingTime: action.payload};

    case 'SET_TRANSCRIBING':
      return {...state, isTranscribing: action.payload};

    case 'ADD_TRANSCRIPT':
      return {
        ...state,
        transcripts: [...state.transcripts, action.payload],
      };

    case 'SET_TRANSCRIPTS':
      return {...state, transcripts: action.payload};

    case 'SET_RECORDING_STATUS':
      return {...state, recordingStatus: action.payload};

    case 'SHOW_WINDOW':
      return {
        ...state,
        visibleWindows: new Set([...state.visibleWindows, action.payload]),
      };

    case 'HIDE_WINDOW': {
      const newVisibleWindows = new Set(state.visibleWindows);
      newVisibleWindows.delete(action.payload);
      return {...state, visibleWindows: newVisibleWindows};
    }

    case 'SET_WINDOW_POSITION':
      return {
        ...state,
        windowPositions: {
          ...state.windowPositions,
          [action.payload.windowId]: {x: action.payload.x, y: action.payload.y},
        },
      };

    case 'SET_THEME':
      return {...state, theme: action.payload};

    case 'TOGGLE_FEATURE':
      return {
        ...state,
        features: {
          ...state.features,
          [action.payload]: !state.features[action.payload],
        },
      };

    case 'SET_FEATURE':
      return {
        ...state,
        features: {
          ...state.features,
          [action.payload.feature]: action.payload.enabled,
        },
      };

    default:
      return state;
  }
}

// Context creation
const AppContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
} | null>(null);

// Provider component
export function AppContextProvider({children}: {children: ReactNode}) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  // Initialize theme from localStorage
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as
      | 'light'
      | 'dark'
      | 'system'
      | null;
    if (savedTheme) {
      dispatch({type: 'SET_THEME', payload: savedTheme});
    }
  }, []);

  // Save theme to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('theme', state.theme);
  }, [state.theme]);

  return (
    <AppContext.Provider value={{state, dispatch}}>
      {children}
    </AppContext.Provider>
  );
}

// Custom hook to use the app context
export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within AppContextProvider');
  }
  return context;
}

// Convenience hooks for specific parts of state
export function useAIAssistant() {
  const {state, dispatch} = useAppContext();

  return {
    isVisible: state.isAIVisible,
    query: state.aiQuery,
    response: state.aiResponse,
    isLoading: state.isAILoading,
    toggleVisibility: () => dispatch({type: 'TOGGLE_AI_VISIBILITY'}),
    setVisible: (visible: boolean) =>
      dispatch({type: 'SET_AI_VISIBLE', payload: visible}),
    setQuery: (query: string) =>
      dispatch({type: 'SET_AI_QUERY', payload: query}),
    setResponse: (response: string) =>
      dispatch({type: 'SET_AI_RESPONSE', payload: response}),
    setLoading: (loading: boolean) =>
      dispatch({type: 'SET_AI_LOADING', payload: loading}),
  };
}

export function useRecording() {
  const {state, dispatch} = useAppContext();

  return {
    isRecording: state.isRecording,
    recordingTime: state.recordingTime,
    isTranscribing: state.isTranscribing,
    status: state.recordingStatus,
    transcripts: state.transcripts,
    setRecording: (recording: boolean) =>
      dispatch({type: 'SET_RECORDING', payload: recording}),
    setRecordingTime: (time: number) =>
      dispatch({type: 'SET_RECORDING_TIME', payload: time}),
    setTranscribing: (transcribing: boolean) =>
      dispatch({type: 'SET_TRANSCRIBING', payload: transcribing}),
    addTranscript: (transcript: TranscriptionResult) =>
      dispatch({type: 'ADD_TRANSCRIPT', payload: transcript}),
    setTranscripts: (transcripts: TranscriptionResult[]) =>
      dispatch({type: 'SET_TRANSCRIPTS', payload: transcripts}),
    setStatus: (status: string) =>
      dispatch({type: 'SET_RECORDING_STATUS', payload: status}),
  };
}

export function useWindowManager() {
  const {state, dispatch} = useAppContext();

  return {
    visibleWindows: state.visibleWindows,
    windowPositions: state.windowPositions,
    showWindow: (windowId: string) =>
      dispatch({type: 'SHOW_WINDOW', payload: windowId}),
    hideWindow: (windowId: string) =>
      dispatch({type: 'HIDE_WINDOW', payload: windowId}),
    setWindowPosition: (windowId: string, x: number, y: number) =>
      dispatch({type: 'SET_WINDOW_POSITION', payload: {windowId, x, y}}),
  };
}

export function useFeatures() {
  const {state, dispatch} = useAppContext();

  return {
    features: state.features,
    toggleFeature: (feature: keyof AppState['features']) =>
      dispatch({type: 'TOGGLE_FEATURE', payload: feature}),
    setFeature: (feature: keyof AppState['features'], enabled: boolean) =>
      dispatch({type: 'SET_FEATURE', payload: {feature, enabled}}),
  };
}
