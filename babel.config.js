/**
 * This babel config file is the babel config necessary for the files in the
 * `src` and `demo` directories.  It was broken out of the `webpack.common.js`
 * file so that it can be used with `jest` and to make things easier for clients
 * who wish to use `src` files.
 *
 * Note that the following "peer" dependencies are required:
 * - `@babel/core`
 * - `babel-loader`
 * - `@babel/runtime-corejs3`
 * - All other `@babel` dependencies listed below
 *
 * @see - https://jestjs.io/docs/en/getting-started#using-babel
 * @see - https://jestjs.io/docs/en/webpack
 * @see - https://webpack.js.org/loaders/babel-loader/
 */
module.exports = {
  // @see - https://github.com/vuejs/vue-cli/issues/2746
  sourceType: 'unambiguous',
  // The Router is duplicated in every player iframe, and is meant to be ES5
  // only, to be as light-weight as possible.  Therefore, no tranforms need to
  // be done on it.
  ignore: [
    'src/js/conduit/Router.js',
  ],
  presets: [
    [
      '@babel/preset-env',
      {
        exclude: [
          // Prevents "ReferenceError: _typeof is not defined" error
          '@babel/plugin-transform-typeof-symbol',
        ],
      },
    ],
  ],
  plugins: [
    '@babel/plugin-syntax-dynamic-import',
    '@babel/plugin-proposal-object-rest-spread',
    '@babel/plugin-proposal-class-properties',
    [
      "@babel/plugin-transform-runtime",
      {
        "corejs": 3,
      },
    ],
  ],
};
