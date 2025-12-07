/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    // Define breakpoints for responsive design
    screens: {
      'xs': '480px',
      'sm': '640px',
      'md': '768px',
      'lg': '1024px',
      'xl': '1280px',
      '2xl': '1536px',
      '3xl': '1920px',
    },
    extend: {
      // Colors now reference CSS variables for theme support
      colors: {
        base: 'var(--base)',
        mantle: 'var(--mantle)',
        crust: 'var(--crust)',
        surface0: 'var(--surface0)',
        surface1: 'var(--surface1)',
        surface2: 'var(--surface2)',
        overlay0: 'var(--overlay0)',
        overlay1: 'var(--overlay1)',
        overlay2: 'var(--overlay2)',
        subtext0: 'var(--subtext0)',
        subtext1: 'var(--subtext1)',
        text: 'var(--text)',
        lavender: 'var(--lavender)',
        blue: 'var(--blue)',
        sapphire: 'var(--sapphire)',
        sky: 'var(--sky)',
        teal: 'var(--teal)',
        green: 'var(--green)',
        yellow: 'var(--yellow)',
        peach: 'var(--peach)',
        maroon: 'var(--maroon)',
        red: 'var(--red)',
        mauve: 'var(--mauve)',
        pink: 'var(--pink)',
        flamingo: 'var(--flamingo)',
        rosewater: 'var(--rosewater)',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      // Responsive spacing
      spacing: {
        'sidebar': 'var(--sidebar-width)',
        'sidebar-collapsed': 'var(--sidebar-width-collapsed)',
        'chat-panel': 'var(--chat-panel-width)',
      },
      // Animations for modals and transitions
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-in': 'slideIn 0.2s ease-out',
        'slide-in-right': 'slideInRight 0.2s ease-out',
        'scale-in': 'scaleIn 0.15s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideIn: {
          '0%': { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideInRight: {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
