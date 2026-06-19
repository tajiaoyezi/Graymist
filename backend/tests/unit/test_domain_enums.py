"""BDD: 任务类型枚举 / 框架枚举（对应 spec 需求「任务类型枚举」「框架枚举」）。"""
import pytest

from app.domain.enums import TaskType, Framework, VersionStatus


class TestTaskTypeEnum:
    def test_valid_values(self):
        # spec「任务类型枚举」: task_type ∈ {classification, generation, embedding, custom}
        assert {t.value for t in TaskType} == {
            "classification",
            "generation",
            "embedding",
            "custom",
        }

    def test_reject_invalid_task_type(self):
        # WHEN 提交 task_type="foo" THEN 枚举校验失败
        with pytest.raises(ValueError):
            TaskType("foo")


class TestFrameworkEnum:
    def test_valid_values(self):
        # spec「框架枚举」: framework ∈ {PyTorch, ONNX, TensorRT}
        assert {f.value for f in Framework} == {"PyTorch", "ONNX", "TensorRT"}

    def test_reject_invalid_framework(self):
        # WHEN 提交 framework="Caffe" THEN 枚举校验失败
        with pytest.raises(ValueError):
            Framework("Caffe")


class TestVersionStatusEnum:
    def test_values(self):
        assert {s.value for s in VersionStatus} == {
            "draft",
            "validating",
            "ready",
            "archived",
        }
