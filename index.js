const fs     = require('fs');
const ziti   = require('ziti-sdk-nodejs');

const UV_EOF = -4095;

const zitiInit = async (zitiFile) => {
  return new Promise((resolve, reject) => {
    var rc = ziti.ziti_init(zitiFile, (init_rc) => {
        if (init_rc < 0) {
            return reject(`init_rc = ${init_rc}`);
        }
        return resolve();
    });

    if (rc < 0) {
        return reject(`rc = ${rc}`);
    }
  });
};

const zitiServiceAvailable = async (service) => {
  return new Promise((resolve, reject) => {
    ziti.ziti_service_available(service, (obj) => {
      if (obj.status != 0) {
        console.log(`service ${service} not available, status: ${status}`);
        return reject(status);
      } else {
        console.log(`service ${service} available`);
        return resolve();
      }
    });
  });
}

const zitiHttpRequest = async (url, method, headers) => {
  return new Promise((resolve) => {
    ziti.Ziti_http_request(
      url, 
      method,
      headers,
      (obj) => { // on_req callback
          console.log('on_req callback: req is: %o', obj.req);
          return resolve(obj.req);
      },        
      (obj) => { // on_resp callback
        console.log(`on_resp status: ${obj.code} ${obj.status}`);
        if (obj.code != 200) {
          core.setFailed(`on_resp failure: ${obj.status}`);
          process.exit(-1);
        }
        process.exit(0);
      },
      (obj) => { // on_resp_body callback
        // not expecting any body...
        if (obj.len === UV_EOF) {
          console.log('response complete')
          process.exit(0);
        } else if (obj.len < 0) {
          core.setFailed(`on_resp failure: ${obj.len}`);
          process.exit(-1);
        }

        if (obj.body) {
          let str = Buffer.from(obj.body).toString();
          console.log(`on_resp_body len: ${obj.len}, body: ${str}`);
        } else {
          console.log(`on_resp_body len: ${obj.len}`);
        }
      });
  });
};

const zitiHttpRequestData = async (req, buf) => {
  ziti.Ziti_http_request_data(
    req, 
    buf,
    (obj) => { // on_req_body callback
      if (obj.status < 0) {
          reject(obj.status);
      } else {
          resolve(obj);
      }
  });
};

console.log('Going async...');
(async function() {
  try {
    const zidFile        = './zid.json'
    const zitiId         = process.env.ZITI_IDENTITY;
    const webhookUrl     = process.env.WEBHOOK_URL;
    const webhookPayload = process.env.WEBHOOK_PAYLOAD;

    if (zitiId === '') {
      console.log(`ZITI_IDENTITY env var was not specified`);
      process.exit(-1);
    }
    if (webhookUrl === '') {
      console.log(`WEBHOOK_URL env var was not specified`);
      process.exit(-1);
    }
    if (webhookPayload === '') {
      console.log(`WEBHOOK_PAYLOAD env var was not specified`);
      process.exit(-1);
    }


    // Write zitiId to file
    fs.writeFileSync(zidFile, zitiId);

    // First make sure we can initialize Ziti
    await zitiInit(zidFile).catch((err) => {
      console.log(`zitiInit failed: ${err}`);
      process.exit(-1);
    });

    // Make sure we have ziti service available
    // Note: ziti-sdk-nodejs (currently) requires service name to match URL host
    // (TODO: write an issue to change this - no reason that should need to match, and can lead to errors)
    let url = new URL(webhookUrl);
    let serviceName = url.hostname;
    await zitiServiceAvailable(serviceName).catch((err) => {
      console.log(`zitiServiceAvailable failed: ${err}`);
      process.exit(-1);
    });

    // Get the JSON webhook payload for the event that triggered the workflow. We expect it to already be stringify'd.
    const payload = `${webhookPayload}`;
    var payloadBuf = Buffer.from(payload, 'utf8');

    // Send it over Ziti
    let headersArray = [
      'User-Agent: GitLab-Hookshot/ziti-gitlab-webhook', 
      'Content-Type: application/json',
      `Content-Length: ${payloadBuf.length}`,
    ];
    let req = await zitiHttpRequest(webhookUrl, 'POST', headersArray).catch((err) => {
      console.log(`zitiHttpRequest failed: ${err}`);
      process.exit(-1);
    });

    // Send the payload
    results = await zitiHttpRequestData(req, payloadBuf).catch((err) => {
      console.log(`zitiHttpRequestData failed: ${err}`);
      process.exit(-1);
    });
    ziti.Ziti_http_request_end(req);

  } catch (error) {
    console.log(error.message);
  }
}());
