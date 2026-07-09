const { EModelEndpoint } = require('librechat-data-provider');
const DoubaoImageClient = require('~/app/clients/DoubaoImageClient');
const { resolveProviderApiKeyForUser } = require('~/server/services/UserService');

const initializeClient = async ({
  req,
  res,
  endpointOption = {},
  overrideModel,
  providerEnvPrefix,
  useUserProviderApiKey = false,
}) => {
  const selectedProviderEnvPrefix = providerEnvPrefix ?? 'DOUBAO_IMAGE_KEY';
  let apiKey = process.env[selectedProviderEnvPrefix] ?? process.env.DOUBAO_IMAGE_KEY;

  if (req.user) {
    const routing = await resolveProviderApiKeyForUser({
      user: req.user,
      providerEnvPrefix: selectedProviderEnvPrefix,
      defaultApiKey: apiKey,
      useUserProviderApiKey,
    });

    apiKey = routing.apiKey;
  }

  if (!apiKey) {
    throw new Error(`${EModelEndpoint.doubao} API Key not provided.`);
  }

  const clientOptions = {
    req,
    res,
    reverseProxyUrl:
      endpointOption.reverseProxyUrl ||
      process.env.DOUBAO_IMAGE_REVERSE_PROXY ||
      process.env.DOUBAO_IMAGE_BASEURL ||
      null,
    proxy: process.env.PROXY ?? null,
    ...endpointOption,
    modelOptions: {
      ...(endpointOption?.modelOptions ?? {}),
      ...(endpointOption?.model_parameters ?? {}),
    },
  };

  if (overrideModel) {
    clientOptions.modelOptions.model = overrideModel;
  }

  const client = new DoubaoImageClient(apiKey, clientOptions);
  return {
    client,
    doubaoApiKey: apiKey,
  };
};

module.exports = initializeClient;
