const { handleAdmin } = require('../../kiosk-server.js');

module.exports = async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  return handleAdmin(req, res, url);
};
