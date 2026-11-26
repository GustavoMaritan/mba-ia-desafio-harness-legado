// Roda todos os gates (G1-G10 + P1-P3) sem parar na primeira falha.
// No fim imprime uma linha por violacao: "<ID> <arquivo> ...". Sai com 1 se houver qualquer violacao.
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
process.chdir(raiz)

const somente = process.argv.slice(2).filter((a) => /^(G\d+|P\d+)$/.test(a))
const quer = (id) => somente.length === 0 || somente.includes(id)

const bin = (pasta, nome) => path.join(raiz, pasta, 'node_modules', '.bin', nome)
const rel = (p) => path.relative(raiz, path.resolve(raiz, p)).split(path.sep).join('/')

const faltando = ['.', 'api', 'web'].filter((p) => !existsSync(path.join(raiz, p, 'node_modules')))
if (faltando.length) {
  console.error(`Dependências não instaladas em: ${faltando.join(', ')}. Rode "bash scripts/subir.sh" ou "npm ci" nessas pastas.`)
  process.exit(2)
}

function rodar(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const inicio = Date.now()
    const p = spawn(cmd, args, { cwd: opts.cwd || raiz, env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' } })
    let out = ''
    let err = ''
    p.stdout.on('data', (d) => (out += d))
    p.stderr.on('data', (d) => (err += d))
    p.on('error', (e) => resolve({ code: 127, out, err: err + String(e), ms: Date.now() - inicio }))
    p.on('close', (code) => resolve({ code: code ?? 1, out, err, ms: Date.now() - inicio }))
  })
}

const violacoes = []
const add = (id, arquivo, detalhe = '') => violacoes.push(`${id} ${arquivo}${detalhe ? ` ${detalhe}` : ''}`)
const status = []
const falhaDeFerramenta = (ids, alvo, r) => {
  const msg = (r.err || r.out).trim().split('\n').slice(-3).join(' | ').slice(0, 300)
  for (const id of ids) add(id, alvo, `(ferramenta falhou, código ${r.code}: ${msg})`)
}

// G1 - tipos
async function g1(pasta) {
  const r = await rodar(bin(pasta, 'tsc'), ['-p', `${pasta}/tsconfig.json`, '--noEmit', '--pretty', 'false'])
  let achou = 0
  for (const linha of r.out.split('\n')) {
    const m = linha.match(/^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/)
    if (m) {
      achou++
      add('G1', rel(m[1]), `(linha ${m[2]}: ${m[4]} ${m[5].slice(0, 120)})`)
    } else if (/error TS\d+/.test(linha)) {
      achou++
      add('G1', `${pasta}/tsconfig.json`, `(${linha.trim().slice(0, 160)})`)
    }
  }
  if (r.code !== 0 && achou === 0) falhaDeFerramenta(['G1'], `${pasta}/tsconfig.json`, r)
  status.push([`G1 tipos (${pasta})`, r.code === 0, r.ms])
}

// G2 + G5 - eslint (as mensagens de G5 comecam com "G5:", ver eslint.config.mjs)
async function eslint() {
  const r = await rodar(bin('.', 'eslint'), ['api', 'web', '--format', 'json', '--max-warnings', '0'])
  let dados
  try {
    dados = JSON.parse(r.out)
  } catch {
    falhaDeFerramenta(['G2', 'G5'], 'eslint.config.mjs', r)
    status.push(['G2 lint (api e web)', false, r.ms], ['G5 env só em config', false, r.ms])
    return
  }
  let g2 = 0
  let g5 = 0
  for (const arq of dados) {
    for (const m of arq.messages) {
      const id = typeof m.message === 'string' && m.message.startsWith('G5:') ? 'G5' : 'G2'
      if (id === 'G5') g5++
      else g2++
      const regra = m.ruleId ?? 'parse'
      add(id, rel(arq.filePath), `(linha ${m.line ?? '?'}: ${regra}${id === 'G2' ? ` - ${m.message.slice(0, 100)}` : ''})`)
    }
  }
  status.push(['G2 lint (api e web)', g2 === 0, r.ms], ['G5 env só em config', g5 === 0, r.ms])
}

