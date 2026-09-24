import { Injectable, NotFoundException } from "@nestjs/common";
import { Mastery, Prisma } from "@prisma/client";
import { BusinessException } from "../common/exceptions/business.exception";
import { PrismaService } from "../prisma/prisma.service";
import { CreateRecordDto, QueryRecordDto, UpdateMasteryDto, UpdateRecordDto } from "./dto/record.dto";
import { assertMasteryTransition } from "./mastery-state";
import { serializeRecord, serializeSnapshot, serializeSnapshotDetail } from "./record.serializer";

export const VERSION_CONFLICT = 10409;

@Injectable()
export class RecordsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, query: QueryRecordDto) {
    const where: Prisma.RecordWhereInput = { userId };
    if (query.keyword) {
      where.OR = [{ title: { contains: query.keyword } }, { content: { contains: query.keyword } }];
    }
    if (query.tag) {
      where.tags = { some: { tag: { name: query.tag } } };
    }
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.record.count({ where }),
      this.prisma.record.findMany({
        where,
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

  async update(userId: string, id: string, dto: UpdateRecordDto) {
    const owned = await this.findOwned(userId, id);
    if (dto.expectedVersion !== undefined && dto.expectedVersion !== owned.version) {
      throw new BusinessException(VERSION_CONFLICT, "笔记已在其他设备修改，请刷新后重试");
    }
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
    const row = await this.prisma.$transaction(async (tx) => {
      if (contentChanged) {
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

  async restoreSnapshot(userId: string, id: string, sid: string) {
    const owned = await this.findOwned(userId, id);
    const snap = await this.prisma.recordSnapshot.findFirst({ where: { id: sid, recordId: id } });
    if (!snap) throw new NotFoundException("版本快照不存在");
    const row = await this.prisma.$transaction(async (tx) => {
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

  private async findOwned(userId: string, id: string) {
    const row = await this.prisma.record.findFirst({ where: { id, userId } });
    if (!row) throw new NotFoundException("记录不存在");
    return row;
  }
}
