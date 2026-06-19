"""通用领域错误。"""


class NotFoundError(Exception):
    def __init__(self, what: str = "资源"):
        self.what = what
        super().__init__(f"{what}不存在")
