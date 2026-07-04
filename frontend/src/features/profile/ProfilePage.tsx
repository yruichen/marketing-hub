import { type FormEvent, type ReactNode, useMemo, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  Globe2,
  Heart,
  ImageIcon,
  Link as LinkIcon,
  Loader2,
  MapPin,
  Mic,
  PenLine,
  Save,
  Settings2,
  ShieldCheck,
  Sparkles,
  Star,
  Tags,
  UserRound,
  Video,
  Wand2,
  X,
} from 'lucide-react';
import type { CommunityItem } from '../community';
import { useProfile, type CreatorProfile, type CreatorSocialLink } from './useProfile';
import './profile.css';

type ProfilePageProps = {
  username?: string | null;
  currentUsername: string | null;
  triggerToast: (text: string, type?: 'success' | 'info' | 'error') => void;
};

type CreationFilter = 'all' | CommunityItem['creation_type'];
type EditorSection = 'basics' | 'visuals' | 'links' | 'display';

const CREATION_FILTERS: Array<{ id: CreationFilter; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'copy', label: '文案' },
  { id: 'image', label: '图片' },
  { id: 'storyboard', label: '分镜' },
  { id: 'audio', label: '音频' },
  { id: 'video', label: '视频' },
];

const EDITOR_SECTIONS: Array<{ id: EditorSection; label: string }> = [
  { id: 'basics', label: '资料' },
  { id: 'visuals', label: '视觉' },
  { id: 'links', label: '链接' },
  { id: 'display', label: '展示' },
];

const EMPTY_PROFILE: Pick<
  CreatorProfile,
  'display_name' | 'headline' | 'bio' | 'location' | 'website_url' | 'avatar_url' | 'banner_url' | 'specialties' | 'social_links' | 'profile_visibility'
> = {
  display_name: '',
  headline: '',
  bio: '',
  location: '',
  website_url: '',
  avatar_url: '',
  banner_url: '',
  specialties: [],
  social_links: [],
  profile_visibility: 'workspace',
};

function formatDate(value?: string | null) {
  if (!value) return '暂无';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '暂无';
  return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' }).format(date);
}

function formatDateTime(value?: string | null) {
  if (!value) return '未发布';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 16);
  return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}

function initials(name: string) {
  const text = name.trim();
  if (!text) return 'MH';
  return text.slice(0, 2).toUpperCase();
}

