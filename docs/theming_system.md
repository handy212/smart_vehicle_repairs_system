# Theming System Documentation

## Overview
The application uses a sophisticated theming system built on **CSS Custom Properties (Variables)** with **OKLCH color space** for optimal color management and dark mode support.

## Color System

### Why OKLCH?
- **Perceptually uniform**: Colors that look equally bright/dark
- **Better gradients**: Smooth color transitions without muddy middle tones
- **Predictable lightness**: Easier to create accessible color variants
- **Future-proof**: Modern CSS color space with wide browser support

### Color Format
```css
oklch(lightness chroma hue)
```
- **Lightness**: 0-1 (0 = black, 1 = white)
- **Chroma**: 0-0.4 (saturation/colorfulness)
- **Hue**: 0-360 (color angle)

## Theme Structure

### Light Mode (Default)
```css
:root {
  /* Brand - Vibrant Orange */
  --primary: oklch(0.627 0.184 37.698);        /* #ea540d - Orange */
  --primary-foreground: oklch(1 0 0);          /* White text on orange */
  
  /* Semantic States */
  --success: oklch(0.627 0.175 145.5);         /* Green */
  --destructive: oklch(0.577 0.245 27.325);    /* Red */
  --warning: oklch(0.760 0.191 85.594);        /* Amber/Yellow */
  --info: oklch(0.607 0.186 246.055);          /* Blue */
  
  /* Neutral Palette */
  --background: oklch(1 0 0);                  /* Pure white */
  --foreground: oklch(0.145 0 0);              /* Almost black text */
  --muted: oklch(0.97 0 0);                    /* Light gray backgrounds */
  --border: oklch(0.922 0 0);                  /* Subtle borders */
}
```

### Dark Mode
```css
.dark {
  /* Brand - Brighter orange for dark backgrounds */
  --primary: oklch(0.707 0.184 37.698);        /* Brighter orange */
  --primary-foreground: oklch(0.145 0 0);      /* Dark text on bright colors */
  
  /* Semantic States - More vibrant */
  --success: oklch(0.687 0.175 145.5);         /* Brighter green */
  --destructive: oklch(0.657 0.245 27.325);    /* Brighter red */
  --warning: oklch(0.820 0.191 85.594);        /* Brighter yellow */
  --info: oklch(0.677 0.186 246.055);          /* Brighter blue */
  
  /* Neutral Palette - Improved contrast */
  --background: oklch(0.165 0 0);              /* Dark gray (not pure black) */
  --foreground: oklch(0.97 0 0);               /* Light text */
  --card: oklch(0.215 0 0);                    /* Slightly lighter cards */
  --border: oklch(0.35 0 0);                   /* Visible borders */
}
```

## Semantic Color Tokens

### Usage Guidelines

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| **primary** | #ea540d (Orange) | Lighter Orange | Brand actions, links, CTAs |
| **success** | Green | Brighter Green | Success messages, completed states |
| **destructive** | Red | Brighter Red | Errors, delete actions, warnings |
| **warning** | Amber/Yellow | Brighter Yellow | Warnings, caution states |
| **info** | Blue | Brighter Blue | Information, help text |
| **muted** | Light Gray | Dark Gray | Disabled states, secondary info |
| **accent** | Light Gray | Medium Gray | Hover states, highlights |

### Examples

```tsx
// Success state
<div className="bg-success text-success-foreground">
  Payment received!
</div>

// Warning state
<div className="bg-warning text-warning-foreground">
  Invoice overdue
</div>

// Info state
<Badge variant="info">
  New feature
</Badge>

// Primary action
<Button className="bg-primary text-primary-foreground">
  Save changes
</Button>
```

## Component Variants

### Card Colors
```tsx
// Light backgrounds (use for distinguishing sections)
<Card className="bg-muted">         // Subtle gray background
<Card className="bg-accent">        // Slightly darker emphasis
<Card className="bg-card">          // Default white/dark card

// Colored states
<Card className="bg-success/10 border-success">  // Success tint
<Card className="bg-destructive/10 border-destructive">  // Error tint
<Card className="bg-warning/10 border-warning">  // Warning tint
<Card className="bg-info/10 border-info">        // Info tint
```

### Text Colors
```tsx
<p className="text-foreground">        // Primary text
<p className="text-muted-foreground">  // Secondary/muted text
<p className="text-success">           // Success text
<p className="text-destructive">       // Error text
<p className="text-warning">           // Warning text
<p className="text-info">              // Info text
<p className="text-primary">           // Brand/link text
```

