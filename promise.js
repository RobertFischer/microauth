const Promise = require("bluebird");
const _ = require("lodash");

Promise.prototype.andThen = function promiseAndThen(next, default=null) {
  return this.then((result) => {
    if(result) {
      return this.then(_.partial(next, result));
    } else {
      return default;
    }
  });
};
