const app = require("./app.js");

const PORT = parseInt(process.env.PORT) || 3414;
app.listen(PORT, () => console.info("Server is listening on port: " + PORT));


