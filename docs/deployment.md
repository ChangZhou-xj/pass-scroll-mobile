# 通关秘籍 H5 部署手册

把后端和 H5 页面一起部署到阿里云 ECS，用手机或电脑浏览器访问。

## 你需要什么

- 一台阿里云 ECS，系统选 Alibaba Cloud Linux 3 / CentOS / Rocky。
- 2核2G 能跑，但内存部分必须按本文做；4G 更稳。
- 不需要 ICP 备案，所以 H5 用 `8080` 端口，API 用 `3100` 端口。
- 仅自用，不对外公开。

> 文中所有 `<...>` 都要换成你自己的值。

---

## 第一步：服务器装 Docker

用 SSH 连上 ECS，执行：

```bash
yum install -y yum-utils
yum-config-manager --add-repo https://mirrors.aliyun.com/docker-ce/linux/centos/docker-ce.repo
yum install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
systemctl enable --now docker
docker version && docker compose version
```

配置镜像加速（从阿里云控制台 → 容器镜像服务 → 镜像加速器 复制你的地址）：

```bash
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<'EOF'
{
  "registry-mirrors": ["https://xuanyuan.cloud/free"],
  "log-driver": "json-file",
  "log-opts": { "max-size": "20m", "max-file": "3" }
}
EOF
systemctl restart docker
```

---

## 第二步：加 swap（2G 内存机器必须做）

```bash
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
free -h
```

看到 Swap 有 2G 即可。

---

## 第三步：放通防火墙

### 3.1 阿里云安全组

ECS 控制台 → 安全组 → 入方向，添加：

- TCP 22（已有的 SSH）
- TCP 3100，源填 `<你家宽带IP>/32`
- TCP 8080，源填 `<你家宽带IP>/32`

不要填 `0.0.0.0/0`，自用没必要全网开放。

### 3.2 服务器防火墙

```bash
systemctl is-active firewalld
```

如果显示 `active`，执行：

```bash
firewall-cmd --permanent --add-port=3100/tcp
firewall-cmd --permanent --add-port=8080/tcp
firewall-cmd --reload
firewall-cmd --list-ports
```

如果显示 `inactive`，跳过。

---

## 第四步：把代码放到服务器

```bash
mkdir -p /opt && cd /opt
git clone <你的仓库地址> pass-scroll
cd pass-scroll
git checkout feat/pass-scroll-server
```

如果是私有仓库，用 deploy key 或 token，不要写账号密码。

---

## 第五步：后端容器化文件

### 5.1 创建 `server/Dockerfile`

```dockerfile
# syntax=docker/dockerfile:1
ARG NPM_REGISTRY=https://registry.npmmirror.com
ARG PRISMA_ENGINES_MIRROR=https://registry.npmmirror.com/-/binary/prisma

FROM node:20-bookworm-slim AS build
ARG NPM_REGISTRY
ARG PRISMA_ENGINES_MIRROR
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates tzdata \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci --registry=${NPM_REGISTRY}
COPY prisma ./prisma
ENV PRISMA_ENGINES_MIRROR=${PRISMA_ENGINES_MIRROR}
RUN npx prisma generate
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

FROM node:20-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates tzdata \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./package.json
EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3100/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
USER node
CMD ["node", "dist/main.js"]
```

### 5.2 创建 `server/.dockerignore`

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

### 5.3 创建 `server/.env`

```bash
cd /opt/pass-scroll/server
openssl rand -base64 48
```

复制输出的随机字符串。然后创建 `.env`：

```bash
DATABASE_URL="mysql://root:<强密码>@mysql:3306/pass_scroll"
TEST_DATABASE_URL="mysql://root:<强密码>@mysql:3306/pass_scroll_test"
MYSQL_ROOT_PASSWORD='<强密码>'
JWT_SECRET='<上面复制的随机字符串>'
PORT=3100
```

> 密码里不要出现 `@ / : # $`，避免连接串解析出错。

### 5.4 替换 `server/docker-compose.yml`

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
    volumes:
      - mysql-data:/var/lib/mysql
      - ./docker/mysql/init.sql:/docker-entrypoint-initdb.d/init.sql:ro
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
      NODE_OPTIONS: --max-old-space-size=384
    ports:
      - "3100:3100"
    depends_on:
      mysql:
        condition: service_healthy

  web:
    image: nginx:alpine
    container_name: pass-scroll-web
    restart: unless-stopped
    ports:
      - "8080:80"
    volumes:
      - ./dist/build/h5:/usr/share/nginx/html:ro
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
    depends_on:
      - api

volumes:
  mysql-data:
```

---

## 第六步：导入本地数据到云数据库

### 6.1 本地导出（Windows）

```bash
"D:/Software/mysql-8.0.40-winx64/bin/mysqldump.exe" \
  -h 127.0.0.1 -P 3307 -u root -ppass_scroll_dev \
  --single-transaction --no-tablespaces \
  --default-character-set=utf8mb4 \
  --databases pass_scroll --add-drop-database \
  > pass_scroll.sql
