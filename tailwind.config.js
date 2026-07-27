/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./pages/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
    "./lib/ui/**/*.{js,jsx}",
    "./lib/utils/easternTime.js",
    "./lib/pipeline/bulkPublishModes.js",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
