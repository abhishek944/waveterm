/** @type {import('tailwindcss').Config} */
module.exports = {
    content: {
        files: ["./src/**/*.{js,jsx,ts,tsx}"],
        safelist: ["w-0", "w-3"],
    },
    theme: {
        extend: {},
    },
    plugins: [],
};
