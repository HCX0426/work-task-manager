/* H2 回归：CSV 公式注入防护（escCsv 必须中和行首 = + - @ \t \r）。
   直接抽取 list.js 中的 escCsv 箭头函数运行，避免重复实现逻辑。
   用法：node _csv_injection_reg.js */
const fs = require('fs');
const path = require('path');

const listSrc = fs.readFileSync(path.resolve(__dirname, '..', 'js', 'list.js'), 'utf8');
const m = listSrc.match(/const escCsv=s=>\{[^}]*\};/);
if (!m) { console.error('escCsv 未找到'); process.exit(1); }
const arrow = m[0].replace('const escCsv=', '').replace(/;\s*$/, '');
const escCsv = eval('(' + arrow + ')');

let pass = 0, fail = 0; const fails = [];
function ok(cond, msg) { if (cond) pass++; else { fail++; fails.push(msg); console.log('  ✗ FAIL:', msg); } }
function eq(a, b, msg) { ok(a === b, msg + `  (期望 ${JSON.stringify(b)}，实际 ${JSON.stringify(a)})`); }

console.log('=== H2：escCsv 公式注入防护 ===');
eq(escCsv('=cmd'), "'=cmd", '行首 = 被中和（前缀单引号）');
eq(escCsv('+1'), "'+1", '行首 + 被中和');
eq(escCsv('-1'), "'-1", '行首 - 被中和');
eq(escCsv('@SUM(1)'), "'@SUM(1)", '行首 @ 被中和');
eq(escCsv('\tx'), "'\tx", '行首制表符被中和（tab 不在引号触发集，不包裹）');
// 回车在引号触发集内，故中和后还会被双引号包裹（两者并存，安全）
const crExpected = '"' + "'" + '\r' + 'cr' + '"';
eq(escCsv('\rcr'), crExpected, '行首回车被中和（同时触发引号包裹）');
eq(escCsv('正常文本'), '正常文本', '普通文本不变');
eq(escCsv('含,逗号'), '"含,逗号"', '含逗号仍走双引号包裹');
eq(escCsv('带"引号"'), '"带""引号"""', '含引号仍按 CSV 规范转义');
eq(escCsv('=a,b'), "\"'=a,b\"", '先中和再包裹：注入与逗号共存安全');
eq(escCsv(null), '', 'null 转为空字符串（不抛错）');

console.log(`\n========== CSV 注入防护回归：PASS=${pass}  FAIL=${fail} ==========`);
if (fail) { fails.forEach(f => console.log('  - ' + f)); process.exit(1); }
console.log('✓ escCsv 已中和行首公式注入字符，且保留原 CSV 转义语义');
