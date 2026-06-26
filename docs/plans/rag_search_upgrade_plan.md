# 搜索框 RAG 升级实施计划

版本：V1
日期：2026-06-26
范围：社区品牌灵感搜索框、`rag_search` 工作流节点、素材/项目/活动检索、后续可复用的检索增强生成基础设施

## 1. 背景与结论

当前 Marketing Hub 已经暴露了几类“RAG”入口：

- 前端社区页搜索框：`frontend/src/features/community/CommunityPage.tsx`
- 后端搜索接口：`backend/community/views.py` 的 `RAGSearchView`
- 工作流节点：`rag_search` / `retrieval`
- 任务类型：`GenerationTask.TASK_TYPES` 中的 `rag_search`

但当前实现仍是关键词匹配：

- `RAGSearchView` 遍历所有 `CommunityCreation`。
- 用 `query.split()` 对 `title/content/tags` 计数。
- `similarity_score` 是按命中词数人工拼出来的分数。
- `CommunityCreation.rag_indexed` 已存在，但没有真正的向量索引或 ingestion 流程。

核心结论：

1. 第一阶段不引入独立向量数据库。项目已有 PostgreSQL、Django、RBAC、Celery、审计、组织/项目/活动作用域；应优先用 PostgreSQL + pgvector，保持事务、备份、权限和迁移体系一致。
2. 本地开发继续保留 SQLite fallback，但必须明确标识为 `keyword_fallback`，不能再伪装为生产 RAG。
3. 搜索框不应只返回作品列表。它应返回“可解释的检索结果”：匹配来源、chunk 摘要、语义分、关键词分、rerank 分、来源引用、可直接复用的文案/视觉/分镜入口。
4. 检索链路采用 `hybrid retrieval -> rerank -> context compression -> response shaping`，而不是只做向量最近邻。
5. RAG 基础设施要复用于社区搜索、素材库搜索、工作流 `rag_search` 节点、全局助手和品牌记忆。

## 2. 调研摘要

### 2.1 OpenAI Embeddings

OpenAI 官方 embeddings 文档将 embedding 定义为把文本转换成数字向量，用于 search 等场景。当前第三代 embedding 模型包括 `text-embedding-3-small` 和 `text-embedding-3-large`；默认维度分别是 1536 和 3072，也支持通过 `dimensions` 参数降低向量维度，以在成本、存储、内存和检索效果之间折中。

对本项目的含义：

- 默认 embedding 模型选 `text-embedding-3-small`，维度 1536。
- 企业版或高价值知识库可以切到 `text-embedding-3-large`，但要单独评估成本和索引大小。
- 如果后续希望统一使用 `halfvec` 或降低索引体积，可通过 `dimensions=1024` 或 `dimensions=768` 做 A/B eval 后再迁移。

参考：

- https://developers.openai.com/api/docs/guides/embeddings

### 2.2 OpenAI Retrieval / Vector Stores

OpenAI Retrieval API 提供托管 semantic search，基于 vector stores，可对上传文件做语义检索，支持自然语言查询、返回 chunk、score、file origin，并支持 query rewriting 和 attribute filtering。

对本项目的含义：

- 不作为第一阶段主路径，因为当前系统的多租户、RBAC、项目/活动筛选、素材来源、审计、成本计量都在本地数据库中。
- 可作为 enterprise managed mode 或外部文档检索的第二阶段可选路径。
- 本地 pgvector 方案的数据结构要保留 `external_vector_store_id` / `external_file_id` 扩展位，避免未来切换时重构。

参考：

- https://developers.openai.com/api/docs/guides/retrieval

### 2.3 pgvector

pgvector 是 PostgreSQL 的开源向量相似度检索扩展，支持精确/近似最近邻、cosine/L2/inner product 等距离函数，并支持 HNSW、IVFFlat、halfvec、bit、sparsevec 等类型和索引策略。

对本项目的含义：

- 使用 `pgvector` + `pgvector-python` 的 Django 集成。
- 初始使用 `VectorField(dimensions=1536)` + HNSW cosine index。
- 数据量小于 10 万 chunk 时 HNSW 足够；大规模导入时可先无索引批量写入，再创建索引。
- 对过滤条件较多的多租户场景，要特别注意 approximate index 先扫描后过滤的问题；需要组织级过滤、partial index 或更高 `hnsw.ef_search`。

参考：

- https://github.com/pgvector/pgvector
- https://github.com/pgvector/pgvector-python

### 2.4 PostgreSQL Full Text Search

PostgreSQL Full Text Search 支持自然语言文档查询、相关性排序、`tsvector` / `tsquery`、GIN / GiST 索引。官方文档明确普通 `LIKE` / 正则搜索缺少语言归一化、排序和索引性能。

对本项目的含义：

- 中文、英文、品牌名、SKU、平台词、标签词需要关键词召回，不能完全依赖向量。
- 第一阶段做 hybrid search：`pgvector cosine` + `Postgres FTS/keyword`。
- 中文分词如果只用 PostgreSQL 内置配置会有限；MVP 可先用标签、标题、JSON 字段、简单 token 化，第二阶段再接 `jieba`/`pg_jieba` 或外部搜索。

参考：

- https://www.postgresql.org/docs/current/textsearch-intro.html
- https://www.postgresql.org/docs/current/textsearch-indexes.html

### 2.5 Reranking

Cohere 的 rerank 文档把 rerank 定位为提升关键词或向量搜索质量的第二阶段排序，尤其适合 RAG；可以保留现有 lexical / semantic 一阶段检索系统，再把候选结果交给 rerank endpoint。

对本项目的含义：

- 第一阶段先实现本地轻量 rerank：加权融合、字段权重、时间衰减、项目/活动权重。
- 第二阶段引入 provider adapter：`cohere_rerank`、`openai_judge_rerank` 或本地 cross-encoder。
- Rerank 必须可关闭，并记录成本和延迟。

