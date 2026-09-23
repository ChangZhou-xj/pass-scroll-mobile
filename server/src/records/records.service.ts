import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateRecordDto, QueryRecordDto, UpdateRecordDto } from "./dto/record.dto";
import { serializeRecord } from "./record.serializer";

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
    await this.findOwned(userId, id);
    const data: Prisma.RecordUncheckedUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.content !== undefined) data.content = dto.content;
    if (dto.tags !== undefined) {
      data.tags = { deleteMany: {}, create: this.tagConnections(userId, dto.tags) };
    }
    const row = await this.prisma.record.update({
      where: { id },
      data,
      include: { tags: { include: { tag: true } } },
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
