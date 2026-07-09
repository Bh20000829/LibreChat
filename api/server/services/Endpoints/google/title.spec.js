jest.mock(
  'librechat-data-provider',
  () => ({
    EModelEndpoint: {
      google: 'google',
    },
  }),
  { virtual: true },
);

jest.mock('~/server/services/Endpoints/image/title', () => jest.fn());

const addTitle = require('./title');
const addImageTitle = require('~/server/services/Endpoints/image/title');

describe('google/addTitle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('delegates image title generation to the shared image title service', async () => {
    const req = { body: {} };
    const params = {
      text: '画一个宁静的山间湖泊',
      response: { conversationId: 'convo-1' },
      client: { options: {} },
    };

    await addTitle(req, params);

    expect(addImageTitle).toHaveBeenCalledWith(
      req,
      expect.objectContaining({
        ...params,
        endpoint: 'google',
        titleEndpoint: 'google',
      }),
    );
  });
});
