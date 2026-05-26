#!/usr/bin/env node
import { execFileSync } from 'node:child_process';

function parseArgs(argv) {
  const result = {};

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current.startsWith('--')) {
      continue;
    }

    const equalsIndex = current.indexOf('=');
    if (equalsIndex > -1) {
      result[current.slice(2, equalsIndex)] = current.slice(equalsIndex + 1);
      continue;
    }

    const key = current.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      result[key] = next;
      index += 1;
      continue;
    }

    result[key] = 'true';
  }

  return result;
}

function runGit(args) {
  execFileSync('git', args, {
    stdio: 'inherit',
  });
}

function runGitCapture(args) {
  return execFileSync('git', args, {
    encoding: 'utf8',
  }).trim();
}

const options = parseArgs(process.argv.slice(2));
const sourceRef = options.source || process.env.SNAPSHOT_SOURCE || 'refs/remotes/origin/gh-pages';
const snapshotBranch = options.branch || process.env.SNAPSHOT_BRANCH || 'gh-pages';
const snapshotMessage = options.message || process.env.SNAPSHOT_MESSAGE || 'chore: sync gh-pages snapshot';

runGit(['rev-parse', '--is-inside-work-tree']);
const sourceTree = runGitCapture(['rev-parse', `${sourceRef}^{tree}`]);
const snapshotCommit = runGitCapture(['commit-tree', sourceTree, '-m', snapshotMessage]);
runGit(['update-ref', `refs/heads/${snapshotBranch}`, snapshotCommit]);
runGit(['checkout', '-f', snapshotBranch]);
