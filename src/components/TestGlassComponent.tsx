import React from 'react'
import LiquidGlass from 'liquid-glass-react'
import {useTheme, useThemeClasses} from '../contexts/ThemeProvider'

interface TestGlassComponentProps {
  title?: string
  children?: React.ReactNode
}

export const TestGlassComponent: React.FC<TestGlassComponentProps> = ({
  title = 'Test Glass Component',
  children
}) => {
  const {isDark} = useTheme()
  const {themeClass, glassClass} = useThemeClasses()

  return (
    <div
      className={`min-h-screen p-8 transition-colors duration-300 ${themeClass}`}
      style={{
        background: `linear-gradient(135deg, var(--bg-primary) 0%, var(--bg-secondary) 50%, var(--bg-tertiary) 100%)`
      }}
    >
      <LiquidGlass
        className="rounded-lg p-6 shadow-lg"
        blurAmount={20}
        saturation={1.2}
        cornerRadius={12}
        mode="standard"
        overLight={!isDark}
      >
        <div className={`${glassClass} rounded-lg p-6`}>
          <h2 className="mb-4 text-xl font-semibold" style={{color: 'var(--text-primary)'}}>
            {title}
          </h2>
          <p className="mb-4 text-sm" style={{color: 'var(--text-secondary)'}}>
            This is a test component using liquid-glass-react library with the new theme system. The
            glassmorphism effect adapts to the current theme mode.
          </p>

          <LiquidGlass
            className="mt-4"
            blurAmount={15}
            saturation={1.1}
            cornerRadius={8}
            mode="standard"
            overLight={!isDark}
          >
            <div
              className="rounded-lg p-4"
              style={{
                backgroundColor: 'var(--glass-light)',
                border: '1px solid var(--glass-border)'
              }}
            >
              <p className="text-sm" style={{color: 'var(--text-tertiary)'}}>
                Nested glass effect component with theme-aware styling. Current theme:{' '}
                <span style={{color: 'var(--text-accent)'}}>{isDark ? 'Dark' : 'Light'}</span>
              </p>
              {children && (
                <div className="mt-4" style={{color: 'var(--text-muted)'}}>
                  {children}
                </div>
              )}
            </div>
          </LiquidGlass>
        </div>
      </LiquidGlass>
    </div>
  )
}

export default TestGlassComponent