参考：

- https://docs.cohere.com/docs/reranking-with-cohere

### 2.6 RAG Evaluation

Ragas 当前指标覆盖 RAG 常用评测，包括 Context Precision、Context Recall、Noise Sensitivity、Response Relevancy、Faithfulness、Context Relevance、Response Groundedness 等。

对本项目的含义：

- RAG 搜索上线前必须建立固定 eval set，不只看人工感觉。
- 检索评测和生成评测分开：先评 retrieved chunks 是否正确，再评生成回答是否忠实引用。
- 每次调整 chunk、embedding、rerank、prompt 都要跑 regression eval。

参考：

- https://docs.ragas.io/en/stable/concepts/metrics/

### 2.7 OpenAI GPT-5.5 / Responses API

OpenAI 当前 latest 模型文档显示 GPT-5.5 面向复杂生产工作流、工具型 agent、grounded assistants、long-context retrieval 等场景；官方迁移建议中强调 Responses API、reasoning effort、structured outputs、prompt caching、tool calling 和 state management。

对本项目的含义：

- RAG 搜索框本身不一定需要生成模型，避免每次搜索都产生 LLM 成本。
- 当用户点击“生成洞察/综合答案”时，再走生成模型。
- 生成层推荐规划为 Responses API 适配器，但当前代码仍使用 Chat Completions adapter；实施时可以先保留现有 gateway，再把 Responses API 作为后续 provider adapter 迁移。

参考：

- https://developers.openai.com/api/docs/guides/latest-model

## 3. 目标体验

### 3.1 用户搜索体验

用户在“品牌灵感搜索”输入：

```text
小红书咖啡新品上市，高级感视觉，年轻白领
```

系统应该返回：

- 相似社区作品：文案、图片、分镜、口播、视频。
- 命中的素材/项目/活动上下文。
- 每条结果的匹配理由，例如“品牌调性相似”“平台相同”“包含新品上市场景”“视觉风格接近”。
- 可解释分数：语义相似、关键词匹配、时间/点赞/项目权重、rerank 后总分。
- 来源引用：作品 ID、项目、活动、创建者、时间。
- 下一步动作：复用模板、带入工作流、生成相似文案、生成视觉 prompt、打开来源项目。

### 3.2 搜索结果结构

接口响应从当前的：

```json
{
  "query": "新品上市",
  "results": [],
  "rag_logs": []
}
```

升级为：

```json
{
  "query": "新品上市",
  "normalized_query": "新品 上市 launch product",
  "mode": "hybrid",
  "results": [
    {
      "id": 123,
      "source_type": "community_creation",
      "source_id": 45,
      "chunk_id": 9001,
      "title": "夏季咖啡新品小红书种草",
      "snippet": "适合年轻白领的轻盈冷萃...",
      "content": {},
      "tags": ["小红书", "咖啡", "新品上市"],
      "scores": {
        "semantic": 0.82,
        "keyword": 0.54,
        "freshness": 0.08,
        "popularity": 0.04,
        "rerank": 0.91,
        "final": 0.87
      },
      "match_reasons": [
        "语义接近：新品上市 + 咖啡场景",
        "平台匹配：小红书",
        "标签命中：咖啡"
      ],
      "citation": {
        "organization": "demo-org",
        "project": "summer-campaign",
        "campaign": 12,
        "created_at": "2026-06-25T10:00:00Z"
      }
    }
  ],
  "facets": {
    "source_type": {"community_creation": 8, "asset": 4},
    "creation_type": {"copy": 6, "image": 3}
  },
  "trace": {
    "retrieval_id": "ret_...",
    "embedding_model": "text-embedding-3-small",
    "embedding_dimensions": 1536,
    "candidate_count": 80,
    "reranked_count": 20,
    "latency_ms": 184,
    "fallback_used": false
  },
  "rag_logs": [
    "query_normalized",
    "semantic_candidates=50",
    "keyword_candidates=50",
    "rerank=local_weighted",
    "final_results=12"
  ]
}
```

### 3.3 工作流节点体验

`rag_search` / `retrieval` 节点应支持：

- `query`：用户或上游节点传入。
- `source_types`：`community_creation`、`asset`、`generation_task`、`project_brief`、`campaign`。
- `scope`：organization / project / campaign / public community。
- `top_k`：最终输出数量，默认 8。
- `candidate_k`：第一阶段候选数量，默认 80。
- `rerank_enabled`：默认 true。
- `context_budget_tokens`：压缩后传给下游节点的 token 预算。

输出：

```json
{
  "query": "...",
  "summary": "检索到 8 条与新品上市相关的品牌灵感。",
  "chunks": [],
  "citations": [],
  "context_pack": "可直接注入 prompt 的压缩上下文",
  "rag_logs": []
}
```

## 4. 技术栈方案

### 4.1 后端

必须新增：

- `pgvector>=0.4.0`：Django `VectorField`、`VectorExtension`、HNSW/IVFFlat index。
- `openai>=1.x`：embedding API 客户端。当前项目用 `urllib` 手写 Chat Completions，embedding 可以先写轻量 adapter，也可以引入官方 SDK。建议引入 SDK，因为 embeddings、Responses、vector stores 后续都会用到。
- `numpy>=2.x`：本地 fallback cosine、eval、批处理辅助。
- `tiktoken>=0.8` 或同类 tokenizer：chunk token 估算和 context budget。若避免模型绑定，MVP 可先用字符长度估算。
- 可选第二阶段：`ragas`、`datasets`、`pandas`，仅用于 eval，不进生产路径。
- 可选第二阶段：`cohere`，仅用于 rerank provider。

`backend/pyproject.toml` 目标：

```toml
dependencies = [
    "celery>=5.5.0",
    "django>=6.0.5",
    "django-cors-headers>=4.9.0",
    "djangorestframework>=3.17.1",
    "psycopg[binary]>=3.2.0",
    "redis>=5.2.0",
    "pydantic>=2.6.0",
    "pgvector>=0.4.0",
    "openai>=1.90.0",
    "numpy>=2.0.0",
    "tiktoken>=0.8.0",
]
```

