"""
Сервис бинаризации изображений
Использует метод Оцу для автоматического определения порога бинаризации

Метод Оцу:
- Автоматически находит оптимальный порог, минимизирующий внутриклассовую дисперсию
- σ²_b(t) = W₀(t) * W₁(t) * [μ₀(t) - μ₁(t)]²
- Ищет t, максимизирующий межклассовую дисперсию
"""

import os
from typing import Tuple, Optional
import numpy as np
import cv2
from PIL import Image


class BinarizationService:
    """
    Сервис бинаризации изображений методом Оцу
    
    Преобразует цветное изображение плана эвакуации в черно-белое
    для выделения структурных элементов (стен)
    """
    
    def __init__(self, output_dir: str = "uploads/processed"):
        """
        Args:
            output_dir: Директория для сохранения обработанных изображений
        """
        self.output_dir = output_dir
        os.makedirs(output_dir, exist_ok=True)
    
    def load_image(self, file_path: str) -> np.ndarray:
        """
        Загрузка изображения
        
        Поддерживает Unicode пути (кириллица)
        
        Args:
            file_path: Путь к файлу изображения
            
        Returns:
            BGR изображение как numpy array
        """
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Файл не найден: {file_path}")
        
        # Используем numpy для чтения с поддержкой Unicode путей
        # cv2.imread не работает с кириллицей в путях
        try:
            with open(file_path, 'rb') as f:
                file_bytes = np.frombuffer(f.read(), dtype=np.uint8)
            image = cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)
        except Exception as e:
            raise ValueError(f"Ошибка загрузки: {e}")
        
        if image is None:
            raise ValueError(f"Не удалось декодировать изображение: {file_path}")
        
        return image
    
    def to_grayscale(self, image: np.ndarray) -> np.ndarray:
        """
        Преобразование в градации серого
        
        Args:
            image: BGR изображение
            
        Returns:
            Grayscale изображение
        """
        if len(image.shape) == 3 and image.shape[2] == 3:
            return cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        return image
    
    def binarize_otsu(self, gray_image: np.ndarray) -> Tuple[np.ndarray, int]:
        """
        Бинаризация методом Оцу
        
        Автоматически определяет оптимальный порог,
        максимизирующий межклассовую дисперсию
        
        Args:
            gray_image: Изображение в градациях серого
            
        Returns:
            binary_image: Бинарное изображение (255 = белый, 0 = черный)
            threshold: Найденный порог
        """
        # Размытие для уменьшения шума
        blurred = cv2.GaussianBlur(gray_image, (5, 5), 0)
        
        # Применяем метод Оцу
        threshold, binary = cv2.threshold(
            blurred, 
            0, 
            255, 
            cv2.THRESH_BINARY + cv2.THRESH_OTSU
        )
        
        return binary, int(threshold)
    
    def apply_adaptive_threshold(
        self, 
        gray_image: np.ndarray,
        block_size: int = 11,
        c: int = 2
    ) -> np.ndarray:
        """
        Адаптивная бинаризация для изображений с неравномерным освещением
        
        Args:
            gray_image: Изображение в градациях серого
            block_size: Размер окна для локального порога (нечетное число)
            c: Константа, вычитаемая из среднего
            
        Returns:
            Бинарное изображение
        """
        return cv2.adaptiveThreshold(
            gray_image,
            255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY,
            block_size,
            c
        )
    
    def apply_morphology(
        self, 
        binary_image: np.ndarray, 
        kernel_size: int = 3,
        iterations: int = 1
    ) -> np.ndarray:
        """
        Морфологическая обработка для улучшения маски
        
        Удаляет шум и заполняет небольшие пробелы в стенах
        
        Args:
            binary_image: Бинарное изображение
            kernel_size: Размер ядра
            iterations: Количество итераций
            
        Returns:
            Обработанное изображение
        """
        kernel = cv2.getStructuringElement(
            cv2.MORPH_RECT, 
            (kernel_size, kernel_size)
        )
        
        # Закрытие (closing) - заполняет маленькие дыры и разрывы
        closed = cv2.morphologyEx(
            binary_image, 
            cv2.MORPH_CLOSE, 
            kernel,
            iterations=iterations
        )
        
        # Открытие (opening) - удаляет мелкий шум
        opened = cv2.morphologyEx(
            closed, 
            cv2.MORPH_OPEN, 
            kernel,
            iterations=iterations
        )
        
        return opened
    
    def invert_if_needed(self, binary_image: np.ndarray) -> np.ndarray:
        """
        Инвертирует изображение если стены белые (нужны черные)
        
        Определяет, что занимает больше площади - белое или черное
        Стены обычно занимают меньше площади, поэтому их должно быть меньше
        
        Args:
            binary_image: Бинарное изображение
            
        Returns:
            Изображение с белыми стенами на черном фоне
        """
        white_pixels = np.sum(binary_image == 255)
        black_pixels = np.sum(binary_image == 0)
        
        # Если белого больше - инвертируем (стены должны быть белыми, фон черным)
        if white_pixels > black_pixels:
            return cv2.bitwise_not(binary_image)
        
        return binary_image
    
    def process(
        self, 
        file_path: str,
        use_adaptive: bool = False,
        morphology_kernel: int = 3,
        morphology_iterations: int = 2
    ) -> Tuple[np.ndarray, int, str]:
        """
        Полный pipeline бинаризации
        
        1. Загрузка изображения
        2. Преобразование в градации серого
        3. Бинаризация методом Оцу (или адаптивная)
        4. Морфологическая обработка
        5. Инверсия при необходимости
        
        Args:
            file_path: Путь к файлу изображения
            use_adaptive: Использовать адаптивную бинаризацию
            morphology_kernel: Размер ядра морфологии
            morphology_iterations: Итерации морфологии
            
        Returns:
            mask: Бинарная маска (белый = стены)
            threshold: Использованный порог (0 для адаптивной)
            output_path: Путь к сохраненной маске
        """
        # Загрузка
        image = self.load_image(file_path)
        print(f"Загружено изображение: {image.shape}")
        
        # Градации серого
        gray = self.to_grayscale(image)
        
        # Бинаризация
        if use_adaptive:
            binary = self.apply_adaptive_threshold(gray)
            threshold = 0
        else:
            binary, threshold = self.binarize_otsu(gray)
        
        print(f"Порог бинаризации (Оцу): {threshold}")
        
        # Морфология
        cleaned = self.apply_morphology(
            binary,
            kernel_size=morphology_kernel,
            iterations=morphology_iterations
        )
        
        # Инверсия при необходимости
        mask = self.invert_if_needed(cleaned)
        
        # Сохранение
        filename = os.path.basename(file_path)
        name, ext = os.path.splitext(filename)
        output_path = os.path.join(self.output_dir, f"{name}_mask.png")
        cv2.imwrite(output_path, mask)
        print(f"Маска сохранена: {output_path}")
        
        return mask, threshold, output_path
    
    def save_mask(self, mask: np.ndarray, output_path: str) -> str:
        """
        Сохранение маски в файл
        
        Args:
            mask: Бинарная маска
            output_path: Путь для сохранения
            
        Returns:
            Абсолютный путь к файлу
        """
        cv2.imwrite(output_path, mask)
        return os.path.abspath(output_path)


# Для тестирования
if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python binarization.py <image_path>")
        sys.exit(1)
    
    service = BinarizationService()
    mask, threshold, output_path = service.process(sys.argv[1])
    print(f"Обработка завершена. Порог: {threshold}, Маска: {output_path}")
