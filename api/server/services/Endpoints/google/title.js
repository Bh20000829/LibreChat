const { EModelEndpoint } = require('librechat-data-provider');
const addImageTitle = require('~/server/services/Endpoints/image/title');

const addTitle = async (req, params) =>
  addImageTitle(req, {
    ...params,
    endpoint: params?.endpoint ?? EModelEndpoint.google,
    titleEndpoint: EModelEndpoint.google,
  });

module.exports = addTitle;
