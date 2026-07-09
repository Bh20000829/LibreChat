import { getResponseSender } from './parsers';
import { EModelEndpoint } from './schemas';

describe('getResponseSender', () => {
  it('uses Doubao as the default sender label for Doubao image models', () => {
    expect(
      getResponseSender({
        endpoint: EModelEndpoint.doubao,
        model: 'doubao-seedream-5-0-260128',
      }),
    ).toBe('Doubao');
  });

  it('allows Doubao sender label overrides', () => {
    expect(
      getResponseSender({
        endpoint: EModelEndpoint.doubao,
        model: 'doubao-seedream-5-0-260128',
        modelLabel: 'DouBao',
      }),
    ).toBe('DouBao');
  });
});
