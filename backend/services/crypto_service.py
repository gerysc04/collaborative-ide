import os
import secrets
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def _get_secret() -> bytes:
    key_hex = os.environ.get("SECRET_KEY", "")
    if len(key_hex) != 64:
        raise ValueError("SECRET_KEY must be a 64-char hex string (32 bytes). Generate with: python -c \"import secrets; print(secrets.token_hex(32))\"")
    return bytes.fromhex(key_hex)


def encrypt_api_key(plaintext: str) -> dict:
    key = _get_secret()
    aesgcm = AESGCM(key)
    iv = secrets.token_bytes(12)
    # AESGCM.encrypt returns ciphertext + 16-byte auth tag concatenated
    ciphertext_with_tag = aesgcm.encrypt(iv, plaintext.encode("utf-8"), None)
    return {
        "ciphertext": ciphertext_with_tag.hex(),
        "iv": iv.hex(),
    }


def decrypt_api_key(ciphertext_hex: str, iv_hex: str) -> str:
    key = _get_secret()
    aesgcm = AESGCM(key)
    iv = bytes.fromhex(iv_hex)
    ciphertext = bytes.fromhex(ciphertext_hex)
    plaintext = aesgcm.decrypt(iv, ciphertext, None)
    return plaintext.decode("utf-8")
