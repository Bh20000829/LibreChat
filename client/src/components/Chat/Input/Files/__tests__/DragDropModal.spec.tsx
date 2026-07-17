import { EModelEndpoint } from 'librechat-data-provider';
import { getProviderUploadFileType, isProviderUploadSupportedFile } from '~/utils';

describe('DragDropModal - provider upload capability detection', () => {
  it('uses image-only provider upload for ordinary OpenAI chats', () => {
    expect(
      getProviderUploadFileType({
        endpoint: EModelEndpoint.openAI,
        endpointType: EModelEndpoint.openAI,
      }),
    ).toBe('image');
  });

  it('uses document-capable provider upload for OpenAI agents', () => {
    expect(
      getProviderUploadFileType({
        endpoint: EModelEndpoint.agents,
        endpointType: EModelEndpoint.agents,
        provider: EModelEndpoint.openAI,
      }),
    ).toBe('multimodal');
  });

  it('uses Google multimodal upload for Google agents', () => {
    expect(
      getProviderUploadFileType({
        endpoint: EModelEndpoint.agents,
        endpointType: EModelEndpoint.agents,
        provider: EModelEndpoint.google,
      }),
    ).toBe('google_multimodal');
  });

  it('falls back to image-only provider upload for unsupported providers', () => {
    expect(
      getProviderUploadFileType({
        endpoint: 'unsupported-provider',
        endpointType: 'unsupported-endpoint',
      }),
    ).toBe('image');
  });

  it('allows PDFs only for document-capable provider upload', () => {
    const pdf = new File(['pdf'], 'test.pdf', { type: 'application/pdf' });

    expect(isProviderUploadSupportedFile(pdf, 'image')).toBe(false);
    expect(isProviderUploadSupportedFile(pdf, 'multimodal')).toBe(true);
  });

  it('allows audio and video only for Google multimodal provider upload', () => {
    const audio = new File(['audio'], 'test.mp3', { type: 'audio/mpeg' });
    const video = new File(['video'], 'test.mp4', { type: 'video/mp4' });

    expect(isProviderUploadSupportedFile(audio, 'multimodal')).toBe(false);
    expect(isProviderUploadSupportedFile(video, 'multimodal')).toBe(false);
    expect(isProviderUploadSupportedFile(audio, 'google_multimodal')).toBe(true);
    expect(isProviderUploadSupportedFile(video, 'google_multimodal')).toBe(true);
  });
});
