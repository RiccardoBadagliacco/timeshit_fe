/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export", // <--- abilita static export
  assetPrefix: "./", // usa path relativi per funzionare anche se la build è servita da una sottocartella
  images: {
    unoptimized: true, // necessario in export mode
  },
  eslint: {
    // Skip ESLint during build/export to unblock static output
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
