/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    './node_modules/@mui/material/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        'midnight-blue': '#0D1B2A',
        'pacific-blue': '#1B263B',
        'coral-red': '#E4572E',
        alabaster: '#E0E1DD',
        'slate-gray': '#778DA9',
        'sea-green': '#2a9d8f',
        'crimson-red': '#e63946',
        'sandy-yellow': '#fca311',
      },
    },
  },
  plugins: [],
};
