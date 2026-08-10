// Tailwind v4 подключается плагином PostCSS — отдельного tailwind.config.js
// больше нет, вся настройка живёт в CSS (@theme в src/app/globals.css).
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
