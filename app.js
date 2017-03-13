const express = require("express");
const organizations = require("./routes/organizations.js");
const providers = require("./routes/providers.js");
const auth = require("./routes/auth.js");
const bodyParser = require("body-parser");
const compress = require("compression");
const cookieSession = require("cookie-session");
const appReqId = require("express-request-id")();

const app = express();

// Be serious about compressing our responses
app.use(compression({
  "level": 9,
  "memLevel": 9
}));

// Attach unique request ids for logging purposes
app.use(appReqId,
  (req,res,next) => {
    try {
      console.info("Request start %s", req.id);
      next();
    } finally {
      console.info("Request end %s", req.id);
    }
  };
);

// Use session-based cookies
app.use(cookieSession({
  'name': 'microauth-session',
  'secret': process.env.COOKIE_SECRET || "microauth",
  'maxAge': 52 * 7 * 24 * 60 * 60 * 1000
}, (req,res,next) => {
  // Push out the expiration of the token
  req.session.maxAge = 52 * 7 * 24 * 60 * 60 * 1000;
  next();
}));

// Decode JSON and text bodies
app.use(bodyParser.json({
  "strict": false
}));
app.use(bodyParser.text({
}));

// Log errors
app.use((err, req, res, next) => {
  console.error("Error calling " + req.originalUrl + " being handled as " + req.url, req, res, err);
  console.error(err.stack);
  next();
});

// Attach utility methods
app.use((req,res,next) => {
  res.sendClientError = function sendClientError(msg) {
    console.warn("Client content error: " + msg, req.id, req.originalUrl, req.body);
    this.status(422).jsonp({"error": msg, "success": false});
    return;
  };

  next();
});

// Attach the routes
app.use("/organizations", organizations);
app.use("/providers", providers);
app.use("/auth", auth);

module.exports = app;
