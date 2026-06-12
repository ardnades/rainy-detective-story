"""讓測試能 `import config`（把 art_tool/ 加進 sys.path）。"""
import sys
from pathlib import Path

ART_TOOL_DIR = Path(__file__).resolve().parent.parent
if str(ART_TOOL_DIR) not in sys.path:
    sys.path.insert(0, str(ART_TOOL_DIR))
