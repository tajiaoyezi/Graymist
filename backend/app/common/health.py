"""Redis 健康检查骨架（tasks 1.4）。本 change 不写业务逻辑，仅验证可达；非致命。"""


async def redis_ping(redis_url: str) -> bool:
    try:
        import redis.asyncio as aioredis

        client = aioredis.from_url(redis_url)
        try:
            return bool(await client.ping())
        finally:
            await client.aclose()
    except Exception:
        return False
