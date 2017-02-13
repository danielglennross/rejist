'use strict';

const Hoek = require('hoek');
const Joi = require('joi');
const Wreck = require('wreck');

const schemaTypes = ['headers', 'params', 'query', 'payload'];

module.exports = (apiSchema, baseUriFac /* , settings = {}*/) => {

  Hoek.assert(
    ['string', 'function'].some(type => typeof baseUriFac === type),
    '"basUri" must be a string or function'
  );

  const baseUri = typeof baseUriFac === 'function'
    ? baseUriFac()
    : baseUriFac;

  const httpRequest = (method, url, requestOptions) => {
    const options = requestOptions;

    options.headers = Object.assign({}, options.headers || {}, {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    });

    if (options.payload && typeof options.payload === 'object') {
      options.payload = JSON.stringify(options.payload);
    }

    return new Promise((resolve, reject) =>
      Wreck[method](url, options, (err, res, payload) => {
        if (err) {
          return reject(err);
        }

        // eslint-disable-next-line no-param-reassign
        res.payload = payload instanceof Buffer
          ? JSON.parse(payload.toString() || '{}')
          : payload;
        return resolve(res);
      })
    );
  };

  const createApiCall = (schema) => {

    // ensure correct joi format
    const cleanSchema = Hoek.clone(schema);
    cleanSchema.forEach(type => {
      if (schemaTypes.includes(type) &&
            schema[type] &&
              !schema[type].isJoi) {
        cleanSchema[type] = Joi.compile(schema[type]);
      }
    });

    return (args) => {

      // map args with schema
      const options = Object.keys(args).reduce((agg, k) => {
        const clone = [...schemaTypes];
        const create = (type) => {
          if (!type) {
            return;
          }
          const item = schema[type] && schema[type]._inner.children.find(
            x => x.key.toLowerCase() === k.toLowerCase()
          );
          if (item) {
            // eslint-disable-next-line no-param-reassign
            agg[type] = Object.assign({}, agg[type] || {}, { [k]: args[k] });
            return;
          }
          create(clone.shift());
        };
        create(clone.shift());
        return agg;
      }, {});

      Hoek.assert(schema.path, '"path" must exist');
      Hoek.assert(schema.method, '"method" must exist');

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
            cleanSchema.path = cleanSchema.path.replace(`{${key}}`, encodeURIComponent(options.params[key]));
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
        return httpRequest(method, url, { headers, payload });
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
