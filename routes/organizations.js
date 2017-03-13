const _ = require("lodash");
const router = require("express").Router();
const withRedis = require("../withRedis.js");
const Promise = require("../promise.js");
const orgProviders = require("./organizations/providers.js");
const restClient = require("node-rest-client-promise");
const rest = require("../rest.js");
const URI = require("urijs");
const dns = require("dns");
const ursa = require("ursa");
Promise.promisifyAll(dns);

const wired = router; // Attach middleware here

const plural = wired.route("/")
  .post((req,res,next) => {

    const verify = (it, desc) => {
      if(_.isNil(it)) {
        res.sendClientError("No " + desc + " found on request");
        return false;
      }

      if(_.isEmpty(it)) {
        res.sendClientError("Empty " + desc + " found on request");
        return false;
      }

      return it;
    }

    const body = verify(req.body, "content");
    if(!body) return;

    const urlPrefix = verify(req.body.urlPrefix, "urlPrefix");
    if(!urlPrefix) return;
    const hostname = new URI(urlPrefix).hostname();
    const verifyHostname = Promise.try( () => {
      if(_.isNil(hostname) || _.isEmpty(hostname)) return false;
      if(process.env.NODE_ENV == "development" && hostname == "localhost") {
        console.info("Accepting localhost because this is development; this will not work in other environments");
        return true;
      }
      return dns.lookupAsync(hostname).then(
        addr => !(_.isNil(addr) || _.isEmpty(addr))
      ).catch(e => {
        console.warn("Error looking up hostname", hostname, e);
        return false;
      });
    }).tap(result => {
      if(!result) {
        res.sendClientError("Hostname could not be found on a DNS lookup");
      }
    });

    let publicKey = verify(req.body.publicKey, "public key");
    if(!publicKey) return;
    try {
      publicKey = ursa.createPublicKey(publicKey, "utf8");
    } catch(e) {
      console.warn("Error coercing the public key", publicKey, e);
      res.sendClientError("Public key could not be parsed as a UTF-8 PEM");
      return;
    }

    const urlName = verify(req.body.urlName, "short name");
    if(!urlName) return;
    if(!urlName.match(/^[\w-]+$/)) {
      res.sendClientError("Short name must only contain alphanumerics, dashes (-), or underscores (_)");
      return;
    }
    const claimUrlName = withRedis(redis => {
      redis.setnx("org:" + urlName, urlName);
    });

    const clientPaths = verify(req.body.clientPaths, "redirect paths");
    if(!clientPaths) return;
    const successPath = verify(clientPaths.success, "success redirect path");
    if(!successPath) return;
    const failurePath = verify(clientPaths.failure, "failure redirect path");
    if(!failurePath) return;

    const serverPaths = verify(req.body.serverPaths, "data post paths");
    if(!serverPaths) return;
    const verificationPath = verify(serverPaths.verify, "verification data post path");
    if(!verificationPath) return;
    const resultPath = verify(serverPaths.result, "authentication result data post path");
    if(!resultPath) return;

  });

const single = plural.route("/:org")
  .get()
  .post()
  .delete()
  .patch();

const subsingle = single
  .route("/providers", orgProviders);

module.export = router;