// G3 - testes unitarios da API
async function g3() {
  const tmp = mkdtempSync(path.join(tmpdir(), 'gates-'))
  const saida = path.join(tmp, 'vitest.json')
  const r = await rodar(bin('api', 'vitest'), ['run', '--reporter=json', `--outputFile=${saida}`], {
    cwd: path.join(raiz, 'api'),
  })
  let ok = r.code === 0
  let achou = 0
  if (existsSync(saida)) {
    const dados = JSON.parse(readFileSync(saida, 'utf8'))
    for (const t of dados.testResults || []) {
      if (t.status !== 'passed') {
        ok = false
        achou++
        const nomes = (t.assertionResults || []).filter((a) => a.status === 'failed').map((a) => a.title)
        const motivo = nomes.length ? nomes.join('; ') : (t.message || 'falhou').split('\n')[0]
        add('G3', rel(t.name), `(${motivo.slice(0, 120)})`)
      }
    }
  }
  if (r.code !== 0 && achou === 0) {
    ok = false
    falhaDeFerramenta(['G3'], 'api/vitest.config.mts', r)
  }
  rmSync(tmp, { recursive: true, force: true })
  status.push(['G3 testes unitários (api)', ok, r.ms])
}

// G4, G6, G7, G8, G9 e P2 - dependency-cruiser (.dependency-cruiser.cjs)
const idsCruiser = ['G4', 'G6', 'G7', 'G8', 'G9', 'P2']
const nomesCruiser = {
  G4: 'http sem prisma/repositório',
  G6: 'serviço sem express/multer/http',
  G7: 'openai só em integrations',
  G8: 'web não importa api',
  G9: 'sem import circular',
  P2: 'domínio puro',
}
async function cruiser() {
  const alvos = ['api/src', 'api/prisma', 'api/test', 'web/src', 'web/vite.config.ts'].filter((p) => existsSync(p))
  const r = await rodar(bin('.', 'depcruise'), [...alvos, '--config', '.dependency-cruiser.cjs', '--output-type', 'json'])
  let dados
  try {
    dados = JSON.parse(r.out)
  } catch {
    falhaDeFerramenta(idsCruiser, '.dependency-cruiser.cjs', r)
    for (const id of idsCruiser) status.push([`${id} ${nomesCruiser[id]}`, false, r.ms])
    return
  }
  const cont = {}
  for (const v of dados.summary.violations || []) {
    const id = v.rule.name.split('-')[0]
    cont[id] = (cont[id] || 0) + 1
    const destino = v.cycle
      ? `(ciclo: ${[v.from, ...v.cycle.map((c) => (typeof c === 'string' ? c : c.name))].join(' -> ')})`
      : `-> ${v.to}`
    add(id, v.from, `${destino} [${v.rule.name}]`)
  }
  for (const id of idsCruiser) status.push([`${id} ${nomesCruiser[id]}`, !cont[id], r.ms])
}

