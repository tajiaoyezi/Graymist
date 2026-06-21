"""上游凭证对称加密（a7,southbound-credentials）。

Fernet(AES-CBC + HMAC 认证加密)。主密钥取自 `settings.secret_key`(`GRAYMIST_SECRET_KEY`,
一个 Fernet key)。平台内填写的明文 API Key 经此加密后存版本的 `auth_secret_enc` 列,
调用时解密注入。平台 MUST NOT 持久化明文、MUST NOT 在响应/界面/日志回显明文或密文。
"""
from cryptography.fernet import Fernet

from app.config import settings


class SecretKeyNotConfiguredError(Exception):
    """未配置 GRAYMIST_SECRET_KEY,无法加密存储上游凭证(映射 HTTP 400)。"""

    def __init__(self, msg: str = "未配置 GRAYMIST_SECRET_KEY,无法在平台内加密保存上游 API Key"):
        super().__init__(msg)


def _fernet() -> Fernet:
    key = settings.secret_key
    if not key:
        raise SecretKeyNotConfiguredError()
    return Fernet(key.encode() if isinstance(key, str) else key)


def encrypt_secret(plaintext: str) -> str:
    """明文 → Fernet 密文(urlsafe-base64 文本)。未配主密钥 → SecretKeyNotConfiguredError。"""
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt_secret(token: str) -> str:
    """Fernet 密文 → 明文。密文被篡改/主密钥不匹配 → 抛 InvalidToken(由调用方兜底)。"""
    return _fernet().decrypt(token.encode()).decode()
