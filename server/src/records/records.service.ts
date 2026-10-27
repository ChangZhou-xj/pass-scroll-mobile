/**
 * RecordsService——笔记业务的核心逻辑层（本项目最大的一个 service）
 *
 * 贯穿全文的三个约定，读代码前先记住：
 *
 * 【约定 1：数据归属校验】几乎所有方法第一行都是 findOwned(userId, id)——
 * 按 "id 且 userId" 查，查不到就抛 404。这样他人记录和不存在记录得到同一个响应，
 * 不会泄露"这条记录其实存在但不是你的"。
 *
 * 【约定 2：排序不变量】列表按 updatedAt 倒序，而 Prisma 的 @updatedAt 会在任何
 * UPDATE 时自动刷新。置顶/标掌握度这类"不该改变排序"的操作，会显式把旧 updatedAt
 * 写回去（data: { ..., updatedAt: owned.updatedAt }）骗过自动刷新。
 *
 * 【约定 3：统一序列化】所有返回值都过 serializeRecord——把数据库行转换成
 * 前端契约 RecordItem（tags 拍平成字符串数组、时间转毫秒数字），见 record.serializer.ts。
 */
import { Injectable, NotFoundException } from "@nestjs/common";
import { Mastery, Prisma } from "@prisma/client";
import { BusinessException } from "../common/exceptions/business.exception";
import { PrismaService } from "../prisma/prisma.service";
import { CreateRecordDto, DueQueryDto, QueryRecordDto, ReviewRecordDto, UpdateRecordDto } from "./dto/record.dto";
import { assertMasteryTransition } from "./mastery-state";
import { serializeRecord, serializeSnapshot, serializeSnapshotDetail } from "./record.serializer";
import { DEFAULT_CURVE, type Grade, normalizeCurve, schedule } from "./srs";

export const VERSION_CONFLICT = 10409;

/** due() 里带标签查出来的行（含标签名，用于主题分块） */
type DueRow = Prisma.RecordGetPayload<{ include: { tags: { include: { tag: true } } } }>;

/**
 * 卡片的主标签：取第一个标签；没打标签的归"未分类"（空串）块。
 * Prisma 不带 orderBy 时按桥接表主键返回，同一张卡多次查询结果顺序一致，
 * 所以前端用 record.tags[0] 算主标签与这里的分块结果必然对得上。
 */
function primaryTag(row: DueRow): string {
  return row.tags[0]?.tag.name ?? "";
}

/** 把已排好序的队列切成"连续主题块"（相邻同标签合并），供前端显示"本组还剩几张" */
export function tagBlocks(rows: DueRow[]): { tag: string; count: number }[] {
  const out: { tag: string; count: number }[] = [];
  rows.forEach((row) => {
    const tag = primaryTag(row);
    const last = out[out.length - 1];
    if (last && last.tag === tag) last.count += 1;
    else out.push({ tag, count: 1 });
  });
  return out;
}

/**
 * 主题分块重排：同一标签的卡片连成一整块，一块啃完再进下一块
 * （混排会让 #游戏 和 #面试 交替出现，大脑反复换主题，学完拼不出整块知识）。
 *
 * - 组内：按 dueAt 升序（逾期最久的在前，新卡 dueAt=null 排最后）
 * - 组间：按组内最早到期时间升——最该被捞回来的主题先学；
 *         一样紧急时卡片多的先（一次啃透一块）；再一样按标签名稳定排序
 */
export function orderByTagBlock(rows: DueRow[]): DueRow[] {
  const dueOrLast = (row: DueRow) => row.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
  const groups = new Map<string, DueRow[]>();
  rows.forEach((row) => {
    const tag = primaryTag(row);
    const list = groups.get(tag);
    if (list) list.push(row);
    else groups.set(tag, [row]);
  });
  const blocks = Array.from(groups, ([tag, list]) => ({
    tag,
    list: [...list].sort((a, b) => dueOrLast(a) - dueOrLast(b)),
  }));
  // 组内已按到期升序，第一张的 dueAt 就是这块最急的时间；纯新卡的块排最后
  const urgency = (list: DueRow[]) => dueOrLast(list[0]);
  return blocks
    .sort((a, b) => urgency(a.list) - urgency(b.list) || b.list.length - a.list.length || a.tag.localeCompare(b.tag))
    .flatMap((group) => group.list);
}

