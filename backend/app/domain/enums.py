"""领域枚举（v1.0）。

对应原始需求 2.1：
- task_type：classification / generation / embedding / custom
- framework：PyTorch / ONNX / TensorRT
- 版本状态：draft / validating / ready / archived
"""
from enum import Enum


class TaskType(str, Enum):
    classification = "classification"
    generation = "generation"
    embedding = "embedding"
    custom = "custom"


class Framework(str, Enum):
    pytorch = "PyTorch"
    onnx = "ONNX"
    tensorrt = "TensorRT"


class VersionStatus(str, Enum):
    draft = "draft"
    validating = "validating"
    ready = "ready"
    archived = "archived"
