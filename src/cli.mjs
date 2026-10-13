#!/usr/bin/env node
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createServer } from './server.mjs';

try {
  await serveStdio(createServer, { onerror: error => console.error(error.message) });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
