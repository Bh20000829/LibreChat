const express = require('express');
const { generateCheckAccess, skipAgentCheck, handleError } = require('@librechat/api');
const {
  EModelEndpoint,
  PermissionTypes,
  Permissions,
  PermissionBits,
} = require('librechat-data-provider');
const {
  setHeaders,
  moderateText,
  validateModel,
  validateConvoAccess,
  buildEndpointOption,
  canAccessAgentFromBody,
} = require('~/server/middleware');
const { initializeClient } = require('~/server/services/Endpoints/agents');
const AgentController = require('~/server/controllers/agents/request');
const OpenAIImageController = require('~/server/controllers/images/openAI');
const addTitle = require('~/server/services/Endpoints/agents/title');
const { getRoleByName } = require('~/models/Role');

const router = express.Router();

router.use(moderateText);

const checkAgentAccess = generateCheckAccess({
  permissionType: PermissionTypes.AGENTS,
  permissions: [Permissions.USE],
  skipCheck: skipAgentCheck,
  getRoleByName,
});
const checkAgentResourceAccess = canAccessAgentFromBody({
  requiredPermission: PermissionBits.VIEW,
});

router.use(checkAgentAccess);
router.use(checkAgentResourceAccess);
router.use(validateConvoAccess);
router.use(buildEndpointOption);
router.use(setHeaders);

const controller = async (req, res, next) => {
  if (req.body?.mode === 'image') {
    if (![EModelEndpoint.openAI, EModelEndpoint.google].includes(req.body?.endpoint)) {
      return handleError(res, {
        text: 'Image generation is only supported for OpenAI and Google right now',
      });
    }

    req.body.model = req.body.model ?? req.body.endpointOption?.model_parameters?.model;

    return validateModel(req, res, async () => {
      await OpenAIImageController(req, res, next);
    });
  }

  await AgentController(req, res, next, initializeClient, addTitle);
};

/**
 * @route POST / (regular endpoint)
 * @desc Chat with an assistant
 * @access Public
 * @param {express.Request} req - The request object, containing the request data.
 * @param {express.Response} res - The response object, used to send back a response.
 * @returns {void}
 */
router.post('/', controller);

/**
 * @route POST /:endpoint (ephemeral agents)
 * @desc Chat with an assistant
 * @access Public
 * @param {express.Request} req - The request object, containing the request data.
 * @param {express.Response} res - The response object, used to send back a response.
 * @returns {void}
 */
router.post('/:endpoint', controller);

module.exports = router;
