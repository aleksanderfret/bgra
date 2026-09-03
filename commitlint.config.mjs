export const scopes = [
  'web',
  'desktop',
  'rag-engine',
  'api-contract',
  'cursor',
  'repo',
  'docs',
  'ci',
];

/** @type {import('cz-git').UserConfig} */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [2, 'always', scopes],
    'scope-empty': [2, 'never'],
  },
  prompt: {
    allowCustomScopes: false,
    allowEmptyScopes: false,
    enableMultipleScopes: false,
    scopes,
    skipQuestions: ['footerPrefix', 'footer'],
  },
};
