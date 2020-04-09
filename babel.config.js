/**
 * This babel config file is the babel config necessary for the files in the
 * `src` and `demo` directories.  It was broken out of the `webpack.common.js`
 * file so that it can be used with `jest`.
 *
 * @see - https://jestjs.io/docs/en/getting-started#using-babel
 * @see - https://jestjs.io/docs/en/webpack
 * @see - https://webpack.js.org/loaders/babel-loader/
 */
module.exports = {
  presets: [
    [
      '@babel/preset-env',
      {
        exclude: [
          '@babel/plugin-transform-typeof-symbol',
        ],
      },
    ],
  ],
  plugins: [
    '@babel/plugin-syntax-dynamic-import',
    '@babel/plugin-proposal-object-rest-spread',
    '@babel/plugin-proposal-class-properties',
  ],
};
