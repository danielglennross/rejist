'use strict';

const Joi = require('joi');
const restService = require('./restService');

const api = {
  getHealth: {
    method: 'GET',
    path: '/diagnostics/health'
  },
  getGames: {
    method: 'GET',
    path: '/games',
    headers: Joi.object({
      'x-site-code': Joi.string().default('test'),
      'x-correlation-token': Joi.string().required()
    }),
    query: Joi.object({
      take: Joi.number().required(),
      skip: Joi.number().required()
    }),
    handleRequest: (request) => {
      console.log(request);
      return Promise.resolve(request);
    },
    handleResponse: (err, response) => {
      if (err) {
        console.log(err);
        return Promise.reject(err);
      }
      console.log(response);
      return Promise.resolve(response);
    }
  }
};

const service = restService(api, 'http://baseuri.com');

service.getHealth().then(res => {
  console.log(res); 
});

service.getGames({
  'x-correlation-token': '53b0eaed-2c1f-412a-b05d-f695e7c17a4c',
  take: 10,
  skip: 10
}).then(res => {
  console.log(res);
});
