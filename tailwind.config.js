/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#e8edf5',
          100: '#c5d2e8',
          200: '#9eb4d8',
          300: '#7796c8',
          400: '#5a80bc',
          500: '#0B3D91',
          600: '#0a3782',
          700: '#082d6b',
          800: '#062354',
          900: '#04193d',
          950: '#020e24',
        },
        surface: {
          50: '#f8f9fa',
          100: '#f1f3f5',
          200: '#dee2e6',
          300: '#ced4da',
          400: '#adb5bd',
          500: '#6c757d',
          600: '#495057',
          700: '#343a40',
          800: '#212529',
          900: '#0f1114',
          950: '#060708',
        },
        cta: {
          500: '#D64541',
          600: '#c13b37',
          700: '#a8322f',
        },
        success: {
          50: '#e8f5e9',
          500: '#28a745',
          600: '#218838',
        },
        warning: {
          50: '#fff8e1',
          500: '#ffc107',
          600: '#e0a800',
        },
        danger: {
          50: '#fde8e8',
          500: '#dc3545',
          600: '#c82333',
        },
        info: {
          50: '#e0f4f8',
          500: '#17a2b8',
          600: '#138496',
        },
        sky: {
          light: '#87CEEB',
          50: '#e8f6fc',
        },
        cloud: '#f0f4f8',
        sunset: '#FF6B35',
      },
      fontFamily: {
        display: ['var(--font-display)'],
        body: ['var(--font-body)'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      boxShadow: {
        'card': '0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.04)',
        'card-hover': '0 4px 16px 0 rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.06)',
        'elevated': '0 10px 30px -5px rgb(0 0 0 / 0.12)',
        'nav': '0 2px 8px 0 rgb(0 0 0 / 0.08)',
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out',
        'slide-up': 'slideUp 0.5s ease-out',
        'slide-in-right': 'slideInRight 0.3s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(16px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
      },
    },
  },
  plugins: [],
}
