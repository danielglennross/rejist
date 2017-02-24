'use strict';

const Hoek = require('hoek');
const Joi = require('joi');
const httpClient = require('./httpClient');

const schemaTypes = ['headers', 'params', 'query', 'payload'];

const createOptions = (args, cleanSchema, templateParams, templateQuery) => {
  const updateSchema = (o) => {
    if (!o.type.length) {
      return;
    }

    // eslint-disable-next-line no-param-reassign
    cleanSchema[o.typeStr] = (cleanSchema[o.typeStr] || Joi.object()).concat(
      Joi.object(
        o.type.reduce((obj, k) => {
          const userSchema = cleanSchema[o.typeStr] && cleanSchema[o.typeStr]._inner.children.find(
            x => x.key.toLowerCase() === k.toLowerCase()
          );
          if (!userSchema) { // if schema dne
            Object.assign(obj, { [k]: o.schema });
          }
          return obj;
        }, {})
      )
    );
  };
  [
    { type: templateParams, typeStr: 'params', schema: Joi.required() },
    { type: templateQuery, typeStr: 'query', schema: Joi.optional() }
  ].map(updateSchema);

  // map args with schema
  const options = Object.keys(args || {}).reduce((argObj, k) => {
    const alias = Object.keys(cleanSchema.alias || {}).find(i =>
      cleanSchema.alias[i].toLowerCase() === k.toLowerCase()
    ) || k;

    const clone = [...schemaTypes];
    const create = (type) => {
      if (!type) {
        return;
      }
      const item = cleanSchema[type] && cleanSchema[type]._inner.children.find(
        x => x.key.toLowerCase() === alias.toLowerCase()
      );
      if (item) {
        // eslint-disable-next-line no-param-reassign
        argObj[type] = Object.assign({}, argObj[type] || {}, { [alias]: args[k] });
        return;
      }
      create(clone.shift());
    };
    create(clone.shift());
    return argObj;
  }, {});

  return options;
};

const createApiCall = (baseUri, schema) => {
  const cleanSchema = Hoek.clone(schema);

  Hoek.assert(cleanSchema.template, '"template" must exist');

  // ensure correct joi format
  Object.keys(cleanSchema).forEach(type => {
    if (schemaTypes.includes(type) && schema[type] && !schema[type].isJoi) {
      cleanSchema[type] = Joi.compile(schema[type]);
    }
  });

  return (args) => {

    const routeArr = cleanSchema.template.trim().split(/\s+/);
    const method = routeArr[0];
    let route = routeArr[1];

    const templateParams = (route.match(/{([^\?].+?)}/g) || []).map(s => s.match(/[^{].*[^}]/g)[0]);
    const queryStr = (route.match(/{\?(.+?)}/g) || [])[0] || [];
    const templateQuery = queryStr.length ? queryStr.split(',').map(s => s.match(/[^{|^?].*[^}]/g)[0]) : [];

    const options = createOptions(args, cleanSchema, templateParams, templateQuery);

    const validateFactory = (type) => {
      options[type] = options[type] || {};
      if (cleanSchema[type]) {
        return new Promise((resolve, reject) =>
          Joi.validate(options[type], cleanSchema[type], (err, val) => {
            return (err ? reject(err) : resolve(val));
          })
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
        Object.keys(params).forEach(key => {
          route = route.replace(
            `{${key}}`, encodeURIComponent(params[key])
          );
        });
      }
      if (query) {
        const keyVals = Object.keys(query).map(key =>
          `${key}=${encodeURIComponent(query[key])}`
        );
        route = route.replace(
          /{\?(.+?)}/g, keyVals.length ? `?${keyVals.join('&')}` : ''
        );
      }

      const url = `${baseUri}${route}`;

      const handleRequest = cleanSchema.handleRequest || (
        (req) => Promise.resolve(req)
      );
      const handleResponse = cleanSchema.handleResponse || (
        (err, res) => (err ? Promise.reject(err) : Promise.resolve(res))
      );

      return httpClient.send({
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

module.exports = (apiSchema, baseUriFac /* , settings = {}*/) => {

  Hoek.assert(
    ['string', 'function'].some(type => typeof baseUriFac === type),
    '"basUriFac" must be a string or function'
  );

  const baseUri = typeof baseUriFac === 'function' ? baseUriFac() : baseUriFac;

  const endpoints = Object.keys(apiSchema).reduce((api, key) => {
    // eslint-disable-next-line no-param-reassign
    api[key] = createApiCall(baseUri, apiSchema[key]);
    return api;
  }, {});

  return endpoints;
};
