/**
 * 环境变量校验（Joi）——应用启动前的"安检门"
 *
 * 【为什么需要它】.env 里的配置（数据库地址、JWT 密钥、端口）一旦配错，
 * 以前要到真正用到它那一刻才炸（比如注册用户时才发现连不上库），报错地点离
 * 出错原因很远。借鉴 xj-server 的做法：启动时先用 Joi 把整份环境变量体检一遍，
 * 任何一个不合法都在第一秒 fail-fast，并列出全部问题（而不是只报第一个）。
 *
 * 【校验规则怎么定】原则：只校验"运行时真正必需"的项，测试专用的配置不在这里拦：
 *   DATABASE_URL     必需，且必须是 mysql:// 开头的连接串——schema.prisma 的 provider
 *                    写死 mysql，这里写成其他协议只可能是配错文件/配错库
 *   JWT_SECRET       必需；生产环境额外要求 ≥16 字符，防止把示例值 "change-me" 原样带上线。
 *                    替代了 main.ts 里原先"只检查生产有没有配"的手工判断（查强度比查存在更严）
 *   PORT             可选，默认 3100；必须是合法端口号（0-65535）
 *   TEST_DATABASE_URL 刻意不校验——它只有 jest（test/set-env.ts）用，运行时用不到，
 *                    强制生产环境配它反而是负担
 * 【如何扩展】新增配置项（如对象存储地址）时，往下方 schema 里加一行并写清注释。
 */
import Joi from "joi";

/** 校验通过后暴露给应用侧的环境变量形态（PORT 经 Joi 转换后一定是 number） */
export interface AppEnv {
  DATABASE_URL: string;
  JWT_SECRET: string;
  PORT: number;
}

export function validateEnv(): AppEnv {
  const isProduction = process.env.NODE_ENV === "production";

  // .unknown()：操作系统自带的环境变量（PATH、NODE_ENV 等）与业务无关，一律放行不校验；
  // abortEarly: false：收集全部错误一起报，修配置时不用"改一个跑一次"地挤牙膏
  const { error, value } = Joi.object({
    DATABASE_URL: Joi.string()
      .uri({ scheme: ["mysql"] })
      .required(),
    JWT_SECRET: isProduction ? Joi.string().min(16).required() : Joi.string().required(),
    PORT: Joi.number().port().default(3100),
  })
    .unknown()
    .validate(process.env, { abortEarly: false });

  if (error) {
    const details = error.details.map((d) => `  - ${d.path.join(".") || "(root)"}：${d.message}`).join("\n");
    throw new Error(`环境变量配置不合法，请检查 server/.env：\n${details}`);
  }

  return value as AppEnv;
}
