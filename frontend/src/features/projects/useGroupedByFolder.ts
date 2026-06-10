import { useMemo } from 'react';
import type { FolderRecord, ProjectRecord } from '../../types/workspace';

/**
 * 按 folder.path 把项目分组。board 视图使用。
 * 返回值顺序遵循 folders 数组的顺序，空文件夹也会出现。
 */
export function useGroupedByFolder(
  folders: FolderRecord[],
  projects: ProjectRecord[],
): Record<string, ProjectRecord[]> {
  return useMemo(() => {
    const grouped: Record<string, ProjectRecord[]> = {};
    for (const folder of folders) {
      grouped[folder.path] = [];
    }
    for (const project of projects) {
      const key = project.folder_path_display || project.folder_path || '默认文件夹';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(project);
    }
    return grouped;
  }, [folders, projects]);
}
