require("dotenv").config();
const { connect } = require("../database/db");
const app = require("../server");

module.exports = async (req, res) => {
    await connect();
    return app(req, res);
};
