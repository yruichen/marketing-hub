import { zhCN as baseZhCN } from './base/zh-CN';
import { contentZhCN } from './content/zh-CN';
import { workflowZhCN } from './workflow/zh-CN';

export const zhCN = {
  ...baseZhCN,
  ...contentZhCN,
  ...workflowZhCN,
} as const;
