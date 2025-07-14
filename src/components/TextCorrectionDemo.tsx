import React, { useState, useEffect } from 'react';
import { TextCorrectionRenderer } from './TextCorrectionRenderer';
import '../styles/text-correction-renderer.css';

/**
 * Demo component showcasing text correction capabilities
 */
export const TextCorrectionDemo: React.FC = () => {
  const [currentText, setCurrentText] = useState('');
  const [isAutoDemo, setIsAutoDemo] = useState(false);
  const [selectedScenario, setSelectedScenario] = useState(0);

  // Demo scenarios showing different types of corrections
  const demoScenarios = [
    {
      name: 'Speech Recognition Correction',
      steps: [
        { text: '', delay: 500 },
        { text: 'The quick', delay: 800 },
        { text: 'The quick brown', delay: 600 },
        { text: 'The quick brown fox', delay: 700 },
        { text: 'The quick brown fix', delay: 400 }, // Typo
        { text: 'The quick brown fox', delay: 1000 }, // Correction
        { text: 'The quick brown fox jumps', delay: 600 },
        { text: 'The quick brown fox jumped', delay: 400 }, // Tense correction
        { text: 'The quick brown fox jumps', delay: 1000 }, // Back to present
        { text: 'The quick brown fox jumps over', delay: 700 },
        { text: 'The quick brown fox jumps over the', delay: 500 },
        { text: 'The quick brown fox jumps over the lazy', delay: 600 },
        { text: 'The quick brown fox jumps over the lasy', delay: 400 }, // Typo
        { text: 'The quick brown fox jumps over the lazy', delay: 1000 }, // Correction
        { text: 'The quick brown fox jumps over the lazy dog', delay: 800 },
        { text: 'The quick brown fox jumps over the lazy dog.', delay: 1200 }
      ]
    },
    {
      name: 'Real-time Dictation',
      steps: [
        { text: '', delay: 300 },
        { text: 'To', delay: 400 },
        { text: 'To be', delay: 500 },
        { text: 'To bee', delay: 300 }, // Homophone error
        { text: 'To be', delay: 800 }, // Correction
        { text: 'To be or', delay: 600 },
        { text: 'To be or not', delay: 500 },
        { text: 'To be or knot', delay: 400 }, // Homophone error
        { text: 'To be or not', delay: 800 }, // Correction
        { text: 'To be or not to', delay: 500 },
        { text: 'To be or not to be', delay: 700 },
        { text: 'To be or not to bee', delay: 400 }, // Repeat error
        { text: 'To be or not to be', delay: 1000 }, // Correction
        { text: 'To be or not to be,', delay: 600 },
        { text: 'To be or not to be, that', delay: 500 },
        { text: 'To be or not to be, that is', delay: 600 },
        { text: 'To be or not to be, that is the', delay: 400 },
        { text: 'To be or not to be, that is the question', delay: 800 },
        { text: 'To be or not to be, that is the question.', delay: 1200 }
      ]
    },
    {
      name: 'Multi-word Corrections',
      steps: [
        { text: '', delay: 400 },
        { text: 'I', delay: 300 },
        { text: 'I would', delay: 500 },
        { text: 'I would like', delay: 400 },
        { text: 'I would like to', delay: 500 },
        { text: 'I would like to schedule', delay: 600 },
        { text: 'I would like to schedule a meeting', delay: 700 },
        { text: 'I would like to schedule a meeting tomorrow', delay: 800 },
        { text: 'I would like to schedule a meeting today', delay: 1000 }, // Date correction
        { text: 'I would like to schedule a meeting today at', delay: 600 },
        { text: 'I would like to schedule a meeting today at 3', delay: 400 },
        { text: 'I would like to schedule a meeting today at 3 PM', delay: 700 },
        { text: 'I would like to schedule a meeting today at 2 PM', delay: 1000 }, // Time correction
        { text: 'I would like to schedule a meeting today at 2 PM with', delay: 600 },
        { text: 'I would like to schedule a meeting today at 2 PM with the', delay: 400 },
        { text: 'I would like to schedule a meeting today at 2 PM with the team', delay: 800 },
        { text: 'I would like to schedule a meeting today at 2 PM with the team.', delay: 1200 }
      ]
    },
    {
      name: 'Complex Sentence Restructuring',
      steps: [
        { text: '', delay: 500 },
        { text: 'The', delay: 400 },
        { text: 'The weather', delay: 600 },
        { text: 'The weather is', delay: 500 },
        { text: 'The weather is really', delay: 600 },
        { text: 'The weather is really bad', delay: 700 },
        { text: 'The weather is really terrible', delay: 800 }, // Word replacement
        { text: 'The weather is absolutely terrible', delay: 1000 }, // Intensifier change
        { text: 'The weather is absolutely terrible today', delay: 600 },
        { text: 'The weather today is absolutely terrible', delay: 1200 }, // Word order change
        { text: 'The weather today is absolutely terrible,', delay: 500 },
        { text: 'The weather today is absolutely terrible, so', delay: 600 },
        { text: 'The weather today is absolutely terrible, so I', delay: 400 },
        { text: 'The weather today is absolutely terrible, so I think', delay: 600 },
        { text: 'The weather today is absolutely terrible, so I believe', delay: 800 }, // Verb change
        { text: 'The weather today is absolutely terrible, so I believe we', delay: 500 },
        { text: 'The weather today is absolutely terrible, so I believe we should', delay: 600 },
        { text: 'The weather today is absolutely terrible, so I believe we should stay', delay: 700 },
        { text: 'The weather today is absolutely terrible, so I believe we should stay indoors', delay: 800 },
        { text: 'The weather today is absolutely terrible, so I believe we should stay inside', delay: 1000 }, // Word replacement
        { text: 'The weather today is absolutely terrible, so I believe we should stay inside.', delay: 1200 }
      ]
    }
  ];

  // Auto demo effect
  useEffect(() => {
    if (!isAutoDemo) return;

    let timeoutId: NodeJS.Timeout;
    let currentStep = 0;
    const scenario = demoScenarios[selectedScenario];

    const runStep = () => {
      if (currentStep < scenario.steps.length) {
        const step = scenario.steps[currentStep];
        setCurrentText(step.text);
        
        timeoutId = setTimeout(() => {
          currentStep++;
          runStep();
        }, step.delay);
      } else {
        // Demo completed, restart after a pause
        timeoutId = setTimeout(() => {
          currentStep = 0;
          runStep();
        }, 3000);
      }
    };

    runStep();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [isAutoDemo, selectedScenario, demoScenarios]);

  const handleManualInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (!isAutoDemo) {
      setCurrentText(e.target.value);
    }
  };

  const resetDemo = () => {
    setCurrentText('');
    setIsAutoDemo(false);
  };

  const startAutoDemo = () => {
    setCurrentText('');
    setIsAutoDemo(true);
  };

  return (
    <div className="text-correction-demo" style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <h2 style={{ marginBottom: '1.5rem', color: '#1f2937' }}>
        Text Correction Animation Demo
      </h2>
      
      {/* Demo Controls */}
      <div style={{ 
        marginBottom: '2rem', 
        padding: '1rem', 
        background: '#f9fafb', 
        borderRadius: '8px',
        border: '1px solid #e5e7eb'
      }}>
        <h3 style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>Demo Controls</h3>
        
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={startAutoDemo}
            disabled={isAutoDemo}
            style={{
              padding: '0.5rem 1rem',
              background: isAutoDemo ? '#9ca3af' : '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: isAutoDemo ? 'not-allowed' : 'pointer'
            }}
          >
            {isAutoDemo ? 'Demo Running...' : 'Start Auto Demo'}
          </button>
          
          <button
            onClick={resetDemo}
            style={{
              padding: '0.5rem 1rem',
              background: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            Reset
          </button>
          
          <select
            value={selectedScenario}
            onChange={(e) => setSelectedScenario(Number(e.target.value))}
            disabled={isAutoDemo}
            style={{
              padding: '0.5rem',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              background: 'white'
            }}
          >
            {demoScenarios.map((scenario, index) => (
              <option key={index} value={index}>
                {scenario.name}
              </option>
            ))}
          </select>
        </div>
        
        <div style={{ marginTop: '1rem', fontSize: '0.875rem', color: '#6b7280' }}>
          {isAutoDemo ? (
            <p>🔄 Auto demo is running. Watch the text corrections in real-time!</p>
          ) : (
            <p>💡 Start an auto demo or type in the manual input below to see text corrections.</p>
          )}
        </div>
      </div>

      {/* Manual Input */}
      {!isAutoDemo && (
        <div style={{ marginBottom: '2rem' }}>
          <label style={{ 
            display: 'block', 
            marginBottom: '0.5rem', 
            fontWeight: '500',
            color: '#374151'
          }}>
            Manual Text Input:
          </label>
          <textarea
            value={currentText}
            onChange={handleManualInput}
            placeholder="Type here to see text correction animations..."
            style={{
              width: '100%',
              minHeight: '100px',
              padding: '0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '1rem',
              lineHeight: '1.5',
              resize: 'vertical'
            }}
          />
        </div>
      )}

      {/* Text Correction Renderer */}
      <div style={{ marginBottom: '2rem' }}>
        <h3 style={{ marginBottom: '1rem', fontSize: '1.1rem', color: '#374151' }}>
          Live Text with Correction Animations:
        </h3>
        
        <div style={{
          minHeight: '150px',
          padding: '1.5rem',
          background: 'white',
          border: '2px solid #e5e7eb',
          borderRadius: '8px',
          fontSize: '1.1rem',
          lineHeight: '1.6'
        }}>
          <TextCorrectionRenderer
            text={currentText}
            isPartial={isAutoDemo}
            showStats={true}
            config={{
              highlightDuration: 600,
              correctionDuration: 800,
              diffLevel: 'character',
              enableSounds: true,
              maxSimultaneousCorrections: 5,
              showPreviews: true
            }}
          />
        </div>
      </div>

      {/* Demo Scenarios Info */}
      <div style={{
        padding: '1rem',
        background: '#f0f9ff',
        border: '1px solid #0ea5e9',
        borderRadius: '8px',
        fontSize: '0.875rem'
      }}>
        <h4 style={{ marginBottom: '0.5rem', color: '#0c4a6e' }}>
          Current Scenario: {demoScenarios[selectedScenario].name}
        </h4>
        <p style={{ color: '#075985', margin: 0 }}>
          This demo showcases different types of text corrections including typo fixes, 
          word replacements, sentence restructuring, and real-time speech recognition improvements.
        </p>
      </div>

      {/* Features Info */}
      <div style={{ marginTop: '2rem', fontSize: '0.875rem', color: '#6b7280' }}>
        <h4 style={{ marginBottom: '0.5rem', color: '#374151' }}>Features Demonstrated:</h4>
        <ul style={{ paddingLeft: '1.5rem', lineHeight: '1.6' }}>
          <li>✨ Real-time text correction detection using advanced diff algorithms</li>
          <li>🎨 Smooth highlight and replacement animations</li>
          <li>🔊 Optional sound effects for correction notifications</li>
          <li>📊 Live statistics showing correction activity</li>
          <li>♿ Accessibility support with screen reader announcements</li>
          <li>🎯 Different correction types: insertions, deletions, replacements</li>
          <li>⚡ Performance optimized for real-time streaming text</li>
          <li>🌙 Dark mode and high contrast support</li>
          <li>📱 Mobile responsive design</li>
        </ul>
      </div>
    </div>
  );
};

export default TextCorrectionDemo;