### 4.2 数据库

生产/ Docker：

- 从 `postgres:16` 切到带 pgvector 扩展的镜像。
- 推荐：`pgvector/pgvector:pg16`。
- 保留 Postgres 16，降低迁移风险。

`docker-compose.yml` 目标：

```yaml
postgres:
  image: pgvector/pgvector:pg16
```

SQLite fallback：

- 不创建 vector 扩展。
- `RAGSearchView` 返回 `mode=keyword_fallback`。
- 本地开发允许无向量检索，但测试必须覆盖 fallback。

### 4.3 前端

不需要新框架。继续使用：

- React + TypeScript
- `useCommunity`
- 当前 `apiFetch`
- Tailwind / existing CSS

需要新增的前端能力：

- 搜索模式展示：`hybrid` / `semantic` / `keyword_fallback`
- 检索 trace 折叠面板
- 分数字段展示
- match reasons
- facets / source filters
- 搜索建议 chips 从静态数组升级为后端返回热门 query / tags
- 空状态区分“没有内容”“索引中”“向量服务不可用”

## 5. 数据模型设计

所有模型建议先放在 `backend/api/models.py`，符合当前项目约定。第二阶段若拆 domain app，可迁到 `retrieval/`。

### 5.1 RetrievalSource

表示一个可被检索的源对象。它是 source registry，不直接存 chunk 文本。

字段：

- `organization`
- `project`
- `campaign`
- `source_type`
- `source_id`
- `source_uri`
- `title`
- `content_hash`
- `visibility`
- `metadata`
- `is_active`
- `last_indexed_at`
- `created_at`
- `updated_at`

建议 choices：

```python
SOURCE_TYPES = [
    ('community_creation', 'Community Creation'),
    ('asset', 'Asset'),
    ('generation_task', 'Generation Task'),
    ('project_brief', 'Project Brief'),
    ('campaign', 'Campaign'),
    ('workflow_draft', 'Workflow Draft'),
    ('assistant_message', 'Assistant Message'),
]
```

建议索引：

- `(organization, source_type, source_id)` unique
- `(organization, project, campaign)`
- `(organization, is_active, updated_at)`
- `(source_type, source_id)`

### 5.2 RetrievalChunk

表示真正参与检索的 chunk。

字段：

- `source`
- `organization`
- `project`
- `campaign`
- `chunk_index`
- `chunk_type`
- `title`
- `text`
- `summary`
- `tags`
- `language`
- `token_count`
- `content_hash`
- `metadata`
- `search_vector`
- `is_active`
- `created_at`
- `updated_at`

`search_vector` 使用 PostgreSQL `SearchVectorField`，用于 FTS。SQLite 下该字段可以不参与查询或使用普通文本 fallback。

建议 chunk 类型：

```python
CHUNK_TYPES = [
    ('title', 'Title'),
    ('body', 'Body'),
    ('tag', 'Tag'),
    ('caption', 'Caption'),
    ('prompt', 'Prompt'),
    ('storyboard_scene', 'Storyboard Scene'),
    ('asset_metadata', 'Asset Metadata'),
    ('brand_context', 'Brand Context'),
]
```

### 5.3 RetrievalEmbedding

单独存 embedding，避免 chunk 与向量强耦合，也方便同一 chunk 多模型重建。

字段：

- `chunk`
- `organization`
- `provider`
- `model_name`
- `dimensions`
- `embedding`
- `embedding_hash`
- `status`
- `error_message`
- `created_at`
- `updated_at`

PostgreSQL 字段：

```python
from pgvector.django import VectorField

embedding = VectorField(dimensions=1536, null=True, blank=True)
```

唯一约束：

- `(chunk, provider, model_name, dimensions)`

索引：

- HNSW cosine index on `embedding`
- `(organization, provider, model_name, dimensions, status)`

### 5.4 RetrievalQueryLog

记录每次检索，用于调试、成本、eval 和回放。

字段：

- `organization`
- `user`
- `query`
- `normalized_query`
- `mode`
- `scope`
- `source_types`
- `provider`
- `embedding_model`
- `embedding_dimensions`
- `candidate_count`
- `result_count`
- `latency_ms`
- `fallback_used`
- `trace`
- `created_at`

### 5.5 RetrievalResultLog

记录一次检索返回过的结果，支持离线评测。

字段：

- `query_log`
- `chunk`
- `rank`
- `semantic_score`
- `keyword_score`
- `freshness_score`
- `popularity_score`
- `rerank_score`
- `final_score`
- `match_reasons`

## 6. Django 迁移计划

### 6.1 迁移 1：启用 pgvector

新增 migration：

```python
from django.db import migrations
from pgvector.django import VectorExtension

class Migration(migrations.Migration):
    dependencies = [
        ('api', '0021_...'),
    ]

    operations = [
        VectorExtension(),
    ]
```

注意：

- 该 migration 只在 PostgreSQL 生效。
- 如果 CI 仍跑 SQLite，需要让 migration 对 SQLite 安全。可以用 `RunSQL` + database vendor guard，或在测试环境切 PostgreSQL。
- 更稳妥做法：CI backend 继续 SQLite 时，先不强制 `VectorExtension()`，把 vector migration 标记为 Postgres-only operation。

### 6.2 迁移 2：新增 retrieval 表

新增 `RetrievalSource`、`RetrievalChunk`、`RetrievalEmbedding`、`RetrievalQueryLog`、`RetrievalResultLog`。

### 6.3 迁移 3：索引

PostgreSQL：

```sql
CREATE INDEX retrieval_embedding_hnsw_cosine
ON api_retrievalembedding
USING hnsw (embedding vector_cosine_ops)
WHERE status = 'ready';
```

FTS：

