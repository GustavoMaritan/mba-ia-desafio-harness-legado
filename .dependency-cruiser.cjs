// Fronteiras de camada (G4, G6, G7, G8, G9) e a regra propria P2.
// tsPreCompilationDeps faz o cruiser enxergar imports so de tipo (import type ...).
module.exports = {
  forbidden: [
    {
      name: 'G4-http-sem-prisma-nem-repositorio',
      comment: 'api/src/http/ não fala com o banco: nada de @prisma/client nem de api/src/repositories/.',
      severity: 'error',
      from: { path: '^api/src/http/' },
      to: { path: ['^api/src/repositories/', '(^|/)node_modules/(@prisma/client|\.prisma)(/|$)'] },
    },
    {
      name: 'G6-servico-sem-express',
      comment: 'api/src/services/ não conhece express, multer nem api/src/http/ (inclusive import type).',
      severity: 'error',
      from: { path: '^api/src/services/' },
      to: {
        path: [
          '^api/src/http/',
          '(^|/)node_modules/(@types/)?(express|express-serve-static-core|multer)(/|$)',
        ],
      },
    },
    {
      name: 'G6-servico-sem-express-nao-resolvido',
      comment: 'Mesmo que o pacote nem esteja instalado.',
      severity: 'error',
      from: { path: '^api/src/services/' },
      to: { couldNotResolve: true, path: '^(express|express-serve-static-core|multer)(/|$)' },
    },
    {
      name: 'G7-openai-so-em-integrations',
      comment: 'O SDK da OpenAI só entra por api/src/integrations/.',
      severity: 'error',
      from: { path: '^(api|web)/', pathNot: '^api/src/integrations/' },
      to: { path: '(^|/)node_modules/openai(/|$)' },
    },
    {
      name: 'G7-openai-so-em-integrations-nao-resolvido',
      severity: 'error',
      from: { path: '^(api|web)/', pathNot: '^api/src/integrations/' },
      to: { couldNotResolve: true, path: '^openai(/|$)' },
    },
    {
      name: 'G8-web-nao-importa-api',
      comment: 'O front não importa nada de api/, nem tipo.',
      severity: 'error',
      from: { path: '^web/' },
      to: { path: '^api/' },
    },
    {
      name: 'G9-sem-ciclo',
      comment: 'Nenhum import circular em api/src e web/src.',
      severity: 'error',
      from: { path: '^(api|web)/src/' },
      to: { circular: true },
    },
    {
      name: 'P2-dominio-puro',
      comment: 'api/src/domain/ só importa api/src/domain/ (sem pacote, sem banco, sem http).',
      severity: 'error',
      from: { path: '^api/src/domain/' },
      to: { pathNot: '^api/src/domain/' },
    },
  ],
  options: {
    tsPreCompilationDeps: true,
    doNotFollow: { path: 'node_modules' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.tsx', '.d.ts', '.js', '.mjs', '.cjs', '.json'],
      mainFields: ['types', 'typings', 'module', 'main'],
    },
    skipAnalysisNotInRules: true,
  },
}
