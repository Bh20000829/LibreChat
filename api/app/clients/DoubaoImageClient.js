const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');

const DEFAULT_DOUBAO_IMAGE_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';

function normalizeBaseURL(baseURL) {
  return (baseURL || DEFAULT_DOUBAO_IMAGE_BASE_URL).replace(/\/$/, '');
}

function getImageGenerationUrl(baseURL) {
  const normalized = normalizeBaseURL(baseURL);
  if (/\/images\/generations$/i.test(normalized)) {
    return normalized;
  }

  return `${normalized}/images/generations`;
}

function toDataUrl(imageFile) {
  if (!imageFile?.buffer || !imageFile?.type?.startsWith('image/')) {
    return null;
  }

  const mimeType = imageFile.type.toLowerCase().replace('image/jpg', 'image/jpeg');
  return `data:${mimeType};base64,${imageFile.buffer.toString('base64')}`;
}

function getImagePayload(sourceImages) {
  if (sourceImages.length === 0) {
    return {};
  }

  return {
    image: sourceImages.length === 1 ? sourceImages[0] : sourceImages,
  };
}

function getProviderErrorMessage(error) {
  const data = error?.response?.data;
  return (
    data?.message ||
    data?.error?.message ||
    data?.error?.code ||
    error?.message ||
    'Doubao image generation failed'
  );
}

function normalizeImageItem(item) {
  if (!item || typeof item !== 'object') {
    return null;
  }

  if (typeof item.url === 'string' || typeof item.b64_json === 'string') {
    return item;
  }

  if (typeof item.image_url === 'string') {
    return { ...item, url: item.image_url };
  }

  if (typeof item.image === 'string') {
    if (item.image.startsWith('http')) {
      return { ...item, url: item.image };
    }

    return { ...item, b64_json: item.image.replace(/^data:image\/[^;]+;base64,/, '') };
  }

  if (typeof item.binary_data_base64 === 'string') {
    return { ...item, b64_json: item.binary_data_base64 };
  }

  return item;
}

function normalizeImageData(responseData) {
  if (Array.isArray(responseData?.data)) {
    return responseData.data.map(normalizeImageItem).filter(Boolean);
  }

  if (Array.isArray(responseData?.images)) {
    return responseData.images.map(normalizeImageItem).filter(Boolean);
  }

  if (typeof responseData?.url === 'string' || typeof responseData?.b64_json === 'string') {
    return [normalizeImageItem(responseData)].filter(Boolean);
  }

  if (typeof responseData?.image_url === 'string' || typeof responseData?.image === 'string') {
    return [normalizeImageItem(responseData)].filter(Boolean);
  }

  return [];
}

class DoubaoImageClient {
  constructor(apiKey, options = {}) {
    this.apiKey = apiKey;
    this.options = options;
    this.modelOptions = options.modelOptions ?? {};
    this.baseURL =
      options.reverseProxyUrl ||
      process.env.DOUBAO_IMAGE_REVERSE_PROXY ||
      process.env.DOUBAO_IMAGE_BASEURL ||
      DEFAULT_DOUBAO_IMAGE_BASE_URL;
  }

  async generateImage(params = {}, abortController = null) {
    const {
      prompt,
      model,
      imageFiles = [],
      size = '1024x1024',
      response_format = 'url',
      watermark,
      seed,
      guidance_scale,
      sequential_image_generation = 'disabled',
      sequential_image_generation_options,
      output_format,
      stream = false,
      onProviderRequest,
      onProviderResponse,
    } = params;

    if (!prompt?.trim()) {
      throw new Error('Prompt is required for Doubao image generation');
    }

    const selectedModel = model ?? this.modelOptions.model;
    if (!selectedModel) {
      throw new Error('Model is required for Doubao image generation');
    }

    const sourceImages = imageFiles.map(toDataUrl).filter(Boolean);
    const body = {
      model: selectedModel,
      prompt: prompt.trim(),
      size,
      response_format,
      sequential_image_generation,
      stream,
      ...getImagePayload(sourceImages),
      ...(watermark != null ? { watermark } : {}),
      ...(seed != null ? { seed } : {}),
      ...(sequential_image_generation_options != null
        ? { sequential_image_generation_options }
        : {}),
      ...(output_format != null ? { output_format } : {}),
    };

    const url = getImageGenerationUrl(this.baseURL);
    const axiosConfig = {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        ...(this.options.headers ?? {}),
      },
      signal: abortController?.signal,
    };

    if (this.options.proxy || process.env.PROXY) {
      axiosConfig.httpsAgent = new HttpsProxyAgent(this.options.proxy || process.env.PROXY);
    }

    const doubaoRequestLog = {
      provider: 'doubao',
      url,
      method: 'POST',
      headers: axiosConfig.headers,
      body,
    };
    // console.log('[AI接口请求内容]', JSON.stringify(doubaoRequestLog, null, 2));
    onProviderRequest?.(doubaoRequestLog);

    let response;
    try {
      response = await axios.post(url, body, axiosConfig);
    } catch (error) {
      const providerMessage = getProviderErrorMessage(error);
      const providerErrorResponse = {
        status: error?.response?.status,
        statusText: error?.response?.statusText,
        headers: error?.response?.headers,
        body: error?.response?.data ?? providerMessage,
      };
      // console.log('[AI接口返回内容]', JSON.stringify(providerErrorResponse, null, 2));
      onProviderResponse?.(providerErrorResponse);

      throw new Error(`Doubao image generation failed: ${providerMessage}`);
    }

    const data = response.data ?? {};
    // console.log('[AI接口返回内容]', JSON.stringify(data, null, 2));
    onProviderResponse?.(data);
    const images = normalizeImageData(data);

    return {
      ...data,
      created: data.created ?? Date.now(),
      output_format: data.output_format ?? 'png',
      usage: data.usage,
      data: images,
    };
  }
}

module.exports = DoubaoImageClient;
