const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
module.exports = (file, overrides = {}) => {
  const exports = {}
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  vm.runInNewContext(source, {
    exports,
    require: (name) => overrides[name] ?? require(name),
    console,
    URL,
  })
  return exports
}
