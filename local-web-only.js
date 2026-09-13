require("dotenv").config();
const { connect } = require("./database/db");

(async () => {
    await connect();
    require("./server");
})();
