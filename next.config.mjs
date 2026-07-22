import path from 'node:path';

/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  webpack: (config) => {
    config.resolve.alias['@'] = path.resolve('./src');
    return config;
  },
};
