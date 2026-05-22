const { isEnabled } = require('@librechat/api');
const { EModelEndpoint, CacheKeys, Constants, googleSettings } = require('librechat-data-provider');
const getLogStores = require('~/cache/getLogStores');
const initializeClient = require('./initialize');
const { saveConvo } = require('~/models');

const DEFAULT_TITLE_PROMPT =
	'Generate a concise conversation title in 3 to 8 words. Reply with the title only.';

function getPresetModel(preset) {
	if (!preset || typeof preset !== 'object') {
		return null;
	}

	return preset.model ?? preset.model_parameters?.model ?? preset.modelOptions?.model ?? null;
}

function resolveFirstChatModelBySpec({ req, endpoint, currentSpecName }) {
	const specs = req?.config?.modelSpecs?.list;
	if (!Array.isArray(specs) || specs.length === 0) {
		return null;
	}

	if (!currentSpecName || typeof currentSpecName !== 'string') {
		return null;
	}

	const currentSpec = specs.find((spec) => spec?.name === currentSpecName);
	if (!currentSpec) {
		return null;
	}

	const currentGroup = currentSpec.group;
	const currentEndpoint = currentSpec?.preset?.endpoint ?? endpoint;
	const chatSpecs = specs.filter((spec) => {
		const preset = spec?.preset;
		if (!preset || preset.endpoint !== currentEndpoint) {
			return false;
		}

		const mode = preset.mode ?? 'chat';
		return mode === 'chat';
	});

	if (chatSpecs.length === 0) {
		return null;
	}

	const orderedSpecs = currentGroup
		? [
				...chatSpecs.filter((spec) => spec?.group === currentGroup),
				...chatSpecs.filter((spec) => spec?.group !== currentGroup),
		  ]
		: chatSpecs;

	for (const spec of orderedSpecs) {
		const model = getPresetModel(spec?.preset);
		if (typeof model === 'string' && model.length > 0) {
			return model;
		}
	}

	return null;
}

function getCurrentSpec(req, currentSpecName) {
	const specs = req?.config?.modelSpecs?.list;
	if (!Array.isArray(specs) || !currentSpecName || typeof currentSpecName !== 'string') {
		return null;
	}

	return specs.find((spec) => spec?.name === currentSpecName) ?? null;
}

function normalizeImageModelType(model) {
	if (!model || typeof model !== 'string') {
		return null;
	}

	return model.replace(/-image(?:-[a-z0-9.-]+)?$/i, '').trim() || model;
}

function parseImageTitleModelMap(raw) {
	if (!raw || typeof raw !== 'string') {
		return {};
	}

	const text = raw.trim();
	if (!text) {
		return {};
	}

	if (text.startsWith('{')) {
		try {
			const parsed = JSON.parse(text);
			return parsed && typeof parsed === 'object' ? parsed : {};
		} catch (_error) {
			return {};
		}
	}

	const entries = text
		.split(',')
		.map((item) => item.trim())
		.filter(Boolean)
		.map((pair) => {
			const separator = pair.indexOf('=');
			if (separator === -1) {
				return null;
			}

			const key = pair.slice(0, separator).trim();
			const value = pair.slice(separator + 1).trim();
			if (!key || !value) {
				return null;
			}

			return [key, value];
		})
		.filter(Boolean);

	return Object.fromEntries(entries);
}

function resolveImageFixedTitleModel({ map, specName, specGroup, model }) {
	if (!map || typeof map !== 'object') {
		return null;
	}

	const normalizedType = normalizeImageModelType(model);
	const candidates = [specName, specGroup, model, normalizedType, 'default'];

	for (const key of candidates) {
		if (!key || typeof key !== 'string') {
			continue;
		}

		const value = map[key];
		if (typeof value === 'string' && value.trim().length > 0) {
			return value.trim();
		}
	}

	return null;
}

function buildTitleRequest({ text, responseText, titlePrompt, titlePromptTemplate }) {
	const conversation = `||>User:\n"${text}"\n||>Response:\n"${JSON.stringify(responseText ?? '')}"`;

	const prompt = titlePrompt ?? DEFAULT_TITLE_PROMPT;
	const template = titlePromptTemplate ?? '{{conversation}}';
	return `${prompt}\n\n${template.replace('{{conversation}}', conversation)}`;
}

