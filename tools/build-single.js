// 把整個網站打包成單一 HTML 片段（CSS、JS 內嵌），給 claude.ai Artifact 預覽用。
// 用法：node tools/build-single.js [輸出路徑]
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const out = process.argv[2] || path.join(ROOT, 'dist', 'huarongdao.html');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const title = html.match(/<title>[\s\S]*?<\/title>/)[0];
const fonts = html.match(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/)[0];
const body = html.match(/<body>([\s\S]*)<\/body>/)[1];
const css = fs.readFileSync(path.join(ROOT, 'css', 'style.css'), 'utf8');

const scripts = [];
const markup = body.replace(/<script src="([^"]+)"><\/script>\n?/g, (_, src) => {
  scripts.push(fs.readFileSync(path.join(ROOT, src), 'utf8'));
  return '';
});
for (const s of scripts) if (s.includes('</script')) throw new Error('script contains </script');

const result = [
  title,
  '<meta name="claude:viewport-fit-sides" content="cover">',
  fonts,
  '<style>\n' + css + '</style>',
  markup.trim(),
  '<script>\n' + scripts.join('\n') + '</script>',
  '',
].join('\n');

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, result);
console.log('wrote', out, (result.length / 1024).toFixed(1) + ' KB');