### Border & Ring Colors
```tsx
<div className="border border-border">     // Default border
<div className="border border-primary">    // Brand border
<div className="border border-success">    // Success border
<div className="border border-destructive">// Error border

<input className="focus:ring-2 focus:ring-primary">  // Focus state
<input className="focus:ring-2 focus:ring-ring">     // Default focus
```

## Dark Mode Best Practices

### Do ✅
```tsx
// Use semantic tokens
<div className="bg-card text-card-foreground">
  
// Use opacity for subtle effects
<div className="bg-primary/10">

// Use the border token
<div className="border border-border">
```

### Don't ❌
```tsx
// Hardcode colors
<div className="bg-white dark:bg-gray-900">

// Use arbitrary values without theming
<div className="bg-[#f0f0f0] dark:bg-[#1a1a1a]">

// Mix color systems
<div className="bg-gray-50 dark:bg-slate-900">  // Inconsistent
```

## Theme Toggle

Users can cycle through three modes:
1. **Light Mode** - Default bright theme
2. **Dark Mode** - Dark theme with vibrant accents
3. **System Mode** - Follows OS preference

```tsx
import { useTheme } from '@/lib/hooks/useTheme';

export function MyComponent() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  
  return (
    <div>
      <p>Current theme: {theme}</p>
      <p>Resolved (actual): {resolvedTheme}</p>
      <button onClick={() => setTheme('dark')}>Dark</button>
      <button onClick={() => setTheme('light')}>Light</button>
      <button onClick={() => setTheme('system')}>System</button>
    </div>
  );
}
```

## Customization

### Changing the Primary Color

To change from orange to another brand color:

1. Find your color in OKLCH format: https://oklch.com/
2. Update `globals.css`:

```css
:root {
  /* Change this to your brand color */
  --primary: oklch(0.627 0.184 37.698);  /* Orange */
}

.dark {
  /* Brighter version for dark mode */
  --primary: oklch(0.707 0.184 37.698);  /* Lighter orange */
}
```

### Adding Custom Semantic Colors

```css
:root {
  --custom: oklch(0.6 0.2 200);
  --custom-foreground: oklch(1 0 0);
}

.dark {
  --custom: oklch(0.7 0.2 200);  /* Brighter for dark */
  --custom-foreground: oklch(0.145 0 0);
}
```

Then add to `@theme inline`:
```css
@theme inline {
  --color-custom: var(--custom);
  --color-custom-foreground: var(--custom-foreground);
}
```

And to `tailwind.config.ts`:
```typescript
colors: {
  custom: "var(--color-custom)",
  "custom-foreground": "var(--color-custom-foreground)",
}
```

## Accessibility

### Contrast Ratios
All color combinations maintain **WCAG AA** contrast ratios:
- Normal text: 4.5:1 minimum
- Large text: 3:1 minimum
- UI components: 3:1 minimum

### Testing
```bash
# Check contrast of your custom colors
# Use: https://www.whocanuse.com/
# Or: https://contrast-ratio.com/
```

## Migration from Hardcoded Colors

### Find hardcoded instances
```bash
# Search for hardcoded dark mode colors
grep -r "dark:bg-gray-" frontend/
grep -r "dark:text-gray-" frontend/
```

### Replace with semantic tokens
```tsx
// Before
<div className="bg-white dark:bg-gray-800">

// After
<div className="bg-card">
```

## Performance

### CSS Variables Benefits
- ✅ Single source of truth
- ✅ Instant theme switching (no re-render)
- ✅ Smaller bundle size (no duplicate styles)
- ✅ Runtime customization possible

### OKLCH Browser Support
- All modern browsers since 2023
- Fallbacks not needed for target browsers
- Safari, Chrome, Firefox, Edge all support OKLCH

## Troubleshooting

### Theme not applying
1. Check `html` element has `dark` class
2. Verify CSS variables are defined in `globals.css`
3. Ensure component uses semantic tokens like `bg-card` not `bg-white`

### Colors look wrong
1. Verify OKLCH format: `oklch(L C H)` with proper spaces
2. Check lightness value (0-1 range)
3. Ensure chroma isn't too high (> 0.4 may clip)

### Flash of wrong theme on load
- The theme script in `app/theme-script.tsx` prevents this
- Ensure it's loaded before any content
- Check localStorage isn't being cleared

## Resources

- [OKLCH Color Picker](https://oklch.com/)
- [Color Contrast Checker](https://contrast-ratio.com/)
- [Tailwind CSS v4 Docs](https://tailwindcss.com/docs)
- [CSS Color Module Level 4](https://www.w3.org/TR/css-color-4/)
