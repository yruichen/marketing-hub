import { useCallback, useState } from 'react';
import { apiFetch } from '../../hooks/useApi';
import type { DashboardSnapshot, WorkspaceScope } from './types';
import type { CampaignRecord, ProjectRecord } from '../../types/workspace';

export function useWorkspaceScope(username: string | null) {
  const [workspaceScope, setWorkspaceScope] = useState<WorkspaceScope | null>(null);

  const fetchWorkspaceBootstrap = useCallback(async (): Promise<WorkspaceScope | null> => {
    try {
      const params = new URLSearchParams({
        username: username || '',
      });
      const storedProject = localStorage.getItem('mh_project_slug');
      const storedCampaign = localStorage.getItem('mh_campaign_id');
      if (storedProject) params.set('project', storedProject);
      if (storedCampaign) params.set('campaign', storedCampaign);
      const res = await apiFetch(`/workspace/bootstrap/?${params.toString()}`);
      if (res.ok) {
        const data: { scope: WorkspaceScope } = await res.json();
        setWorkspaceScope(data.scope);
        return data.scope;
      }
    } catch (err) {
      console.error('Failed to fetch workspace bootstrap', err);
    }
    return null;
  }, [username]);

  const selectProjectScope = useCallback((
    project: ProjectRecord,
    campaign?: CampaignRecord | WorkspaceScope['campaign'],
    currentUsername: string | null = null,
  ) => {
    setWorkspaceScope((prev) => {
      if (!prev || prev.organization.id !== project.organization_id) {
        return prev;
      }
      localStorage.setItem('mh_project_slug', project.slug);
      if (campaign) {
        localStorage.setItem('mh_campaign_id', String(campaign.id));
      } else {
        localStorage.removeItem('mh_campaign_id');
      }
      return {
        organization: prev.organization,
        project: {
          id: project.id,
          name: project.name,
          slug: project.slug,
          brief: project.brief,
          brand_context: project.brand_context,
        },
        campaign: campaign
          ? {
              id: campaign.id,
              name: campaign.name,
              objective: campaign.objective,
              status: campaign.status,
            }
          : null,
        username: currentUsername || '',
      };
    });
  }, []);

  return { workspaceScope, setWorkspaceScope, fetchWorkspaceBootstrap, selectProjectScope };
}

export function useDashboardSnapshot(username: string | null) {
  const [dashboardSnapshot, setDashboardSnapshot] = useState<DashboardSnapshot | null>(null);

  const fetchDashboard = useCallback(async (): Promise<DashboardSnapshot | null> => {
    try {
      const params = new URLSearchParams({
        username: username || '',
      });
      const storedProject = localStorage.getItem('mh_project_slug');
      const storedCampaign = localStorage.getItem('mh_campaign_id');
      if (storedProject) params.set('project', storedProject);
      if (storedCampaign) params.set('campaign', storedCampaign);
      const res = await apiFetch(`/dashboard/?${params.toString()}`);
      if (res.ok) {
        const data: DashboardSnapshot = await res.json();
        setDashboardSnapshot(data);
        return data;
      }
    } catch (err) {
      console.error('Failed to fetch analytics dashboard', err);
    }
    return null;
  }, [username]);

  return { dashboardSnapshot, setDashboardSnapshot, fetchDashboard };
}
