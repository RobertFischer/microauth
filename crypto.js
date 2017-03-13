const _ = require("lodash");
const ursa = require("ursa");
const withRedis = require("./withRedis.js");
const Promise = require("bluebird");
const debug = require("debug")(__filename);

const META_RSA = "meta:rsa";
const attachRsa = (toReturn) => withRedis(redis =>
  redis.hgetallAsync(META_RSA).catch(e => {
    console.warn("Error retrieving RSA keys from Redis", e);
    console.warn("Going ahead with the assumption that we need new keys");
    return null;
  }).then(keysObj => {
    if(_.isNil(keysObj) || _.isEmpty(keysObj) || !keysObj.publicPem || !keysObj.privatePem) {
      console.warn("No RSA keys found in Redis; generating new ones for " + META_RSA, keysObj);
      debug("Generating new RSA keys");
      const privKey = ursa.generatePrivateKey(2048);
      const privPem = privKey.toPrivatePem("utf8");
      const pubKey = ursa.createPublicKeyFromComponents(privKey.getModulus(), privKey.getExponent());
      const pubPem = pubKey.toPublicPem("utf8");
      debug("New RSA keys have been generated", pubPem);

      // set the public pem -- this claims the spot
      return redis.hsetnxAsync(META_RSA, "publicPem", pubPem).then(publicSet => {
        if(publicSet == 1) {
          // Now verify that we set the private PEM, so we know we set both of them
          //TODO Encrypt the private PEM with some kind of password-based encryption
          return redis.hsetnxAsync(META_RSA, "privatePem", privPem).then(privateSet => {
            if(privateSet != 1) {
              throw new Error("Set the public PEM but not the private PEM; we just messed up the keypair");
            } else {
              console.info("Stored new public/private RSA keypair at " + META_RSA, pubPem);
            }
          });
        } else {
          console.warn("Another server already set the public key; not assigning the private key", publicSet);
        }
      }).then(() => redis.hgetallAsync(META_RSA)); // We are assuming this returns meaningful values now
    }
    return keysObj;
  })
).then(({publicPem, privatePem} => {
  if(_.isNil(publicPem) || _.isEmpty(publicPem)) {
    throw new Error("Empty publicPem on " + META_RSA);
  }
  if(_.isNil(privatePem) || _.isEmpty(privatePem)) {
    throw new Error("Empty privatePem on " + META_RSA);
  }

  const privKey = ursa.createPrivateKey(privatePem, "utf8");
  const pubKey = ursa.createPublicKey(publicPem, "utf8");
  toReturn.encryptPublic = (content, publicKey=pubKey) =>
    ursa.coercePublicKey(publicKey).encrypt(content, "base64", "base64");
  toReturn.decryptPublic = (content, publicKey=pubKey) =>
    ursa.coercePublicKey(publicKey).publicDecrypt(content, "base64", "base64");
  toReturn.encryptPrivate = (content, privateKey=privKey) =>
    ursa.coercePrivateKey(privateKey).privateEncrypt(content, "base64", "base64");
  toReturn.decryptPrivate = (content, privateKey=privKey) =>
    ursa.coercePrivateKey(privateKey).decrypt(content, "base64", "base64");
  toReturn.publicPem = (publicKey=pubKey) =>
    ursa.coercePublicKey(publicKey).toPublicPem("utf8")
  return toReturn;
});

// Get the DH values
const cryptoPromise = Promise.try(() => {
  const toReturn = {};
  return Promise.join(
    attachRsa(toReturn)
  ).return(toReturn);
});

module.export = cryptoPromise;
