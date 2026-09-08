import { createServer } from 'node:net';

export async function findFreePort(
  preferred: number,
  max: number = preferred + 100,
): Promise<number> {
  for (let port = preferred; port <= max; port += 1) {
    const free = await isPortFree(port);
    if (free) {
      return port;
    }
  }
  throw new Error(`No free port between ${preferred} and ${max}`);
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.unref();
    server.on('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve(true));
    });
  });
}
