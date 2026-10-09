# 部署手册：后端上云（Docker Compose）+ Android APK

面向对象：把 `server/`（NestJS + Prisma + MySQL）部署到一台阿里云 ECS，并把前端打包成可在自己安卓手机上安装的 APK。

本文档假设（三条前提，任一不成立则需回到对应章节重写）：

1. 一台**已存在**的阿里云 ECS，操作系统为 Alibaba Cloud Linux 3 或 CentOS/ Rocky 等 EL 系（命令按 `yum/dnf` 写）。规格 2 核 2 GiB 可以跑，但必须照做 4.5 的三条内存调优；4 GiB 只需保留 `NODE_OPTIONS` 那一条。
2. **不做 ICP 备案**，因此不使用 80/443，APP 直连 `http://<ECS_PUBLIC_IP>:3100`。
3. 仅**自用**，单人使用、无并发压力、不上架任何应用市场。

文中所有 `<...>` 是必须替换的占位符。当前仓库**尚未包含**本文档提到的 Dockerfile、compose 的 `api` service、`build:app` 脚本、`manifest.json` 的 `appid`，落地时按下表新增/修改。

| 文件                              | 动作                                  | 章节 |
| --------------------------------- | ------------------------------------- | ---- |
| `server/Dockerfile`               | 新增                                  | 4.1  |
| `server/.dockerignore`            | 新增                                  | 4.1  |
| `server/docker-compose.yml`       | 改造（加 `api`，改 `mysql` 端口映射） | 4.2  |
| `server/.env`（服务器上，非仓库） | 新增                                  | 4.3  |
| `server/deploy.sh`                | 新增                                  | 7.1  |
| `.env.production`                 | 改 `VITE_APP_API_URL`                 | 6.1  |
| `package.json`                    | 加 `build:app` 脚本                   | 6.2  |
| `src/manifest.json`               | 填 `name` / `appid`                   | 6.3  |

**不在本文范围内**：H5 站点部署、CI/CD 流水线、APM/监控告警。这三项在单人自用场景下收益不抵维护成本，需要时另开文档。

---

## 1. 架构与网络拓扑

```
手机 APP（uni-app / 5+Runtime，原生网络栈，不受浏览器 CORS 约束）
    │  http://<ECS_PUBLIC_IP>:3100        明文 HTTP，见第 8 节风险
    ▼
阿里云安全组（只放行 22/tcp 与 3100/tcp）
    ▼
ECS 宿主机（firewalld 第二道闸，见 3.4）
    ▼  compose 默认网络（api 用服务名 mysql 解析到容器）
┌──────────────────────────┬──────────────────────────────┐
│ api（node dist/main.js） │ mysql（MySQL 8）             │
│ :3100                    │ 3306 —— 无任何宿主机端口映射 │
└──────────┬───────────────┴──────────────┬───────────────┘
           │ mysql://root:...@mysql:3306  │ 命名卷 mysql-data → /var/lib/mysql
           └──────────────────────────────┘
```

三个要点：

- **`mysql` 服务不写 `ports`**，数据库端口在宿主机上根本不监听，只有同一 compose 网络内的 `api` 能连它。这是选 Docker Compose 相对裸机安装的实质收益之一：省掉「MySQL 意外暴露公网」这一整类事故。
- `api` 连库用的主机名是 **`mysql`**（compose 服务名 DNS），不是 `localhost`、也不是 `127.0.0.1`。写成 localhost 是这套部署最常见的启动失败原因（`Can't reach database server at localhost:3306`）。
- 本方案**不引入 Nginx**。没有备案就没有 80/443，而 Nest 自带 CORS，3100 直连已足够；将来上 HTTPS 时再加反代（见 8.3），架构不用重画。

## 2. 前置准备清单

### 2.1 你已经有

- ECS 实例与 `root`（或有 sudo 权限的账号）登录方式。
- 本仓库 `feat/pass-scroll-server` 分支代码，以及本地便携版 MySQL（127.0.0.1:3307）里的现有数据。

### 2.2 必须先办（缺一项则后面卡住）

| 事项                             | 为什么必须                                                                                         | 卡在哪   |
| -------------------------------- | -------------------------------------------------------------------------------------------------- | -------- |
| **注册 DCloud 账号**             | `src/manifest.json` 的 `appid` 现在是空串，HBuilderX 云打包第一步就要用账号登录并「重新获取」appid | 6.3      |
| **ECS 装 Docker + compose 插件** | 镜像只能在服务器上构建（本机没有 Docker，无法本地构建后推送）                                      | 3.1      |
| **加 2G swap**                   | `npm ci` + `nest build` 在 1–2G 内存的机器上会被 OOM killer 静默杀掉，表现为构建无错误直接退出     | 3.2、4.5 |
| **决定安卓签名证书方式**         | 云打包必须有 keystore，公共测试证书仅能测试、不能上架                                              | 6.4      |
| **`manifest.json` 填 `name`**    | 空 `name` 会导致打包出的 APK 桌面图标无名或安装器报错                                              | 6.3      |

## 3. 服务器准备与国内网络链路

国内链路的三个环节都可能被卡，每一小节都给了**验证是否生效的命令**——加速器时好时坏，不要写完就以为成了。

### 3.1 安装 Docker