function normalizeTitle(title) {
	if (!title || typeof title !== 'string') {
		return null;
	}

	const lines = title
		.split('\n')
		.map((line) => line.replace(/[*_`#>]+/g, '').trim())
		.filter(Boolean);

	const preferredLine =
		lines.find((line) => !/[.:!?]$/.test(line) && line.split(/\s+/).length <= 12) ?? lines[0];
	const normalized = preferredLine?.replace(/^['"\s]+|['"\s]+$/g, '') ?? '';
	return normalized || null;
}

function buildFallbackTitle(text) {
	if (!text || typeof text !== 'string') {
		return null;
	}

	const normalized = text
		.replace(/\s+/g, ' ')
		.replace(/^['"\s]+|['"\s]+$/g, '')
		.trim();

	if (!normalized) {
		return null;
	}

	if (/\s/.test(normalized)) {
		return normalized.split(' ').filter(Boolean).slice(0, 8).join(' ');
	}

	return normalized.slice(0, 24).trim();
}

const addTitle = async (req, { text, response, client }) => {
	const { TITLE_CONVO = 'true' } = process.env ?? {};
	if (!isEnabled(TITLE_CONVO)) {
		return;
	}

	if (client.options.titleConvo === false) {
		return;
	}
	const { GOOGLE_TITLE_MODEL } = process.env ?? {};
	const appConfig = req.config;
	const providerConfig = appConfig.endpoints?.[EModelEndpoint.google];
	const isImageMode = (client.options?.modelOptions?.mode ?? req.body?.mode) === 'image';
	const useImageModeTitleSelection =
		isImageMode && isEnabled(process.env.IMAGE_TITLE_USE_IMAGE_MODEL ?? 'false');
	const currentSpecName = client.options?.spec ?? req.body?.spec;
	const currentSpec = getCurrentSpec(req, currentSpecName);
	const imageTitleModelMap = parseImageTitleModelMap(process.env.GOOGLE_IMAGE_TITLE_MODEL_MAP);
	const imageFixedTitleModel = useImageModeTitleSelection
		? resolveImageFixedTitleModel({
				map: imageTitleModelMap,
				specName: currentSpecName,
				specGroup: currentSpec?.group,
				model: client.options?.modelOptions?.model,
		  })
		: null;
	const chatModelFromSpecs = useImageModeTitleSelection
		? resolveFirstChatModelBySpec({
				req,
				endpoint: EModelEndpoint.google,
				currentSpecName,
		  })
		: null;
	let model =
		useImageModeTitleSelection
			? imageFixedTitleModel ??
				providerConfig?.titleModel ??
				GOOGLE_TITLE_MODEL ??
				chatModelFromSpecs ??
				client.options?.titleModel ??
				googleSettings.model.default ??
				client.options?.modelOptions.model
			: providerConfig?.titleModel ??
				GOOGLE_TITLE_MODEL ??
				client.options?.titleModel ??
				googleSettings.model.default ??
				client.options?.modelOptions.model;

	if (GOOGLE_TITLE_MODEL === Constants.CURRENT_MODEL) {
		model = client.options?.modelOptions.model;
	}

	const {
		reverseProxyUrl: _ignoredImageReverseProxyUrl,
		...titleBaseOptions
	} = client.options ?? {};

	const { mode: _ignoredMode, ...baseModelOptions } = client.options?.modelOptions ?? {};

	const titleEndpointOptions = {
		...titleBaseOptions,
		model_parameters: { ...baseModelOptions, model: model },
		modelOptions: { ...baseModelOptions, model: model },
		attachments: undefined,
	};

	const { client: titleClient } = await initializeClient({
		req,
		res: response,
		endpointOption: titleEndpointOptions,
	});

	// Title generation runs outside the normal message pipeline, so we must
	// hydrate identifiers explicitly for accurate token transaction linkage.
	titleClient.user = req.user?.id;
	titleClient.conversationId = response?.conversationId ?? req.body?.conversationId;
	titleClient.responseMessageId = response?.messageId ?? req.body?.responseMessageId;

	const titleCache = getLogStores(CacheKeys.GEN_TITLE);
	const key = `${req.user.id}-${response.conversationId}`;

	const titleRequest = buildTitleRequest({
		text,
		responseText: response?.text ?? '',
		titlePrompt: providerConfig?.titlePrompt,
		titlePromptTemplate: providerConfig?.titlePromptTemplate,
	});

	const generatedTitle = normalizeTitle(
		await titleClient.chatCompletion({
			payload: [{ role: 'user', content: titleRequest }],
			onProgress: () => {},
			abortController: new AbortController(),
		}),
	);

	const usage = typeof titleClient.getStreamUsage === 'function' ? titleClient.getStreamUsage() : null;
	const promptTokens = Number(
		usage?.prompt_tokens ?? usage?.input_tokens ?? usage?.promptTokenCount ?? usage?.prompt_token_count,
	);
	const completionTokens = Number(
		usage?.completion_tokens ??
			usage?.output_tokens ??
			usage?.candidatesTokenCount ??
			usage?.candidates_token_count,
	);

	if (
		typeof titleClient.recordTokenUsage === 'function' &&
		Number.isFinite(promptTokens) &&
		Number.isFinite(completionTokens)
	) {
		await titleClient.recordTokenUsage({
			model,
			usage,
			promptTokens,
			completionTokens,
			context: 'title',
		});
	}

	const title = generatedTitle ?? buildFallbackTitle(text);

	if (!title) {
		return;
	}

	await titleCache.set(key, title, 120000);
	await saveConvo(
		req,
		{
			conversationId: response.conversationId,
			title,
		},
		{ context: 'api/server/services/Endpoints/google/addTitle.js' },
	);
};

module.exports = addTitle;
