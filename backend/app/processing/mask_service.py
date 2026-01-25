
import os
import cv2
import numpy as np
import glob
from app.core.config import settings
from app.core.img_logging import logger

class MaskService:
    def __init__(self):
        self.upload_dir = settings.UPLOAD_DIR
        self.plans_dir = os.path.join(self.upload_dir, "plans")
        self.masks_dir = os.path.join(self.upload_dir, "masks")
        os.makedirs(self.masks_dir, exist_ok=True)

    def get_file_path(self, file_id: str, subfolder: str) -> str:
        # Ищем файл с любым расширением
        search_path = os.path.join(self.upload_dir, subfolder, f"{file_id}.*")
        files = glob.glob(search_path)
        if not files:
            raise FileNotFoundError(f"File {file_id} not found in {subfolder}")
        return files[0]

    async def calculate_mask(self, file_id: str, crop: dict = None, rotation: int = 0) -> str:
        """
        Генерация маски стен (белые стены, черный фон)
        
        Args:
            file_id: ID файла плана
            crop: Optional dict with x, y, width, height (0-1 ratios) for cropping
            rotation: Rotation in degrees (clockwise)
        """
        logger.info(f"Starting mask calculation for {file_id}")
        
        try:
            # 1. Находим файл плана
            input_path = self.get_file_path(file_id, "plans")
            logger.info(f"Input file found: {input_path}")

            # 2. Загружаем изображение
            img = cv2.imread(input_path)
            if img is None:
                raise ValueError("Failed to load image")
            
            # 2.2 Rotate if provided
            if rotation:
                # Normalize rotation to 0, 90, 180, 270
                r = rotation % 360
                if r == 90:
                    img = cv2.rotate(img, cv2.ROTATE_90_CLOCKWISE)
                    logger.info("Rotated 90 degrees clockwise")
                elif r == 180:
                    img = cv2.rotate(img, cv2.ROTATE_180)
                    logger.info("Rotated 180 degrees")
                elif r == 270:
                    img = cv2.rotate(img, cv2.ROTATE_90_COUNTERCLOCKWISE)
                    logger.info("Rotated 90 degrees counter-clockwise")
            
            # 2.5 Apply crop if provided
            if crop:
                h, w = img.shape[:2]
                x = int(crop['x'] * w)
                y = int(crop['y'] * h)
                crop_w = int(crop['width'] * w)
                crop_h = int(crop['height'] * h)
                
                # Ensure bounds
                x = max(0, min(x, w - 1))
                y = max(0, min(y, h - 1))
                crop_w = max(1, min(crop_w, w - x))
                crop_h = max(1, min(crop_h, h - y))
                
                img = img[y:y+crop_h, x:x+crop_w]
                logger.info(f"Applied crop: x={x}, y={y}, w={crop_w}, h={crop_h}")

            # 3. Предобработка
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            
            # Размытие для удаления шума
            blur = cv2.GaussianBlur(gray, (5, 5), 0)
            
            # 4. Бинаризация (Otsu)
            # Предполагаем, что план - это черные линии на белом фоне.
            # Нам нужно: Белые стены на черном фоне.
            # cv2.THRESH_BINARY_INV инвертирует: то что было темным (стены) станет белым (255)
            _, thresh = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
            
            # 5. Морфология (закрытие разрывов)
            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
            morph = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel, iterations=2)
            
            # 6. Удаление мелкого шума (по площади контуров)
            # 6. Удаление мелкого шума (по площади компонент)
            # Используем connectedComponents вместо findContours, чтобы не заливать дырки внутри рамок
            num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(morph, connectivity=8)
            
            mask = np.zeros_like(morph)
            
            # Label 0 is background (black). Start from 1.
            for i in range(1, num_labels):
                area = stats[i, cv2.CC_STAT_AREA]
                if area > 50:
                    mask[labels == i] = 255

            # 7. Сохранение
            # Используем тот же ID для маски, но сохраняем как PNG (маска всегда PNG)
            output_filename = f"{file_id}.png"
            output_path = os.path.join(self.masks_dir, output_filename)
            
            cv2.imwrite(output_path, mask)
            logger.info(f"Mask saved to: {output_path}")
            
            return output_filename

        except Exception as e:
            logger.error(f"Error calculating mask: {e}")
            raise e