```bash
yum install -y yum-utils
yum-config-manager --add-repo https://mirrors.aliyun.com/docker-ce/linux/centos/docker-ce.repo
yum install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
systemctl enable --now docker
docker version && docker compose version
```

配置镜像加速器（拉 `node`、`mysql` 镜像用）：

```bash
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<'EOF'
{
  "registry-mirrors": ["https://<你的专属ID>.mirror.aliyuncs.com"],
  "log-driver": "json-file",
  "log-opts": { "max-size": "20m", "max-file": "3" }
}
EOF
systemctl restart docker
```

专属地址在阿里云控制台 → 容器镜像服务 ACR → 镜像工具 → 镜像加速器。**验证：**

```bash
docker pull mysql:8.0        # 能拉下来即生效；很慢或超时见 3.5 的 ACR 兜底
```

`log-opts` 那两行不是可选项：默认 json-file 不限体积，`console.log` 输出（`main.ts` 会打印 `server running at ...`，异常时还有堆栈）几周就能写满系统盘。

### 3.2 内存不足时先加 swap

```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab     # 重启仍在
free -h                                              # Swap 行应显示 2.0Gi
```

swap 是给**构建期峰值**兜底的，不是给运行时日常用的（日常靠 swap 说明内存真不够了，见 4.5）。1–2G 内存的机器不做这一步，`docker compose build` 的典型表现是没有报错直接 `Killed`。

### 3.3 容器内 npm 与 Prisma 引擎走国内源

`prisma generate` 会下载 query engine 二进制（不在 npm 包里，走的是 Prisma 自己的 CDN），国内 ECS 上经常超时。构建参数里一并注入：

```bash
--build-arg NPM_REGISTRY=https://registry.npmmirror.com
--build-arg PRISMA_ENGINES_MIRROR=https://registry.npmmirror.com/-/binary/prisma
```

对应 Dockerfile 里的 `ARG`/`ENV` 写法见 4.1。**验证**（进容器手动跑）：

```bash
docker compose run --rm --entrypoint sh api -c \
  'npm config get registry && ls node_modules/.prisma/client'
```

判据只看一件事：`ls` 结果里**必须有一个 `libquery_engine-*.so.node` 文件**。引擎下载失败时它不会出现，目录里只剩 `index.js`/`schema.prisma` 之类的壳。后缀名（`debian-openssl-*` 还是别的）由 Prisma 在构建容器内自行探测决定，不需要你核对——构建环境与运行环境同底（见 4.1 的说明），后缀对不对都由同一次 generate 保证。

### 3.4 两道防火墙都要放行 3100

外部访问要同时过阿里云安全组 **和** 宿主机 firewalld，只开一个的表现是「curl 本地通、公网不通」：

- 安全组：ECS 控制台 → 网络与安全 → 安全组 → 入方向添加 `TCP 3100`，源填 `<你的家庭/办公宽带出口IP>/32`（自用强烈建议不要填 `0.0.0.0/0`）。
- firewalld：

```bash
systemctl is-active firewalld                       # inactive 就直接跳过本节
firewall-cmd --permanent --add-port=3100/tcp && firewall-cmd --reload
firewall-cmd --list-ports
```

**验证：** 手机连**蜂窝网络**（不要用同一 WiFi，否则测不出公网问题）访问 `http://<ECS_PUBLIC_IP>:3100/health`，应返回 `{"code":0,"message":"ok","data":{"status":"ok"}}`——注意外层 `{code,message,data}` 是 `TransformInterceptor` 包的，`/health` 免鉴权，可作为「后端 + 拦截器 + 公网链路」三合一的探针。

### 3.5 加速器失效时的兜底

若 `docker pull` 始终失败：把 Docker Hub 镜像同步到自己的 ACR 命名空间（ACR 个人版免费支持「海外机器同步」或本地 `docker tag` + `docker push`），compose 里把 `image:` 换成 `registry.cn-<region>.aliyuncs.com/<ns>/mysql:8.0`。这条路多花约 20 分钟，但一次配好长期稳定。

### 3.6 把代码放到服务器上

`deploy.sh`（7.1）依赖一个 git 工作副本，所以代码走 git 而不是 scp 压缩包：

```bash
mkdir -p /opt && cd /opt
git clone <你的仓库地址> pass-scroll
cd pass-scroll && git checkout feat/pass-scroll-server
```

仓库若是私有的：Gitee/GitHub 用**只读 deploy key 或 fine-grained token**（不要把你的账号口令写进 remote URL），或改用 `git clone` over SSH + 专用只读密钥。

两个不要提交的东西，落地前确认一遍：

- `server/.env` —— 根 `.gitignore` 已含 `/server/.env`，安全。
- `pass-scroll.keystore` —— **根 `.gitignore` 目前没有忽略它**（只忽略了 `.env`、`dist`、`node_modules` 等）。签名口令泄露等于别人能以你的签名发布覆盖你手机上的 APP。生成后放到仓库外的目录（如 `/opt/keys/`），或先往 `.gitignore` 加一行 `*.keystore` 再开始打包。

## 4. 后端容器化

### 4.1 `server/Dockerfile`（多阶段）与 `.dockerignore`