```

### 6.2 上传到服务器并导入

```bash
scp pass_scroll.sql root@<ECS_PUBLIC_IP>:/root/
```

在服务器上：

```bash
cd /opt/pass-scroll/server
docker compose up -d mysql
docker compose ps
```

等 `mysql` 显示 `healthy` 后：

```bash
docker compose exec -T mysql sh -c \
  'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" --default-character-set=utf8mb4' \
  < /root/pass_scroll.sql
```

### 6.3 应用迁移

```bash
docker compose run --rm api npx prisma migrate deploy
```

应看到 `No pending migrations to apply`。

---

## 第七步：构建并部署 H5

### 7.1 本机构建

在仓库根目录：

```bash
pnpm install
pnpm build:h5
```

产物在 `dist/build/h5`。

### 7.2 修改 `.env.production`

```bash
VITE_APP_BASE_API = '/prod-api'
VITE_APP_API_URL = http://<ECS_PUBLIC_IP>:3100
```

### 7.3 上传 H5 产物到服务器

把 `dist/build/h5` 整个目录上传到 `/opt/pass-scroll/server/dist/build/h5`。

可以用 scp：

```bash
scp -r dist/build/h5 root@<ECS_PUBLIC_IP>:/opt/pass-scroll/server/dist/build/
```

### 7.4 创建 `server/nginx.conf`

```nginx
server {
    listen 80;
    server_name localhost;
    root /usr/share/nginx/html;
    index index.html;

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

> `try_files` 这行必须加，否则刷新页面会 404。

---

## 第八步：启动所有服务

```bash
cd /opt/pass-scroll/server
docker compose build api
docker compose up -d
```

查看状态：

```bash
docker compose ps
```

三个服务都 `Up` 才算成功。

测试：

```bash
curl http://127.0.0.1:3100/health
curl -I http://127.0.0.1:8080
```

---

## 第九步：浏览器访问

打开浏览器，输入：

```
http://<ECS_PUBLIC_IP>:8080
```

应该看到登录页。

如果白屏，按 F12 看 Network：

- JS/CSS 404 → `dist/build/h5` 没传对位置。
- 接口报 CORS → 确认 `.env.production` 里的 IP 和端口正确，且后端已启动。
- 刷新 404 → `nginx.conf` 里没加 `try_files`。

---

## 第十步：日常更新

后端或数据库有改动时，在服务器执行：

```bash
cd /opt/pass-scroll/server
git pull
docker compose build api
docker compose run --rm api npx prisma migrate deploy
docker compose up -d
```

前端有改动时：

1. 本机执行 `pnpm build:h5`
2. 把新的 `dist/build/h5` 传到服务器 `/opt/pass-scroll/server/dist/build/h5`
3. 服务器执行 `docker compose restart web`

---

## 第十一步：备份数据库

创建备份脚本：

```bash
mkdir -p /opt/backup
cat > /opt/backup/backup.sh <<'EOF'
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
```

加定时任务：

```bash
echo '15 3 * * * /opt/backup/backup.sh >> /opt/backup/backup.log 2>&1' | crontab -
```

手动跑一次验证：

```bash
bash /opt/backup/backup.sh
gunzip -c /opt/backup/pass_scroll_*.sql.gz | tail -5
```

应看到 `Dump completed`。

---

## 安全检查清单

- [ ] 安全组 3100、8080 只放自家 IP。
- [ ] `.env` 文件权限 600：`chmod 600 /opt/pass-scroll/server/.env`。
- [ ] 密码够长够随机，不与其他网站共用。
- [ ] 不要把 `.env` 提交到 git（已在 `.gitignore` 中）。
- [ ] SSH 建议改用密钥登录，不要直接用 root 密码。

---

## 常见问题

| 问题                                                               | 原因                          | 解决                                |
| ------------------------------------------------------------------ | ----------------------------- | ----------------------------------- |
| `docker compose build` 没报错直接 Killed                           | 内存不够                      | 加 swap（第二步）                   |
| api 反复重启，日志 `Can't reach database server at localhost:3306` | `DATABASE_URL` 写了 localhost | 改成 `@mysql:3306`                  |
| 能 curl 通本地，外网不通                                           | 安全组或 firewalld 没放行     | 检查第三步                          |
| 页面白屏，JS 404                                                   | `dist/build/h5` 没挂载        | 检查 7.3 路径                       |
| 接口报 CORS                                                        | 跨域被拦                      | 确认 `.env.production` IP 正确      |
| 刷新页面 404                                                       | nginx 没配 SPA fallback       | 检查 7.4 的 `try_files`             |
| 趋势柱日期对不上                                                   | 时区不对                      | 确认两个服务都有 `TZ=Asia/Shanghai` |
