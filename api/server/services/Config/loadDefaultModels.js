const { logger } = require('@librechat/data-schemas');
const { EModelEndpoint } = require('librechat-data-provider');
const {
  getAnthropicModels,
  getBedrockModels,
  getOpenAIModels,
  getGoogleModels,
  getDoubaoModels,
} = require('~/server/services/ModelService');

/**
 * Loads the default models for the application.
 * @async
 * @function
 * @param {ServerRequest} req - The Express request object.
 */
async function loadDefaultModels(req) {
  try {
    const mode = req.query?.mode === 'image' ? 'image' : 'chat';
    const [openAI, anthropic, azureOpenAI, assistants, azureAssistants, google, doubao, bedrock] =
      await Promise.all([
        getOpenAIModels({ user: req.user.id, mode }).catch((error) => {
          logger.error('Error fetching OpenAI models:', error);
          return [];
        }),
        getAnthropicModels({ user: req.user.id, mode }).catch((error) => {
          logger.error('Error fetching Anthropic models:', error);
          return [];
        }),
        getOpenAIModels({ user: req.user.id, azure: true, mode }).catch((error) => {
          logger.error('Error fetching Azure OpenAI models:', error);
          return [];
        }),
        getOpenAIModels({ assistants: true, mode }).catch((error) => {
          logger.error('Error fetching OpenAI Assistants API models:', error);
          return [];
        }),
        getOpenAIModels({ azureAssistants: true, mode }).catch((error) => {
          logger.error('Error fetching Azure OpenAI Assistants API models:', error);
          return [];
        }),
        Promise.resolve(getGoogleModels({ mode })).catch((error) => {
          logger.error('Error getting Google models:', error);
          return [];
        }),
        Promise.resolve(getDoubaoModels({ mode })).catch((error) => {
          logger.error('Error getting Doubao models:', error);
          return [];
        }),
        Promise.resolve(getBedrockModels({ mode })).catch((error) => {
          logger.error('Error getting Bedrock models:', error);
          return [];
        }),
      ]);

    return {
      [EModelEndpoint.openAI]: openAI,
      [EModelEndpoint.google]: google,
      [EModelEndpoint.anthropic]: anthropic,
      [EModelEndpoint.azureOpenAI]: azureOpenAI,
      [EModelEndpoint.assistants]: assistants,
      [EModelEndpoint.azureAssistants]: azureAssistants,
      [EModelEndpoint.bedrock]: bedrock,
      [EModelEndpoint.doubao]: doubao,
    };
  } catch (error) {
    logger.error('Error fetching default models:', error);
    throw new Error(`Failed to load default models: ${error.message}`);
  }
}

module.exports = loadDefaultModels;