关键设计：**`prisma generate` 在 `node:20-bookworm-slim` 内执行，构建环境与运行环境同底**。这就是选 Docker Compose 白送的好处——宿主机是 EL8/OpenSSL 3.0 还是别的，与 Prisma 引擎再无关系，`schema.prisma` 里**不需要**手写 `binaryTargets`，默认的 `native` 就对得上。

```dockerfile
# syntax=docker/dockerfile:1
ARG NPM_REGISTRY=https://registry.npmmirror.com
ARG PRISMA_ENGINES_MIRROR=https://registry.npmmirror.com/-/binary/prisma

# ---------- 构建阶段：装依赖、生成 Prisma Client、编译 TS ----------
FROM node:20-bookworm-slim AS build
ARG NPM_REGISTRY
ARG PRISMA_ENGINES_MIRROR
# tzdata：TZ=Asia/Shanghai 需要它，否则时间静默回落 UTC（见 4.4）
# openssl：Prisma 靠它探测 OpenSSL 版本，缺失会误判成 1.1.x
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates tzdata \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci --registry=${NPM_REGISTRY}
COPY prisma ./prisma
# 用 ENV 而不是 `PRISMA_ENGINES_MIRROR=... npx prisma generate` 前缀写法：
# PRISMA_ENGINES_MIRROR 是 Prisma CLI 认的环境变量，显式声明后在 buildx 缓存层里也看得清是谁变了
ENV PRISMA_ENGINES_MIRROR=${PRISMA_ENGINES_MIRROR}
RUN npx prisma generate
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

# ---------- 运行阶段 ----------
FROM node:20-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates tzdata \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
# 整包拷贝 node_modules：比 prisma 官方推荐的「prod 安装 + 拷 .prisma」多约 100MB 体积，
# 但不会出现「生成引擎的依赖树与运行时依赖树不一致」这类难查问题。单人自用，取可靠。
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./package.json
EXPOSE 3100
# Node 20 自带 fetch，用它探活可省掉在镜像里装 curl
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3100/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
USER node
CMD ["node", "dist/main.js"]
```

`.dockerignore`（**缺了它就是安全事故**：`server/.env` 会被 COPY 进镜像层）：

```
node_modules
dist
.env
.env.example
*.tsbuildinfo
docker-compose.yml
Dockerfile
.dockerignore
test
scripts
docker
```

`test` 与 `scripts` 可以排除：前者是测试代码，后者用 `tsx` 跑导入（`npm run import:md`），运行时不需要。**注意**：这带来一个约束——`import:md` 无法在容器里执行，本手册的数据上云走 mysqldump（第 5 节），不依赖它。

### 4.2 `server/docker-compose.yml`（改造后完整文件）

```yaml
name: pass-scroll

services:
  mysql:
    image: mysql:8.0
    container_name: pass-scroll-mysql
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD:?必须在 .env 中设置}
      TZ: Asia/Shanghai
    # 故意不写 ports：3306 不在宿主机监听，只有 compose 内网的 api 能连
    volumes:
      - mysql-data:/var/lib/mysql
      - ./docker/mysql/init.sql:/docker-entrypoint-initdb.d/init.sql:ro
    # 后两项是 2G 内存机器的必做调优，不是可选优化，原因见 4.5
    command:
      - --character-set-server=utf8mb4
      - --collation-server=utf8mb4_unicode_ci
      - --performance-schema=OFF
      - --innodb-buffer-pool-size=128M
    healthcheck:
      test: ["CMD-SHELL", 'mysqladmin ping -h 127.0.0.1 -uroot -p"$${MYSQL_ROOT_PASSWORD}" --silent']
      interval: 10s
      timeout: 5s
      retries: 10
      start_period: 30s

  api:
    build:
      context: .
      dockerfile: Dockerfile
      args:
        NPM_REGISTRY: https://registry.npmmirror.com
        PRISMA_ENGINES_MIRROR: https://registry.npmmirror.com/-/binary/prisma
    image: pass-scroll-api:${GIT_SHA:-dev}
    container_name: pass-scroll-api
    restart: unless-stopped
    env_file: .env
    environment:
      TZ: Asia/Shanghai
      NODE_OPTIONS: --max-old-space-size=384 # 堆封顶，理由见 4.5
    ports:
      - "3100:3100"
    depends_on:
      mysql:
        condition: service_healthy

volumes:
  mysql-data:
```

与原文件的四处差异，逐条都有原因：

1. `mysql` 的 `ports: "3307:3306"` **删除**。原映射是给本机开发用的，而开发实际走的是便携版 MySQL（3307），所以删掉不影响任何现有流程。
2. `MYSQL_ROOT_PASSWORD` 从明文 `pass_scroll_dev` 改为 `${MYSQL_ROOT_PASSWORD:?}` 强制注入。这台机器将直接暴露在公网，开发口令不能上生产。
3. `restart: unless-stopped` + `depends_on.condition: service_healthy`：MySQL 冷启动建库需要十几秒，没有健康条件时 `api` 会先起、连不上库、崩在 `$connect()`（`PrismaService.onModuleInit`）；靠 `restart` 兜住重启风暴的同时，用健康条件让它一次就起对。
4. `command` 追加 `--performance-schema=OFF` / `--innodb-buffer-pool-size=128M`，`api` 追加 `NODE_OPTIONS`：2G 内存的必做调优，见 4.5。若机器是 4G 及以上，`mysql` 那两项可以撤掉（恢复默认采集、buffer pool 交给 MySQL 自己定），`NODE_OPTIONS` 建议无论如何都保留。