```sql
CREATE INDEX retrieval_chunk_search_vector_gin
ON api_retrievalchunk
USING GIN (search_vector);
```

Django 侧：

- 如果 `pgvector.django.HnswIndex` 满足 partial index 需求，优先用 Django index。
- 如果 partial HNSW 表达不足，用 `RunSQL` 写显式索引，并提供 reverse SQL。

## 7. Ingestion 流程

### 7.1 来源对象

第一阶段索引这些来源：

1. `CommunityCreation`
   - title
   - content JSON
   - tags
   - creation_type
   - image/audio/video URL metadata
2. `Asset`
   - title
   - tags
   - metadata
   - source_url
3. `GenerationTask`
   - succeeded 的 `copy/storyboard/review/rag_search`
   - payload
   - result
4. `Project`
   - brief
   - brand_context
   - platform_tags
5. `Campaign`
   - objective
   - status

第二阶段再索引：

- `WorkspaceDraft`
- `AssistantMessage`
- 上传文档正文
- 外部链接抓取内容

### 7.2 Chunk 规则

MVP chunk 策略：

- 目标 300-600 中文字或 250-500 tokens。
- overlap 50-100 tokens。
- JSON 内容按字段拆分，不把整个 JSON 原样塞进一个 chunk。
- 标题、标签、平台、类型作为 metadata 和加权字段。

`CommunityCreation` 示例：

```python
def build_community_creation_chunks(item: CommunityCreation) -> list[ChunkInput]:
    content = item.get_content_dict()
    chunks = []

    chunks.append(ChunkInput(
        chunk_type='title',
        title=item.title,
        text=f"{item.title}\n类型：{item.get_creation_type_display()}\n标签：{' '.join(item.tags)}",
        tags=item.tags,
        metadata={'creation_type': item.creation_type},
    ))

    if item.creation_type == 'copy':
        paragraphs = content.get('paragraphs') or []
        body = '\n'.join(str(p) for p in paragraphs if p)
        chunks.extend(split_text(body, chunk_type='body', title=item.title, tags=item.tags))

    if item.creation_type == 'storyboard':
        for scene in content.get('scenes') or []:
            chunks.append(ChunkInput(
                chunk_type='storyboard_scene',
                title=f"{item.title} S{scene.get('scene_number')}",
                text=json.dumps(scene, ensure_ascii=False),
                tags=item.tags,
                metadata={'scene_number': scene.get('scene_number')},
            ))

    return chunks
```

### 7.3 触发时机

同步触发：

- 用户分享社区作品后，立即创建 `RetrievalSource` 和 `RetrievalChunk`，返回成功。

异步触发：

- Celery job 生成 embeddings。
- 大批量 backfill 使用 management command。

任务：

- `index_retrieval_source(source_type, source_id)`
- `embed_retrieval_chunks(chunk_ids)`
- `reindex_organization(organization_id, source_types=None)`
- `cleanup_inactive_retrieval_sources()`

### 7.4 幂等

每个 source 计算 `content_hash`：

```text
sha256(source_type + source_id + normalized_title + normalized_content + normalized_tags)
```

规则：

- hash 未变化，不重新 chunk，不重新 embedding。
- hash 变化，旧 chunk 标记 `is_active=False`，创建新 chunk。
- embedding 以 `(chunk, provider, model_name, dimensions)` 去重。

## 8. Embedding Provider 设计

### 8.1 不直接写死 OpenAI

当前项目已有 `AIConfiguration` 和 `AIModelGateway` provider pattern。新增 embedding lane 应遵循同样思路。

需要调整：

`AIConfiguration.CONFIG_SCOPE_CHOICES` 增加：

```python
('embedding', 'Embedding'),
('rerank', 'Rerank'),
```

`ai_gateway/gateway_modules/constants.py` 已经有 provider capability `embedding`，但 gateway 没有真正 embedding adapter。补齐：

- `EmbeddingRequest`
- `EmbeddingResponse`
- `ProviderAdapter.embed_texts()`
- `OpenAIEmbeddingAdapter`
- `MockEmbeddingAdapter`
- 可选 `GeminiEmbeddingAdapter`
- 可选 `LocalProxyEmbeddingAdapter`

### 8.2 OpenAI embedding adapter

推荐接口：

```python
@dataclass(slots=True)
class EmbeddingResult:
    vectors: list[list[float]]
    provider: str
    model_name: str
    dimensions: int
    prompt_tokens: int = 0
    cost_usd: Decimal = Decimal('0')

class EmbeddingGateway:
    @classmethod
    def embed_texts(
        cls,
        organization: Organization,
        texts: list[str],
        *,
        model_name: str | None = None,
        dimensions: int = 1536,
    ) -> EmbeddingResult:
        ...
```

OpenAI 请求：

```python
client.embeddings.create(
    model=model_name or "text-embedding-3-small",
    input=texts,
    dimensions=dimensions,
    encoding_format="float",
)
```

### 8.3 Mock embedding adapter

测试环境需要 deterministic vector：

```python
def deterministic_embedding(text: str, dimensions: int = 1536) -> list[float]:
    digest = hashlib.sha256(text.encode('utf-8')).digest()
    values = []
    while len(values) < dimensions:
        digest = hashlib.sha256(digest).digest()
        values.extend(((b / 255.0) * 2 - 1) for b in digest)
    return normalize(values[:dimensions])
```

用途：

- 单元测试无需网络。
- demo 环境可看见 semantic-like 行为。
- 不用于生产质量声明。

## 9. Retrieval Service 设计

新增模块：

```text
backend/api/service_modules/retrieval/
  __init__.py
  chunking.py
  ingestion.py
  embeddings.py
  search.py
  rerank.py
  serializers.py
  tracing.py
```

### 9.1 SearchRequest

