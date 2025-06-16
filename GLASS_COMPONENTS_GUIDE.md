# Glass Components Integration Guide

This guide covers the comprehensive integration of `@rdev/liquid-glass-react` into the DAO Copilot application, providing modern glass morphism effects.

## 🎨 Available Components

### Basic Components

#### GlassCard
A versatile card component with customizable glass effects.
\`\`\`tsx
<GlassCard variant="default|subtle|strong|prominent|minimal">
  Content here
</GlassCard>
\`\`\`

#### GlassButton
Interactive buttons with glass morphism styling.
\`\`\`tsx
<GlassButton variant="default|primary|secondary|ghost|destructive" size="sm|md|lg">
  Button Text
</GlassButton>
\`\`\`

#### GlassInput
Input fields with glass backgrounds and effects.
\`\`\`tsx
<GlassInput 
  label="Field Label"
  placeholder="Placeholder text"
  variant="default|subtle|prominent"
/>
\`\`\`

### Advanced Components

#### GlassModal
Modal dialogs with enhanced glass effects.
\`\`\`tsx
<GlassModal
  isOpen={isOpen}
  onClose={onClose}
  title="Modal Title"
  size="sm|md|lg|xl"
  variant="default|prominent|subtle"
>
  Modal content
</GlassModal>
\`\`\`

#### GlassTooltip
Tooltips with glass morphism styling.
\`\`\`tsx
<GlassTooltip content="Tooltip text" position="top|bottom|left|right">
  <button>Hover me</button>
</GlassTooltip>
\`\`\`

#### GlassDropdown
Dropdown menus with glass effects.
\`\`\`tsx
<GlassDropdown
  options={[
    { value: 'option1', label: 'Option 1', icon: <Icon /> }
  ]}
  value={selectedValue}
  onChange={handleChange}
/>
\`\`\`

#### GlassTabs
Tabbed interfaces with glass styling.
\`\`\`tsx
<GlassTabs
  tabs={[
    { id: 'tab1', label: 'Tab 1', content: <div>Content</div>, icon: <Icon /> }
  ]}
  defaultTab="tab1"
/>
\`\`\`

#### GlassProgress
Progress indicators with glass effects.
\`\`\`tsx
<GlassProgress
  value={75}
  max={100}
  variant="default|success|warning|error"
  showLabel={true}
/>
\`\`\`

#### GlassNotification
Notification components with glass morphism.
\`\`\`tsx
<GlassNotification
  type="success|error|warning|info"
  title="Notification Title"
  message="Notification message"
  isVisible={isVisible}
  onClose={handleClose}
/>
\`\`\`

## 🎛️ Customization Options

### Glass Effect Properties
Each component supports customization through `liquidGlassProps`:

\`\`\`tsx
<GlassCard
  liquidGlassProps={{
    blurAmount: 0.08,
    displacementScale: 70,
    elasticity: 0.2,
    aberrationIntensity: 2.5,
    saturation: 140,
    cornerRadius: 12
  }}
>
  Content
</GlassCard>
\`\`\`

### Variants
Most components support multiple variants:
- **default**: Standard glass effect
- **subtle**: Minimal glass effect
- **strong/prominent**: Enhanced glass effect
- **minimal**: Very light glass effect

## 🚀 Usage Examples

### Basic Usage
\`\`\`tsx
import { GlassCard, GlassButton } from '@/components/ui'

function MyComponent() {
  return (
    <GlassCard variant="default">
      <h2>Glass Card Title</h2>
      <p>Some content here</p>
      <GlassButton variant="primary">
        Action Button
      </GlassButton>
    </GlassCard>
  )
}
\`\`\`

### Advanced Usage with Custom Props
\`\`\`tsx
import { GlassModal } from '@/components/ui'

function AdvancedModal() {
  return (
    <GlassModal
      isOpen={isOpen}
      onClose={onClose}
      title="Advanced Modal"
      variant="prominent"
      liquidGlassProps={{
        blurAmount: 0.15,
        displacementScale: 100,
        elasticity: 0.3
      }}
    >
      <div>Advanced modal content</div>
    </GlassModal>
  )
}
\`\`\`

## 🎯 Accessing the Showcase

To view the complete glass components showcase:

1. **URL Parameter**: Add `?glass=true` to your application URL
2. **Route**: Navigate to `/glass-showcase`
3. **Enhanced Mode**: Use `?enhanced=true` for the enhanced home page

## 🎨 Design Guidelines

### Color Schemes
- Use semi-transparent backgrounds (`bg-white/10`)
- Apply subtle borders (`border-white/20`)
- Implement backdrop blur effects
- Maintain proper contrast ratios

### Interaction States
- Hover effects with increased opacity
- Focus states with ring outlines
- Smooth transitions (200-300ms)
- Proper disabled states

### Accessibility
- Maintain WCAG contrast ratios
- Provide keyboard navigation
- Include proper ARIA labels
- Support screen readers

## 🔧 Technical Implementation

### Dependencies
\`\`\`json
{
  "liquid-glass-react": "^1.1.1"
}
\`\`\`

### Import Structure
\`\`\`tsx
import LiquidGlass from 'liquid-glass-react'
import { cn } from '@/utils/tailwind'
\`\`\`

### Component Pattern
\`\`\`tsx
export const GlassComponent = React.forwardRef<HTMLElement, Props>(
  ({ className, variant = 'default', ...props }, ref) => {
    const getGlassProps = () => {
      // Variant-specific glass properties
    }

    return (
      <LiquidGlass {...getGlassProps()} className={cn(baseClasses, className)}>
        {/* Component content */}
      </LiquidGlass>
    )
  }
)
\`\`\`

## 🐛 Troubleshooting

### Common Issues
1. **Performance**: Reduce `displacementScale` for better performance
2. **Mobile**: Use lighter effects on mobile devices
3. **Accessibility**: Ensure sufficient contrast ratios
4. **Browser Support**: Test across different browsers

### Optimization Tips
- Use `mouseContainer` prop for better performance
- Implement lazy loading for complex components
- Consider reduced motion preferences
- Test on various devices and screen sizes

## 📚 Additional Resources

- [liquid-glass-react Documentation](https://github.com/rdev/liquid-glass-react)
- [Glass Morphism Design Principles](https://uxdesign.cc/glassmorphism-in-user-interfaces-1f39bb1308c9)
- [Accessibility Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