### 4.3 服务器上的 `server/.env`

在 `/opt/pass-scroll/server/.env`（或仓库内 `.env`，它已在根 `.gitignore` 里）创建：

```bash
# 容器内走服务名，绝不能写 localhost / 127.0.0.1
DATABASE_URL="mysql://root:<MYSQL_ROOT_PASSWORD>@mysql:3306/pass_scroll"
TEST_DATABASE_URL="mysql://root:<MYSQL_ROOT_PASSWORD>@mysql:3306/pass_scroll_test"
MYSQL_ROOT_PASSWORD='<一个强密码，与上面连接串里的一致>'
JWT_SECRET='<openssl rand -base64 48 的输出>'
PORT=3100
```

生成密钥后手工粘贴进上面的 `JWT_SECRET` 占位（**不要在文件里留下第二行 `JWT_SECRET=`**：dotenv 取同名键的最后一个值，多出来的占位行会造成「以为设了、实际设成了空」）：

```bash
openssl rand -base64 48        # 输出整行复制，作为 JWT_SECRET 的值
```

`main.ts` 在 `NODE_ENV=production` 且缺 `JWT_SECRET` 时会直接抛错拒绝启动（不会静默退回 `auth.module.ts` 里的 `dev-secret` 弱兜底），所以这条链路的失败是显式的、好查的。

**设 `MYSQL_ROOT_PASSWORD` 时注意连接串转义**：口令里的 `@` `/` `:` `#` 会切断 `mysql://root:<口令>@mysql:3306/...` 的解析，必须写成百分号编码（`@` → `%40`、`/` → `%2F`、`:` → `%3A`、`#` → `%23`）。最省事的做法是**直接避开这几个字符，也避开 `$`**（`$` 会让 shell 与 compose 的插值规则掺和进来，属于能免则免的麻烦）。症状是启动即报 `Can't reach database server`，而不是「密码错误」，很容易误判成网络问题。

### 4.4 时区：这个仓库特有的耦合

`records.service.ts` 的 `stats()` 用 `$queryRaw` 的 `DATE_FORMAT(createdAt, '%Y-%m-%d')` 出「近 7 天新增」，注释里明确口径是**数据库本地日期**；而 JS 侧补零用的又是 `new Date()` 的本地日。两个「本地」必须落在同一个时区，否则趋势柱整体偏移一天——`trend7d[0]` 对不上真实日期。

所以 MySQL 和 api **两个服务都要 `TZ=Asia/Shanghai`**，且镜像里必须装 `tzdata`（4.1 已含）。这一条不能靠推理验收，必须在手机上实测「今天新建一条笔记 → 我的页今日柱子 +1」（验收清单第 11 项）。

### 4.5 2G 内存的预算与调优（1–2G 机器必读）

你的笔记数据量不是变量——正文是 markdown 文本，图片以 URL 形式存在（见 `src/utils/markdown.ts` 的渲染路径），所以量级在几十 MB 以内，MySQL 完全无感。真正的约束只有**进程常驻内存**。上云前想核这个前提，本地跑一条即可：

```bash
"D:/Software/mysql-8.0.40-winx64/bin/mysql.exe" -h 127.0.0.1 -P 3307 -u root -ppass_scroll_dev -e \
 "SELECT ROUND(SUM(data_length+index_length)/1024/1024,1) AS db_mb FROM information_schema.tables WHERE table_schema='pass_scroll';"
```

只要这个数在几百 MB 以内，下面的预算表就成立。按 2 GiB = 2048 MB 排：

| 进程                                                          | 稳态常驻        | 备注                                 |
| ------------------------------------------------------------- | --------------- | ------------------------------------ |
| `mysqld` 8.0 **默认配置**                                     | 400–600 MB      | 大头是 `performance_schema` 默认开启 |
| `mysqld` 8.0 **4.2 调优后**                                   | 150–250 MB      | 关掉采集框架                         |
| `node dist/main.js`                                           | 120–250 MB      | Nest + Prisma 的 Rust query engine   |
| dockerd + containerd                                          | 100–150 MB      |                                      |
| Alibaba Cloud Linux 3 基础                                    | 250–350 MB      |                                      |
| sshd / cron / 其他                                            | ~50 MB          |                                      |
| **构建期峰值**（`npm ci` + `nest build` + `prisma generate`） | **+500–900 MB** | 一次性，但会顶破                     |

调优后稳态约 700–1000 MB，2G 有明确余量；不调优则 950–1400 MB，**没有余量**，且构建期必然要靠 swap 兜（3.2）。

**三条调优的理由，不只是「怎么做」**：

1. **`--performance-schema=OFF`（省 250–350 MB，与上表两行之差一致，是 2G 机器性价比最高的一步）**：它是 MySQL 的内部诊断采集框架，对「一个人写笔记」的负载属于纯开销。注意它**只能在启动时关**，所以必须写在 `command:` 里而不是运行时 `SET`。要排查慢查询时再临时开启（去掉该行重建容器）。
2. **`--innodb-buffer-pool-size=128M`**：这本来就是 8.0 的默认值，写出来是为了明确意图——你的表总量在几百 MB 以内，全进 buffer 都绰绰有余，不需要为它留更多内存。
3. **`NODE_OPTIONS=--max-old-space-size=384`（这条是容灾，不是优化）**：不封顶的后果很具体——OOM killer 挑最大的进程下手，那通常是 `mysqld` 而不是 `node`。api 被杀，`restart: unless-stopped` 秒级自愈；mysqld 被杀，要看 InnoDB 崩溃恢复的脸色，而且它不一定能起来。**让便宜的进程先死，是这套配置里唯一的容灾策略。**