```python
@dataclass(slots=True)
class SearchRequest:
    organization: Organization
    user: User | None
    query: str
    project: Project | None = None
    campaign: Campaign | None = None
    source_types: list[str] | None = None
    scope: str = 'organization'
    top_k: int = 12
    candidate_k: int = 80
    rerank: bool = True
    include_trace: bool = True
```

### 9.2 SearchResponse

```python
@dataclass(slots=True)
class SearchResponse:
    query: str
    normalized_query: str
    mode: str
    results: list[SearchResult]
    facets: dict[str, dict[str, int]]
    trace: dict[str, Any]
    rag_logs: list[str]
```

### 9.3 Query normalization

规则：

- trim
- 全角转半角
- 小写英文
- 去重复空格
- 保留中文、英文、数字、品牌符号
- 识别平台词：小红书、抖音、公众号、B 站、LinkedIn
- 识别内容类型：文案、视觉、分镜、口播、视频
- 识别场景词：新品上市、种草、节日、联名、开业、促销

输出：

```python
NormalizedQuery(
    raw="小红书咖啡新品上市，高级感视觉",
    normalized="小红书 咖啡 新品上市 高级感 视觉",
    tokens=["小红书", "咖啡", "新品上市", "高级感", "视觉"],
    filters={"platform": "小红书", "creation_type": ["copy", "image"]},
)
```

### 9.4 Hybrid retrieval

第一阶段候选：

1. Semantic candidates：向量 cosine distance top `candidate_k`
2. Keyword candidates：FTS / keyword top `candidate_k`
3. Metadata candidates：tags、creation_type、project、campaign、platform

融合：

```python
final_candidate_score =
    0.50 * semantic_score +
    0.25 * keyword_score +
    0.10 * metadata_score +
    0.08 * freshness_score +
    0.07 * popularity_score
```

如果 semantic 不可用：

```python
final_candidate_score =
    0.55 * keyword_score +
    0.25 * metadata_score +
    0.10 * freshness_score +
    0.10 * popularity_score
```

### 9.5 Semantic SQL

PostgreSQL + pgvector:

```sql
SELECT
  c.id AS chunk_id,
  e.embedding <=> %(query_embedding)s::vector AS cosine_distance
FROM api_retrievalembedding e
JOIN api_retrievalchunk c ON c.id = e.chunk_id
WHERE
  e.status = 'ready'
  AND c.is_active = true
  AND c.organization_id = %(organization_id)s
  AND (%(project_id)s IS NULL OR c.project_id = %(project_id)s)
ORDER BY e.embedding <=> %(query_embedding)s::vector
LIMIT %(candidate_k)s;
```

转分数：

```python
semantic_score = max(0, 1 - cosine_distance)
```

### 9.6 Keyword SQL

PostgreSQL FTS:

```sql
SELECT
  c.id,
  ts_rank_cd(c.search_vector, plainto_tsquery('simple', %(query)s)) AS keyword_rank
FROM api_retrievalchunk c
WHERE
  c.is_active = true
  AND c.organization_id = %(organization_id)s
  AND c.search_vector @@ plainto_tsquery('simple', %(query)s)
ORDER BY keyword_rank DESC
LIMIT %(candidate_k)s;
```

MVP fallback：

- `icontains` on `title`
- token matching against `text`
- tag exact match

### 9.7 Rerank

MVP local rerank:

```python
def rerank_local(query, candidates):
    for item in candidates:
        item.rerank_score = (
            0.45 * item.semantic_score +
            0.25 * item.keyword_score +
            0.15 * item.metadata_score +
            0.10 * item.source_quality_score +
            0.05 * item.freshness_score
        )
    return sorted(candidates, key=lambda x: x.rerank_score, reverse=True)
```

第二阶段 provider rerank：

- 只对 top 50 candidates 调用。
- 每条 document 使用 compact YAML/JSON：

```yaml
title: 夏季咖啡新品小红书种草
type: copy
tags: [小红书, 咖啡, 新品上市]
text: ...
project: summer-campaign
```

provider 返回后：

```python
final_score = 0.70 * provider_rerank_score + 0.30 * local_score
```

### 9.8 Context compression

给工作流节点和生成层使用：

- 去重相同 source。
- 每个 source 最多 2 个 chunk。
- 每条 chunk 压缩到 80-160 中文字。
- 保留 citation。
- 按 source_type 分组。

输出示例：

```text
[社区作品 #45 | copy | 小红书/咖啡/新品上市]
标题：夏季咖啡新品小红书种草
要点：面向年轻白领，强调低负担、通勤场景、高级冷萃视觉。

[素材 #18 | image | visual_prompt]
要点：浅灰背景、冷萃杯、玻璃水珠、自然光、1:1 构图。
```

## 10. API 设计

### 10.1 搜索接口

保留路径：

```http
GET /api/community/search/?q=...&project=...&campaign=...&source_types=community_creation,asset
```

新增更通用路径：

```http
POST /api/retrieval/search/
```

请求：

```json
{
  "query": "小红书咖啡新品上市",
  "organization": "demo-org",
  "project": "summer-campaign",
  "campaign": 12,
  "source_types": ["community_creation", "asset", "generation_task"],
  "scope": "organization",
  "top_k": 12,
  "candidate_k": 80,
  "rerank": true,
  "include_trace": true
}
```

响应见第 3.2 节。

### 10.2 索引状态接口

```http
GET /api/retrieval/index/status/?organization=demo-org
```

响应：

```json
{
  "source_count": 128,
  "chunk_count": 942,
  "ready_embedding_count": 910,
  "pending_embedding_count": 20,
  "failed_embedding_count": 12,
  "last_indexed_at": "2026-06-26T10:00:00Z",
  "mode": "pgvector"
}
```

### 10.3 重建索引接口

仅 admin/ops：

```http
POST /api/retrieval/index/rebuild/
```

请求：

```json
{
  "organization": "demo-org",
  "source_types": ["community_creation"],
  "force": false
}
```

响应：

```json
{
  "task_id": "celery-id",
  "message": "reindex queued"
}
```