@Injectable()
export class RecordsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, query: QueryRecordDto) {
    // Prisma 的 where 是声明式查询条件：{ userId } 就是 WHERE userId = ?
    const where: Prisma.RecordWhereInput = { userId };
    if (query.keyword) {
      // OR + contains = WHERE (title LIKE '%词%' OR content LIKE '%词%')
      where.OR = [{ title: { contains: query.keyword } }, { content: { contains: query.keyword } }];
    }
    if (query.tag) {
      // 跨表过滤：经桥接表 RecordTag 关联到 Tag，"任一绑定标签名等于它"
      where.tags = { some: { tag: { name: query.tag } } };
    }
    // $transaction([a, b])：两条查询打包成一个事务（同一数据快照），
    // 保证 count 和 findMany 看到的是同一时刻的数据（total 不会和 list 对不上）
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.record.count({ where }),
      this.prisma.record.findMany({
        where,
        // include 就是 JOIN 并把结果嵌套进返回值：把每条笔记绑定的标签名一并查出来
        include: { tags: { include: { tag: true } } },
        orderBy: [{ isPinned: "desc" }, { updatedAt: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return { list: rows.map(serializeRecord), total };
  }

  async detail(userId: string, id: string) {
    const row = await this.prisma.record.findFirst({
      where: { id, userId },
      include: { tags: { include: { tag: true } } },
    });
    if (!row) throw new NotFoundException("记录不存在");
    return serializeRecord(row);
  }

  async create(userId: string, dto: CreateRecordDto) {
    const row = await this.prisma.record.create({
      data: {
        title: dto.title,
        content: dto.content,
        userId,
        tags: { create: this.tagConnections(userId, dto.tags) },
      },
      include: { tags: { include: { tag: true } } },
    });
    return serializeRecord(row);
  }

  /** 修改笔记：乐观锁校验 → 判定内容是否真变 → 事务内"先存旧版快照、再写新值" */
  async update(userId: string, id: string, dto: UpdateRecordDto) {
    const owned = await this.findOwned(userId, id);
    // 【乐观锁】前端编辑时记下当时的 version，保存时带回 expectedVersion；
    // 若不一致说明期间已被别处改过——拒绝写入（业务码 10409），防止静默覆盖别人的修改
    if (dto.expectedVersion !== undefined && dto.expectedVersion !== owned.version) {
      throw new BusinessException(VERSION_CONFLICT, "笔记已在其他设备修改，请刷新后重试");
    }
    // 只有标题/正文【真的变了】才算内容变更（才存快照、version+1）；
    // 只改标签/置顶一类操作不产生历史版本
    const contentChanged =
      (dto.title !== undefined && dto.title !== owned.title) ||
      (dto.content !== undefined && dto.content !== owned.content);
    const data: Prisma.RecordUncheckedUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.content !== undefined) data.content = dto.content;
    if (dto.tags !== undefined) {
      data.tags = { deleteMany: {}, create: this.tagConnections(userId, dto.tags) };
    }
    if (contentChanged) data.version = owned.version + 1;
    // 交互式事务 $transaction(async (tx) => ...)：回调里的所有写操作要么全部成功、
    // 要么整体回滚——快照和笔记本体绝不会出现"存了一半"的中间态
    const row = await this.prisma.$transaction(async (tx) => {
      if (contentChanged) {
        // 留存"修改前"的快照（历史版本回溯的数据来源）
        await tx.recordSnapshot.create({
          data: { recordId: owned.id, version: owned.version, title: owned.title, content: owned.content },
        });
      }
      return tx.record.update({ where: { id }, data, include: { tags: { include: { tag: true } } } });
    });
    return serializeRecord(row);
  }

  async remove(userId: string, id: string) {
    const { count } = await this.prisma.record.deleteMany({ where: { id, userId } });
    if (count === 0) throw new NotFoundException("记录不存在");
  }

  async togglePin(userId: string, id: string) {
    const owned = await this.findOwned(userId, id);
    const row = await this.prisma.record.update({
      where: { id: owned.id },
      // 显式回写 updatedAt，避免 @updatedAt 自动刷新导致置顶改变列表排序
      data: { isPinned: !owned.isPinned, updatedAt: owned.updatedAt },
      include: { tags: { include: { tag: true } } },
    });
    return serializeRecord(row);
  }

  async setMastery(userId: string, id: string, to: Mastery) {
    const owned = await this.findOwned(userId, id);
    assertMasteryTransition(owned.mastery, to);
    const row = await this.prisma.record.update({
      where: { id: owned.id },
      // 显式回写 updatedAt，避免掌握度标记改变列表排序（同 togglePin）
      data: { mastery: to, updatedAt: owned.updatedAt },
      include: { tags: { include: { tag: true } } },
    });
    return serializeRecord(row);
  }

  /**
   * 复习队列（GET /records/due）——"今天该复习哪些卡"的排序结果
   *
   * 队列 =【已到期的旧卡（按逾期最久排前）】+【今日配额内的新卡】：
   *   - 到期卡：dueAt <= now。按 dueAt 升序——逾期越久越靠前，这是在遗忘曲线上最该被捞回来的那批。
   *   - 新卡：reviewCount = 0（从未复习过）。受曲线配置的每日新卡上限约束，防止一天灌进几百张。
   *   - palaceId：宫殿巡游模式只取某个宫殿内的卡片，仍按到期优先 + 位置顺序排好。
   *   - tag：主题聚焦模式（"今天只啃面试这一块"）。
   *
   * 【为什么不直接按 dueAt 混排】混排会让 #游戏 和 #面试 的卡片交替出现，
   * 大脑在主题之间反复切换，学完记不住"这一块到底有哪些"。所以排完序还要过一次
   * orderByTagBlock：同一标签的卡片连成一整块，一块啃完再进下一块（系统性学习 + 主题内的复现）。
   *
   * 统计一并返回（前端顶部进度条/主题块要用）：到期数 / 新卡数 / 今日已复习数 / 下一张到期时间 / 主题分块。
   */
  async due(userId: string, query: DueQueryDto) {
    const now = new Date();
    const limit = query.limit ?? 50;
    const base: Prisma.RecordWhereInput = { userId };
    if (query.palaceId) base.palaceId = query.palaceId;
    if (query.tag) base.tags = { some: { tag: { name: query.tag } } };

    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const [dueCount, freshCount, learnedToday, introducedToday] = await this.prisma.$transaction([
      this.prisma.record.count({ where: { ...base, reviewCount: { gt: 0 }, dueAt: { lte: now } } }),
      this.prisma.record.count({ where: { ...base, reviewCount: 0 } }),
      this.prisma.record.count({ where: { ...base, lastReviewedAt: { gte: todayStart } } }),
      // 今日已"引入"的新卡数（首次复习发生在今天）→ 决定今天还能放几张新卡进来
      this.prisma.record.count({ where: { ...base, firstReviewedAt: { gte: todayStart } } }),
    ]);

    // 具体间隔由提交评分时带的曲线决定；这里只用到每日新卡上限（曲线在客户端，随请求带上）
    const freshQuota = Math.max(0, (query.newPerDay ?? DEFAULT_CURVE.newPerDay) - introducedToday);

    const [dueRows, freshRows, nextRow] = await this.prisma.$transaction([
      this.prisma.record.findMany({
        where: { ...base, reviewCount: { gt: 0 }, dueAt: { lte: now } },
        include: { tags: { include: { tag: true } } },
        orderBy: [{ dueAt: "asc" }],
        take: limit,
      }),
      this.prisma.record.findMany({
        where: { ...base, reviewCount: 0 },
        include: { tags: { include: { tag: true } } },
        orderBy: { createdAt: "asc" },
        take: Math.min(freshQuota, limit),
      }),
      // 队列清空后告诉用户"下一张什么时候来"，空态才不会只写一句"没有了"
      this.prisma.record.findFirst({
        where: { ...base, dueAt: { gt: now } },
        orderBy: { dueAt: "asc" },
        select: { dueAt: true },
      }),
    ]);

    // 到期卡 + 新卡拼好后按"主题块"重排：同标签连续 → 一块学完再切下一块
    const ordered = orderByTagBlock([...dueRows, ...freshRows]);
    const list = ordered.slice(0, limit);

    return {
      list: list.map(serializeRecord),
      // blocks 按截断后的真实队列重算，前端"本组还剩几张"才不会说谎
      blocks: tagBlocks(list),
      dueCount,
      freshCount: Math.min(freshCount, freshQuota),
      learnedToday,
      nextDueAt: nextRow?.dueAt ? nextRow.dueAt.getTime() : null,
    };
  }

  /**
   * 今日待复习按标签统计——给标签栏/主题切换器用：哪个主题今天还有几张要复习。
   * 与 due() 同一口径（到期 + 新卡），无标签的卡片不计入任何标签（它们归"未分类"块）。
   */
  async dueTags(userId: string) {
    const now = new Date();
    const dueWhere: Prisma.RecordWhereInput = {
      userId,
      OR: [{ reviewCount: { gt: 0 }, dueAt: { lte: now } }, { reviewCount: 0 }],
    };
    const [dueRows, tagRows] = await this.prisma.$transaction([
      this.prisma.record.findMany({
        where: dueWhere,
        select: { tags: { select: { tag: { select: { name: true } } } } },
      }),
      this.prisma.record.findMany({
        where: { userId },
        select: { tags: { select: { tag: { select: { name: true } } } } },
      }),
    ]);
    const dueMap = new Map<string, number>();
    const totalMap = new Map<string, number>();
    dueRows.forEach((row) => row.tags.forEach(({ tag }) => dueMap.set(tag.name, (dueMap.get(tag.name) ?? 0) + 1)));
    tagRows.forEach((row) => row.tags.forEach(({ tag }) => totalMap.set(tag.name, (totalMap.get(tag.name) ?? 0) + 1)));
    return Array.from(totalMap, ([name, total]) => ({ name, total, due: dueMap.get(name) ?? 0 })).sort(
      // 有待复习的排在前面（多的优先），其余按笔记数降序——标签栏的展示顺序直接用它
      (a, b) => b.due - a.due || b.total - a.total || a.name.localeCompare(b.name),
    );
  }

  /**
   * 提交一次复习（POST /records/:id/review）——主动回忆 + 间隔重复的落库点
   *
   * 流程：归属校验 → 洗曲线 → schedule 算下次调度 → 推导掌握度（过状态机）→ 落库。
   * 曲线由前端随评分带上（用户自定制属于客户端偏好，后端不持久化；缺失时用 DEFAULT_CURVE）。
   * 与 togglePin/setMastery 一样显式回写 updatedAt——复习不该把笔记顶到列表最前。
   */
  async review(userId: string, id: string, dto: ReviewRecordDto) {
    const owned = await this.findOwned(userId, id);
    const curve = normalizeCurve(dto.curve);
    const now = new Date();
    const next = schedule(
      { stage: owned.stage, ease: owned.ease, lapses: owned.lapses, reviewCount: owned.reviewCount },
      dto.grade as Grade,
      curve,
      now,
    );
    // 掌握度由评分推导，但仍要过状态机（比如 NONE 直接跳 MASTERED 是允许的，MASTERED → MASTERED 则无需变更）
    if (next.mastery !== owned.mastery) assertMasteryTransition(owned.mastery, next.mastery);

    const row = await this.prisma.record.update({
      where: { id: owned.id },
      data: {
        stage: next.stage,
        ease: next.ease,
        lapses: next.lapses,
        reviewCount: next.reviewCount,
        dueAt: next.dueAt,
        lastReviewedAt: now,
        firstReviewedAt: owned.firstReviewedAt ?? now,
        mastery: next.mastery,
        updatedAt: owned.updatedAt, // 复习不改列表排序（同 setMastery）
      },
      include: { tags: { include: { tag: true } } },
    });
    return serializeRecord(row);
  }

  async snapshots(userId: string, id: string) {
    await this.findOwned(userId, id);
    const rows = await this.prisma.recordSnapshot.findMany({
      where: { recordId: id },
      orderBy: { version: "desc" },
    });
    return rows.map(serializeSnapshot);
  }

  async snapshot(userId: string, id: string, sid: string) {
    await this.findOwned(userId, id);
    const row = await this.prisma.recordSnapshot.findFirst({ where: { id: sid, recordId: id } });
    if (!row) throw new NotFoundException("版本快照不存在");
    return serializeSnapshotDetail(row);
  }

  /** 恢复旧版本：本质是一次"以快照内容为准"的特殊更新——恢复本身也可撤销 */
  async restoreSnapshot(userId: string, id: string, sid: string) {
    const owned = await this.findOwned(userId, id);
    // sid 与 recordId 双条件：防止拿 A 笔记的快照 id 套到 B 笔记上
    const snap = await this.prisma.recordSnapshot.findFirst({ where: { id: sid, recordId: id } });
    if (!snap) throw new NotFoundException("版本快照不存在");
    const row = await this.prisma.$transaction(async (tx) => {
      // 先把【当前内容】也存成快照（历史无断点，恢复错了还能再恢复回来）
      await tx.recordSnapshot.create({
        data: { recordId: owned.id, version: owned.version, title: owned.title, content: owned.content },
      });
      return tx.record.update({
        where: { id },
        data: { title: snap.title, content: snap.content, version: owned.version + 1 },
        include: { tags: { include: { tag: true } } },
      });
    });
    return serializeRecord(row);
  }

  /** "我的"页统计：总数/置顶/标签数 + 掌握度分布 + 近 7 天每日新增 */
  async stats(userId: string) {
    const [total, pinnedCount, tagCount, dueCount] = await this.prisma.$transaction([
      this.prisma.record.count({ where: { userId } }),
      this.prisma.record.count({ where: { userId, isPinned: true } }),
      this.prisma.tag.count({ where: { userId } }),
      // 今日待复习：已排期且到期的卡 + 从未复习的新卡（与 due() 的口径一致）
      this.prisma.record.count({
        where: { userId, OR: [{ reviewCount: { gt: 0 }, dueAt: { lte: new Date() } }, { reviewCount: 0 }] },
      }),
    ]);
    // groupBy 单独调用：放进 $transaction 数组会让泛型 T 退化为 RecordGroupByArgs，
    // 导致结果 _count 被推断为 true | 对象 | undefined
    const masteryGroups = await this.prisma.record.groupBy({
      by: ["mastery"],
      where: { userId },
      _count: { _all: true },
      orderBy: { mastery: "asc" },
    });
    const mastery = { none: 0, learning: 0, mastered: 0 };
    for (const group of masteryGroups) {
      mastery[group.mastery.toLowerCase() as "none" | "learning" | "mastered"] = group._count._all;
    }
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - 6);
    // DATE_FORMAT 直接出字符串，避免 MySQL DATE 类型经驱动转成 Date 后的时区歧义（口径：数据库本地日期）
    const rows = await this.prisma.$queryRaw<{ day: string; cnt: bigint }[]>`
      SELECT DATE_FORMAT(\`createdAt\`, '%Y-%m-%d') AS day, COUNT(*) AS cnt
      FROM \`Record\`
      WHERE \`userId\` = ${userId} AND \`createdAt\` >= ${start}
      GROUP BY DATE_FORMAT(\`createdAt\`, '%Y-%m-%d')`;
    const countByDay = new Map(rows.map((row) => [row.day, Number(row.cnt)]));
    // 把最近 7 天逐日补齐：数据库里没记录的日子补 0，前端拿到的定是长度 7 的数组
    // （trend7d[0] = 6 天前，trend7d[6] = 今日；MySQL 的 COUNT(*) 返回 bigint，要 Number() 转换）
    const trend7d: number[] = [];
    for (let i = 6; i >= 0; i--) {
      const day = new Date();
      day.setHours(0, 0, 0, 0);
      day.setDate(day.getDate() - i);
      const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
      trend7d.push(countByDay.get(key) ?? 0);
    }
    return { total, tagCount, pinnedCount, trend7d, mastery, dueCount };
  }

  /**
   * 组装"标签连接"供 create/update 内嵌写入。
   * 【connectOrCreate】Prisma 的多对多写入语法：标签已存在就连接（connect），
   * 不存在就先建再连接——所以前端传标签名字符串数组即可，不用关心标签是否已存在。
   * userId_name 是 Tag 表 @@unique([userId, name]) 自动生成的复合 where 名。
   */
  private tagConnections(userId: string, tags: string[]) {
    return tags.map((name) => ({
      tag: {
        connectOrCreate: {
          where: { userId_name: { userId, name } },
          create: { userId, name },
        },
      },
    }));
  }

  /** 归属校验：查"这条记录且属于这个用户"，查不到抛 404（不区分"不存在"与"别人的"，防探测） */
  private async findOwned(userId: string, id: string) {
    const row = await this.prisma.record.findFirst({ where: { id, userId } });
    if (!row) throw new NotFoundException("记录不存在");
    return row;
  }
}