**验证调优真的生效了**（配置写了不等于生效）：

```bash
docker stats --no-stream          # mysql 的 MEM USAGE 应落在 150–250MiB 区间
free -h                           # available 应仍有 600MB 以上
docker exec pass-scroll-mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e "SHOW VARIABLES LIKE \"performance_schema\""'   # 应为 OFF
dmesg -T | grep -i -E "oom|killed process" | tail    # 每次部署后看一眼，有输出就是被杀过
```

**磁盘同样会先于性能出问题**：两个镜像约 500 MB，加上每次 `docker compose build` 留下的悬空层、构建缓存、`mysql-data` 卷、以及 3.1 已限制的容器日志。2G 机器通常配 40G 系统盘，`df -h` 建议每月看一次；空间紧张时 `docker system prune -f`（保留卷，不动数据），**不要**用带 `-v` 的版本——那会删卷。

**什么时候该升 4G**：上面三条都做了仍然 `dmesg` 里频繁出现 OOM，或你打算在这台机器上再加别的服务。只跑本项目，2C2G 足够。

## 5. 数据上云（本地便携版 MySQL → 容器 MySQL）

### 5.1 本地导出

Windows 上（便携版路径见仓库 `CLAUDE.md`）：

```bash
"D:/Software/mysql-8.0.40-winx64/bin/mysqldump.exe" \
  -h 127.0.0.1 -P 3307 -u root -ppass_scroll_dev \
  --single-transaction --no-tablespaces \
  --default-character-set=utf8mb4 \
  --databases pass_scroll --add-drop-database \
  > pass_scroll.sql
```

- `--single-transaction`：InnoDB 一致性快照，不锁表，导完前应用仍可读写。
- `--no-tablespaces`：不加这个选项，mysqldump 需要 `PROCESS` 权限，常见报错 `Access denied; you need PROCESS privilege`。
- `--add-drop-database` + `--databases`：连带 `CREATE DATABASE`，导入侧不用手工建库。
- 校验：`grep -c "CREATE TABLE" pass_scroll.sql` 应为 **6**——5 张业务表（User / Record / Tag / RecordTag / RecordSnapshot）**再加一张 Prisma 自己的 `_prisma_migrations`**。数出 5 说明迁移历史没进来，下一节的幂等判断就不成立了。`grep -i "_prisma_migrations" pass_scroll.sql` 也必须有命中。

### 5.2 上传并导入

```bash
scp pass_scroll.sql root@<ECS_PUBLIC_IP>:/root/
cd /opt/pass-scroll/server
docker compose up -d mysql                                  # 先只起数据库，等它 healthy
docker compose ps                                           # mysql 应显示 healthy
docker compose exec -T mysql sh -c \
  'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" --default-character-set=utf8mb4' \
  < /root/pass_scroll.sql
```

两个细节都踩过坑：

- **口令用容器内的环境变量取，不要在宿主机写 `$MYSQL_ROOT_PASSWORD`**。宿主机 shell（尤其 7.3 的 cron）并不导出 `server/.env` 里的值，直接引用会展开成空串，报 `Access denied for user 'root'@'localhost'`。`sh -c '...'`（单引号）让变量在容器内展开，那里 `MYSQL_ROOT_PASSWORD` 是 compose 注入的、必然存在。
- **`-T` 不可省**：不带它时 `docker compose exec` 会分配伪终端，重定向的文本可能被终端处理污染（表现为导入莫名截断）。

### 5.3 导入后：`migrate deploy` 是空操作，且绝对不要 `db push`

dump 里含 `_prisma_migrations` 表，Prisma 会据此认为三个迁移（`20260923060805_init`、`20260924022744_add_snapshot_mastery_version`、`20260924045313_snapshot_record_version_unique`）已应用：

```bash
docker compose run --rm api npx prisma migrate deploy   # 输出应为 "No pending migrations to apply"
```

看到这句话就是对的。**反过来**：`prisma db push` 会绕过迁移历史直接按 `schema.prisma` 改表结构，在这个仓库还有 `--accept-data-loss` 的破坏性语义（`test/global-setup.ts` 就用了它），在已有真实数据的库上手工执行它没有收益、只有风险。

### 5.4 导入结果校验

服务器侧：

```bash
docker compose exec -T mysql sh -c \
  'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e "
   SELECT (SELECT COUNT(*) FROM pass_scroll.User)   AS users,
          (SELECT COUNT(*) FROM pass_scroll.Record)  AS records,
          (SELECT COUNT(*) FROM pass_scroll.Tag)     AS tags,
          (SELECT MAX(CHAR_LENGTH(content)) FROM pass_scroll.Record) AS max_content_len;"'
```

本地侧（便携版，同一套库同名表）：

