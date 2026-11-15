/* 由 data/essays.json 產生可讀的參考答案文件（docs/）。執行：node tools/make_docs.js */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'data', 'essays.json'), 'utf8'));
const SHORT = { '公務人員高等考試三級考試': '高考三級', '公務人員普通考試': '普考', '公務人員初等考試': '初等' };

function md(h) {
  return String(h)
    .replace(/<b>(.*?)<\/b>/g, '**$1**')
    .replace(/<sub>(.*?)<\/sub>/g, '_$1').replace(/<sup>(.*?)<\/sup>/g, '^$1')
    .replace(/<br\s*\/?>\s*<br\s*\/?>/g, '\n\n').replace(/<br\s*\/?>/g, '\n\n')
    .replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n').trim();
}
const groups = {};
data.essays.forEach(e => { (groups[e.year_roc + '|' + e.exam + '|' + e.subject] = groups[e.year_roc + '|' + e.exam + '|' + e.subject] || []).push(e); });
Object.keys(groups).forEach(k => {
  const list = groups[k].sort((a, b) => a.question_no - b.question_no), f = list[0];
  const cats = [...new Set(list.flatMap(e => e.categories || []))];
  const L = [];
  L.push('# ' + f.year_roc + ' 年' + f.exam + (cats.length ? '（' + cats.join('、') + '）' : '') + ' ' + f.subject + '　申論題參考答案與評分細目', '');
  L.push('> 考選部不公布申論題標準答案。以下為編者整理的參考答案與評分細目，非官方答案；閱卷者可能接受其他合理的解法。內容與 `data/essays.json` 同步（由 `tools/make_docs.js` 產生，請改 json 不要直接改本檔）。', '');
  L.push('公式中 `^` 代表上標、`_` 代表下標。', '');
  list.forEach(e => {
    L.push('## 第 ' + e.question_no + ' 題（' + e.points + ' 分）', '', md(e.question), '');
    e.parts.forEach(p => {
      if (e.parts.length > 1 || p.label !== '本題') L.push('### ' + p.label + '（' + p.points + ' 分）', '');
      L.push(md(p.question), '', '**參考答案**', '', md(p.model_answer), '', '**評分細目**', '', '| 得分點 | 配分 |', '|---|---|');
      p.rubric.forEach(r => L.push('| ' + r.label.replace(/\|/g, '\\|') + ' | ' + r.points + ' |'));
      L.push('');
      if (p.pitfalls) L.push(md(p.pitfalls), '');
    });
  });
  const name = f.year_roc + '-' + (SHORT[f.exam] || f.exam) + f.subject.replace(/[（）()\/]/g, '') + '-申論題參考答案.md';
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', name), L.join('\n'), 'utf8');
  console.log('docs/' + name + '（' + list.length + ' 題）');
});
