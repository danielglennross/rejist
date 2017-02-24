'use strict';

const Hoek = require('hoek');
const Wreck = require('wreck');

const send = (opt) => {
  const options = Object.keys(opt.options).reduce((obj, key) => {
    if (typeof opt.options[key] !== 'undefined') {
      Object.assign(obj, { [key]: opt.options[key] });
    }
    return obj;
  }, {});

  options.headers = Object.assign({}, options.headers || {}, {
    'Content-Type': 'application/json',
    Accept: 'application/json'
  });

  if (options.payload && typeof options.payload === 'object') {
    options.payload = JSON.stringify(options.payload);
  }

  return Promise.resolve()
    .then(() => {
      const request = Object.assign({},
        { options: Hoek.clone(options) },
        { url: opt.url, method: opt.method }
      );
      return opt.handleRequest(request);
    })
    .then(({ method, url, options: requestOptions }) =>
      new Promise((resolve, reject) =>
        Wreck[method.toLowerCase()](url, requestOptions, (err, res, payload) => {
          if (err) {
            return reject(err);
          }

          // eslint-disable-next-line no-param-reassign
          res.payload = payload instanceof Buffer
            ? JSON.parse(payload.toString() || '{}')
            : payload;
          return resolve(res);
        })
      )
    )
    .then((res) => opt.handleResponse(null, res))
    .catch((err) => opt.handleResponse(err, null));
};

module.exports = {
  send
};