function compactUrl(value: string) {
  return value.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

function summary(item: CommunityItem) {
  if (item.creation_type === 'copy') return item.content.paragraphs?.[0] || item.content.call_to_action || item.content.title || item.title;
  if (item.creation_type === 'image') return item.content.revised_prompt || item.content.prompt || '视觉提示词模板';
  if (item.creation_type === 'storyboard') return item.content.scenes?.[0]?.visual_description || item.content.video_topic || '短视频分镜结构';
  if (item.creation_type === 'audio') return item.content.text || `约 ${item.content.estimated_audio_duration_seconds || '-'} 秒口播模板`;
  if (item.creation_type === 'video') return item.content.prompt || item.content.video_topic || '视频生成模板';
  return item.title;
}

function completionScore(profile: CreatorProfile) {
  const checks = [
    profile.display_name,
    profile.headline,
    profile.bio,
    profile.avatar_url,
    profile.banner_url,
    profile.location,
    profile.website_url,
    profile.specialties.length > 0,
    profile.social_links.length > 0,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

function isFeatured(item: CommunityItem) {
  return Boolean(item.metadata?.profile_featured);
}

export function ProfilePage({ username, currentUsername, triggerToast }: ProfilePageProps) {
  const { data, loading, saving, error, setError, saveProfile, updateProfileCreation } = useProfile(username);
  const [filter, setFilter] = useState<CreationFilter>('all');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editorSection, setEditorSection] = useState<EditorSection>('basics');
  const [form, setForm] = useState(EMPTY_PROFILE);
  const [specialtyInput, setSpecialtyInput] = useState('');
  const profile = data?.profile;
  const isOwner = Boolean(data?.is_owner || (!username && currentUsername && profile?.username === currentUsername));

  const featuredCreations = useMemo(() => data?.featured_creations ?? [], [data?.featured_creations]);
  const featuredIds = useMemo(() => new Set(featuredCreations.map((item) => item.id)), [featuredCreations]);
  const wallItems = useMemo(() => {
    const items = (data?.creations ?? []).filter((item) => !featuredIds.has(item.id));
    if (filter === 'all') return items;
    return items.filter((item) => item.creation_type === filter);
  }, [data?.creations, featuredIds, filter]);

  function openEditor(section: EditorSection = 'basics') {
    if (!profile) return;
    setForm({
      display_name: profile.display_name,
      headline: profile.headline,
      bio: profile.bio,
      location: profile.location,
      website_url: profile.website_url,
      avatar_url: profile.avatar_url,
      banner_url: profile.banner_url,
      specialties: profile.specialties || [],
      social_links: profile.social_links || [],
      profile_visibility: profile.profile_visibility,
    });
    setSpecialtyInput((profile.specialties || []).join(', '));
    setEditorSection(section);
    setDrawerOpen(true);
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    try {
      await saveProfile({
        ...form,
        specialties: specialtyInput.split(',').map((item) => item.trim()).filter(Boolean),
      });
      setDrawerOpen(false);
      triggerToast('个人主页已更新', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : '资料保存失败';
      setError(message);
      triggerToast(message, 'error');
    }
  }

  async function handleFeatured(item: CommunityItem, featured: boolean) {
    try {
      await updateProfileCreation(item.id, {
        profile_featured: featured,
        profile_featured_rank: featured ? Math.min(featuredCreations.length + 1, 3) : undefined,
      });
      triggerToast(featured ? '已加入精选作品' : '已从精选移除', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : '作品展示设置失败';
      triggerToast(message, 'error');
    }
  }

  async function copyProfileLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      triggerToast('主页链接已复制', 'success');
    } catch {
      triggerToast('复制失败，请手动复制地址栏链接', 'error');
    }
  }

  function updateSocialLink(index: number, key: keyof CreatorSocialLink, value: string) {
    setForm((prev) => ({
      ...prev,
      social_links: prev.social_links.map((link, itemIndex) => (
        itemIndex === index ? { ...link, [key]: value } : link
      )),
    }));
  }

  if (loading && !data) {
    return (
      <div className="profile-page profile-page--center">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>个人主页加载中...</span>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="profile-page profile-page--center">
        <UserRound className="h-8 w-8" />
        <h2>{error || '没有找到这个创作者'}</h2>
      </div>
    );
  }

  if (data?.is_private && !isOwner) {
    return (
      <div className="profile-page profile-page--center profile-page--private">
        <EyeOff className="h-9 w-9" />
        <h2>{profile.display_name} 的主页暂未公开</h2>
        <p>@{profile.username} 当前将个人主页设为私密。</p>
      </div>
    );
  }

  const score = completionScore(profile);
  const hasFeatured = featuredCreations.length > 0;

  return (
    <div className="profile-page">
      <section className="profile-hero">
        <div className="profile-hero__banner" style={profile.banner_url ? { backgroundImage: `url(${profile.banner_url})` } : undefined}>
          <div className="profile-hero__banner-scrim" />
          <div className="profile-hero__tools">
            <span><Globe2 className="h-3.5 w-3.5" />{profile.profile_visibility === 'private' ? '私密主页' : '工作区可见'}</span>
            {isOwner ? (
              <button type="button" onClick={() => openEditor('display')}>
                <Settings2 className="h-3.5 w-3.5" />展示设置
              </button>
            ) : null}
          </div>
        </div>

        <div className="profile-hero__body">
          <div className="profile-avatar" aria-label={profile.display_name}>
            {profile.avatar_url ? <img src={profile.avatar_url} alt={profile.display_name} /> : <span>{initials(profile.display_name)}</span>}
          </div>
          <div className="profile-hero__main">
            <div className="profile-hero__heading">
              <div>
                <p className="profile-hero__username">@{profile.username}</p>
                <h2>{profile.display_name}</h2>
              </div>
              <div className="profile-actions">
                <button type="button" className="profile-action profile-action--ghost" onClick={copyProfileLink}>
                  <LinkIcon className="h-4 w-4" />复制链接
                </button>
                {isOwner ? (
                  <button type="button" className="profile-action" onClick={() => openEditor('basics')}>
                    <PenLine className="h-4 w-4" />编辑资料
                  </button>
                ) : null}
              </div>
            </div>

            {profile.headline ? <p className="profile-hero__headline">{profile.headline}</p> : null}
            {profile.bio ? <p className="profile-hero__bio">{profile.bio}</p> : null}

            <div className="profile-hero__meta">
              {profile.location ? <span><MapPin className="h-3.5 w-3.5" />{profile.location}</span> : null}
              {profile.website_url ? (
                <a href={profile.website_url} target="_blank" rel="noreferrer">
                  <LinkIcon className="h-3.5 w-3.5" />{compactUrl(profile.website_url)}
                </a>
              ) : null}
              <span><CalendarDays className="h-3.5 w-3.5" />最近 {formatDate(data.stats.latest_published_at)}</span>
            </div>

            {profile.specialties.length > 0 ? (
              <div className="profile-tags">
                {profile.specialties.map((tag) => <span key={tag}>{tag}</span>)}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="profile-dashboard">
        <div className="profile-stats" aria-label="创作者数据">
          <StatCard label="公开作品" value={data.stats.creation_count} icon={<ImageIcon className="h-4 w-4" />} />
          <StatCard label="获赞" value={data.stats.total_likes} icon={<Heart className="h-4 w-4" />} />
          <StatCard label="常用类型" value={data.stats.favorite_type_display || '暂无'} icon={<Tags className="h-4 w-4" />} />
          <StatCard label="最近发布" value={formatDate(data.stats.latest_published_at)} icon={<CalendarDays className="h-4 w-4" />} />
        </div>
        {isOwner ? (
          <aside className="profile-completion">
            <div>
              <span>资料完成度</span>
              <strong>{score}%</strong>
            </div>
            <div className="profile-completion__bar"><span style={{ width: `${score}%` }} /></div>
            <p>{score >= 80 ? '主页已经具备完整作品集观感。' : '补充头像、封面、简介和链接后，访客更容易判断你的创作方向。'}</p>
          </aside>
        ) : null}
      </section>

      {profile.social_links.length > 0 ? (
        <section className="profile-links" aria-label="社交链接">
          {profile.social_links.map((link) => (
            <a key={`${link.label}-${link.url}`} href={link.url} target="_blank" rel="noreferrer">
              {link.label}<ExternalLink className="h-3.5 w-3.5" />
            </a>
          ))}
        </section>
      ) : null}

      <section className="profile-showcase">
        <div className="profile-section-head">
          <div>
            <span><Star className="h-3.5 w-3.5" />Featured</span>
            <h3>精选作品</h3>
          </div>
          {isOwner ? <p>最多精选 3 个作品，优先展示在主页首屏下方。</p> : null}
        </div>
        {hasFeatured ? (
          <div className="profile-featured-grid">
            {featuredCreations.map((item) => (
              <ProfileCreationCard
                key={item.id}
                item={item}
                featured
                isOwner={isOwner}
                saving={saving}
                onFeaturedChange={handleFeatured}
              />
            ))}
          </div>
        ) : (
          <div className="profile-empty profile-empty--compact">
            <Sparkles className="h-7 w-7" />
            <h4>{isOwner ? '还没有精选作品' : '创作者还没有设置精选作品'}</h4>
            {isOwner ? <p>从下方作品墙选择 3 个最能代表你的内容。</p> : null}
          </div>
        )}
      </section>

      <section className="profile-wall">
        <div className="profile-wall__head">
          <div>
            <span>Portfolio</span>
            <h3>作品墙</h3>
            <p>{wallItems.length} 件作品 · 精选作品已置顶展示</p>
          </div>
          <div className="profile-wall__filters">
            {CREATION_FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={filter === item.id ? 'is-active' : ''}
                onClick={() => setFilter(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {wallItems.length > 0 ? (
          <div className="profile-grid">
            {wallItems.map((item) => (
              <ProfileCreationCard
                key={item.id}
                item={item}
                isOwner={isOwner}
                saving={saving}
                onFeaturedChange={handleFeatured}
              />
            ))}
          </div>
        ) : (
          <div className="profile-empty">
            <Wand2 className="h-8 w-8" />
            <h4>{filter === 'all' ? '暂无作品' : '这个类型还没有作品'}</h4>
            {isOwner ? <p>从生成结果分享公开内容后，作品会出现在这里。</p> : null}
          </div>
        )}
      </section>

      {drawerOpen ? (
        <ProfileEditorDrawer
          error={error}
          form={form}
          saving={saving}
          section={editorSection}
          specialtyInput={specialtyInput}
          onClose={() => setDrawerOpen(false)}
          onFormChange={setForm}
          onSave={handleSave}
          onSectionChange={setEditorSection}
          onSpecialtyInputChange={setSpecialtyInput}
          onSocialLinkChange={updateSocialLink}
        />
      ) : null}
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string | number; icon: ReactNode }) {
  return (
    <div className="profile-stat">
      <span>{icon}</span>
      <p>{label}</p>
      <strong>{value}</strong>
    </div>
  );
}

function ProfileCreationCard({
  item,
  featured = false,
  isOwner,
  saving,
  onFeaturedChange,
}: {
  item: CommunityItem;
  featured?: boolean;
  isOwner: boolean;
  saving: boolean;
  onFeaturedChange: (item: CommunityItem, featured: boolean) => void;
}) {
  return (
    <article className={`profile-creation ${featured ? 'profile-creation--featured' : ''}`}>
      <CreationVisual item={item} />
      <div className="profile-creation__body">
        <div className="profile-creation__meta">
          <span>{item.creation_type_display}</span>
          <span><Heart className="h-3.5 w-3.5" />{item.likes}</span>
        </div>
        <h4>{item.title}</h4>
        <p>{summary(item)}</p>
        <footer className="profile-creation__footer">
          <span>{formatDateTime(item.published_at || item.created_at)}</span>
          {isOwner ? <VisibilityBadge item={item} /> : null}
        </footer>
        {isOwner ? (
          <button
            type="button"
            className={`profile-feature-toggle ${featured || isFeatured(item) ? 'is-active' : ''}`}
            disabled={saving}
            onClick={() => onFeaturedChange(item, !(featured || isFeatured(item)))}
          >
            <Star className="h-3.5 w-3.5" />
            {featured || isFeatured(item) ? '取消精选' : '设为精选'}
          </button>
        ) : null}
      </div>
    </article>
  );
}

function VisibilityBadge({ item }: { item: CommunityItem }) {
  if (item.moderation_status && item.moderation_status !== 'visible') {
    return <span className="profile-badge profile-badge--warning"><ShieldCheck className="h-3 w-3" />{item.moderation_status}</span>;
  }
  if (item.visibility === 'public') return <span className="profile-badge"><Eye className="h-3 w-3" />公开</span>;
  if (item.visibility === 'organization') return <span className="profile-badge"><ShieldCheck className="h-3 w-3" />工作区</span>;
  return <span className="profile-badge"><EyeOff className="h-3 w-3" />私密</span>;
}

function CreationVisual({ item }: { item: CommunityItem }) {
  if (item.creation_type === 'image') {
    return (
      <div className="profile-creation__visual profile-creation__visual--image">
        {item.image_url ? <img src={item.image_url} alt={item.title} /> : <ImageIcon className="h-9 w-9" />}
      </div>
    );
  }
  if (item.creation_type === 'audio') {
    return (
      <div className="profile-creation__visual profile-creation__visual--audio">
        <Mic className="h-8 w-8" />
        <div className="profile-wave" aria-hidden="true">
          {Array.from({ length: 12 }).map((_, index) => <span key={index} style={{ height: `${24 + ((index * 19) % 58)}%` }} />)}
        </div>
      </div>
    );
  }
  if (item.creation_type === 'storyboard' || item.creation_type === 'video') {
    return (
      <div className="profile-creation__visual profile-creation__visual--video">
        <Video className="h-8 w-8" />
        <span>{item.creation_type === 'video' ? 'VIDEO' : 'STORY'}</span>
      </div>
    );
  }
  return (
    <div className="profile-creation__visual profile-creation__visual--copy">
      <PenLine className="h-8 w-8" />
      <span>{item.content.title || item.title}</span>
    </div>
  );
}

function ProfileEditorDrawer({
  error,
  form,
  saving,
  section,
  specialtyInput,
  onClose,
  onFormChange,
  onSave,
  onSectionChange,
  onSpecialtyInputChange,
  onSocialLinkChange,
}: {
  error: string;
  form: typeof EMPTY_PROFILE;
  saving: boolean;
  section: EditorSection;
  specialtyInput: string;
  onClose: () => void;
  onFormChange: React.Dispatch<React.SetStateAction<typeof EMPTY_PROFILE>>;
  onSave: (event: FormEvent) => void;
  onSectionChange: (section: EditorSection) => void;
  onSpecialtyInputChange: (value: string) => void;
  onSocialLinkChange: (index: number, key: keyof CreatorSocialLink, value: string) => void;
}) {
  return (
    <div className="profile-drawer" role="dialog" aria-modal="true" aria-label="编辑资料">
      <button type="button" className="profile-drawer__scrim" onClick={onClose} aria-label="关闭编辑资料" />
      <form className="profile-drawer__panel" onSubmit={onSave}>
        <header>
          <div>
            <p>Creator Profile</p>
            <h3>编辑个人主页</h3>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="profile-editor-preview">
          <div className="profile-editor-preview__banner" style={form.banner_url ? { backgroundImage: `url(${form.banner_url})` } : undefined} />
          <div className="profile-editor-preview__body">
            <div className="profile-editor-preview__avatar">
              {form.avatar_url ? <img src={form.avatar_url} alt={form.display_name || '头像预览'} /> : initials(form.display_name || 'MH')}
            </div>
            <div>
              <strong>{form.display_name || '你的昵称'}</strong>
              <span>{form.headline || '一句话说明你的创作方向'}</span>
            </div>
          </div>
        </div>

        <div className="profile-editor-tabs">
          {EDITOR_SECTIONS.map((item) => (
            <button key={item.id} type="button" className={section === item.id ? 'is-active' : ''} onClick={() => onSectionChange(item.id)}>
              {item.label}
            </button>
          ))}
        </div>

        {error ? <div className="profile-form-error">{error}</div> : null}

        {section === 'basics' ? (
          <div className="profile-editor-section">
            <FieldHint label="昵称" count={form.display_name.length} max={80}>
              <input value={form.display_name} onChange={(event) => onFormChange((prev) => ({ ...prev, display_name: event.target.value }))} maxLength={80} />
            </FieldHint>
            <FieldHint label="职业标题" count={form.headline.length} max={120}>
              <input value={form.headline} onChange={(event) => onFormChange((prev) => ({ ...prev, headline: event.target.value }))} maxLength={120} />
            </FieldHint>
            <FieldHint label="简介" count={form.bio.length} max={500}>
              <textarea value={form.bio} onChange={(event) => onFormChange((prev) => ({ ...prev, bio: event.target.value }))} maxLength={500} rows={5} />
            </FieldHint>
            <label>
              位置
              <input value={form.location} onChange={(event) => onFormChange((prev) => ({ ...prev, location: event.target.value }))} maxLength={80} />
            </label>
          </div>
        ) : null}

        {section === 'visuals' ? (
          <div className="profile-editor-section">
            <label>
              头像 URL
              <input value={form.avatar_url} onChange={(event) => onFormChange((prev) => ({ ...prev, avatar_url: event.target.value }))} placeholder="https://..." />
            </label>
            <label>
              封面 URL
              <input value={form.banner_url} onChange={(event) => onFormChange((prev) => ({ ...prev, banner_url: event.target.value }))} placeholder="https://..." />
            </label>
          </div>
        ) : null}

        {section === 'links' ? (
          <div className="profile-editor-section">
            <label>
              主页链接
              <input value={form.website_url} onChange={(event) => onFormChange((prev) => ({ ...prev, website_url: event.target.value }))} placeholder="https://..." />
            </label>
            <label>
              擅长领域
              <input value={specialtyInput} onChange={(event) => onSpecialtyInputChange(event.target.value)} placeholder="新品发布, 视觉 Prompt, 小红书" />
            </label>
            <div className="profile-social-editor">
              <div className="profile-social-editor__head">
                <span>社交链接</span>
                <button
                  type="button"
                  onClick={() => onFormChange((prev) => ({
                    ...prev,
                    social_links: [...prev.social_links, { label: '', url: '' }].slice(0, 5),
                  }))}
                >
                  添加
                </button>
              </div>
              {form.social_links.map((link, index) => (
                <div className="profile-social-row" key={index}>
                  <input value={link.label} onChange={(event) => onSocialLinkChange(index, 'label', event.target.value)} placeholder="平台" />
                  <input value={link.url} onChange={(event) => onSocialLinkChange(index, 'url', event.target.value)} placeholder="https://..." />
                  <button
                    type="button"
                    onClick={() => onFormChange((prev) => ({ ...prev, social_links: prev.social_links.filter((_, itemIndex) => itemIndex !== index) }))}
                    aria-label="删除社交链接"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {section === 'display' ? (
          <div className="profile-editor-section">
            <label>
              主页可见性
              <select value={form.profile_visibility} onChange={(event) => onFormChange((prev) => ({ ...prev, profile_visibility: event.target.value as CreatorProfile['profile_visibility'] }))}>
                <option value="workspace">工作区可见</option>
                <option value="private">私密</option>
              </select>
            </label>
            <div className="profile-editor-note">
              <CheckCircle2 className="h-4 w-4" />
              精选作品在作品卡片上设置，最多 3 个。私密主页仅自己可查看。
            </div>
          </div>
        ) : null}

        <button type="submit" className="profile-save" disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          保存资料
        </button>
      </form>
    </div>
  );
}

function FieldHint({ label, count, max, children }: { label: string; count: number; max: number; children: ReactNode }) {
  return (
    <label>
      <span className="profile-field-head"><span>{label}</span><span>{count}/{max}</span></span>
      {children}
    </label>
  );
}
