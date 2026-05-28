/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        neoYellow: '#FFDE4D',
        neoGreen: '#39FF14',
        neoRed: '#FF6B6B',
        neoBlue: '#4D96FF',
        neoPurple: '#B983FF',
        neoBg: '#F4F4F0',
      },
      boxShadow: {
        neo: '4px 4px 0px 0px rgba(0,0,0,1)',
        'neo-hover': '8px 8px 0px 0px rgba(0,0,0,1)',
        'neo-lg': '6px 6px 0px 0px rgba(0,0,0,1)',
      }
    },
  },
  plugins: [],
}
