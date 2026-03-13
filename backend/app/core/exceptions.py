class ImageProcessingError(Exception):
    """Ошибка на этапе обработки изображения (processing/).

    Args:
        step: название шага, напр. "preprocess_image", "find_contours"
        message: детальное сообщение
    """
    def __init__(self, step: str, message: str) -> None:
        self.step = step
        super().__init__(f"[{step}] {message}")


class FloorPlanNotFoundError(Exception):
    """Реконструкция/план не найден в БД."""
    def __init__(self, reconstruction_id: int) -> None:
        self.reconstruction_id = reconstruction_id
        super().__init__(f"Reconstruction {reconstruction_id} not found")


class FileStorageError(Exception):
    """Файл не найден на диске или не читается."""
    def __init__(self, file_id: str, path: str) -> None:
        self.file_id = file_id
        super().__init__(f"File {file_id} not found at {path}")
