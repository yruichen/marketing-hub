import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Ban,
  CheckCircle2,
  Coins,
  Database,
  LockKeyhole,
  LogOut,
  RefreshCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Users,
  Workflow,
} from 'lucide-react';
import { apiFetch, buildErrorToast, parseApiErrorResponse } from '../../hooks/useApi';
import type { TriggerToastFn } from '../../shared/types/toast';

type AdminSummary = {
  users: { total: number; today: number; pending: number; suspended: number };
  organizations: { total: number; free: number; pro: number; enterprise: number };
  tasks: { total: number; today: number; queued: number; running: number; succeeded: number; failed: number };
  usage: { total_tokens: number; total_cost_usd: string };
  recent_security_events: Array<{ id: number; event_type: string; email: string; risk_level: string; created_at: string }>;
};

type AdminUser = {
  id: number;
  username: string;
  email: string;
  is_active: boolean;
  is_staff: boolean;
  is_superuser: boolean;
  last_login: string | null;
  date_joined: string;
  profile: {
    email_verified: boolean;
    status: 'pending' | 'active' | 'suspended' | 'deleted';
    subscription_plan: 'free' | 'pro';
    subscription_source: string;
    subscription_expires_at: string | null;
    signup_source: string;
    signup_ip: string | null;
    last_login_ip: string | null;
  };
  organizations: Array<{ id: number; name: string; slug: string; role: string }>;
  security_events?: AdminLog[];
  credit_grants?: Array<{
    id: number;
    organization_id: number;
    organization: string;
    delta_cents: number;
    balance_after_cents: number;
    metadata: Record<string, unknown>;
    created_at: string;
  }>;
};

type AdminOrg = {
  id: number;
  name: string;
  slug: string;
  subscription_plan: string;
  member_count: number;
  project_count: number;
  task_count: number;
  credit_balance_usd: string;
  total_tokens: number;
  total_cost_usd: string;
};

