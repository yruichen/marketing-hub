import type { zhCN } from './zh-CN';
import { enUS as baseEnUS } from './base/en-US';
import { contentEnUS } from './content/en-US';
import { workflowEnUS } from './workflow/en-US';

export const enUS = {
  ...baseEnUS,
  ...contentEnUS,
  ...workflowEnUS,
} satisfies Record<keyof typeof zhCN, string>;
