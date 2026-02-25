"""
API Key encryption utilities using Fernet.
Provides secure encryption and decryption for storing API keys.
"""
from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings


def get_cipher():
    """取得 Fernet cipher 實例

    Returns:
        Fernet: Fernet cipher 實例

    Raises:
        ValueError: 如果 ENCRYPTION_KEY 未設定或無效
    """
    encryption_key = getattr(settings, 'ENCRYPTION_KEY', None)
    if not encryption_key:
        raise ValueError(
            'ENCRYPTION_KEY not configured in settings. '
            'Generate one using: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"'
        )

    try:
        return Fernet(encryption_key.encode() if isinstance(encryption_key, str) else encryption_key)
    except Exception as e:
        raise ValueError(f'Invalid ENCRYPTION_KEY format: {str(e)}')


def encrypt_api_key(plain_key: str) -> bytes:
    """加密 API Key

    Args:
        plain_key (str): 未加密的 API Key

    Returns:
        bytes: 加密後的 API Key
    """
    cipher = get_cipher()
    return cipher.encrypt(plain_key.encode())


def decrypt_api_key(encrypted_key: bytes) -> str:
    """解密 API Key

    Args:
        encrypted_key (bytes): 加密後的 API Key

    Returns:
        str: 解密後的 API Key

    Raises:
        InvalidToken: 如果加密 key 無效或已損壞
    """
    cipher = get_cipher()
    try:
        raw = bytes(encrypted_key) if not isinstance(encrypted_key, bytes) else encrypted_key
        return cipher.decrypt(raw).decode()
    except InvalidToken:
        raise ValueError('Failed to decrypt API key. The key may be corrupted.')
    except Exception as e:
        raise ValueError(f'Decryption error: {str(e)}')