type AdminLog = {
  id: number;
  action?: string;
  event_type?: string;
  actor?: string;
  user?: string;
  organization?: string;
  target_type?: string;
  target_id?: string;
  email?: string;
  ip_address?: string;
  risk_level?: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

type AdminInvite = {
  id: number;
  label: string;
  code_hash_preview: string;
  max_uses: number;
  used_count: number;
  is_active: boolean;
  created_by: string;
  created_at: string;
  plain_code?: string;
  deactivated?: boolean;
};

type AdminEnterpriseRequest = {
  id: number;
  company_name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  team_size: string;
  requirements: string;
  status: string;
  username: string;
  organization: string;
  created_at: string;
};

type AdminCommunityCreation = {
  id: number;
  title: string;
  username: string;
  creation_type: string;
  creation_type_display: string;
  organization: string | null;
  organization_name: string;
  project: string | null;
  project_name: string;
  visibility: string;
  review_status: string;
  moderation_status: string;
  reported_count: number;
  ai_generated: boolean;
  takedown_reason: string;
  rejected_asset_id?: number | null;
  content_preview: string;
  created_at: string;
  published_at: string | null;
};

type AdminCommunityCounts = {
  total: number;
  approved: number;
  rejected: number;
  reported: number;
  hidden: number;
};

type AdminConsolePageProps = {
  isStaff: boolean;
  username?: string;
  onLogout?: () => void;
  triggerToast: TriggerToastFn;
};

const tabs = [
  { id: 'overview', label: '总览' },
  { id: 'users', label: '用户' },
  { id: 'grants', label: '资源发放' },
  { id: 'orgs', label: '组织' },
  { id: 'invites', label: '邀请码' },
  { id: 'pro-invites', label: 'Pro 邀请码' },
  { id: 'enterprise', label: '企业需求' },
  { id: 'moderation', label: '内容审核' },
  { id: 'security', label: '安全事件' },
  { id: 'logs', label: '审计日志' },
] as const;

type TabId = typeof tabs[number]['id'];

function formatDate(value: string | null | undefined) {
  if (!value) return '从未';
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

function formatNumber(value: number | undefined) {
  return new Intl.NumberFormat('zh-CN').format(value || 0);
}

function StatCard({ label, value, hint, tone, icon: Icon }: { label: string; value: string | number; hint: string; tone: string; icon: typeof Users }) {
  return (
    <div className="relative overflow-hidden border border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] p-4 shadow-[4px_4px_0_var(--editorial-stroke)]">
      <div className={`absolute right-3 top-3 h-10 w-10 rounded-full ${tone} opacity-80`} />
      <div className="relative flex items-center gap-2 text-[10px] font-black uppercase text-[var(--editorial-text-gray)]">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className="relative mt-3 text-3xl font-black">{value}</div>
      <p className="relative mt-1 text-[11px] text-[var(--editorial-text-gray)]">{hint}</p>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const style = status === 'active' || status === 'succeeded'
    ? 'border-emerald-600 text-emerald-700'
    : status === 'suspended' || status === 'failed' || status === 'deleted'
      ? 'border-red-600 text-red-700'
      : 'border-amber-600 text-amber-700';
  return <span className={`inline-flex border px-2 py-0.5 text-[10px] font-black ${style}`}>{status}</span>;
}

export function AdminConsolePage({ isStaff, username, onLogout, triggerToast }: AdminConsolePageProps) {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [orgs, setOrgs] = useState<AdminOrg[]>([]);
  const [auditLogs, setAuditLogs] = useState<AdminLog[]>([]);
  const [securityLogs, setSecurityLogs] = useState<AdminLog[]>([]);
  const [invites, setInvites] = useState<AdminInvite[]>([]);
  const [proInvites, setProInvites] = useState<AdminInvite[]>([]);
  const [enterpriseRequests, setEnterpriseRequests] = useState<AdminEnterpriseRequest[]>([]);
  const [communityCreations, setCommunityCreations] = useState<AdminCommunityCreation[]>([]);
  const [communityCounts, setCommunityCounts] = useState<AdminCommunityCounts | null>(null);
  const [reviewStatusFilter, setReviewStatusFilter] = useState('');
  const [moderationStatusFilter, setModerationStatusFilter] = useState('');
  const [reportedOnly, setReportedOnly] = useState(false);
  const [moderationReasons, setModerationReasons] = useState<Record<number, string>>({});
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [emailFilter, setEmailFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [creditAmount, setCreditAmount] = useState('10');
  const [creditReason, setCreditReason] = useState('小范围测试额度');
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [userGrantOrgId, setUserGrantOrgId] = useState('');
  const [userGrantAmount, setUserGrantAmount] = useState('10');
  const [userGrantReason, setUserGrantReason] = useState('个人测试资源发放');
  const [inviteCode, setInviteCode] = useState('');
  const [inviteLabel, setInviteLabel] = useState('种子用户测试邀请');
  const [inviteMaxUses, setInviteMaxUses] = useState('1');
  const [proInviteLabel, setProInviteLabel] = useState('Pro 种子用户邀请');
  const [proInviteMaxUses, setProInviteMaxUses] = useState('1');
  const [generatedProInviteCode, setGeneratedProInviteCode] = useState('');
  const [editingProInviteId, setEditingProInviteId] = useState<number | null>(null);
  const [editingProInviteLabel, setEditingProInviteLabel] = useState('');
  const [editingProInviteMaxUses, setEditingProInviteMaxUses] = useState('1');

  const loadCommunityCreations = async () => {
    const params = new URLSearchParams();
    if (reviewStatusFilter) params.set('review_status', reviewStatusFilter);
    if (moderationStatusFilter) params.set('moderation_status', moderationStatusFilter);
    if (reportedOnly) params.set('reported_only', 'true');
    if (query.trim()) params.set('search', query.trim());
    const response = await apiFetch(`/admin-console/community-creations/?${params.toString()}`);
    const data = await response.json();
    if (!response.ok) throw await parseApiErrorResponse(response, '/admin-console/community-creations/');
    setCommunityCreations(data.results || []);
    setCommunityCounts(data.counts || null);
  };

  const loadData = async () => {
    if (!isStaff) return;
    setLoading(true);
    try {
      const [summaryRes, usersRes, orgsRes, auditRes, securityRes, inviteRes, proInviteRes, enterpriseRes] = await Promise.all([
        apiFetch('/admin-console/summary/'),
        apiFetch('/admin-console/users/'),
        apiFetch('/admin-console/organizations/'),
        apiFetch('/admin-console/audit-logs/'),
        apiFetch('/admin-console/security-events/'),
        apiFetch('/admin-console/invites/'),
        apiFetch('/admin-console/pro-invites/'),
        apiFetch('/admin-console/enterprise-requests/'),
      ]);
      const responses = [summaryRes, usersRes, orgsRes, auditRes, securityRes, inviteRes, proInviteRes, enterpriseRes];
      const failed = responses.find((res) => !res.ok);
      if (failed) throw await parseApiErrorResponse(failed, '/admin-console/');
      setSummary(await summaryRes.json());
      setUsers((await usersRes.json()).results || []);
      setOrgs((await orgsRes.json()).results || []);
      setAuditLogs((await auditRes.json()).results || []);
      setSecurityLogs((await securityRes.json()).results || []);
      setInvites((await inviteRes.json()).results || []);
      setProInvites((await proInviteRes.json()).results || []);
      setEnterpriseRequests((await enterpriseRes.json()).results || []);
      await loadCommunityCreations();
    } catch (err) {
      triggerToast(buildErrorToast(err, '运营后台数据加载失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData();
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStaff]);

  useEffect(() => {
    if (!isStaff || activeTab !== 'moderation') return;
    const timer = window.setTimeout(() => {
      void loadCommunityCreations().catch((err) => {
        triggerToast(buildErrorToast(err, '内容审核列表加载失败'));
      });
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, isStaff, reviewStatusFilter, moderationStatusFilter, reportedOnly, query]);

  const moderateCommunityCreation = async (item: AdminCommunityCreation, review_status: 'approved' | 'rejected') => {
    const reason = moderationReasons[item.id]?.trim() || (review_status === 'rejected' ? '平台审核驳回' : '');
    try {
      const response = await apiFetch(`/admin-console/community-creations/${item.id}/moderate/`, {
        method: 'POST',
        body: JSON.stringify({
          review_status,
          reason,
          moderation_status: review_status === 'approved' ? 'visible' : undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw await parseApiErrorResponse(response, `/admin-console/community-creations/${item.id}/moderate/`);
      setCommunityCreations((items) => items.map((entry) => (entry.id === item.id ? data : entry)));
      triggerToast(review_status === 'rejected' ? `已驳回并归档到项目资产 #${data.rejected_asset_id || '—'}` : '已恢复通过并重新展示', review_status === 'rejected' ? 'info' : 'success');
      void loadCommunityCreations();
      void loadData();
    } catch (err) {
      triggerToast(buildErrorToast(err, '内容审核操作失败'));
    }
  };

  const filteredUsers = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return users.filter((user) => {
      if (keyword && !`${user.username} ${user.email} ${user.profile.signup_ip || ''} ${user.profile.last_login_ip || ''}`.toLowerCase().includes(keyword)) return false;
      if (statusFilter && user.profile.status !== statusFilter) return false;
      if (emailFilter === 'verified' && !user.profile.email_verified) return false;
      if (emailFilter === 'unverified' && user.profile.email_verified) return false;
      if (activeFilter === 'active' && !user.is_active) return false;
      if (activeFilter === 'inactive' && user.is_active) return false;
      return true;
    });
  }, [activeFilter, emailFilter, query, statusFilter, users]);

  const filteredOrgs = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return orgs;
    return orgs.filter((org) => `${org.name} ${org.slug}`.toLowerCase().includes(keyword));
  }, [query, orgs]);

  const refreshUserDetail = async (userId: number) => {
    try {
      const response = await apiFetch(`/admin-console/users/${userId}/`);
      const data = await response.json();
      if (!response.ok) throw await parseApiErrorResponse(response, `/admin-console/users/${userId}/`);
      setSelectedUser(data);
      setUsers((items) => items.map((item) => (item.id === userId ? data : item)));
      if (!userGrantOrgId && data.organizations?.[0]) setUserGrantOrgId(String(data.organizations[0].id));
    } catch (err) {
      triggerToast(buildErrorToast(err, '用户详情加载失败'));
    }
  };

  useEffect(() => {
    if (!selectedUserId) return;
    const timer = window.setTimeout(() => {
      void refreshUserDetail(selectedUserId);
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUserId]);

  const runUserAction = async (user: AdminUser, action: string) => {
    try {
      const response = await apiFetch(`/admin-console/users/${user.id}/actions/${action}/`, { method: 'POST', body: JSON.stringify({}) });
      const data = await response.json();
      if (!response.ok) throw await parseApiErrorResponse(response, `/admin-console/users/${user.id}/actions/${action}/`);
      setUsers((items) => items.map((item) => (item.id === user.id ? data : item)));
      setSelectedUser(data);
      triggerToast('账号操作已记录', 'success');
      void loadData();
    } catch (err) {
      triggerToast(buildErrorToast(err, '账号操作失败'));
    }
  };

  const updateUserSubscriptionPlan = async (user: AdminUser, subscriptionPlan: 'free' | 'pro') => {
    try {
      const response = await apiFetch(`/admin-console/users/${user.id}/`, {
        method: 'PATCH',
        body: JSON.stringify({ subscription_plan: subscriptionPlan }),
      });
      const data = await response.json();
      if (!response.ok) throw await parseApiErrorResponse(response, `/admin-console/users/${user.id}/`);
      setUsers((items) => items.map((item) => (item.id === user.id ? data : item)));
      if (selectedUser?.id === user.id) setSelectedUser(data);
      triggerToast(`用户订阅已切换为 ${subscriptionPlan.toUpperCase()}`, 'success');
      void loadData();
    } catch (err) {
      triggerToast(buildErrorToast(err, '用户订阅更新失败'));
    }
  };

  const grantCreditToUserOrg = async (user: AdminUser) => {
    const amount = Math.round(Number(userGrantAmount || 0) * 100);
    try {
      const response = await apiFetch(`/admin-console/users/${user.id}/credit-grants/`, {
        method: 'POST',
        body: JSON.stringify({ organization_id: Number(userGrantOrgId), amount_cents: amount, reason: userGrantReason }),
      });
      const data = await response.json();
      if (!response.ok) throw await parseApiErrorResponse(response, `/admin-console/users/${user.id}/credit-grants/`);
      setSelectedUser(data);
      triggerToast('已按用户所属组织发放额度', 'success');
      void loadData();
    } catch (err) {
      triggerToast(buildErrorToast(err, '用户资源发放失败'));
    }
  };

  const grantCredit = async (org: AdminOrg) => {
    const amount = Math.round(Number(creditAmount || 0) * 100);
    try {
      const response = await apiFetch(`/admin-console/organizations/${org.id}/credits/`, { method: 'POST', body: JSON.stringify({ amount_cents: amount, reason: creditReason }) });
      const data = await response.json();
      if (!response.ok) throw await parseApiErrorResponse(response, `/admin-console/organizations/${org.id}/credits/`);
      setOrgs((items) => items.map((item) => (item.id === org.id ? data : item)));
      triggerToast(`已给 ${org.name} 发放 $${creditAmount}`, 'success');
      void loadData();
    } catch (err) {
      triggerToast(buildErrorToast(err, '额度发放失败'));
    }
  };

  const updateOrgPlan = async (org: AdminOrg, subscription_plan: string) => {
    try {
      const response = await apiFetch(`/admin-console/organizations/${org.id}/`, { method: 'PATCH', body: JSON.stringify({ subscription_plan }) });
      const data = await response.json();
      if (!response.ok) throw await parseApiErrorResponse(response, `/admin-console/organizations/${org.id}/`);
      setOrgs((items) => items.map((item) => (item.id === org.id ? data : item)));
      triggerToast('组织套餐已更新', 'success');
      void loadData();
    } catch (err) {
      triggerToast(buildErrorToast(err, '组织套餐更新失败'));
    }
  };

  const createInvite = async () => {
    try {
      const response = await apiFetch('/admin-console/invites/', { method: 'POST', body: JSON.stringify({ code: inviteCode, label: inviteLabel, max_uses: Number(inviteMaxUses || 1) }) });
      const data = await response.json();
      if (!response.ok) throw await parseApiErrorResponse(response, '/admin-console/invites/');
      setInvites((items) => [data, ...items]);
      setInviteCode('');
      triggerToast('邀请码已创建，明文不会被保存，请记录刚才输入的 code', 'success');
      void loadData();
    } catch (err) {
      triggerToast(buildErrorToast(err, '邀请码创建失败'));
    }
  };

  const createProInvite = async () => {
    try {
      const response = await apiFetch('/admin-console/pro-invites/', {
        method: 'POST',
        body: JSON.stringify({ label: proInviteLabel, max_uses: Number(proInviteMaxUses || 1) }),
      });
      const data = await response.json();
      if (!response.ok) throw await parseApiErrorResponse(response, '/admin-console/pro-invites/');
      setProInvites((items) => [data, ...items]);
      setGeneratedProInviteCode(data.plain_code || '');
      triggerToast('Pro 邀请码已生成，请记录明文 code', 'success');
      void loadData();
    } catch (err) {
      triggerToast(buildErrorToast(err, 'Pro 邀请码创建失败'));
    }
  };

  const startEditProInvite = (invite: AdminInvite) => {
    setEditingProInviteId(invite.id);
    setEditingProInviteLabel(invite.label);
    setEditingProInviteMaxUses(String(invite.max_uses));
  };

  const updateProInvite = async (invite: AdminInvite, patch?: Partial<Pick<AdminInvite, 'label' | 'max_uses' | 'is_active'>>) => {
    try {
      const payload = patch || {
        label: editingProInviteLabel,
        max_uses: Number(editingProInviteMaxUses || invite.max_uses),
      };
      const response = await apiFetch(`/admin-console/pro-invites/${invite.id}/`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw await parseApiErrorResponse(response, `/admin-console/pro-invites/${invite.id}/`);
      setProInvites((items) => items.map((item) => (item.id === invite.id ? data : item)));
      setEditingProInviteId(null);
      triggerToast('Pro 邀请码已更新', 'success');
    } catch (err) {
      triggerToast(buildErrorToast(err, 'Pro 邀请码更新失败'));
    }
  };

  const deleteProInvite = async (invite: AdminInvite) => {
    try {
      const response = await apiFetch(`/admin-console/pro-invites/${invite.id}/`, { method: 'DELETE' });
      if (response.status === 204) {
        setProInvites((items) => items.filter((item) => item.id !== invite.id));
        triggerToast('Pro 邀请码已删除', 'success');
        return;
      }
      const data = await response.json();
      if (!response.ok) throw await parseApiErrorResponse(response, `/admin-console/pro-invites/${invite.id}/`);
      setProInvites((items) => items.map((item) => (item.id === invite.id ? data : item)));
      triggerToast('邀请码已有兑换记录，已改为停用', 'info');
    } catch (err) {
      triggerToast(buildErrorToast(err, 'Pro 邀请码删除失败'));
    }
  };

  if (!isStaff) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="max-w-md border border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] p-8 text-center shadow-[8px_8px_0_var(--editorial-stroke)]">
          <LockKeyhole className="mx-auto h-10 w-10 text-[var(--danger-accent)]" />
          <h2 className="serif-header mt-4 text-2xl font-black">需要超级管理员权限</h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--editorial-text-gray)]">平台运营后台只对 superuser 开放。组织管理员能力后续单独设计，不混用这里的开发者后台。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-console h-full min-h-0 overflow-y-auto pr-1 font-mono">
      <section className="relative overflow-hidden border border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] p-5 shadow-[6px_6px_0_var(--editorial-stroke)]">
        <div className="absolute right-0 top-0 h-32 w-32 bg-[var(--brand-accent)] opacity-35 [clip-path:polygon(35%_0,100%_0,100%_100%,0_70%)]" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <span className="inline-flex border border-[var(--editorial-stroke)] bg-[var(--brand-accent)] px-2 py-1 text-[10px] font-black uppercase">Super Admin Cockpit</span>
            <h1 className="serif-header mt-3 text-4xl font-black">超级管理员后台</h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--editorial-text-gray)]">当前管理员：{username || 'admin'}。后台仅包含平台管理模块，不挂载普通创作工作台。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void loadData()} className="inline-flex items-center justify-center gap-2 border border-[var(--editorial-stroke)] bg-[var(--editorial-stroke)] px-4 py-2 text-xs font-black text-[var(--editorial-bg)]">
              <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              刷新数据
            </button>
            {onLogout ? (
              <button type="button" onClick={onLogout} className="inline-flex items-center justify-center gap-2 border border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] px-4 py-2 text-xs font-black">
                <LogOut className="h-4 w-4" />
                退出
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <div className="sticky top-0 z-10 mt-4 flex flex-wrap items-center gap-2 border border-[var(--border-subtle)] bg-[var(--surface-panel)]/95 p-2 backdrop-blur">
        {tabs.map((tab) => (
          <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={`border px-3 py-2 text-xs font-black ${activeTab === tab.id ? 'border-[var(--editorial-stroke)] bg-[var(--brand-accent)] text-black' : 'border-[var(--border-subtle)] bg-[var(--surface-elevated)]'}`}>
            {tab.label}
          </button>
        ))}
        <label className="ml-auto flex min-w-[220px] items-center gap-2 border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-3 py-2 text-xs">
          <Search className="h-4 w-4 text-[var(--editorial-text-gray)]" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} className="w-full bg-transparent outline-none" placeholder="搜索用户 / 组织 / IP" />
        </label>
      </div>

      {activeTab === 'overview' && summary ? (
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard icon={Users} label="用户" value={summary.users.total} hint={`今日新增 ${summary.users.today}，待验证 ${summary.users.pending}`} tone="bg-[var(--brand-accent)]" />
            <StatCard icon={Database} label="组织" value={summary.organizations.total} hint={`Free ${summary.organizations.free} / Pro ${summary.organizations.pro}`} tone="bg-[var(--editorial-accent-blue)]" />
            <StatCard icon={Workflow} label="任务" value={summary.tasks.total} hint={`今日 ${summary.tasks.today}，失败 ${summary.tasks.failed}`} tone="bg-amber-300" />
            <StatCard icon={Coins} label="成本" value={`$${Number(summary.usage.total_cost_usd).toFixed(4)}`} hint={`${formatNumber(summary.usage.total_tokens)} tokens`} tone="bg-emerald-300" />
          </div>
        </div>
      ) : null}

      {activeTab === 'users' && (
        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="grid gap-3">
            <div className="grid gap-2 border border-[var(--editorial-stroke)] bg-[var(--surface-elevated)] p-3 md:grid-cols-3">
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="border border-[var(--border-default)] bg-[var(--editorial-paper)] px-3 py-2 text-xs outline-none">
                <option value="">全部状态</option>
                <option value="pending">pending</option>
                <option value="active">active</option>
                <option value="suspended">suspended</option>
                <option value="deleted">deleted</option>
              </select>
              <select value={emailFilter} onChange={(event) => setEmailFilter(event.target.value)} className="border border-[var(--border-default)] bg-[var(--editorial-paper)] px-3 py-2 text-xs outline-none">
                <option value="">邮箱验证</option>
                <option value="verified">已验证</option>
                <option value="unverified">未验证</option>
              </select>
              <select value={activeFilter} onChange={(event) => setActiveFilter(event.target.value)} className="border border-[var(--border-default)] bg-[var(--editorial-paper)] px-3 py-2 text-xs outline-none">
                <option value="">登录状态</option>
                <option value="active">可登录</option>
                <option value="inactive">已停用</option>
              </select>
            </div>
          {filteredUsers.map((user) => (
            <article key={user.id} className={`grid gap-3 border bg-[var(--editorial-paper)] p-4 lg:grid-cols-[minmax(0,1fr)_auto] ${selectedUserId === user.id ? 'border-[var(--brand-accent-strong)] shadow-[4px_4px_0_var(--editorial-stroke)]' : 'border-[var(--editorial-stroke)]'}`}>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-black">{user.username}</h3>
                  <StatusPill status={user.profile.status} />
                  {user.is_active ? <span className="text-xs font-black text-emerald-700">可登录</span> : <span className="text-xs font-black text-red-700">已停用</span>}
                  {user.profile.email_verified ? <span className="inline-flex items-center gap-1 text-xs font-black text-emerald-700"><CheckCircle2 className="h-3 w-3" />邮箱已验证</span> : <span className="inline-flex items-center gap-1 text-xs font-black text-amber-700"><AlertTriangle className="h-3 w-3" />未验证</span>}
                  <span className={`border px-2 py-0.5 text-[10px] font-black ${user.profile.subscription_plan === 'pro' ? 'border-emerald-700 text-emerald-800' : 'border-[var(--editorial-stroke)] text-[var(--editorial-text-gray)]'}`}>
                    {user.profile.subscription_plan.toUpperCase()}
                  </span>
                  {user.is_superuser ? <span className="border border-black px-2 py-0.5 text-[10px] font-black">SUPERUSER</span> : user.is_staff ? <span className="border border-[var(--editorial-stroke)] px-2 py-0.5 text-[10px] font-black">STAFF</span> : null}
                </div>
                <p className="mt-1 text-xs text-[var(--editorial-text-gray)]">{user.email || '无邮箱'} · 注册 {formatDate(user.date_joined)} · 最近登录 {formatDate(user.last_login)}</p>
                <p className="mt-1 text-xs text-[var(--editorial-text-gray)]">来源 {user.profile.signup_source || '-'} · 注册 IP {user.profile.signup_ip || '-'} · 最近 IP {user.profile.last_login_ip || '-'}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {user.organizations.map((org) => <span key={org.id} className="border border-[var(--border-subtle)] px-2 py-1 text-[10px]">{org.name} · {org.role}</span>)}
                </div>
              </div>
              <div className="flex max-w-xl flex-wrap items-center gap-2 lg:justify-end">
                <label className="flex items-center gap-1 border border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] px-2 py-1 text-[10px] font-black">
                  订阅
                  <select
                    value={user.profile.subscription_plan}
                    onChange={(event) => void updateUserSubscriptionPlan(user, event.target.value as 'free' | 'pro')}
                    className="bg-transparent text-xs font-black outline-none"
                  >
                    <option value="free">free</option>
                    <option value="pro">pro</option>
                  </select>
                </label>
                <button type="button" onClick={() => setSelectedUserId(user.id)} className="border border-[var(--editorial-stroke)] bg-[var(--brand-accent)] px-3 py-2 text-xs font-black text-black">
                  详情
                </button>
                <button type="button" onClick={() => void runUserAction(user, user.profile.status === 'suspended' ? 'unfreeze' : 'freeze')} className="inline-flex items-center gap-1 border border-[var(--editorial-stroke)] px-3 py-2 text-xs font-black">
                  {user.profile.status === 'suspended' ? <ShieldCheck className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
                  {user.profile.status === 'suspended' ? '解冻' : '冻结'}
                </button>
                <button type="button" onClick={() => void runUserAction(user, user.is_active ? 'disable' : 'enable')} className="border border-[var(--editorial-stroke)] px-3 py-2 text-xs font-black">
                  {user.is_active ? '停用登录' : '恢复登录'}
                </button>
                {!user.profile.email_verified ? (
                  <button type="button" onClick={() => void runUserAction(user, 'mark-email-verified')} className="border border-emerald-700 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-800">
                    标记已验证
                  </button>
                ) : null}
                <button type="button" onClick={() => void runUserAction(user, 'send-password-reset')} className="border border-[var(--editorial-stroke)] px-3 py-2 text-xs font-black">发送重置链接</button>
                <button type="button" onClick={() => void runUserAction(user, 'resend-verification')} className="border border-[var(--editorial-stroke)] px-3 py-2 text-xs font-black">重发验证邮件</button>
              </div>
            </article>
          ))}
          </div>
          <aside className="h-fit border border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] p-4 shadow-[4px_4px_0_var(--editorial-stroke)]">
            <h3 className="text-lg font-black">用户详情</h3>
            {selectedUser ? (
              <div className="mt-3 grid gap-4 text-xs">
                <div>
                  <b>{selectedUser.username}</b>
                  <p className="mt-1 text-[var(--editorial-text-gray)]">{selectedUser.email || '无邮箱'} · 注册 {formatDate(selectedUser.date_joined)}</p>
                </div>
                <div className="grid gap-2 border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-3">
                  <div className="font-black">个人订阅状态</div>
                  <select
                    value={selectedUser.profile.subscription_plan}
                    onChange={(event) => void updateUserSubscriptionPlan(selectedUser, event.target.value as 'free' | 'pro')}
                    className="border border-[var(--border-default)] bg-[var(--editorial-paper)] px-3 py-2 font-black outline-none"
                  >
                    <option value="free">free</option>
                    <option value="pro">pro</option>
                  </select>
                  <p className="text-[10px] leading-relaxed text-[var(--editorial-text-gray)]">
                    来源 {selectedUser.profile.subscription_source || 'default'}；管理员修改后立即影响 Pro-only 功能。
                  </p>
                </div>
                <div>
                  <div className="mb-2 font-black">所属组织</div>
                  <div className="grid gap-1">{selectedUser.organizations.map((org) => <span key={org.id} className="border border-[var(--border-subtle)] px-2 py-1">{org.name} · {org.role}</span>)}</div>
                </div>
                <div className="grid gap-2 border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-3">
                  <div className="font-black">给该用户所属组织发放资源</div>
                  <select value={userGrantOrgId} onChange={(event) => setUserGrantOrgId(event.target.value)} className="border border-[var(--border-default)] bg-[var(--editorial-paper)] px-3 py-2 outline-none">
                    <option value="">选择组织</option>
                    {selectedUser.organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
                  </select>
                  <input value={userGrantAmount} onChange={(event) => setUserGrantAmount(event.target.value)} className="border border-[var(--border-default)] bg-[var(--editorial-paper)] px-3 py-2 outline-none" placeholder="美元金额" />
                  <input value={userGrantReason} onChange={(event) => setUserGrantReason(event.target.value)} className="border border-[var(--border-default)] bg-[var(--editorial-paper)] px-3 py-2 outline-none" placeholder="发放原因" />
                  <button type="button" onClick={() => void grantCreditToUserOrg(selectedUser)} className="border border-[var(--editorial-stroke)] bg-[var(--brand-accent)] px-3 py-2 font-black text-black">发放额度</button>
                </div>
                <div>
                  <div className="mb-2 font-black">最近发放</div>
                  <div className="grid gap-1">{(selectedUser.credit_grants || []).map((grant) => <div key={grant.id} className="border border-[var(--border-subtle)] p-2"><b>${(grant.delta_cents / 100).toFixed(2)}</b> · {grant.organization}<p className="text-[var(--editorial-text-gray)]">{String(grant.metadata.reason || '')} · {formatDate(grant.created_at)}</p></div>)}</div>
                </div>
                <div>
                  <div className="mb-2 font-black">安全事件</div>
                  <div className="grid gap-1">{(selectedUser.security_events || []).map((event) => <div key={event.id} className="border border-[var(--border-subtle)] p-2"><b>{event.event_type}</b><p className="text-[var(--editorial-text-gray)]">{event.ip_address || '-'} · {event.risk_level} · {formatDate(event.created_at)}</p></div>)}</div>
                </div>
              </div>
            ) : <p className="mt-2 text-xs text-[var(--editorial-text-gray)]">从左侧选择用户查看组织、角色、安全事件和额度发放记录。</p>}
          </aside>
        </div>
      )}

      {activeTab === 'grants' && (
        <div className="mt-4 border border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] p-4 text-sm">
          资源发放现在从“用户”页选择个人用户后执行，目标组织限定为该用户所属组织。
        </div>
      )}

      {activeTab === 'orgs' && (
        <div className="mt-4 grid gap-3">
          <div className="grid gap-2 border border-[var(--editorial-stroke)] bg-[var(--surface-elevated)] p-3 md:grid-cols-[140px_minmax(0,1fr)_auto]">
            <input value={creditAmount} onChange={(event) => setCreditAmount(event.target.value)} className="border border-[var(--border-default)] bg-[var(--editorial-paper)] px-3 py-2 text-xs outline-none" placeholder="美元金额" />
            <input value={creditReason} onChange={(event) => setCreditReason(event.target.value)} className="border border-[var(--border-default)] bg-[var(--editorial-paper)] px-3 py-2 text-xs outline-none" placeholder="发放原因" />
            <span className="px-2 py-2 text-xs text-[var(--editorial-text-gray)]">先填写金额与原因，再点组织卡片发放。</span>
          </div>
          {filteredOrgs.map((org) => (
            <article key={org.id} className="grid gap-3 border border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] p-4 xl:grid-cols-[minmax(0,1fr)_auto]">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-black">{org.name}</h3>
                  <span className="border border-[var(--editorial-stroke)] px-2 py-0.5 text-[10px] font-black">{org.subscription_plan}</span>
                  <span className="text-xs text-[var(--editorial-text-gray)]">/{org.slug}</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs md:grid-cols-5">
                  <span>成员 <b>{org.member_count}</b></span>
                  <span>项目 <b>{org.project_count}</b></span>
                  <span>任务 <b>{org.task_count}</b></span>
                  <span>Tokens <b>{formatNumber(org.total_tokens)}</b></span>
                  <span>成本 <b>${Number(org.total_cost_usd).toFixed(4)}</b></span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <select value={org.subscription_plan} onChange={(event) => void updateOrgPlan(org, event.target.value)} className="border border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] px-3 py-2 text-xs font-black outline-none">
                  <option value="free">free</option>
                  <option value="pro">pro</option>
                  <option value="enterprise">enterprise</option>
                </select>
                <div className="text-right">
                  <div className="text-[10px] font-black uppercase text-[var(--editorial-text-gray)]">测试额度余额</div>
                  <div className="text-2xl font-black">${Number(org.credit_balance_usd).toFixed(2)}</div>
                </div>
                <button type="button" onClick={() => void grantCredit(org)} className="inline-flex items-center gap-2 border border-[var(--editorial-stroke)] bg-[var(--brand-accent)] px-4 py-2 text-xs font-black text-black">
                  <Coins className="h-4 w-4" />发放额度
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {activeTab === 'invites' && (
        <div className="mt-4 grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
          <section className="border border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] p-4 shadow-[4px_4px_0_var(--editorial-stroke)]">
            <h3 className="text-lg font-black">创建测试邀请码</h3>
            <p className="mt-1 text-xs leading-relaxed text-[var(--editorial-text-gray)]">邀请码只保存 hash。创建后后台不会再显示明文，所以这里输入后你需要自己记录。</p>
            <div className="mt-4 grid gap-3">
              <label className="grid gap-1 text-xs font-black">明文邀请码<input value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} className="border border-[var(--editorial-stroke)] bg-[var(--surface-elevated)] px-3 py-2 font-mono outline-none" placeholder="例如 SEED-2026-A01" /></label>
              <label className="grid gap-1 text-xs font-black">标签<input value={inviteLabel} onChange={(event) => setInviteLabel(event.target.value)} className="border border-[var(--editorial-stroke)] bg-[var(--surface-elevated)] px-3 py-2 outline-none" /></label>
              <label className="grid gap-1 text-xs font-black">可用次数<input value={inviteMaxUses} onChange={(event) => setInviteMaxUses(event.target.value)} className="border border-[var(--editorial-stroke)] bg-[var(--surface-elevated)] px-3 py-2 outline-none" /></label>
              <button type="button" onClick={() => void createInvite()} className="border border-[var(--editorial-stroke)] bg-[var(--brand-accent)] px-4 py-2 text-xs font-black text-black">生成邀请码</button>
            </div>
          </section>
          <section className="border border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] p-4">
            <h3 className="mb-3 text-lg font-black">邀请码记录</h3>
            <div className="grid gap-2">
              {invites.map((invite) => (
                <div key={invite.id} className="grid gap-2 border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-3 text-xs md:grid-cols-[minmax(0,1fr)_150px_100px_120px]">
                  <div><b>{invite.label}</b><p className="mt-1 text-[var(--editorial-text-gray)]">{invite.code_hash_preview}</p></div>
                  <span>{invite.used_count} / {invite.max_uses}</span>
                  <span>{invite.is_active ? '启用' : '停用'}</span>
                  <span>{formatDate(invite.created_at)}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {activeTab === 'logs' && (
        <div className="mt-4 grid gap-4">
          <section className="border border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-black"><Activity className="h-4 w-4" />审计日志</h3>
            <div className="grid gap-2">{auditLogs.map((log) => <div key={log.id} className="border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-3 text-xs"><div className="flex justify-between gap-2"><b>{log.action}</b><span>{formatDate(log.created_at)}</span></div><p className="mt-1 text-[var(--editorial-text-gray)]">{log.actor || '-'} · {log.organization || '-'} · {log.target_type}#{log.target_id}</p></div>)}</div>
          </section>
        </div>
      )}

      {activeTab === 'pro-invites' && (
        <div className="mt-4 grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
          <section className="border border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] p-4 shadow-[4px_4px_0_var(--editorial-stroke)]">
            <h3 className="text-lg font-black">创建 Pro 邀请码</h3>
            <p className="mt-1 text-xs leading-relaxed text-[var(--editorial-text-gray)]">Pro 邀请码由系统随机生成，管理员只需要填写 label 用于记忆。明文 code 只会在创建成功后显示一次。</p>
            {generatedProInviteCode ? (
              <div className="mt-4 border border-emerald-600 bg-emerald-50 p-3 text-xs">
                <span className="font-black text-emerald-700">刚生成的 Pro 邀请码</span>
                <div className="mt-2 select-all border border-emerald-600 bg-white px-3 py-2 font-mono text-base font-black tracking-wider text-emerald-800">{generatedProInviteCode}</div>
              </div>
            ) : null}
            <div className="mt-4 grid gap-3">
              <label className="grid gap-1 text-xs font-black">标签<input value={proInviteLabel} onChange={(event) => setProInviteLabel(event.target.value)} className="border border-[var(--editorial-stroke)] bg-[var(--surface-elevated)] px-3 py-2 outline-none" /></label>
              <label className="grid gap-1 text-xs font-black">可用次数<input value={proInviteMaxUses} onChange={(event) => setProInviteMaxUses(event.target.value)} className="border border-[var(--editorial-stroke)] bg-[var(--surface-elevated)] px-3 py-2 outline-none" /></label>
              <button type="button" onClick={() => void createProInvite()} className="border border-[var(--editorial-stroke)] bg-[var(--brand-accent)] px-4 py-2 text-xs font-black text-black">随机生成 Pro 邀请码</button>
            </div>
          </section>
          <section className="border border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] p-4">
            <h3 className="mb-3 text-lg font-black">Pro 邀请码记录</h3>
            <div className="grid gap-2">
              {proInvites.map((invite) => (
                <div key={invite.id} className="grid gap-2 border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-3 text-xs lg:grid-cols-[minmax(0,1fr)_120px_80px_210px]">
                  <div>
                    {editingProInviteId === invite.id ? (
                      <input value={editingProInviteLabel} onChange={(event) => setEditingProInviteLabel(event.target.value)} className="w-full border border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] px-2 py-1 font-black outline-none" />
                    ) : (
                      <b>{invite.label}</b>
                    )}
                    <p className="mt-1 text-[var(--editorial-text-gray)]">{invite.code_hash_preview}</p>
                    <p className="mt-1 text-[var(--editorial-text-gray)]">{formatDate(invite.created_at)}</p>
                  </div>
                  <div>
                    {editingProInviteId === invite.id ? (
                      <input value={editingProInviteMaxUses} onChange={(event) => setEditingProInviteMaxUses(event.target.value)} className="w-full border border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] px-2 py-1 outline-none" />
                    ) : (
                      <span>{invite.used_count} / {invite.max_uses}</span>
                    )}
                  </div>
                  <span>{invite.is_active ? '启用' : '停用'}</span>
                  <div className="flex flex-wrap gap-2">
                    {editingProInviteId === invite.id ? (
                      <>
                        <button type="button" onClick={() => void updateProInvite(invite)} className="border border-[var(--editorial-stroke)] px-2 py-1 font-black">保存</button>
                        <button type="button" onClick={() => setEditingProInviteId(null)} className="border border-[var(--editorial-stroke)] px-2 py-1">取消</button>
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={() => startEditProInvite(invite)} className="border border-[var(--editorial-stroke)] px-2 py-1">编辑</button>
                        <button type="button" onClick={() => void updateProInvite(invite, { is_active: !invite.is_active })} className="border border-[var(--editorial-stroke)] px-2 py-1">{invite.is_active ? '停用' : '启用'}</button>
                        <button type="button" onClick={() => void deleteProInvite(invite)} className="border border-red-600 px-2 py-1 text-red-700">删除</button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {activeTab === 'enterprise' && (
        <div className="mt-4 border border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] p-4 shadow-[4px_4px_0_var(--editorial-stroke)]">
          <h3 className="mb-3 text-lg font-black">企业定制需求</h3>
          <div className="grid gap-2">
            {enterpriseRequests.length === 0 ? (
              <p className="text-xs text-[var(--editorial-text-gray)]">暂无企业定制需求。</p>
            ) : enterpriseRequests.map((request) => (
              <div key={request.id} className="grid gap-3 border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-3 text-xs lg:grid-cols-[minmax(0,1.2fr)_180px_150px_100px]">
                <div>
                  <b>{request.company_name}</b>
                  <p className="mt-1 text-[var(--editorial-text-gray)]">{request.requirements || '未填写详细需求'}</p>
                </div>
                <div>
                  <b>{request.contact_name}</b>
                  <p className="mt-1 text-[var(--editorial-text-gray)]">{request.contact_email}</p>
                  {request.contact_phone ? <p className="text-[var(--editorial-text-gray)]">{request.contact_phone}</p> : null}
                </div>
                <div>
                  <span>{request.username}</span>
                  <p className="mt-1 text-[var(--editorial-text-gray)]">{request.organization || '无组织'}</p>
                </div>
                <div className="flex flex-col gap-1">
                  <StatusPill status={request.status} />
                  <span className="text-[var(--editorial-text-gray)]">{formatDate(request.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'moderation' && (
        <div className="mt-4 grid gap-4">
          <section className="grid gap-3 border border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] p-4 shadow-[4px_4px_0_var(--editorial-stroke)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 text-lg font-black"><ShieldCheck className="h-5 w-5" />社区内容审核</h3>
                <p className="mt-1 text-xs text-[var(--editorial-text-gray)]">公开发布默认通过。ROOT 可在此驳回作品：社区隐藏，原记录保留，并归档到所属项目资产库。</p>
              </div>
              {communityCounts ? (
                <div className="flex flex-wrap gap-2 text-[10px] font-black uppercase">
                  <span className="border border-[var(--editorial-stroke)] px-2 py-1">总计 {communityCounts.total}</span>
                  <span className="border border-emerald-600 px-2 py-1 text-emerald-700">通过 {communityCounts.approved}</span>
                  <span className="border border-red-600 px-2 py-1 text-red-700">驳回 {communityCounts.rejected}</span>
                  <span className="border border-amber-600 px-2 py-1 text-amber-700">被举报 {communityCounts.reported}</span>
                  <span className="border border-[var(--editorial-stroke)] px-2 py-1">隐藏 {communityCounts.hidden}</span>
                </div>
              ) : null}
            </div>
            <div className="grid gap-2 md:grid-cols-[160px_160px_auto_minmax(0,1fr)]">
              <select value={reviewStatusFilter} onChange={(event) => setReviewStatusFilter(event.target.value)} className="border border-[var(--editorial-stroke)] bg-[var(--surface-elevated)] px-3 py-2 text-xs font-black outline-none">
                <option value="">全部审核状态</option>
                <option value="approved">approved</option>
                <option value="rejected">rejected</option>
                <option value="pending">pending</option>
                <option value="flagged">flagged</option>
              </select>
              <select value={moderationStatusFilter} onChange={(event) => setModerationStatusFilter(event.target.value)} className="border border-[var(--editorial-stroke)] bg-[var(--surface-elevated)] px-3 py-2 text-xs font-black outline-none">
                <option value="">全部展示状态</option>
                <option value="visible">visible</option>
                <option value="hidden">hidden</option>
                <option value="removed">removed</option>
              </select>
              <label className="inline-flex items-center gap-2 border border-[var(--editorial-stroke)] bg-[var(--surface-elevated)] px-3 py-2 text-xs font-black">
                <input type="checkbox" checked={reportedOnly} onChange={(event) => setReportedOnly(event.target.checked)} />
                仅看被举报
              </label>
              <span className="self-center text-xs text-[var(--editorial-text-gray)]">可使用顶部搜索框按标题、作者、组织筛选。</span>
            </div>
          </section>

          <section className="grid gap-3">
            {communityCreations.length === 0 ? (
              <div className="border border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] p-6 text-sm text-[var(--editorial-text-gray)]">当前筛选条件下没有社区作品。</div>
            ) : communityCreations.map((item) => (
              <article key={item.id} className="grid gap-4 border border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] p-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-base font-black">{item.title}</h4>
                    <StatusPill status={item.review_status} />
                    <StatusPill status={item.moderation_status} />
                    {item.reported_count > 0 ? <span className="border border-red-600 px-2 py-0.5 text-[10px] font-black text-red-700">举报 {item.reported_count}</span> : null}
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-[var(--editorial-text-gray)]">{item.content_preview || '（无正文预览）'}</p>
                  <div className="mt-3 grid gap-1 text-[11px] text-[var(--editorial-text-gray)]">
                    <span>作者 {item.username} · {item.creation_type_display} · {item.visibility}</span>
                    <span>组织 {item.organization_name || item.organization || '—'} · 项目 {item.project_name || item.project || '—'}</span>
                    <span>发布 {formatDate(item.published_at)} · 创建 {formatDate(item.created_at)}</span>
                    {item.rejected_asset_id ? <span>已归档资产 #{item.rejected_asset_id}</span> : null}
                    {item.takedown_reason ? <span>原因：{item.takedown_reason}</span> : null}
                  </div>
                </div>
                <div className="grid gap-2 self-start border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-3">
                  <label className="grid gap-1 text-[10px] font-black uppercase">
                    审核备注
                    <textarea
                      value={moderationReasons[item.id] || ''}
                      onChange={(event) => setModerationReasons((prev) => ({ ...prev, [item.id]: event.target.value }))}
                      rows={3}
                      className="border border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] px-3 py-2 text-xs outline-none"
                      placeholder="驳回原因，会写入项目资产 metadata"
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => void moderateCommunityCreation(item, 'rejected')} className="inline-flex items-center gap-1 border border-red-600 px-3 py-2 text-xs font-black text-red-700">
                      <Ban className="h-3.5 w-3.5" />驳回并归档
                    </button>
                    <button type="button" onClick={() => void moderateCommunityCreation(item, 'approved')} className="inline-flex items-center gap-1 border border-emerald-600 px-3 py-2 text-xs font-black text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5" />恢复通过
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </section>
        </div>
      )}

      {activeTab === 'security' && (
        <div className="mt-4 grid gap-4">
          <section className="border border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-black"><ShieldAlert className="h-4 w-4" />安全事件</h3>
            <div className="grid gap-2">{securityLogs.map((log) => <div key={log.id} className="border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-3 text-xs"><div className="flex justify-between gap-2"><b>{log.event_type}</b><span>{formatDate(log.created_at)}</span></div><p className="mt-1 text-[var(--editorial-text-gray)]">{log.email || log.user || '-'} · {log.ip_address || '-'} · risk {log.risk_level}</p></div>)}</div>
          </section>
        </div>
      )}
    </div>
  );
}
