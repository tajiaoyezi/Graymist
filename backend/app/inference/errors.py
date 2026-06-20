"""推理调用领域错误（a3）。

异常 → HTTP 映射在 main.py:RateLimitedError→429、InferenceTimeoutError→504、
InferenceInputInvalidError→422(推理输入实例校验失败)。端点非 running 复用 ConflictError→409。
"""


class RateLimitedError(Exception):
    """端点在执行并发已达 max_concurrency,同步推理被拒(映射为 HTTP 429)。"""

    def __init__(self, msg: str = "端点并发已满"):
        super().__init__(msg)


class InferenceTimeoutError(Exception):
    """同步推理模拟执行超过端点 timeout_ms(映射为 HTTP 504)。"""

    def __init__(self, msg: str = "推理超时"):
        super().__init__(msg)


class InferenceInputInvalidError(Exception):
    """推理输入不符合命中 Model 的 input_schema(实例校验失败,映射为 HTTP 422)。

    刻意不复用 common.schema_validation.InvalidSchemaError —— 后者语义是「Schema 本身非法」,
    文案会误导;此处是「实例 against schema」校验失败。
    """

    def __init__(self, msg: str = "推理输入不符合 input_schema"):
        super().__init__(msg)