```bash
"D:/Software/mysql-8.0.40-winx64/bin/mysql.exe" -h 127.0.0.1 -P 3307 -u root -ppass_scroll_dev \
  -e "SELECT (SELECT COUNT(*) FROM pass_scroll.User), (SELECT COUNT(*) FROM pass_scroll.Record),
        (SELECT COUNT(*) FROM pass_scroll.Tag), (SELECT MAX(CHAR_LENGTH(content)) FROM pass_scroll.Record);"
```

和本地跑同一条 SQL 对比，四个数字必须一致。`max_content_len` 尤其要看：正常应是几千到几万；如果本地是几万而这里是几百，说明导入过程被截断（多半是 5.2 少了 `-T`，或 `--default-character-set` 不匹配导致中文乱码后长度失真）。

## 6. 前端配置与 APK 打包

### 6.1 `.env.production` 改成公网地址

`src/utils/request.ts` 里 `BASE_URL = import.meta.env.VITE_APP_API_URL`，拼在 `uni.request` 的 `url` 前面。**这条因果要记住**：该值在**编译期**烙进包里，所以

- 换服务器 IP / 换端口 ⇒ 必须改这个文件并**重新打包 APK**，改 `.env` 重启容器是没用的；
- 仓库里现值 `https://api.moxun.cn` 保留备用（备案 + HTTPS 就绪后只改这一行切回，见 8.3），本次先注释掉：

```
VITE_APP_BASE_API = '/prod-api'
# VITE_APP_API_URL = https://api.moxun.cn
VITE_APP_API_URL = http://<ECS_PUBLIC_IP>:3100
```

`vite.config.ts` 里那段 `/dev-api` proxy 依然不参与：`request.ts` 直连 `VITE_APP_API_URL`，这也是仓库 `CLAUDE.md` 已记明的死配置，别去动它。App 端走的是原生网络栈，不存在 CORS 问题。

### 6.2 新增 App 平台构建脚本

`package.json` 目前只有 `dev:h5` / `build:mp-*` 等，缺 App 平台。加一条：

```json
"build:app": "uni build -p app",
```

`app` 与 `app-plus` 都在 `@dcloudio/uni-cli-shared` 的内置平台表里，产物目录按 `dist/<build|dev>/<UNI_PLATFORM>` 计算，所以用 `app` 时产物是 `dist/build/app`（DCloud 官方文档描述 wgt 时用的是 `app-plus` 那条路径，内容等价）。

### 6.3 `src/manifest.json`

```json
"name": "通关秘籍",
"appid": "__FILL_IN_HBUILDERX__",
"versionName": "1.0.0",
"versionCode": "100",
```

- `appid`：**不要手编**。用 HBuilderX 打开项目后，在 manifest 可视化视图的「基础配置」里点「重新获取」，由已登录的 DCloud 账号签发。手填一个假 appid 会让云打包直接失败。
- `versionCode`：每次出覆盖安装的包都要 +1（它是安卓判定「新/旧」的整数），`versionName` 给人看、可随意。
- 该文件里有 `/* ... */` 注释，uni-app 允许（JSON5），IDE 的 JSON 报错是误报，别为了消除报错删注释。
- `app-plus.distribute.android.permissions` 是模板默认值，含 `CAMERA`、`WRITE_SETTINGS`、`GET_ACCOUNTS` 等本项目**完全用不到**的权限（只用 `uni.request` + 本地 storage）。自用可不管；若将来要上架，这里必须裁到最小集，否则隐私合规审核会卡。

### 6.4 打 APK（HBuilderX 云打包）

**先定证书方式**，二选一：

```bash
# 方式 A：自有 keystore（推荐，一次生成永久复用；App 端要求 RSA ≥ 2048）
keytool -genkey -alias pass-scroll -keyalg RSA -keysize 2048 -validity 10000 \
  -keystore pass-scroll.keystore
```

方式 B：打包对话框里选「使用 DCloud 公共测试证书」——零配置，但**仅供测试、不能上架**，且以后想换自有证书属于「换签名」，老包无法覆盖安装，得先卸载。自用建议直接走方式 A，并把 keystore 和口令存进密码管理器：**丢了它就无法再用同一个签名覆盖更新这台手机上的 APP。**

打包步骤（HBuilderX 需 ≥ 3.6.7 才支持 Vue3/Vite 工程；DCloud 官方文档另注明低版本要在「工具 → 设置 → 运行配置 → node 路径」指到本机 Node 18/20，改完必须重启 HBuilderX 才生效）：

1. 文件 → 导入 → 从本地目录，选仓库根目录（CLI 工程结构是 `src/` 放源码、编译产物在 `dist/`，与 HBuilderX 可视化工程的约定不同，导入后不要手工调整目录）。
2. 发行 → 原生App-云打包 → 打移动端 → 勾选 Android，填上一步方式 A 生成的 keystore 路径、口令、alias 与 alias 口令。
3. 等云端队列回消息，下载 APK。
4. 传到手机，允许「安装未知来源应用」，装完**立刻做第 9 节的验收**再收工。

若打包入口报「未编译/缺资源」：先 `pnpm build:app` 产出 `dist/build/app` 再重试。DCloud 官方对 CLI 工程的表述是「`build:app-plus` 生成打包资源，可用于持续集成；不支持 run，运行调试仍需在 HBuilderX 中操作」——CLI 工程编译与云打包的分工就是这样的。（HBuilderX 的 GUI 菜单项会随版本微调，本节按当前稳定路径写，具体以你机器上的对话框为准。）

