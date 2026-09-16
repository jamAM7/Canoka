"""Canvas LMS scraper — per-subject JSON built for use as LLM context."""

from .client import CanvasClient, CanvasError, CanvasForbidden, CanvasNotFound
from .build import SubjectBuilder, slugify, subject_code
from .render import module_slices, render_module, render_subject, week_label

__all__ = [
    "CanvasClient",
    "CanvasError",
    "CanvasForbidden",
    "CanvasNotFound",
    "SubjectBuilder",
    "slugify",
    "subject_code",
    "module_slices",
    "render_module",
    "render_subject",
    "week_label",
]
