import React from 'react';
import {render, screen, fireEvent} from '@testing-library/react';
import {describe, it, expect, vi, beforeEach} from 'vitest';
import {AIAssistantProvider} from '../../../contexts/AIAssistantContext';
import AIAssistantToggle from '../AIAssistantToggle';
import AIAssistantWindow from '../AIAssistantWindow';
import AIAssistantHeader from '../AIAssistantHeader';
import AIAssistantFeatures from '../AIAssistantFeatures';

// Mock the window manager API
const mockWindowManager = {
  createWindow: vi.fn(),
  closeWindow: vi.fn(),
  showWindow: vi.fn(),
  hideWindow: vi.fn(),
  toggleWindow: vi.fn(),
  isWindowVisible: vi.fn().mockResolvedValue(false),
  getCurrentWindowType: vi.fn().mockReturnValue(null),
};

// Mock the window object
beforeEach(() => {
  vi.stubGlobal('windowManager', mockWindowManager);
});

describe('AIAssistantToggle', () => {
  it('renders the toggle button', () => {
    render(
      <AIAssistantProvider>
        <AIAssistantToggle />
      </AIAssistantProvider>,
    );
    
    const toggleButton = screen.getByRole('button', {name: /show ai assistant/i});
    expect(toggleButton).toBeInTheDocument();
  });

  it('calls toggleVisibility when clicked', async () => {
    render(
      <AIAssistantProvider>
        <AIAssistantToggle />
      </AIAssistantProvider>,
    );
    
    const toggleButton = screen.getByRole('button', {name: /show ai assistant/i});
    fireEvent.click(toggleButton);
    
    expect(mockWindowManager.toggleWindow).toHaveBeenCalled();
  });
});

describe('AIAssistantWindow', () => {
  it('renders the AI Assistant window components', () => {
    render(
      <AIAssistantProvider>
        <AIAssistantWindow />
      </AIAssistantProvider>,
    );
    
    // Check for the header
    expect(screen.getByText('Ask AI')).toBeInTheDocument();
    
    // Check for the response section
    expect(screen.getByText(/Hi, I'm Cluely!/i)).toBeInTheDocument();
    
    // Check for the features section
    expect(screen.getByText('Features')).toBeInTheDocument();
    expect(screen.getByText('Screen Monitoring')).toBeInTheDocument();
    expect(screen.getByText('Audio Listening')).toBeInTheDocument();
    expect(screen.getByText('Proactive Assistance')).toBeInTheDocument();
    
    // Check for the input section
    expect(screen.getByPlaceholderText('Ask a question...')).toBeInTheDocument();
  });
});

describe('AIAssistantFeatures', () => {
  it('toggles features when clicked', () => {
    render(
      <AIAssistantProvider>
        <AIAssistantFeatures />
      </AIAssistantProvider>,
    );
    
    // Get the toggle switches
    const toggles = screen.getAllByRole('checkbox');
    expect(toggles).toHaveLength(3);
    
    // Toggle screen monitoring
    fireEvent.click(toggles[0]);
    
    // Toggle audio listening
    fireEvent.click(toggles[1]);
    
    // Toggle proactive assistance
    fireEvent.click(toggles[2]);
    
    // Check that all toggles are now checked
    toggles.forEach(toggle => {
      expect(toggle).toBeChecked();
    });
  });
});