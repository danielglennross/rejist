'use strict';

const Joi = require('joi');
const restService = require('./restService');

const api = {
  getGamesRegex: {
    template: 'GET /players/{playerId}/games/{gameId}{?take,skip,limit}',
    headers: Joi.object({
      'x-site-code': Joi.string().default('test'),
      'x-correlation-token': Joi.string().required()
    }),
    alias: {
      playerId: 'id'
    }
  },
  getHealth: {
    template: 'GET /diagnostics/health'
  },
  getGames: {
    template: 'GET /games{?take,skip}',
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

// TODO bug, if no header provided, default not found
service.getGamesRegex({
  'x-correlation-token': '53b0eaed-2c1f-412a-b05d-f695e7c17a4c',
  id: '12345',
  gameId: '87678'
}).then(res => {
   console.log(res);
});

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
