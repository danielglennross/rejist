'use strict';

const Hoek = require('hoek');
const Joi = require('joi');
const Wreck = require('wreck');

const schemaTypes = ['headers', 'params', 'query', 'payload'];

module.exports = (apiSchema, baseUri, settings = {}) => {

  Hoek.assert(['string', 'function'].some(type => typeof baseUri === type), '"basUri" must be a string or function');

  if (typeof baseUri === 'function') {
    baseUri = baseUri();
  }

  const httpRequest = (method, url, options) => {
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
        res.payload = payload instanceof Buffer 
          ? JSON.parse(payload.toString() || "{}") 
          : payload;
        return resolve(res);
      })
    );
  };

  const createApiCall = (schema) => {
    
    // ensure correct joi format
    cleanSchema = Hoek.clone(schema).forEach(type => {
      if (schemaTypes.includes(type) && 
          schema[type] && 
          !schema[type].isJoi) {
        schema[type] = Joi.compile(schema[type]);
      }
    });
    
    return (args) => {

      // map args with schema
      const options = Object.keys(args).reduce((agg, k) => {
        const clone = [...schemaTypes];
        const create = (type) => {
          if (!newType) {
            return;
          }

          const item = schema[type] && schema[type]._inner.children.find(x => x.key.toLowerCase() === k.toLowerCase());
          if (item) {
            agg[type] = Object.assign({}, agg[type] || {}, { [k]: args[k] });
            return;
          }

          return create(clone.shift());
        };
        create(clone.shift());
        return agg;
      }, {});

      Hoek.assert(schema.path, '"path" must exist');
      Hoek.assert(schema.method, '"method" must exist');

      const validateFactory = (type) => {
        if (options && options[type]) {
          return new Promise((resolve, reject) => {
            return Joi.validate(options[type], schema[type], (err, val) => {
              if (err) return reject(err);
              resolve(val);
            });
          });
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
            schema.path = schema.path.replace(`{${key}}`, encodeURIComponent(options.params[key]));
          });
        }
        if (query) {
          const keyVals = Object.keys(options.query).map(key => 
            `${key}=${encodeURIComponent(options.query[key])}`
          );
          schema.path += `?${keyVals.join('&')}`;
        }

        const method = schema.method.toLowerCase();
        const url = `${baseUri.trim('/')}${schema.path}`;
        return httpRequest(method, url, { headers, payload })
      });
    }
  };

  const endpoints = Object.keys(apiSchema).reduce((api, key) => {
    api[key] = createApiCall(apiSchema[key]);
    return api;
  }, {});

  return endpoints;
};