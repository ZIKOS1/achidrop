require("dotenv").config();
const { connect } = require("../backend/database/db");
const app = require("../backend/server");

module.exports = async (req, res) => {
    await connect({ lazy: ["instantSellRequests"] });
    return app(req, res);
};
