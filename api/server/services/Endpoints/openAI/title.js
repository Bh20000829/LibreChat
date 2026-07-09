const { EModelEndpoint } = require('librechat-data-provider');
const addImageTitle = require('~/server/services/Endpoints/image/title');

const addTitle = async (req, params) =>
  addImageTitle(req, {
    ...params,
    endpoint: params?.endpoint ?? EModelEndpoint.openAI,
    titleEndpoint: EModelEndpoint.openAI,
  });

module.exports = addTitle;