## 11. 前端实施计划

### 11.1 类型

`frontend/src/features/community/types.ts` 增加：

```ts
export interface RetrievalScores {
  semantic?: number;
  keyword?: number;
  freshness?: number;
  popularity?: number;
  rerank?: number;
  final: number;
}

export interface RetrievalTrace {
  retrieval_id: string;
  mode: 'hybrid' | 'semantic' | 'keyword_fallback';
  embedding_model?: string;
  embedding_dimensions?: number;
  candidate_count: number;
  reranked_count: number;
  latency_ms: number;
  fallback_used: boolean;
}

export interface CommunitySearchResponse {
  query: string;
  normalized_query: string;
  mode: 'hybrid' | 'semantic' | 'keyword_fallback';
  results: CommunityItem[];
  facets: Record<string, Record<string, number>>;
  trace: RetrievalTrace;
  rag_logs: string[];
}
```

### 11.2 `useCommunity`

改造点：

- `CommunitySearchResponse` 从 hook 内部移到 `types.ts`。
- 增加 `searchTrace`、`facets`、`searchMode`。
- 请求参数带上 `organization/project/campaign`。
- 搜索时 debounce 不放在 submit 表单上；MVP 保持点击搜索即可。
- 错误状态区分：
  - 400：query 为空或参数错误
  - 503：embedding provider 不可用
  - 202：索引构建中，可展示“正在索引”

### 11.3 `CommunityPage`

UI 增强：

- 搜索结果旁显示 `hybrid` / `semantic` / `keyword_fallback` badge。
- 每张卡片显示 match reasons。
- 分数展示只显示最终百分比；详细分数放 tooltip 或折叠面板。
- `ragLogs` 从纯文本变为 trace 折叠区。
- facet filters 放在搜索框下方，支持按内容类型筛选。

### 11.4 不做的事

第一阶段不做：

- 搜索即生成长答案。
- 自动改写用户 query 后隐藏原 query。
- 无限流式搜索。
- 前端本地 embedding。
- 把所有 RAG trace 默认展开。

## 12. 后端文件级改造清单

### 12.1 新增文件

```text
backend/api/service_modules/retrieval/__init__.py
backend/api/service_modules/retrieval/chunking.py
backend/api/service_modules/retrieval/ingestion.py
backend/api/service_modules/retrieval/embeddings.py
backend/api/service_modules/retrieval/search.py
backend/api/service_modules/retrieval/rerank.py
backend/api/service_modules/retrieval/tracing.py
backend/api/management/commands/reindex_retrieval.py
backend/api/management/commands/embed_retrieval_chunks.py
```

可选新增：

```text
backend/api/service_modules/retrieval/eval.py
backend/api/management/commands/eval_rag_search.py
```

### 12.2 修改文件

```text
backend/api/models.py
backend/api/serializers.py
backend/api/tasks.py
backend/community/views.py
backend/community/urls.py
backend/api/urls.py
backend/ai_gateway/gateway_modules/adapters.py
backend/ai_gateway/gateway_modules/types.py
backend/ai_gateway/gateway_modules/policy.py
backend/ai_gateway/gateway_modules/constants.py
backend/pyproject.toml
docker-compose.yml
frontend/src/features/community/types.ts
frontend/src/features/community/useCommunity.ts
frontend/src/features/community/CommunityPage.tsx
```

## 13. 端到端链路

### 13.1 分享社区作品

1. 用户点击“分享社区”。
2. `CommunityCreationView.post()` 创建 `CommunityCreation`。
3. 设置 `rag_indexed=False`。
4. 调用 `index_retrieval_source.delay('community_creation', item.id)`。
5. Celery 创建/更新 `RetrievalSource`。
6. chunking 创建 `RetrievalChunk`。
7. 调用 `embed_retrieval_chunks.delay(chunk_ids)`。
8. embedding 成功后 `CommunityCreation.rag_indexed=True`。

失败处理：

- chunk 失败：source `metadata.index_error` 记录错误。
- embedding 失败：`RetrievalEmbedding.status='failed'`，搜索仍可关键词 fallback。
- 重试：Celery retry exponential backoff。

### 13.2 用户搜索

1. 前端 submit `q`。
2. `RAGSearchView.get()` 解析 scope。
3. 调用 `retrieval.search.search(SearchRequest(...))`。
4. Query normalize。
5. 生成 query embedding。
6. Semantic candidates。
7. Keyword candidates。
8. Merge + local rerank。
9. 写 `RetrievalQueryLog` 和 `RetrievalResultLog`。
10. 返回兼容 `CommunityItem` 的结果。

### 13.3 工作流节点

1. `run_generation_task` 或 workflow runner 处理 `rag_search`。
2. 调用 retrieval service。
3. 结果写入 `GenerationTask.result`。
4. 下游 copy/image/storyboard 节点可读取 `context_pack`。

## 14. 权限与多租户

检索必须遵守：

- organization 隔离。
- project/campaign scope。
- folder permission scope。
- Membership role。
- 私有资产不可被普通 workspace 搜到。
- public community 和 organization community 要分开。

第一阶段规则：

- `CommunityCreation`：仅同 organization 可见；如果 `organization` 为空，视为 public demo 内容。
- `Asset`：按 organization + project/campaign 过滤。
- `GenerationTask`：只检索同 organization，且默认不检索失败任务。
- `Project` / `Campaign`：同 organization 内可见。

第二阶段规则：

- 接入 `api/rbac.py` 的权限矩阵。
- 对 chunk 增加 `visibility` 和 `permission_scope`。
- 检索时先过滤可见 chunk，再排序。

## 15. 成本与性能预算

### 15.1 成本

embedding：

- 增量内容才生成。
- 批量请求，一次最多 64 或 128 个 chunk，按 provider 限制调整。
- 对短文本合并 embedding 要谨慎，避免降低可解释性。

rerank：

