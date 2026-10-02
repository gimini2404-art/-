"""Image field that shrinks uploads and stores them as WebP (keeps transparency for logos)."""
import io
import os

from django.core.files.base import ContentFile
from django.db import models

MAX_SIDE = 1600
QUALITY = 82


class OptimizedImageField(models.ImageField):
    def pre_save(self, model_instance, add):
        f = getattr(model_instance, self.attname)
        if f and not getattr(f, "_committed", True):  # a new upload that has not been stored yet
            try:
                from PIL import Image, ImageOps

                f.file.seek(0)
                img = ImageOps.exif_transpose(Image.open(f.file))
                has_alpha = img.mode in ("RGBA", "LA", "P")
                img = img.convert("RGBA" if has_alpha else "RGB")
                img.thumbnail((MAX_SIDE, MAX_SIDE))
                buf = io.BytesIO()
                img.save(buf, "WEBP", quality=QUALITY, method=4)
                base = os.path.splitext(os.path.basename(f.name))[0]
                f.save(f"{base}.webp", ContentFile(buf.getvalue()), save=False)
            except Exception:  # never block an upload because optimisation failed
                f.file.seek(0)
        return super().pre_save(model_instance, add)
