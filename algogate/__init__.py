from __future__ import annotations

import importlib
import os
import subprocess
import sys

__version__ = "0.1.1"

_REQUIRED_DEPENDENCIES = {
    "fastapi": "fastapi>=0.110.0",
    "pydantic": "pydantic>=2.7.0",
    "httpx": "httpx>=0.27.0",
    "websockets": "websockets>=12.0",
    "uvicorn": "uvicorn>=0.29.0",
}


def _ensure_runtime_dependencies() -> None:
    if os.getenv("ALGOGATE_SKIP_AUTO_INSTALL") == "1":
        return

    missing_specs: list[str] = []
    for module_name, install_spec in _REQUIRED_DEPENDENCIES.items():
        try:
            importlib.import_module(module_name)
        except ModuleNotFoundError:
            missing_specs.append(install_spec)

    if not missing_specs:
        return

    try:
        import pip  # noqa: F401
    except ModuleNotFoundError:
        subprocess.check_call([sys.executable, "-m", "ensurepip", "--upgrade"])

    print(f"AlgoGate is installing missing Python dependencies: {', '.join(missing_specs)}")
    subprocess.check_call([sys.executable, "-m", "pip", "install", *missing_specs])


_ensure_runtime_dependencies()

from .config import AlgoGateConfig
from .gate import AlgoGate

__all__ = ["AlgoGate", "AlgoGateConfig", "__version__"]