// G10 - knip (arquivo, export, tipo e dependencia sem uso)
const tiposKnip = {
  files: 'arquivo sem uso',
  dependencies: 'dependência sem uso',
  devDependencies: 'dependência de dev sem uso',
  optionalPeerDependencies: 'peer dependency sem uso',
  unlisted: 'dependência não declarada',
  binaries: 'binário não declarado',
  unresolved: 'import não resolvido',
  exports: 'export sem uso',
  types: 'export de tipo sem uso',
  nsExports: 'export sem uso (namespace)',
  nsTypes: 'export de tipo sem uso (namespace)',
  enumMembers: 'membro de enum sem uso',
  classMembers: 'membro de classe sem uso',
  duplicates: 'export duplicado',
}
async function knip(pasta) {
  const r = await rodar(bin('.', 'knip'), ['--directory', pasta, '--reporter', 'json', '--no-progress', '--no-config-hints'])
  let dados
  try {
    dados = JSON.parse(r.out)
  } catch {
    falhaDeFerramenta(['G10'], `${pasta}/knip.json`, r)
    status.push([`G10 sem uso (${pasta})`, false, r.ms])
    return
  }
  let n = 0
  for (const issue of dados.issues || []) {
    const arquivo = `${pasta}/${issue.file}`
    for (const [chave, texto] of Object.entries(tiposKnip)) {
      const lista = issue[chave]
      if (!Array.isArray(lista)) continue
      for (const item of lista) {
        n++
        if (chave === 'files') {
          add('G10', arquivo, `(${texto})`)
          continue
        }
        const nome = Array.isArray(item) ? item.map((i) => i.name).join(',') : item.name
        add('G10', arquivo, `${nome} (${texto}${item.line ? `, linha ${item.line}` : ''})`)
      }
    }
  }
  if (r.code !== 0 && n === 0) falhaDeFerramenta(['G10'], `${pasta}/knip.json`, r)
  status.push([`G10 sem uso (${pasta})`, r.code === 0 && n === 0, r.ms])
}

// P1 e P3 - varreduras de texto em api/src e web/src
function arquivosDe(dir) {
  if (!existsSync(dir)) return []
  const lista = []
  for (const nome of readdirSync(dir)) {
    const p = path.join(dir, nome)
    if (statSync(p).isDirectory()) lista.push(...arquivosDe(p))
    else if (/\.(c|m)?(t|j)sx?$/.test(nome)) lista.push(p)
  }
  return lista
}

async function varreduras() {
  const inicio = Date.now()
  const supressao = /eslint-disable|eslint-enable|@ts-ignore|@ts-expect-error|@ts-nocheck|\/\*\s*eslint\s/
  const endereco = /\b(localhost|127\.0\.0\.1|0\.0\.0\.0)\b|https?:\/\/[^\s'"`/]+:\d{2,5}/
  let p1 = 0
  let p3 = 0
  for (const arq of [...arquivosDe('api/src'), ...arquivosDe('web/src')]) {
    const r = rel(arq)
    const emConfig = /^(api|web)\/src\/config\//.test(r)
    readFileSync(arq, 'utf8')
      .split('\n')
      .forEach((linha, i) => {
        if (supressao.test(linha)) {
          p1++
          add('P1', r, `(linha ${i + 1}: comentário de supressão)`)
        }
        if (!emConfig && endereco.test(linha)) {
          p3++
          add('P3', r, `(linha ${i + 1}: endereço fixo fora de config/)`)
        }
      })
  }
  const ms = Date.now() - inicio
  status.push(['P1 sem comentário de supressão', p1 === 0, ms], ['P3 sem endereço fixo fora de config/', p3 === 0, ms])
}

const tarefas = []
if (quer('G1')) tarefas.push(g1('api'), g1('web'))
if (quer('G2') || quer('G5')) tarefas.push(eslint())
if (quer('G3')) tarefas.push(g3())
if (idsCruiser.some(quer)) tarefas.push(cruiser())
if (quer('G10')) tarefas.push(knip('api'), knip('web'))
if (quer('P1') || quer('P3')) tarefas.push(varreduras())
await Promise.all(tarefas)

const idDe = (texto) => texto.split(' ')[0]
console.log('Gates:')
for (const [nome, ok, ms] of status.filter(([n]) => quer(idDe(n)))) {
  console.log(`  ${ok ? 'ok    ' : 'FALHOU'} ${nome} (${(ms / 1000).toFixed(1)}s)`)
}
console.log('')
const lista = [...new Set(violacoes.filter((v) => quer(idDe(v))))].sort()
if (lista.length === 0) {
  console.log('Violações: nenhuma.')
  process.exit(0)
}
console.log(`Violações (${lista.length}):`)
for (const v of lista) console.log(v)
process.exit(1)
