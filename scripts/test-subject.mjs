/**
 * 主题归并的回归测试。
 *
 * 用法：node scripts/test-subject.mjs
 *
 * 归并规则是手写的正则与表，改一行就可能让上百条记录的主题名悄悄变掉。
 * 用例把已经人工核对过的行为钉住：跑一遍，不一样的就是改坏的。
 *
 * 失败时只报差异，不改数据——修规则是人的事。
 */
import { subjectOf, subjectKey } from './lib/subject.mjs';
import { SUBJECT_CASES } from './fixtures/subject-cases.mjs';

let failed = 0;
const failures = [];

for (const c of SUBJECT_CASES) {
  const got = subjectOf(c.name, c.grade);
  if (got !== c.subject) {
    failed++;
    failures.push({ ...c, got });
  }
}

console.log(`主题归并用例：${SUBJECT_CASES.length - failed}/${SUBJECT_CASES.length} 通过`);
if (failed) {
  console.log('\n不符合预期的：');
  for (const f of failures) {
    console.log(`  ${f.name}（${f.grade}）`);
    console.log(`    期望 ${JSON.stringify(f.subject)}`);
    console.log(`    实际 ${JSON.stringify(f.got)}`);
    console.log(`    理由 ${f.why}`);
  }
  process.exitCode = 1;
}

/* 检索键也要稳定：它是页面地址，改了就等于改了一堆 URL */
const KEY_CASES = [
  ['RX-78-2 高达', 'rx-78-2高达'],
  ['ν高达', 'ν高达'],
  ['渣古II', '渣古ii'],
  ['高达MK-Ⅲ', '高达mk-iii'],
  ['基拉·多加', '基拉·多加'],
];

let keyFailed = 0;
for (const [label, expected] of KEY_CASES) {
  const got = subjectKey(label);
  if (got !== expected) {
    keyFailed++;
    console.log(`  检索键：${label} → ${JSON.stringify(got)}，期望 ${JSON.stringify(expected)}`);
  }
}
if (!keyFailed) console.log(`检索键用例：${KEY_CASES.length}/${KEY_CASES.length} 通过`);

if (failed || keyFailed) {
  console.log('\n有改动没同步到用例里，或者规则被改坏了——请先确认再改数据。');
  process.exitCode = 1;
}
