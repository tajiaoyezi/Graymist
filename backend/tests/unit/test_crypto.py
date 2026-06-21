"""上游凭证加密单测（a7）:round-trip / 未配主密钥拒绝 / 篡改检测。"""
import pytest
from cryptography.fernet import Fernet

from app.common import crypto
from app.common.crypto import SecretKeyNotConfiguredError
from app.config import settings


def test_encrypt_decrypt_roundtrip(monkeypatch):
    monkeypatch.setattr(settings, "secret_key", Fernet.generate_key().decode())
    token = crypto.encrypt_secret("sk-secret-123")
    assert token != "sk-secret-123"  # 密文 ≠ 明文
    assert "sk-secret-123" not in token  # 密文不可读出明文
    assert crypto.decrypt_secret(token) == "sk-secret-123"


def test_encrypt_without_master_key_raises(monkeypatch):
    monkeypatch.setattr(settings, "secret_key", "")
    with pytest.raises(SecretKeyNotConfiguredError):
        crypto.encrypt_secret("x")


def test_tampered_ciphertext_fails(monkeypatch):
    monkeypatch.setattr(settings, "secret_key", Fernet.generate_key().decode())
    token = crypto.encrypt_secret("hello")
    with pytest.raises(Exception):  # InvalidToken
        crypto.decrypt_secret(token[:-4] + "AAAA")
