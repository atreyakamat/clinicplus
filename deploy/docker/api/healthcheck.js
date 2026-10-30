// Docker HEALTHCHECK for the API container (no curl in the image).
// Probes /health/live; falls back to /health on 404 for builds that predate the live/ready split.
'use strict';
const http = require('node:http');

const port = Number(process.env.PORT || 3000);

function probe(path) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path, agent: false, timeout: 4000 }, (res) => {
      res.resume();
      resolve(res.statusCode || 0);
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', () => resolve(0));
  });
}

(async () => {
  let status = await probe('/health/live');
  if (status === 404) status = await probe('/health');
  process.exitCode = status >= 200 && status < 300 ? 0 : 1;
})();
