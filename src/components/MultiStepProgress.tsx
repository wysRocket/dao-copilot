/**
 * Multi-Step Progress Indicator
 * 
 * A component for showing progress through multiple steps with visual indicators
 * and smooth transitions. Perfect for showing AI answer generation progress.
 */

import React from 'react'
import { cn } from '../utils/tailwind'

export interface ProgressStep {
  id: string
  label: string
  description?: string
  status: 'pending' | 'active' | 'complete' | 'error'
  progress?: number // 0-100 for active step
}

export interface MultiStepProgressProps {
  /** Array of steps to display */
  steps: ProgressStep[]
  /** Current active step index */
  currentStep?: number
  /** Show step descriptions */
  showDescriptions?: boolean
  /** Orientation of the progress indicator */
  orientation?: 'horizontal' | 'vertical'
  /** Size variant */
  size?: 'sm' | 'md' | 'lg'
  /** Color scheme */
  colorScheme?: 'blue' | 'green' | 'purple' | 'gray'
  /** Custom CSS classes */
  className?: string
  /** Whether to show progress percentages */
  showProgress?: boolean
  /** Animation duration in ms */
  animationDuration?: number
}

const MultiStepProgress: React.FC<MultiStepProgressProps> = ({
  steps,
  currentStep,
  showDescriptions = false,
  orientation = 'horizontal',
  size = 'md',
  colorScheme = 'blue',
  className,
  showProgress = true,
  animationDuration = 300
}) => {
  // Size mappings
  const sizeClasses = {
    sm: {
      indicator: 'w-6 h-6 text-xs',
      text: 'text-xs',
      spacing: orientation === 'horizontal' ? 'space-x-2' : 'space-y-2'
    },
    md: {
      indicator: 'w-8 h-8 text-sm',
      text: 'text-sm',
      spacing: orientation === 'horizontal' ? 'space-x-3' : 'space-y-3'
    },
    lg: {
      indicator: 'w-10 h-10 text-base',
      text: 'text-base',
      spacing: orientation === 'horizontal' ? 'space-x-4' : 'space-y-4'
    }
  }

  // Color scheme mappings
  const colors = {
    blue: {
      pending: 'bg-gray-200 text-gray-400 border-gray-300',
      active: 'bg-blue-500 text-white border-blue-500 ring-4 ring-blue-200',
      complete: 'bg-green-500 text-white border-green-500',
      error: 'bg-red-500 text-white border-red-500',
      connector: 'bg-gray-300',
      activeConnector: 'bg-blue-500',
      completeConnector: 'bg-green-500'
    },
    green: {
      pending: 'bg-gray-200 text-gray-400 border-gray-300',
      active: 'bg-green-500 text-white border-green-500 ring-4 ring-green-200',
      complete: 'bg-green-600 text-white border-green-600',
      error: 'bg-red-500 text-white border-red-500',
      connector: 'bg-gray-300',
      activeConnector: 'bg-green-500',
      completeConnector: 'bg-green-600'
    },
    purple: {
      pending: 'bg-gray-200 text-gray-400 border-gray-300',
      active: 'bg-purple-500 text-white border-purple-500 ring-4 ring-purple-200',
      complete: 'bg-purple-600 text-white border-purple-600',
      error: 'bg-red-500 text-white border-red-500',
      connector: 'bg-gray-300',
      activeConnector: 'bg-purple-500',
      completeConnector: 'bg-purple-600'
    },
    gray: {
      pending: 'bg-gray-200 text-gray-400 border-gray-300',
      active: 'bg-gray-700 text-white border-gray-700 ring-4 ring-gray-300',
      complete: 'bg-gray-800 text-white border-gray-800',
      error: 'bg-red-500 text-white border-red-500',
      connector: 'bg-gray-300',
      activeConnector: 'bg-gray-700',
      completeConnector: 'bg-gray-800'
    }
  }

  const getStepIcon = (step: ProgressStep, index: number) => {
    switch (step.status) {
      case 'complete':
        return '✓'
      case 'error':
        return '✗'
      case 'active':
        return step.progress !== undefined && showProgress 
          ? `${Math.round(step.progress)}%` 
          : index + 1
      default:
        return index + 1
    }
  }

  const getConnectorClasses = (index: number) => {
    const step = steps[index]
    const nextStep = steps[index + 1]
    
    if (step.status === 'complete') {
      return colors[colorScheme].completeConnector
    } else if (step.status === 'active') {
      return colors[colorScheme].activeConnector
    }
    return colors[colorScheme].connector
  }

  const renderHorizontalProgress = () => (
    <div className={cn('flex items-center', sizeClasses[size].spacing, className)}>
      {steps.map((step, index) => (
        <React.Fragment key={step.id}>
          {/* Step indicator */}
          <div className="flex flex-col items-center">
            <div
              className={cn(
                'flex items-center justify-center rounded-full border-2 font-medium transition-all',
                sizeClasses[size].indicator,
                colors[colorScheme][step.status]
              )}
              style={{ transitionDuration: `${animationDuration}ms` }}
              role="progressbar"
              aria-valuenow={step.progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${step.label} - ${step.status}`}
            >
              {step.status === 'active' && step.progress !== undefined ? (
                <div className="relative">
                  <div className="absolute inset-0 flex items-center justify-center text-xs font-bold">
                    {Math.round(step.progress)}%
                  </div>
                  <svg className="transform -rotate-90" viewBox="0 0 32 32" width="32" height="32">
                    <circle
                      cx="16"
                      cy="16"
                      r="14"
                      fill="none"
                      stroke="rgba(255,255,255,0.3)"
                      strokeWidth="2"
                    />
                    <circle
                      cx="16"
                      cy="16"
                      r="14"
                      fill="none"
                      stroke="white"
                      strokeWidth="2"
                      strokeDasharray={`${2 * Math.PI * 14}`}
                      strokeDashoffset={`${2 * Math.PI * 14 * (1 - step.progress! / 100)}`}
                      className="transition-all duration-300 ease-out"
                    />
                  </svg>
                </div>
              ) : (
                getStepIcon(step, index)
              )}
            </div>
            
            {/* Step label */}
            <div className="mt-2 text-center">
              <div className={cn('font-medium', sizeClasses[size].text)}>
                {step.label}
              </div>
              {showDescriptions && step.description && (
                <div className={cn('text-gray-500 mt-1', 
                  size === 'sm' ? 'text-xs' : size === 'lg' ? 'text-sm' : 'text-xs'
                )}>
                  {step.description}
                </div>
              )}
            </div>
          </div>

          {/* Connector line */}
          {index < steps.length - 1 && (
            <div
              className={cn(
                'flex-1 h-0.5 mx-2 transition-all',
                getConnectorClasses(index)
              )}
              style={{ transitionDuration: `${animationDuration}ms` }}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  )

  const renderVerticalProgress = () => (
    <div className={cn('flex flex-col', sizeClasses[size].spacing, className)}>
      {steps.map((step, index) => (
        <React.Fragment key={step.id}>
          {/* Step row */}
          <div className="flex items-start">
            {/* Step indicator */}
            <div
              className={cn(
                'flex items-center justify-center rounded-full border-2 font-medium transition-all flex-shrink-0',
                sizeClasses[size].indicator,
                colors[colorScheme][step.status]
              )}
              style={{ transitionDuration: `${animationDuration}ms` }}
              role="progressbar"
              aria-valuenow={step.progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${step.label} - ${step.status}`}
            >
              {getStepIcon(step, index)}
            </div>

            {/* Step content */}
            <div className="ml-3 min-w-0 flex-1">
              <div className={cn('font-medium', sizeClasses[size].text)}>
                {step.label}
              </div>
              {showDescriptions && step.description && (
                <div className={cn('text-gray-500 mt-1',
                  size === 'sm' ? 'text-xs' : size === 'lg' ? 'text-sm' : 'text-xs'
                )}>
                  {step.description}
                </div>
              )}
              {step.status === 'active' && step.progress !== undefined && showProgress && (
                <div className="mt-2">
                  <div className="bg-gray-200 rounded-full h-2">
                    <div
                      className={cn(
                        'h-2 rounded-full transition-all duration-300',
                        colors[colorScheme].activeConnector
                      )}
                      style={{ width: `${step.progress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Connector line */}
          {index < steps.length - 1 && (
            <div className="flex">
              <div className="flex items-center justify-center" style={{ width: sizeClasses[size].indicator.split(' ')[0] }}>
                <div
                  className={cn(
                    'w-0.5 h-6 transition-all',
                    getConnectorClasses(index)
                  )}
                  style={{ transitionDuration: `${animationDuration}ms` }}
                />
              </div>
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  )

  return orientation === 'horizontal' ? renderHorizontalProgress() : renderVerticalProgress()
}

export default MultiStepProgress