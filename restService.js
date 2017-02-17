'use strict';

const Hoek = require('hoek');
const Joi = require('joi');
const Wreck = require('wreck');

const schemaTypes = ['headers', 'params', 'query', 'payload'];

module.exports = (apiSchema, baseUriFac /* , settings = {}*/) => {

  Hoek.assert(
    ['string', 'function'].some(type => typeof baseUriFac === type),
    '"basUriFac" must be a string or function'
  );

  const baseUri = typeof baseUriFac === 'function' ? baseUriFac() : baseUriFac;

  const httpRequest = (opt) => {
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
      .then(({ method: m, url: u, options: o }) =>
        new Promise((resolve, reject) =>
          Wreck[m](u, o, (err, res, payload) => {
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

  const createApiCall = (schema) => {
    const cleanSchema = Hoek.clone(schema);

    //Hoek.assert(cleanSchema.path, '"path" must exist');
    //Hoek.assert(cleanSchema.method, '"method" must exist');
    //Hoek.assert(cleanSchema.template, '"template" must exist');

    // ensure correct joi format
    Object.keys(cleanSchema).forEach(type => {
      if (schemaTypes.includes(type) &&
            schema[type] &&
              !schema[type].isJoi) {
        cleanSchema[type] = Joi.compile(schema[type]);
      }
    });

    return (args) => {

      // GET /players/{playerId}/games{?take,skip}
      const [gh, ty] = cleanSchema.template.trim().split(/\s+/);
      const params = ty.match(/{([^\?].+?)}/)[1];
      const query = ty.match(/{\?(.+?)}/)[1].split(',');
      const options = { params, query };

      // map args with schema
      // const options = Object.keys(args).reduce((argObj, k) => {
      //   const clone = [...schemaTypes];
      //   const create = (type) => {
      //     if (!type) {
      //       return;
      //     }
      //     const item = cleanSchema[type] && cleanSchema[type]._inner.children.find(
      //       x => x.key.toLowerCase() === k.toLowerCase()
      //     );
      //     if (item) {
      //       // eslint-disable-next-line no-param-reassign
      //       argObj[type] = Object.assign({}, argObj[type] || {}, { [k]: args[k] });
      //       return;
      //     }
      //     create(clone.shift());
      //   };
      //   create(clone.shift());
      //   return argObj;
      // }, {});

      schemaTypes.forEach(s => {
        cleanSchema.alias[s].forEach(k => {
          if (Object.keys(options[s]).includes(k)) {
            const realKey = cleanSchema.alias[s][k];
            const tmp = options[s][k];
            options[s][realKey] = tmp;
            delete options[s][k];
          }
        });
      });

      const validateFactory = (type) => {
        if (options && options[type]) {
          return new Promise((resolve, reject) =>
            Joi.validate(options[type], schema[type], (err, val) =>
              (err ? reject(err) : resolve(val))
            )
          );
        }
        return Promise.resolve();
      };

      return Promise.all(
        schemaTypes.map(validateFactory)
      ).then(([
        headers, params, query, payload
      ]) => {
        if (params) {
          Object.keys(options.params).forEach(key => {
            cleanSchema.path = cleanSchema.path.replace(
              `{${key}}`, encodeURIComponent(options.params[key])
            );
          });
        }
        if (query) {
          const keyVals = Object.keys(options.query).map(key =>
            `${key}=${encodeURIComponent(options.query[key])}`
          );
          cleanSchema.path += `?${keyVals.join('&')}`;
        }

        const method = cleanSchema.method.toLowerCase();
        const url = `${baseUri.trim('/')}${cleanSchema.path}`;

        const handleRequest = cleanSchema.handleRequest || (
          (req) => Promise.resolve(req)
        );
        const handleResponse = cleanSchema.handleResponse || (
          (err, res) => (err ? Promise.reject(err) : Promise.resolve(res))
        );

        return httpRequest({
          method,
          url,
          options: {
            headers,
            payload
          },
          handleRequest,
          handleResponse
        });
      });
    };
  };

  const endpoints = Object.keys(apiSchema).reduce((api, key) => {
    // eslint-disable-next-line no-param-reassign
    api[key] = createApiCall(apiSchema[key]);
    return api;
  }, {});

  return endpoints;
};
