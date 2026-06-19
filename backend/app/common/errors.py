"""通用领域错误。"""


class NotFoundError(Exception):
    def __init__(self, what: str = "资源"):
        self.what = what
        super().__init__(f"{what}不存在")


class ConflictError(Exception):
    """资源冲突（如 url_path 唯一冲突），映射为 HTTP 409。"""

    def __init__(self, msg: str = "资源冲突"):
        super().__init__(msg)


class BindingError(Exception):
    """端点版本绑定/权重无效（不存在/非 ready/跨模型/权重越界或和≠100），映射为 422。"""

    def __init__(self, msg: str = "绑定无效"):
        super().__init__(msg)
