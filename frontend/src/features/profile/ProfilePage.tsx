import { type FormEvent, type ReactNode, useMemo, useState } from 'react';
import {
  CalendarDays,
  ExternalLink,
  Heart,
  ImageIcon,
  Link as LinkIcon,
  Loader2,
  MapPin,
  Mic,
  PenLine,
  Save,
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

const CREATION_FILTERS: Array<{ id: CreationFilter; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'copy', label: '文案' },
  { id: 'image', label: '图片' },
  { id: 'storyboard', label: '分镜' },
  { id: 'audio', label: '音频' },
  { id: 'video', label: '视频' },
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

function initials(name: string) {
  const text = name.trim();
  if (!text) return 'MH';
  return text.slice(0, 2).toUpperCase();
}

function summary(item: CommunityItem) {
  if (item.creation_type === 'copy') return item.content.paragraphs?.[0] || item.content.call_to_action || item.content.title || item.title;
  if (item.creation_type === 'image') return item.content.revised_prompt || item.content.prompt || '视觉提示词模板';
  if (item.creation_type === 'storyboard') return item.content.scenes?.[0]?.visual_description || item.content.video_topic || '短视频分镜结构';
  if (item.creation_type === 'audio') return item.content.text || `约 ${item.content.estimated_audio_duration_seconds || '-'} 秒口播模板`;
  if (item.creation_type === 'video') return item.content.prompt || item.content.video_topic || '视频生成模板';
  return item.title;
}

export function ProfilePage({ username, currentUsername, triggerToast }: ProfilePageProps) {
  const { data, loading, saving, error, setError, saveProfile } = useProfile(username);
  const [filter, setFilter] = useState<CreationFilter>('all');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_PROFILE);
  const [specialtyInput, setSpecialtyInput] = useState('');
  const profile = data?.profile;
  const isOwner = Boolean(data?.is_owner || (!username && currentUsername && profile?.username === currentUsername));

  function openEditor() {
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
    setDrawerOpen(true);
  }

  const creations = useMemo(() => {
    const items = data?.creations ?? [];
    if (filter === 'all') return items;
    return items.filter((item) => item.creation_type === filter);
  }, [data?.creations, filter]);

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

  return (
    <div className="profile-page">
      <section className="profile-hero">
        <div
          className="profile-hero__banner"
          style={profile.banner_url ? { backgroundImage: `url(${profile.banner_url})` } : undefined}
        />
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
              {isOwner ? (
                <button type="button" className="profile-action" onClick={openEditor}>
                  <PenLine className="h-4 w-4" />
                  编辑资料
                </button>
              ) : null}
            </div>
            {profile.headline ? <p className="profile-hero__headline">{profile.headline}</p> : null}
            {profile.bio ? <p className="profile-hero__bio">{profile.bio}</p> : null}
            <div className="profile-hero__meta">
              {profile.location ? <span><MapPin className="h-3.5 w-3.5" />{profile.location}</span> : null}
              {profile.website_url ? (
                <a href={profile.website_url} target="_blank" rel="noreferrer">
                  <LinkIcon className="h-3.5 w-3.5" />{profile.website_url.replace(/^https?:\/\//, '')}
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

      <section className="profile-stats" aria-label="创作者数据">
        <StatCard label="作品" value={data.stats.creation_count} icon={<ImageIcon className="h-4 w-4" />} />
        <StatCard label="获赞" value={data.stats.total_likes} icon={<Heart className="h-4 w-4" />} />
        <StatCard label="常用类型" value={data.stats.favorite_type_display || '暂无'} icon={<Tags className="h-4 w-4" />} />
        <StatCard label="最近发布" value={formatDate(data.stats.latest_published_at)} icon={<CalendarDays className="h-4 w-4" />} />
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

      <section className="profile-wall">
        <div className="profile-wall__head">
          <div>
            <h3>作品墙</h3>
            <p>{creations.length} 件公开创作</p>
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

        {creations.length > 0 ? (
          <div className="profile-grid">
            {creations.map((item) => <ProfileCreationCard key={item.id} item={item} />)}
          </div>
        ) : (
          <div className="profile-empty">
            <Wand2 className="h-8 w-8" />
            <h4>暂无作品</h4>
          </div>
        )}
      </section>

      {drawerOpen ? (
        <div className="profile-drawer" role="dialog" aria-modal="true" aria-label="编辑资料">
          <button type="button" className="profile-drawer__scrim" onClick={() => setDrawerOpen(false)} aria-label="关闭编辑资料" />
          <form className="profile-drawer__panel" onSubmit={handleSave}>
            <header>
              <div>
                <p>Creator Profile</p>
                <h3>编辑资料</h3>
              </div>
              <button type="button" onClick={() => setDrawerOpen(false)} aria-label="关闭">
                <X className="h-4 w-4" />
              </button>
            </header>

            {error ? <div className="profile-form-error">{error}</div> : null}

            <label>
              昵称
              <input value={form.display_name} onChange={(event) => setForm((prev) => ({ ...prev, display_name: event.target.value }))} maxLength={80} />
            </label>
            <label>
              职业标题
              <input value={form.headline} onChange={(event) => setForm((prev) => ({ ...prev, headline: event.target.value }))} maxLength={120} />
            </label>
            <label>
              简介
              <textarea value={form.bio} onChange={(event) => setForm((prev) => ({ ...prev, bio: event.target.value }))} maxLength={500} rows={5} />
            </label>
            <div className="profile-form-grid">
              <label>
                位置
                <input value={form.location} onChange={(event) => setForm((prev) => ({ ...prev, location: event.target.value }))} maxLength={80} />
              </label>
              <label>
                主页链接
                <input value={form.website_url} onChange={(event) => setForm((prev) => ({ ...prev, website_url: event.target.value }))} />
              </label>
            </div>
            <label>
              头像 URL
              <input value={form.avatar_url} onChange={(event) => setForm((prev) => ({ ...prev, avatar_url: event.target.value }))} />
            </label>
            <label>
              封面 URL
              <input value={form.banner_url} onChange={(event) => setForm((prev) => ({ ...prev, banner_url: event.target.value }))} />
            </label>
            <label>
              擅长领域
              <input
                value={specialtyInput}
                onChange={(event) => setSpecialtyInput(event.target.value)}
              />
            </label>

            <div className="profile-social-editor">
              <div className="profile-social-editor__head">
                <span>社交链接</span>
                <button
                  type="button"
                  onClick={() => setForm((prev) => ({
                    ...prev,
                    social_links: [...prev.social_links, { label: '', url: '' }].slice(0, 5),
                  }))}
                >
                  添加
                </button>
              </div>
              {form.social_links.map((link, index) => (
                <div className="profile-social-row" key={index}>
                  <input value={link.label} onChange={(event) => updateSocialLink(index, 'label', event.target.value)} placeholder="平台" />
                  <input value={link.url} onChange={(event) => updateSocialLink(index, 'url', event.target.value)} placeholder="https://..." />
                  <button
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, social_links: prev.social_links.filter((_, itemIndex) => itemIndex !== index) }))}
                    aria-label="删除社交链接"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <button type="submit" className="profile-save" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              保存资料
            </button>
          </form>
        </div>
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

function ProfileCreationCard({ item }: { item: CommunityItem }) {
  return (
    <article className="profile-creation">
      <CreationVisual item={item} />
      <div className="profile-creation__body">
        <div className="profile-creation__meta">
          <span>{item.creation_type_display}</span>
          <span><Heart className="h-3.5 w-3.5" />{item.likes}</span>
        </div>
        <h4>{item.title}</h4>
        <p>{summary(item)}</p>
      </div>
    </article>
  );
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
