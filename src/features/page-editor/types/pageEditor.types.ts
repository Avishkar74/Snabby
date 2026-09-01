import type { PageId } from '../../../domain/common/ids.ts';

export interface PageEditorProps {
  pageId: PageId | null;
  onClose: () => void;
}
