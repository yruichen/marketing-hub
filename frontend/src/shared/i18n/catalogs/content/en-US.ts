import type { contentZhCN } from './zh-CN';

export const contentEnUS = {
  'content.version.aiDraft': 'AI draft',
  'content.version.userRevision': 'User revision',
  'content.version.final': 'Final',
  'content.empty.title': 'No content pack yet',
  'content.empty.description': 'Enter a brand name and brief, choose a channel, configure an AI provider, and run generation to receive a real result.',
  'content.context.empty': 'No content pack generated',
  'content.context.guide': 'Enter a brief and run a real generation task.',
  'review.empty.title': 'Nothing to review',
  'review.empty.description': 'Generate a real content pack before opening review.',
  'review.status.approved': 'Approved',
  'review.status.pending': 'Awaiting human approval',
  'review.approve': 'Approve as final',
} satisfies Record<keyof typeof contentZhCN, string>;
