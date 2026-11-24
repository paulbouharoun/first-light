import { defineConfig, type Plugin } from 'vite';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Dev-only: lets the proof sheet (dev/proof.html) save full-resolution renders
 * to ./proofs so they can be inspected outside the browser. Not part of the build.
 */
function proofSaver(): Plugin {
  return {
    name: 'proof-saver',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__proof', (req, res) => {
        const name = (new URL(req.url ?? '', 'http://x').searchParams.get('name') ?? 'proof').replace(/[^\w-]/g, '');
        const chunks: Buffer[] = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
          const dir = join(server.config.root, 'proofs');
          mkdirSync(dir, { recursive: true });
          writeFileSync(join(dir, `${name}.png`), Buffer.concat(chunks));
          res.end('ok');
        });
      });
    },
  };
}

export default defineConfig({
  base: './',
  server: { port: 5180, watch: { ignored: ['**/proofs/**'] } },
  plugins: [proofSaver()],
  test: { environment: 'node' },
} as never);
