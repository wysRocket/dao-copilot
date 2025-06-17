import React from 'react';
import LiquidGlass from 'liquid-glass-react';

interface TestGlassComponentProps {
  title?: string;
  children?: React.ReactNode;
}

export const TestGlassComponent: React.FC<TestGlassComponentProps> = ({ 
  title = "Test Glass Component", 
  children 
}) => {
  return (
    <div className="p-8 bg-gradient-to-br from-purple-900 to-blue-900 min-h-screen">
      <LiquidGlass
        className="p-6 rounded-lg"
        blurAmount={20}
        saturation={1.2}
        cornerRadius={12}
        mode="standard"
        overLight={false}
      >
        <div className="backdrop-blur-sm bg-white/10 rounded-lg p-6">
          <h2 className="text-white text-xl font-semibold mb-4">{title}</h2>
          <p className="text-white/90 text-sm mb-4">
            This is a test component using liquid-glass-react library.
            The glassmorphism effect should be visible with blur and transparency.
          </p>
          
          <LiquidGlass
            className="mt-4"
            blurAmount={15}
            saturation={1.1}
            cornerRadius={8}
            mode="standard"
          >
            <div className="backdrop-blur-sm bg-white/5 rounded-lg p-4">
              <p className="text-white/80 text-sm">
                Nested glass effect component for enhanced visual depth.
              </p>
              {children && (
                <div className="mt-4 text-white/70">
                  {children}
                </div>
              )}
            </div>
          </LiquidGlass>
        </div>
      </LiquidGlass>
    </div>
  );
};

export default TestGlassComponent;
