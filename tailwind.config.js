/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        royal: '#0B0B0D',
        gold: { DEFAULT: '#D4AF37', soft: '#E6C968', deep: '#A98A22' },
        ivory: { DEFAULT: '#F7E7CE', dim: '#CDBFA8' },
        midnight: { DEFAULT: '#163047', deep: '#0E2132' },
        charcoal: { DEFAULT: '#1B1B20', light: '#25252C' },
      },
      fontFamily: {
        serif: ['"Cormorant Garamond"', 'Cormorant', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        gold: '0 0 0 1px rgba(212,175,55,.55), 0 10px 40px -10px rgba(212,175,55,.35)',
        card: '0 1px 0 rgba(247,231,206,.05) inset, 0 20px 40px -24px rgba(0,0,0,.8)',
      },
      keyframes: {
        rise: { from: { opacity: 0, transform: 'translateY(14px)' }, to: { opacity: 1, transform: 'none' } },
        fade: { from: { opacity: 0 }, to: { opacity: 1 } },
        glow: { '0%,100%': { opacity: 0.55 }, '50%': { opacity: 1 } },
        float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-6px)' } },
        reveal: { from: { opacity: 0, transform: 'scale(.86)', filter: 'blur(6px)' }, to: { opacity: 1, transform: 'none', filter: 'none' } },
        shimmer: { from: { backgroundPosition: '-200% 0' }, to: { backgroundPosition: '200% 0' } },
        spark: { '0%': { opacity: 0, transform: 'translateY(0) scale(.5)' }, '15%': { opacity: 1 }, '100%': { opacity: 0, transform: 'translateY(-120px) scale(1)' } },
      },
      animation: {
        rise: 'rise .7s cubic-bezier(.2,.7,.2,1) both',
        fade: 'fade .6s ease both',
        glow: 'glow 4s ease-in-out infinite',
        float: 'float 6s ease-in-out infinite',
        reveal: 'reveal 1s cubic-bezier(.2,.7,.2,1) both',
        shimmer: 'shimmer 3s linear infinite',
        spark: 'spark 3.2s ease-out infinite',
      },
    },
  },
  plugins: [],
};