- 默认 local rerank。
- provider rerank 只对 top 50。
- 免费/演示环境关闭 provider rerank。

generation：

- 搜索本身不调用 LLM。
- 用户点击“生成总结/生成相似内容”才调用 generation model。

### 15.2 延迟

目标：

- P50 搜索 < 300ms，不含首次 query embedding。
- P95 搜索 < 900ms。
- 首次 embedding provider 调用 < 1500ms。
- fallback keyword < 200ms。

优化：

- query embedding cache：`sha256(normalized_query + model + dimensions)`。
- HNSW index。
- 只返回必要字段。
- trace 默认摘要。
- 搜索结果分页或 top_k 限制。

### 15.3 索引规模

估算：

- 1536 维 float32 约 6KB / vector，不含索引。
- 10 万 chunk 原始向量约 600MB，HNSW index 额外占用明显。
- 若规模快速增长，评估 `halfvec`、降维到 768/1024、冷热分层、独立向量库。

## 16. Observability

每次搜索记录：

- query
- normalized_query
- scope
- source_types
- embedding provider/model/dimensions
- semantic candidate count
- keyword candidate count
- rerank strategy
- top result ids
- latency
- fallback reason
- user/org/project/campaign

日志示例：

```text
retrieval.search org=demo query_hash=abc mode=hybrid semantic=50 keyword=42 final=12 latency_ms=184 fallback=false
```

需要 dashboard 指标：

- 搜索次数
- 空结果率
- fallback 率
- embedding 失败率
- 平均 latency
- P95 latency
- top query
- top clicked result
- search-to-reuse conversion

## 17. Eval 计划

### 17.1 Golden Set

创建 `backend/api/tests/fixtures/rag_search_eval.json`：

```json
[
  {
    "query": "小红书咖啡新品上市",
    "expected_source_ids": [1, 2, 5],
    "must_not_source_ids": [9],
    "expected_terms": ["咖啡", "新品", "小红书"],
    "notes": "应优先召回咖啡新品相关内容，不应召回 B2B 白皮书"
  }
]
```

### 17.2 自动指标

检索指标：

- recall@5
- precision@5
- MRR
- nDCG@10
- empty result rate
- source diversity

RAG 生成指标：

- context precision
- context recall
- faithfulness
- response relevancy
- groundedness
- citation correctness

### 17.3 测试命令

```bash
cd backend
uv run python manage.py test api.tests.RetrievalSearchTests
uv run python manage.py eval_rag_search --fixture api/tests/fixtures/rag_search_eval.json
```

CI 第一阶段：

- 单元测试必须跑。
- eval command 可先只在手动或 nightly 跑，避免 CI 成本过高。

## 18. 测试计划

### 18.1 Backend unit tests

新增测试：

- chunking JSON copy
- chunking storyboard scenes
- content hash 幂等
- deterministic mock embedding
- keyword fallback search
- hybrid merge scoring
- organization isolation
- project/campaign filtering
- empty query
- no indexed content
- embedding failure fallback
- `CommunityCreation.rag_indexed` 状态更新

### 18.2 API tests

新增：

- `/api/community/search/?q=...` 返回兼容旧结构。
- 新响应包含 `mode/results/rag_logs/trace`。
- 未登录或无权限用户不能跨 org 搜索。
- `source_types` 参数生效。
- 索引构建中返回可解释状态。

### 18.3 Frontend tests

新增：

- `useCommunity` 解析新版响应。
- 搜索 loading 状态。
- fallback badge。
- match reasons 渲染。
- 空结果状态。
- API error toast。

### 18.4 E2E

Playwright：

1. 创建/登录 demo 用户。
2. 生成或分享社区作品。
3. 等待索引完成或使用测试 seed。
4. 搜索相关 query。
5. 断言结果按相似度展示。
6. 点击“显示全部”恢复。

## 19. 分阶段实施

### Phase 0：确认边界和基线

工作：

- 固定当前搜索行为 snapshot。
- 为 `RAGSearchView` 加测试，证明当前 keyword fallback 行为。
- 统计现有 `CommunityCreation` 字段质量。
- 确认 Docker 是否可切 pgvector 镜像。

验收：

- 当前接口测试通过。
- 有 baseline latency 和空结果率。

### Phase 1：数据模型与 ingestion

工作：

- 新增 retrieval models。
- 新增 pgvector dependency。
- Docker Postgres 镜像切 pgvector。
- 实现 chunking。
- 实现 source indexing。
- 实现 Celery embedding job 的 mock adapter。
- 新增 `reindex_retrieval` command。

验收：

- 分享 `CommunityCreation` 后能生成 source/chunk。
- mock embedding 可写入。
- 重复 reindex 不产生重复 chunk。
- SQLite fallback 测试通过。

### Phase 2：真实 embedding + hybrid search

工作：

- 实现 OpenAI embedding adapter。
- `AIConfiguration` 增加 embedding scope。
- 实现 query embedding cache。
- 实现 semantic search。
- 实现 keyword fallback。
- 实现 hybrid merge。
- 替换 `RAGSearchView` 内部逻辑。

验收：

- `/api/community/search/` 返回 `mode=hybrid`。
- 无 embedding 配置时返回 `mode=keyword_fallback`。
- 跨 organization 不泄漏。
- recall@5 相比关键词 baseline 提升。

### Phase 3：前端可解释搜索体验

工作：

- 更新 TypeScript types。
- 展示 search mode。
- 展示 match reasons。
- 展示 trace 折叠区。
- 展示 facets。
- 优化空状态和索引中状态。

验收：

- 用户能理解为什么结果被召回。
- fallback 不被包装成真实 RAG。
- 搜索结果能继续点赞、打开作者、复用。

### Phase 4：工作流节点接入

工作：

- `rag_search` node 调用 retrieval service。
- 输出 `chunks/citations/context_pack`。
- 下游 copy/storyboard/image_prompt 节点可使用 context。
- `GenerationTask.result` 保存完整 trace。

