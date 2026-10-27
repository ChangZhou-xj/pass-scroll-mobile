/**
 * PalacesService——记忆宫殿（Memory Palace）的读写逻辑
 *
 * 【记忆宫殿是什么】把要记的东西放到一条你熟悉的空间路径上（门口→玄关→客厅→书桌→…），
 * 回忆时在脑内沿路径"走"一遍，用空间顺序提示内容顺序——这是位置法（method of loci），
 * 也是本项目"结构空间设计优化记忆"的落点：宫殿 = 一条路径，卡片 = 路径上的一个桩位。
 *
 * 数据上宫殿很轻：一个 Palace 行 + Record.palaceId（属于哪个宫殿）/ palaceOrder（第几个桩位）。
 * 复习时按 palaceOrder 依次走位（见 records.service.ts due() 的 palaceId 过滤）。
 *
 * 归属校验沿用 records 的同款约定：所有查询都带 userId，查不到抛 404（不区分不存在与别人的）。
 */
import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreatePalaceDto, SetPalaceRecordsDto, UpdatePalaceDto } from "./dto/palace.dto";

export type PalaceRow = {
  id: string;
  name: string;
  emoji: string;
  description: string | null;
  createdAt: Date;
  _count?: { records: number };
};

@Injectable()
export class PalacesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    const rows = await this.prisma.palace.findMany({
      where: { userId },
      include: { _count: { select: { records: true } } },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row) => this.serialize(row));
  }

  async create(userId: string, dto: CreatePalaceDto) {
    const row = await this.prisma.palace.create({
      data: {
        userId,
        name: dto.name,
        emoji: dto.emoji ?? "🏛",
        description: dto.description ?? null,
      },
      include: { _count: { select: { records: true } } },
    });
    return this.serialize(row);
  }

  async update(userId: string, id: string, dto: UpdatePalaceDto) {
    await this.findOwned(userId, id);
    const row = await this.prisma.palace.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.emoji !== undefined ? { emoji: dto.emoji } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
      },
      include: { _count: { select: { records: true } } },
    });
    return this.serialize(row);
  }

  /** 删除宫殿：笔记不跟着删，只解除归属（schema 里 palaceId 是 onDelete: SetNull） */
  async remove(userId: string, id: string) {
    await this.findOwned(userId, id);
    await this.prisma.record.updateMany({
      where: { palaceId: id, userId },
      data: { palaceId: null, palaceOrder: 0 },
    });
    await this.prisma.palace.delete({ where: { id } });
  }

  /**
   * 设定宫殿里有哪些笔记、以及它们的桩位顺序：recordIds 的【数组顺序】就是 palaceOrder。
   * 传入的完整列表会覆盖原顺序（前端拖好/排好再一次性提交），不在列表里的卡片被移出宫殿。
   */
  async setRecords(userId: string, id: string, dto: SetPalaceRecordsDto) {
    await this.findOwned(userId, id);
    // 只接受属于当前用户的笔记：防止把别人的笔记挂进自己的宫殿
    const owned = await this.prisma.record.findMany({
      where: { userId, id: { in: dto.recordIds } },
      select: { id: true },
    });
    const ownedIds = new Set(owned.map((row) => row.id));
    const ordered = dto.recordIds.filter((rid) => ownedIds.has(rid));

    await this.prisma.$transaction([
      // 先把宫殿内原有卡片全部移出（含本次不再入选的）
      this.prisma.record.updateMany({ where: { palaceId: id, userId }, data: { palaceId: null, palaceOrder: 0 } }),
      ...ordered.map((rid, index) =>
        this.prisma.record.update({ where: { id: rid }, data: { palaceId: id, palaceOrder: index } }),
      ),
    ]);
    return this.list(userId);
  }

  /** 把单条笔记移出宫殿（宫殿页的位置卡上"移出"用） */
  async removeRecord(userId: string, id: string, recordId: string) {
    await this.findOwned(userId, id);
    const { count } = await this.prisma.record.updateMany({
      where: { id: recordId, userId, palaceId: id },
      data: { palaceId: null, palaceOrder: 0 },
    });
    if (count === 0) throw new NotFoundException("位置上的笔记不存在");
    return this.list(userId);
  }

  private serialize(row: PalaceRow) {
    return {
      id: row.id,
      name: row.name,
      emoji: row.emoji,
      description: row.description,
      recordCount: row._count?.records ?? 0,
      createdAt: row.createdAt.getTime(),
    };
  }

  private async findOwned(userId: string, id: string) {
    const row = await this.prisma.palace.findFirst({ where: { id, userId } });
    if (!row) throw new NotFoundException("记忆宫殿不存在");
    return row;
  }
}
