'use strict';

const { marked } = require('marked');

marked.setOptions({
  gfm: true,
  breaks: false,
});

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function extractTitle(md) {
  const m = String(md).match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : 'Markdown Page';
}

function renderMarkdown(md, options = {}) {
  const title = options.title || extractTitle(md);
  const body = marked.parse(String(md));
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light dark; }
    body {
      font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
      line-height: 1.7;
      max-width: 820px;
      margin: 0 auto;
      padding: 2rem 1.25rem 4rem;
      color: #1a1a1a;
      background: #fafafa;
    }
    @media (prefers-color-scheme: dark) {
      body { color: #e8e8e8; background: #121212; }
      pre, code { background: #1e1e1e; }
      a { color: #7cb8ff; }
      blockquote { border-color: #444; color: #aaa; }
      table th, table td { border-color: #333; }
      table th { background: #1e1e1e; }
    }
    h1, h2, h3 { line-height: 1.3; }
    a { color: #0b5fff; }
    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.92em;
      background: #eee;
      padding: 0.1em 0.35em;
      border-radius: 4px;
    }
    pre {
      background: #f0f0f0;
      padding: 1rem;
      overflow: auto;
      border-radius: 8px;
    }
    pre code { background: none; padding: 0; }
    blockquote {
      margin: 0;
      padding: 0.25rem 1rem;
      border-left: 4px solid #ccc;
      color: #555;
    }
    img { max-width: 100%; height: auto; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 0.5rem 0.75rem; text-align: left; }
    th { background: #f5f5f5; }
    .pagedrop-footer {
      margin-top: 3rem;
      padding-top: 1rem;
      border-top: 1px solid #ddd;
      font-size: 0.85rem;
      color: #888;
    }
  </style>
</head>
<body>
${body}
<footer class="pagedrop-footer">Published with PageDrop</footer>
</body>
</html>`;
}

module.exports = {
  renderMarkdown,
  extractTitle,
};
