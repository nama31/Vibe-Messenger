"""
Property-based tests for pwd_context in app.core.security.

Validates: Requirements 6.2 and 6.3
"""

from datetime import timedelta

from hypothesis import given, settings
from hypothesis import strategies as st

from app.core.security import pwd_context

# bcrypt silently truncates passwords longer than 72 bytes, so we constrain
# the strategy to ASCII printable characters (1 byte each) with a max length
# of 72 to stay within bcrypt's limit and avoid ambiguous truncation behaviour.
_password_strategy = st.text(
    alphabet=st.characters(min_codepoint=32, max_codepoint=126),
    min_size=8,
    max_size=72,
)


@given(_password_strategy)
@settings(max_examples=20, deadline=timedelta(seconds=5))  # bcrypt is slow
def test_hash_verify_roundtrip(password: str) -> None:
    """Property 1: For any password p, verify(p, hash(p)) is True.

    Validates: Requirements 6.2
    """
    hashed = pwd_context.hash(password)
    assert pwd_context.verify(password, hashed) is True


@given(_password_strategy, _password_strategy)
@settings(max_examples=20, deadline=timedelta(seconds=10))  # two bcrypt ops
def test_different_passwords_dont_verify(p1: str, p2: str) -> None:
    """Property 2: For any p1 != p2, verify(p1, hash(p2)) is False.

    Validates: Requirements 6.3
    """
    if p1 == p2:
        return  # skip equal pairs
    hashed_p2 = pwd_context.hash(p2)
    assert pwd_context.verify(p1, hashed_p2) is False
