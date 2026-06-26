import type { AssetRecord, GenerationTaskRecord, ProjectRecord } from '../../types/workspace';
import type { AppSection } from '../../shared/stores/uiStore';

export type GlobalSearchKind = 'project' | 'asset' | 'task' | 'action';

export interface GlobalSearchResult {
  id: string;
  kind: GlobalSearchKind;
  label: string;
  description: string;
  tab: AppSection;
  project?: ProjectRecord;
  asset?: AssetRecord;
  task?: GenerationTaskRecord;
}

export interface GlobalSearchPayload {
  projects: ProjectRecord[];
  assets: AssetRecord[];
  tasks: GenerationTaskRecord[];
}
