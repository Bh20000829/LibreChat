jest.mock(
  'librechat-data-provider',
  () => ({
    EModelEndpoint: {
      openAI: 'openAI',
    },
  }),
  { virtual: true },
);

jest.mock('~/server/services/Endpoints/image/title', () => jest.fn());

const addTitle = require('./title');
const addImageTitle = require('~/server/services/Endpoints/image/title');

describe('openAI/addTitle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('delegates image title generation to the shared image title service', async () => {
    const req = { body: {} };
    const params = {
      text: '生成一张未来城市图',
      response: { conversationId: 'convo-1' },
      client: { options: {} },
    };

    await addTitle(req, params);

    expect(addImageTitle).toHaveBeenCalledWith(
      req,
      expect.objectContaining({
        ...params,
        endpoint: 'openAI',
        titleEndpoint: 'openAI',
      }),
    );
  });
});
