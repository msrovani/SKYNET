const webpack = require('webpack');

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: { unoptimized: true },
  transpilePackages: [
    '@skynet/core-wasm-engine',
    '@skynet/p2p-mesh-network',
    '@skynet/blockchain-client',
  ],
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.module.rules.push({
        test: /\.node$/,
        use: 'ignore-loader',
      });
      config.plugins.push(
        new webpack.IgnorePlugin({
          resourceRegExp: /^@node-llama-cpp\//,
        }),
        new webpack.IgnorePlugin({
          resourceRegExp: /^@reflink\//,
        }),
      );
    } else {
      config.externals = [...(Array.isArray(config.externals) ? config.externals : []), 'node-llama-cpp'];
    }
    return config;
  },
};

module.exports = nextConfig;
