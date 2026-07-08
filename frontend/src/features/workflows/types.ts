import type { ErrorActionId } from '../../shared/api/errorActions';
import type { BrandContext, CampaignRecord, FeatureEntitlements, ProjectRecord, WorkflowNode, WorkflowEdge, WorkspaceDraftRecord } from '../../types/workspace';
import type { TriggerToastFn } from '../../shared/types/toast';
import type { NodeType, LegacyNodeType } from './constants';
import { ioSchema, defaultNodeConfig, nodeTypeLabels } from './constants';

export interface ProjectDetail extends ProjectRecord {
  campaigns: CampaignRecord[];
  drafts: WorkspaceDraftRecord[];
  assets: Array<{ id: number; asset_type: string; title: string; created_at: string }>;
}


export interface WorkflowBuilderProps {
  project: Pick<ProjectRecord, 'id' | 'name' | 'slug'> | null;
  campaign: Pick<CampaignRecord, 'id' | 'name'> | null;
  organizationSlug?: string;
  username: string;
  triggerToast: TriggerToastFn;
  featureEntitlements?: Partial<FeatureEntitlements>;
  onOpenBilling?: () => void;
  onErrorAction?: (actionId: ErrorActionId) => void;
}

export type WorkflowSnapshot = {
  id: string;
  label: string;
  createdAt: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  brandContext: BrandContext;
  selectedNodeId: string;
};

// Conversion functions between WorkflowNode (API format) and ReactFlow Node format

export function normalizeNodeType(type: string): LegacyNodeType {
  if (type === 'rag_search') return 'retrieval';
  if (type === 'image') return 'image_generation';
  if (type === 'video') return 'video_generation';
  return (type as LegacyNodeType) in ioSchema ? (type as LegacyNodeType) : 'custom_agent';
}

export function normalizeWorkflowNode(node: WorkflowNode, brandContext: BrandContext): WorkflowNode {
  const normalizedType = normalizeNodeType(node.type);
  const schema = ioSchema[normalizedType] || ioSchema.custom_agent;
  return {
    ...node,
    type: normalizedType,
    label: node.label || nodeTypeLabels[normalizedType] || '节点',
    width: node.width && node.width >= 300 ? node.width : 320,
    height: node.height && node.height >= 320 ? node.height : 360,
    input_schema: node.input_schema || schema.input,
    output_schema: node.output_schema || schema.output,
    config: {
      ...defaultNodeConfig(normalizedType as NodeType, brandContext),
      ...(node.config || {}),
      input_schema: node.input_schema || schema.input,
      output_schema: node.output_schema || schema.output,
    },
  };
}
