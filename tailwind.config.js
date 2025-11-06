const defaultTheme = require('tailwindcss/defaultTheme')

const withOpacityValue = (variable) => ({ opacityValue }) => {
  if (opacityValue === undefined) {
    return `rgb(var(${variable}))`
  }
  return `rgb(var(${variable}) / ${opacityValue})`
}

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./templates/**/*.{html,js,py}",
    "./apps/**/templates/**/*.{html,js,py}",
    "./apps/**/*.{js,jsx,ts,tsx,py}",
    "./static/src/**/*.{js,jsx,ts,tsx,css,html}",
  ],
  safelist: [
    {
      pattern: /grid-cols-(1|2|3|4|5|6|7|8|9|10|11|12)/,
      variants: ["sm", "md", "lg", "xl", "2xl"],
    },
    {
      pattern: /col-span-(1|2|3|4|5|6|7|8|9|10|11|12)/,
      variants: ["sm", "md", "lg", "xl", "2xl"],
    },
  ],
  theme: {
    extend: {
      colors: {
        primary: withOpacityValue('--primary-rgb'),
        secondary: "var(--secondary)",
        success: "var(--success)",
        danger: "var(--danger)",
        warning: "var(--warning)",
        info: "var(--info)",
        surface: "var(--bg-card)",
        body: "var(--bg-body)",
        slate: {
          50: "var(--gray-50)",
          100: "var(--gray-100)",
          200: "var(--gray-200)",
          300: "var(--gray-300)",
          400: "var(--gray-400)",
          500: "var(--gray-500)",
          600: "var(--gray-600)",
          700: "var(--gray-700)",
          800: "var(--gray-800)",
          900: "var(--gray-900)",
        },
      },
      borderRadius: {
        '4xl': '2rem',
      },
      boxShadow: {
        card: "0 20px 45px -20px rgba(15, 23, 42, 0.25)",
        soft: "0 12px 30px -18px rgba(15, 23, 42, 0.18)",
      },
      fontFamily: {
        sans: ['Inter', ...defaultTheme.fontFamily.sans],
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
  ],
}

