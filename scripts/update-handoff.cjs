#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const rootDir = process.cwd();
const contextDir = path.join(rootDir, '.context');
const notesPath = path.join(contextDir, 'notes.md');
const todosPath = path.join(contextDir, 'todos.md');
const handoffPath = path.join(contextDir, 'handoff.md');

const manualStart = '<!-- MANUAL START -->';
const manualEnd = '<!-- MANUAL END -->';

const defaultNotes = `# Notes

## ${new Date().toISOString().slice(0, 10)}

- Contexto inicializado para handoff entre IAs.
`;

const defaultTodos = `# Todos

- [ ] Registrar objetivo atual no handoff manual.
- [ ] Atualizar o próximo passo antes de encerrar a sessão.
`;

const defaultManualSection = `## Manual Checkpoint

- Objetivo atual:
- Status:
- Arquivos alterados:
- Decisoes tomadas:
- Proximo passo:
`;

function runGit(command) {
  try {
    return execSync(command, {
      cwd: rootDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
    }).trim();
  } catch {
    return '';
  }
}

function ensureFile(filePath, content) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, content, 'utf8');
  }
}

function toLines(value) {
  if (!value) {
    return [];
  }

  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function formatSection(title, lines) {
  if (!lines.length) {
    return `## ${title}\n- (none)\n`;
  }

  return `## ${title}\n${lines.map((line) => `- ${line}`).join('\n')}\n`;
}

function getManualBlock(existingContent) {
  const start = existingContent.indexOf(manualStart);
  const end = existingContent.indexOf(manualEnd);

  if (start === -1 || end === -1 || end < start) {
    return `${manualStart}\n${defaultManualSection}${manualEnd}`;
  }

  return existingContent.slice(start, end + manualEnd.length).trim();
}

function preview(filePath, maxLines = 40) {
  const content = fs.readFileSync(filePath, 'utf8').trim();

  if (!content) {
    return '(empty)';
  }

  const lines = content.split('\n');
  const cropped = lines.slice(0, maxLines);
  if (lines.length > maxLines) {
    cropped.push('...');
  }

  return cropped.join('\n');
}

fs.mkdirSync(contextDir, { recursive: true });
ensureFile(notesPath, defaultNotes);
ensureFile(todosPath, defaultTodos);

const now = new Date();
const timestampUtc = now.toISOString();
const timestampLocal = now.toLocaleString('sv-SE', { hour12: false });

const branch = runGit('git rev-parse --abbrev-ref HEAD') || '(unknown)';
const headSha = runGit('git rev-parse --short HEAD') || '(none)';
const headSubject = runGit('git log -1 --pretty=%s') || '(no commits)';
const statusShort = toLines(runGit('git status --short'));
const stagedFiles = toLines(runGit('git diff --cached --name-only'));
const unstagedFiles = toLines(runGit('git diff --name-only'));
const untrackedFiles = toLines(runGit('git ls-files --others --exclude-standard'));
const recentCommits = toLines(
  runGit("git log -n 5 --pretty=format:'%h | %ad | %s' --date=short"),
);

const existingHandoff = fs.existsSync(handoffPath)
  ? fs.readFileSync(handoffPath, 'utf8')
  : '';
const manualBlock = getManualBlock(existingHandoff);

const handoffContent = `# AI Handoff

_Last updated (UTC): ${timestampUtc}_
_Last updated (local): ${timestampLocal}_

## Git Snapshot

- Branch: \`${branch}\`
- HEAD: \`${headSha}\` - ${headSubject}
- Working tree: ${statusShort.length ? 'dirty' : 'clean'}
- Staged files: ${stagedFiles.length}
- Unstaged files: ${unstagedFiles.length}
- Untracked files: ${untrackedFiles.length}

${formatSection('Recent Commits', recentCommits)}
${formatSection('Working Tree (git status --short)', statusShort)}
${formatSection('Staged Files', stagedFiles)}
${formatSection('Unstaged Files', unstagedFiles)}
${formatSection('Untracked Files', untrackedFiles)}
## Notes Preview (\`.context/notes.md\`)

\`\`\`md
${preview(notesPath)}
\`\`\`

## Todos Preview (\`.context/todos.md\`)

\`\`\`md
${preview(todosPath)}
\`\`\`

${manualBlock}

## Prompt Template

\`\`\`txt
Objetivo atual:
Status:
Arquivos alterados:
Decisoes tomadas:
Proximo passo:
\`\`\`
`;

fs.writeFileSync(handoffPath, handoffContent, 'utf8');

console.log(`Updated ${path.relative(rootDir, handoffPath)}`);