验收：

- 工作流中检索节点输出可被下游节点消费。
- 失败时不阻断整个工作流，可返回 fallback context。

### Phase 5：Rerank 与 Eval

工作：

- 实现 local weighted rerank。
- 新增 eval fixture。
- 新增 eval command。
- 可选接 Cohere rerank provider。
- 新增 retrieval dashboard 指标。

验收：

- eval regression 可运行。
- rerank 打开后 nDCG@10 有提升，且 latency/cost 可接受。
- 可按 org 关闭 provider rerank。

### Phase 6：托管检索和长期扩展

工作：

- 增加 OpenAI Vector Stores adapter，可作为 enterprise managed mode。
- 支持上传文档索引。
- 支持 assistant 侧 retrieval tool。
- 支持品牌记忆 2.0 的 semantic/episodic/procedural memory。

验收：

- 同一 SearchRequest 可切本地 pgvector 或 external vector store。
- 检索结果 schema 不变。

## 20. 风险与回滚

### 20.1 风险

风险：pgvector extension 在本地/CI 不可用。

缓解：

- Docker 使用 `pgvector/pgvector:pg16`。
- SQLite fallback。
- migration vendor guard。

风险：中文检索效果不稳定。

缓解：

- hybrid search。
- 强化 tags/platform/creation_type metadata。
- eval set 中加入中文 query。
- 第二阶段接中文分词。

风险：embedding 成本增长。

缓解：

- content hash 幂等。
- 增量 embedding。
- query embedding cache。
- 免费环境使用 mock / local。

风险：近似索引 + org/project 过滤导致 recall 下降。

缓解：

- 先按 organization 过滤。
- 调高 `hnsw.ef_search`。
- 必要时按 organization 或 source_type partial index。
- eval 监控 recall@k。

风险：搜索框响应变慢。

缓解：

- 搜索只检索，不生成。
- top_k/candidate_k 限制。
- trace 轻量化。
- provider rerank 默认关闭。

### 20.2 回滚

回滚策略：

- 保留旧 keyword fallback function。
- Feature flag：`RAG_SEARCH_MODE=keyword|hybrid|semantic`
- 出现问题时：
  - 设置 `RAG_SEARCH_MODE=keyword`
  - 停止 embedding worker
  - 保留 retrieval tables，不删除数据
  - 前端显示 fallback badge

## 21. 环境变量

新增：

```bash
RAG_SEARCH_MODE=hybrid
RAG_EMBEDDING_PROVIDER=openai
RAG_EMBEDDING_MODEL=text-embedding-3-small
RAG_EMBEDDING_DIMENSIONS=1536
RAG_CANDIDATE_K=80
RAG_TOP_K=12
RAG_RERANK_MODE=local
RAG_QUERY_CACHE_TTL_SECONDS=86400
RAG_ENABLE_TRACE=true
RAG_ALLOW_KEYWORD_FALLBACK=true
```

可选：

```bash
COHERE_API_KEY=
RAG_RERANK_PROVIDER=cohere
RAG_RERANK_MODEL=rerank-v4.0-pro
OPENAI_VECTOR_STORE_MODE=false
```

## 22. 验收标准

必须满足：

- 搜索接口不再只做关键词遍历。
- PostgreSQL 环境可以生成并查询 embeddings。
- SQLite 环境明确返回 `keyword_fallback`。
- 搜索结果包含 match reasons 和 trace。
- 组织隔离测试通过。
- 搜索没有内容时返回明确空状态。
- embedding provider 失败时搜索仍可用。
- `rag_search` 工作流节点可以复用同一 retrieval service。
- 文档、测试和 CI 命令更新。

质量指标：

- recall@5 比关键词 baseline 提升至少 20%。
- P95 搜索延迟小于 900ms，不含首次外部 embedding 冷启动。
- fallback 率可观测。
- 空结果率下降。
- 用户点击/复用率可记录。

## 23. 推荐落地顺序

最小可交付顺序：

1. 写 tests 固定旧行为。
2. 加 retrieval models + chunking + mock embedding。
3. 加 management command backfill 当前 `CommunityCreation`。
4. 切 Docker pgvector。
5. 接 OpenAI embedding adapter。
6. 替换 `RAGSearchView` 为 retrieval service。
7. 前端展示 mode/trace/reasons。
8. 接工作流 `rag_search` 节点。
9. 加 eval fixture 和 regression command。
10. 再考虑 provider rerank 或 OpenAI Vector Stores。

## 24. 与现有长期规划的关系

`docs/plans/brand_memory_long_term_evolution_plan.md` 规划的是品牌记忆 2.0、风格克隆和 harness 自动进化。本计划是更靠近当前搜索框的落地子计划：

- 本计划先解决“社区搜索框假 RAG”的生产化。
- 数据模型中的 `RetrievalSource/Chunk/Embedding` 后续可成为品牌记忆底座。
- Eval、trace、context_pack 设计与品牌记忆 2.0 保持兼容。
- 不在第一阶段实现完整长期记忆、风格画像和自动进化。

## 25. 参考资料

- OpenAI Embeddings: https://developers.openai.com/api/docs/guides/embeddings
- OpenAI Retrieval / Vector Stores: https://developers.openai.com/api/docs/guides/retrieval
- OpenAI Latest Model Guidance: https://developers.openai.com/api/docs/guides/latest-model
- pgvector: https://github.com/pgvector/pgvector
- pgvector Python / Django: https://github.com/pgvector/pgvector-python
- PostgreSQL Full Text Search: https://www.postgresql.org/docs/current/textsearch-intro.html
- PostgreSQL Text Search Indexes: https://www.postgresql.org/docs/current/textsearch-indexes.html
- Cohere Reranking: https://docs.cohere.com/docs/reranking-with-cohere
- Ragas Metrics: https://docs.ragas.io/en/stable/concepts/metrics/
