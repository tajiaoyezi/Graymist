"""pytest 根配置：把 backend/ 加入 sys.path，使 `import app` 可用。

DB/HTTP 相关 fixture 见 tests/conftest.py。
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.resolve()))
