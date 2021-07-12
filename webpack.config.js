//@ts-check

'use strict';

const path = require('path');

/**@type {import('webpack').Configuration}*/
const nodeConfig = {
  target: 'node', 
	mode: 'none',
	entry: {
		main: './src/node/main.ts'
	},
	output: {
		filename: '[name].js',
		path: path.join(__dirname, 'lib', 'node'),
		libraryTarget: 'commonjs'
	},
  devtool: 'nosources-source-map',
  resolve: {
    extensions: ['.ts', '.js'],
    alias: {
      'debug': path.join(__dirname, 'polyfill', 'debug.js')
    }
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader'
          }
        ]
      }
    ]
  }
};
/**@type {import('webpack').Configuration}*/
const browserConfig = {
  target: 'webworker', 
	mode: 'none',
	entry: {
		main: './src/browser/main.ts'
	},
	output: {
		filename: '[name].js',
		path: path.join(__dirname, 'lib', 'browser'),
		libraryTarget: 'commonjs'
	},
  devtool: 'nosources-source-map',
  resolve: {
    extensions: ['.ts', '.js'],
    alias: {
      'debug': path.join(__dirname, 'polyfill', 'debug.js')
    }
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader'
          }
        ]
      }
    ]
  }
};
module.exports = [ nodeConfig, browserConfig];