## 7. 日常升级、回滚、备份

### 7.1 `server/deploy.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

export GIT_SHA="$(git rev-parse --short HEAD)"          # compose 里 image tag 用它，回滚才有意义
git pull --ff-only
docker compose build api
docker compose run --rm api npx prisma migrate deploy   # 只前进不后退，见 7.2
docker compose up -d
docker compose ps
curl -fsS "http://127.0.0.1:3100/health"                # 本地探活：确认拦截器也在工作
```

`chmod +x deploy.sh`。之后每次上线就是 `./deploy.sh`。前端改动不在这里——APK 必须回本机用 HBuilderX 重打（6.4）。

### 7.2 回滚

Prisma 迁移**没有自动回滚**（`migrate rollback` 不存在），所以：

- **只回滚代码**（99% 的场景）：`export GIT_SHA=<上一个好版本短 SHA>` 后 `docker compose up -d api`。前提是迁移是向后兼容的——本项目的 `version`/`mastery`/`RecordSnapshot` 都带默认值，旧代码在新库上能跑。
- **回滚数据结构**：只能靠 7.3 的备份 `mysqldump` 导回，等于丢数据。所以任何 `schema.prisma` 改动，上云前先想清楚「这份 dump 能不能救回来」。

### 7.3 备份（别裸奔）

```bash
mkdir -p /opt/backup && cat > /opt/backup/backup.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
cd /opt/pass-scroll/server
ts=$(date +%F_%H%M)
docker compose exec -T mysql sh -c \
  'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --no-tablespaces --default-character-set=utf8mb4 pass_scroll' \
  | gzip > "/opt/backup/pass_scroll_${ts}.sql.gz"
find /opt/backup -name 'pass_scroll_*.sql.gz' -mtime +14 -delete
EOF
chmod +x /opt/backup/backup.sh
echo '15 3 * * * /opt/backup/backup.sh >> /opt/backup/backup.log 2>&1' | crontab -
```

口令在这里同样走容器内的环境变量（见 5.2 那条说明）——cron 的环境比交互 shell 更干净，任何「我以为它导出了」的假设都会在这里失败，日志里只留一行 `Access denied`。

**必须验证备份可用**（没人验过的备份等于没有备份）：先 `bash /opt/backup/backup.sh` 手动跑一次，`gunzip -c /opt/backup/pass_scroll_*.sql.gz | tail -20` 应看到 `Dump completed`；更进一步，起个临时 mysql 容器把它导进去跑一次 `SELECT COUNT(*)`。第二天再确认 `grep backup /opt/backup/backup.log` 里 cron 那次也成功了。

另外：`date +%F` 在容器/宿主机没设时区时按 UTC 出文件名，凌晨 0–8 点的备份会归到「昨天」——机器 TZ 已在 4.4 统一，这里顺带受益。

## 8. 安全现状与后续上 HTTPS

### 8.1 现在真实的暴露面（必须知情）

选了「公网 IP + 不备案」，以下三条是既成事实，不是提醒：

1. **全链路明文。** 注册/登录时那个「8–64 位且同时含字母与数字」的密码（`auth/password-policy.ts`）在网络上裸传，JWT 也在网络上裸传。密码策略防的是弱口令爆破，防不了链路嗅探。
2. **token 泄露 = 7 天完全接管。** 单 token 方案，无 refresh、无服务端会话、**无吊销**（`auth.module.ts` 只有 `expiresIn: "7d"`）。别人拿到你的 token，改密码也救不回来——旧 token 仍然有效直到过期，因为后端不校验任何签发代数。
3. **注册接口对全网开放，且没有任何速率限制。** 依赖里没有 `@nestjs/throttler`，`/auth/register` 也没有验证码，脚本可无限刷库和刷登录尝试。

自用可接受，但要按「这台机器上有一个可被完全接管的账号体系」来认知，并因此：给这个系统设一个**只属于它**的强密码，不要复用你任何已有口令。

### 8.2 低成本收敛（建议今天就做）

- 安全组 3100 的源限制成自家出口 IP `/32`（3.4 已写），这一条能挡掉 99% 的公网扫描。
- `MYSQL_ROOT_PASSWORD` 与 `JWT_SECRET` 都足够长且随机；`.env` 权限 `chmod 600`。
- `.env`、keystore 都不能进构建上下文（4.1 的 `.dockerignore` 已排除 `.env`；keystore 按 3.6 放在仓库外）。以后改 Dockerfile 的 `COPY` 时别绕过 `.dockerignore`——文件名带 `.env` 的 COPY 一旦写上，密钥就永久留在镜像层，删掉文件也拿不出来。
- `main.ts` 的 `app.enableCors()` 是全放开。App 端不受 CORS 约束，所以收紧它**不会**影响手机，将来上 HTTPS 后建议改成显式白名单。
- 可选：`yum install fail2ban` 挡 SSH 爆破——SSH 才是这台机器真正的高危入口，比业务接口值钱得多。

### 8.3 将来切 HTTPS 的最小路径（备案之后）

架构不动，只加一层、改一处：

1. 域名解析到 ECS，ICP 备案通过。
2. ECS 上加 nginx + certbot（`--nginx` 签发并自动续期），反代 `127.0.0.1:3100`。
3. compose 里 `api` 的端口映射改成 `127.0.0.1:3100:3100`，公网只留 80/443，安全组同步收窄。
4. `.env.production` 的 `VITE_APP_API_URL` 改回 `https://<域名>`，**重打 APK**（6.1 的编译期烙值）。
5. 可选：那时再给注册接口加 `@nestjs/throttler`，明文与刷注册两个问题一起解决。

