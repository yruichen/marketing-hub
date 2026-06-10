import { useMemo } from 'react';
import type { ProjectRecord } from '../../types/workspace';
import { STATUS_LABELS } from './types';

export interface FilterInputs {
  search: string;
  platformFilter: string;
  statusFilter: string;
  folderFilter: string;
}

const matchesSearch = (project: ProjectRecord, query: string): boolean => {
  if (!query.trim()) return true;
  const lower = query.toLowerCase();
  return (
    project.name.toLowerCase().includes(lower) ||
    (project.brief || '').toLowerCase().includes(lower) ||
    (project.folder_path || '').toLowerCase().includes(lower) ||
    (project.platform_tags || []).some((tag) => tag.toLowerCase().includes(lower)) ||
    (STATUS_LABELS[project.status_tag || ''] || project.status_tag || '').toLowerCase().includes(lower)
  );
};

/**
 * 单一职责：根据 4 个筛选条件过滤项目。
 * 不持有 state、不做 IO，纯函数 hook，方便测试和复用。
 */
export function useFilteredProjects(projects: ProjectRecord[], filters: FilterInputs): ProjectRecord[] {
  const { search, platformFilter, statusFilter, folderFilter } = filters;

  return useMemo(() => {
    return projects.filter((project) => {
      if (!matchesSearch(project, search)) return false;
      if (platformFilter !== '全部' && !(project.platform_tags || []).includes(platformFilter)) return false;
      if (statusFilter !== '全部' && project.status_tag !== statusFilter) return false;
      if (folderFilter !== '全部' && (project.folder_path_display || project.folder_path || '默认文件夹') !== folderFilter) return false;
      return true;
    });
  }, [projects, search, platformFilter, statusFilter, folderFilter]);
}
