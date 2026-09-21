import neostandard from 'neostandard'

export default [
  ...neostandard({
    ignores: neostandard.resolveIgnoresFromGitignore(),
    ts: true
  }),
  {
    files: ['test/*.test.js'],
    rules: {
      '@stylistic/padded-blocks': 'off',
    },
  },
]