## 9. 验收清单

按顺序逐条勾，每条都是「操作 → 预期」。**全过才算部署完成**，不要只测登录。

| #   | 操作                                     | 预期                                                             | 它在验什么                                        |
| --- | ---------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------- |
| 1   | 蜂窝网络访问 `/health`                   | `{"code":0,"message":"ok","data":{"status":"ok"}}`               | 安全组 + firewalld + 容器 + 全局拦截器            |
| 2   | APP 注册新账号                           | 直接进首页且自动带 token                                         | `auth:false` 的 401/成功分支、JWT 签发            |
| 3   | 注册同名账号                             | toast「用户名已存在」，不跳登录页                                | 业务码 10001 走 HTTP 200（`HttpExceptionFilter`） |
| 4   | 弱密码注册（如 `12345678`）              | toast 密码强度提示                                               | 10004，且请求的 401 分支没被误触发                |
| 5   | 首页新建笔记                             | 列表出现该条                                                     | 首屏 `fetchList` + 写穿 storage 缓存              |
| 6   | 编辑已有笔记并改正文，保存               | 版本号 +1，「历史版本」页多一条                                  | 事务内「先存快照再更新」                          |
| 7   | 两个设备/两次登录先后保存同一笔记        | 后保存者报「笔记已在其他设备修改」，编辑页自动拉回最新内容继续编 | 乐观锁 10409 + `editor/index.vue` 的恢复分支      |
| 8   | 只点置顶 / 只标掌握度，然后回列表        | 排序不因这两个动作变化                                           | 显式回写 `updatedAt` 的排序不变量                 |
| 9   | 历史版本 → 恢复某一版                    | 内容回退且**恢复本身也可再撤销**（快照多一条当前版）             | `restoreSnapshot` 的双快照逻辑                    |
| 10  | 已掌握的笔记标记为「未掌握」             | toast「掌握度状态非法流转」                                      | 状态机 10002（`MASTERED → NONE` 必须被拒）        |
| 11  | 「我的」页看统计 + 手机系统日期核对      | 总数/置顶/掌握度分布与实际条数一致；今日柱子对得上今天           | **时区口径**（4.4），最容易出问题的一条           |
| 12  | 手机开飞行模式重启 APP                   | 列表仍显示上次内容（只读），操作时报网络异常 toast               | 缓存优先 + 离线只读策略                           |
| 13  | 把服务器 `JWT_SECRET` 改掉重启，APP 不动 | 任意操作后弹「登录已过期」并跳回登录页                           | 401 → `reLaunch` 强制登出链路                     |
| 14  | 「我的」→ 退出登录 → 用另一账号登录      | 首页看不到上一个账号的任何笔记                                   | 缓存按用户隔离（`logout` 清 storage）             |

第 11、12、14 三条是纯 GUI 才能验出来的，也是这种「后端一换就翻车」的地方，别用接口测试代替。

## 附录：错误信息 → 根因速查

| 现象 / 报错                                                          | 根因                                                         | 回到     |
| -------------------------------------------------------------------- | ------------------------------------------------------------ | -------- |
| `api` 反复重启，日志 `Can't reach database server at localhost:3306` | `DATABASE_URL` 写了 localhost，容器内应为服务名 `mysql`      | 4.3      |
| `api` 反复重启，日志 `Can't reach database server at mysql:3306`     | 口令含 `@ / : #` 未转义，连接串被切错                        | 4.3      |
| `Unknown binary target` / `could not locate the Query Engine`        | 手写或残留了 `binaryTargets`，或 generate 与运行时不同底     | 4.1      |
| `Prisma failed to detect the libssl/openssl version`                 | 镜像里缺 `openssl`（只有 libssl 运行库不够）                 | 4.1      |
| `docker compose build` 无报错直接 `Killed`                           | 内存不足被 OOM 杀，加 swap                                   | 3.2、4.5 |
| 容器状态 `Exited (137)` / `dmesg` 有 `Killed process`                | 内存超配；`137` = 被 SIGKILL，优先看 mysqld 是否被选为牺牲者 | 4.5      |
| 本机 curl 通、公网不通                                               | 安全组或 firewalld 只放开了一个                              | 3.4      |
| APP 请求失败 `request:fail abort`                                    | 安全组未放行 / IP 变更未重打包 / 服务没起                    | 6.1、3.4 |
| 趋势柱整体偏移一天                                                   | 两个服务的 `TZ` 或 `tzdata` 没到位                           | 4.4      |
| `migrate deploy` 报 schema drift / 要求 reset                        | 导入后又 `db push` 过，迁移历史与库不一致                    | 5.3      |
| 上传 APK 失败「应用未安装」                                          | `versionCode` 没 +1，或签名与已装版本不同（换过 keystore）   | 6.3、6.4 |
