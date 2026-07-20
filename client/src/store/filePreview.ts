import { atom } from 'recoil';

export type FilePreviewItem = {
  file_id?: string;
  filepath?: string;
  filename?: string;
  preview?: string;
  type?: string;
  source?: string;
  user?: string;
  [key: string]: unknown;
} | null;

export const filePreview = atom<FilePreviewItem>({
  key: 'filePreview',
  default: null,
});
