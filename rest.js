const rest = require("rest");

const client = rest
  .wrap(require('rest/interceptor/mime'))
  .wrap(require('rest/interceptor/errorCode'))
  .wrap(require('rest/interceptor/location'))
  .wrap(require('rest/interceptor/retry'), {
    'initial': 10,
    'multiplier': 1.5
  })
  .wrap(require('rest/interceptor/timeout'), {
    'timeout': 1000 * 60
  });

module.export = client;
