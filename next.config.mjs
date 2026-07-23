import path from 'node:path';

/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_VERSION: (process.env.VERCEL_GIT_COMMIT_SHA || 'local').slice(0, 7),
  },
  webpack: (config) => {
    config.resolve.alias['@'] = path.resolve('./src');
    return config;
  },
};
