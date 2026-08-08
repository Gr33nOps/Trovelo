const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['.expo/**', 'android/**', 'node_modules/**'],
    rules: {
      // These React Compiler diagnostics reject established React Native
      // Animated/ref and lifecycle patterns even though this app does not use
      // the compiler. Keep the conventional hooks rules enabled below them.
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
    },
  },
]);
