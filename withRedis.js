import _ from 'lodash';
import debugFunction from 'debug';
const debug = debugFunction('./redis.js');
import Redis from 'redis';
import Promise from "bluebird";
Promise.promisifyAll(Redis.RedisClient.prototype);
Promise.promisifyAll(Redis.Multi.prototype);

const noopAsync = _.constant(Promise.resolve(true));

const connectOpts = {};
const redisURL = process.env.REDIS_URL;
if(!_.isNil(redisURL) && "" != redisURL.trim()) {
  connectOpts[url] = redisURL.trim();
}
debug("Using connection options:\n%O", connectOpts);

export default ((withRedis) => {
  const redisResource = Promise.try(
    () => debug("Connecting to Redis")
  ).then(
    () => Redis.createClientAsync(connectOpts);
  ).tap(
    () => debug("Successfully connected to Redis")
  ).catch(
    e => console.error("Error connecting to Redis: ", e)
  ).disposer(
    client => (client || { "quitAsync": noopAsync }).quitAsync().tap(
      () => debug("Successfully disconnected from Redis")
    ).catch(
      e => console.error("Error disconnecting from Redis: ", e)
    )
  );
  return Promise.using(redisResource, withRedis);
});
