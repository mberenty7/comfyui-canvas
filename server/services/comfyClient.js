const http = require('http');

function proxyRequest(comfyUrl, method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(comfyUrl + urlPath);
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {},
    };
    if (body) {
      const data = typeof body === 'string' ? body : JSON.stringify(body);
      opts.headers['Content-Type'] = 'application/json';
      opts.headers['Content-Length'] = Buffer.byteLength(data);
    }
    const req = http.request(opts, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        try { resolve({ status: res.statusCode, data: JSON.parse(buf.toString()) }); }
        catch { resolve({ status: res.statusCode, data: buf }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

function uploadImageToComfy(comfyUrl, filename, fileData, mime='image/png') {
  return new Promise((resolve, reject) => {
    const boundary = '----NodeFormBoundary' + Math.random().toString(36).slice(2);
    const bodyParts = [
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`),
      fileData,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ];
    const bodyBuf = Buffer.concat(bodyParts);

    const url = new URL(comfyUrl + '/upload/image');
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': bodyBuf.length,
      },
    }, (resp) => {
      let data = '';
      resp.on('data', c => data += c);
      resp.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('Comfy upload parse failed: ' + data.slice(0, 500))); }
      });
    });

    req.on('error', reject);
    req.write(bodyBuf);
    req.end();
  });
}

module.exports = {
  proxyRequest,
  uploadImageToComfy,
};
